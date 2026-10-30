// 本机 CLI 适配层：用已登录的 Claude Code / Codex CLI 代替 API Key。
// 只启动子进程（spawn、参数数组、shell:false，prompt 走 stdin），不读取、不保存任何凭据。
import { spawn } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createAnthropicLlm, type LlmFn } from './llm';

export type LocalProvider = 'claude' | 'codex';
export type LocalAgentErrorCode = 'NOT_INSTALLED' | 'NOT_LOGGED_IN' | 'TIMEOUT' | 'EXIT_NONZERO' | 'BAD_OUTPUT';

export class LocalAgentError extends Error {
  constructor(public code: LocalAgentErrorCode, message: string, public provider?: LocalProvider) {
    super(message);
    this.name = 'LocalAgentError';
  }
}

export interface LocalAgentOptions {
  provider: LocalProvider;
  prompt: string;
  system?: string;
  cwd?: string;
  /** 毫秒，默认 180000。 */
  timeout?: number;
  /** 默认 false：claude 禁用全部工具，codex 只读沙箱。 */
  allowTools?: boolean;
  /** claude 返回 JSON 时附带 raw。 */
  json?: boolean;
  model?: string;
  /** 覆盖可执行文件路径（测试用）；默认读 LOCAL_AGENT_CLAUDE_BIN / LOCAL_AGENT_CODEX_BIN。 */
  bin?: string;
  /** 只用于读取 LOCAL_AGENT_* 配置；子进程始终继承 process.env（需要 PATH、HOME 找到登录态）。 */
  env?: NodeJS.ProcessEnv;
}

export interface LocalAgentResult {
  text: string;
  provider: LocalProvider;
  durationMs: number;
  raw?: unknown;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const LOGIN_HINT: Record<LocalProvider, string> = { claude: '请先在终端运行 claude auth login', codex: '请先在终端运行 codex login' };
const INSTALL_HINT: Record<LocalProvider, string> = {
  claude: '未找到 claude 命令，请先安装 Claude Code CLI 并运行 claude auth login',
  codex: '未找到 codex 命令，请先安装 Codex CLI 并运行 codex login',
};
const NOT_LOGGED_IN = /not logged in|please run .*login|log ?in|unauthori[sz]ed|authentication|401|invalid api key|credentials/i;

// —— 简单并发队列 ——
let running = 0;
const waiting: { limit: number; resolve: () => void }[] = [];
const concurrencyLimit = (env: NodeJS.ProcessEnv = process.env) => {
  const n = Math.floor(Number(env.LOCAL_AGENT_CONCURRENCY));
  return Number.isFinite(n) && n >= 1 ? Math.min(2, n) : 1;
};
async function withSlot<T>(task: () => Promise<T>, limit: number): Promise<T> {
  const drain = () => {
    while (waiting.length && running < waiting[0].limit) {
      running++;
      waiting.shift()!.resolve();
    }
  };
  await new Promise<void>((resolve) => { waiting.push({ limit, resolve }); drain(); });
  try {
    return await task();
  } finally {
    running--;
    drain();
  }
}

interface SpawnResult { stdout: string; stderr: string; code: number | null }

function runProcess(provider: LocalProvider, bin: string, args: string[], stdin: string, cwd: string, timeout: number): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: process.env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(killTimer); fn(); };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 3000); // SIGTERM 无效时兜底
      // 等待 close 确认进程退出后再释放并发名额和清理临时目录。
    }, timeout);
    child.stdout.setEncoding('utf8').on('data', (d: string) => { stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d: string) => { stderr += d; });
    child.on('error', (error: NodeJS.ErrnoException) => finish(() => reject(error.code === 'ENOENT'
      ? new LocalAgentError('NOT_INSTALLED', INSTALL_HINT[provider], provider)
      : new LocalAgentError('EXIT_NONZERO', `${provider} 启动失败：${error.message}`, provider))));
    child.on('close', (code) => finish(() => {
      if (timedOut) reject(new LocalAgentError('TIMEOUT', `${provider} 调用超过 ${timeout / 1000} 秒未返回，已终止。可调大 LOCAL_AGENT_TIMEOUT_MS 或稍后重试`, provider));
      else resolve({ stdout, stderr, code });
    }));
    child.stdin.on('error', () => { /* 子进程提前退出时忽略 EPIPE，由 close 处理 */ });
    child.stdin.end(stdin);
  });
}

const failure = (provider: LocalProvider, detail: string, code: number | null): LocalAgentError => {
  const text = detail.trim().slice(0, 400);
  if (NOT_LOGGED_IN.test(text)) return new LocalAgentError('NOT_LOGGED_IN', `${provider} 未登录或登录已失效：${LOGIN_HINT[provider]}。${text ? `（${text}）` : ''}`, provider);
  return new LocalAgentError('EXIT_NONZERO', `${provider} 执行失败${code === null ? '' : `（退出码 ${code}）`}：${text || '无输出'}`, provider);
};

async function runClaude(o: LocalAgentOptions, bin: string, cwd: string, timeout: number): Promise<{ text: string; raw?: unknown }> {
  const args = ['-p', '--output-format', 'json', '--no-session-persistence'];
  if (o.system) args.push('--system-prompt', o.system);
  if (o.model) args.push('--model', o.model);
  if (!o.allowTools) args.push('--tools', '');
  const { stdout, stderr, code } = await runProcess('claude', bin, args, o.prompt, cwd, timeout);
  let data: { result?: unknown; is_error?: boolean } | undefined;
  try { data = JSON.parse(stdout.trim()); } catch { /* 下面按 BAD_OUTPUT / 失败处理 */ }
  if (data && typeof data === 'object' && data.is_error) throw failure('claude', typeof data.result === 'string' ? data.result : stderr, code);
  if (code !== 0) throw failure('claude', stderr || stdout, code);
  if (!data || typeof data.result !== 'string' || !data.result.trim()) throw new LocalAgentError('BAD_OUTPUT', 'claude 输出不是预期的 JSON（缺少 result 字段）', 'claude');
  return { text: data.result.trim(), ...(o.json ? { raw: data } : {}) };
}

async function runCodex(o: LocalAgentOptions, bin: string, cwd: string, timeout: number): Promise<{ text: string; raw?: unknown }> {
  const dir = await mkdtemp(join(tmpdir(), 'local-agent-codex-'));
  const outFile = join(dir, 'last-message.txt');
  try {
    const args = ['exec', '--sandbox', o.allowTools ? 'workspace-write' : 'read-only', '--skip-git-repo-check', '--ephemeral', '--color', 'never', '-o', outFile];
    if (o.model) args.push('--model', o.model);
    // codex 没有独立的 system 参数，把 system 拼到 prompt 前面；末尾的 - 表示从 stdin 读取
    args.push('-');
    const prompt = o.system ? `${o.system}\n\n---\n\n${o.prompt}` : o.prompt;
    const { stdout, stderr, code } = await runProcess('codex', bin, args, prompt, cwd, timeout);
    if (code !== 0) throw failure('codex', stderr || stdout, code);
    let text = '';
    try { text = (await readFile(outFile, 'utf8')).trim(); } catch { /* 没写文件 → BAD_OUTPUT */ }
    if (!text) throw new LocalAgentError('BAD_OUTPUT', 'codex 没有返回最后一条消息', 'codex');
    return { text, ...(o.json ? { raw: { stdout, stderr } } : {}) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runLocalAgent(options: LocalAgentOptions): Promise<LocalAgentResult> {
  const env = options.env ?? process.env;
  const { provider } = options;
  if (provider !== 'claude' && provider !== 'codex') throw new LocalAgentError('BAD_OUTPUT', `不支持的 provider：${String(provider)}`);
  const bin = options.bin ?? env[provider === 'claude' ? 'LOCAL_AGENT_CLAUDE_BIN' : 'LOCAL_AGENT_CODEX_BIN'] ?? provider;
  const configuredTimeout = Number(options.timeout ?? env.LOCAL_AGENT_TIMEOUT_MS);
  const timeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_TIMEOUT_MS;
  return withSlot(async () => {
    const started = Date.now();
    let cwd = options.cwd;
    let ownDir: string | undefined;
    try {
      if (!cwd) {
        ownDir = await mkdtemp(join(tmpdir(), 'local-agent-cwd-'));
        cwd = ownDir; // 每次调用独立的空目录，避免读到上次调用的文件
      }
      const run = provider === 'claude' ? runClaude : runCodex;
      const { text, raw } = await run({ ...options, model: options.model ?? (env.LOCAL_AGENT_MODEL?.trim() || undefined) }, bin, cwd, timeout);
      return { text, provider, durationMs: Date.now() - started, ...(raw !== undefined ? { raw } : {}) };
    } finally {
      if (ownDir) await rm(ownDir, { recursive: true, force: true });
    }
  }, concurrencyLimit(env));
}

/** 多轮对话没有原生支持，用清晰标记拼成单个 prompt。 */
export function createLocalAgentLlm(provider: LocalProvider, env: NodeJS.ProcessEnv = process.env): LlmFn {
  const timeoutMs = Number(env.LOCAL_AGENT_TIMEOUT_MS);
  return async ({ system, messages }) => {
    const prompt = messages.length === 1
      ? messages[0].content
      : `${messages.map((m) => `[${m.role === 'user' ? '用户' : '助手'}]\n${m.content}`).join('\n\n')}\n\n[助手]\n请直接回复上面最后一条用户消息。`;
    const result = await runLocalAgent({
      provider, prompt, system, env,
      model: env.LOCAL_AGENT_MODEL?.trim() || undefined,
      ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeout: timeoutMs } : {}),
    });
    return result.text;
  };
}

// —— AI 引擎选择 ——
/** 请求/环境变量里可选的引擎：auto 按 api → claude → codex 探测；heuristic 是本地模板（非 AI）。 */
export const PROVIDER_CHOICES = ['auto', 'api', 'claude', 'codex', 'heuristic'] as const;
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number];
export type AiProviderId = 'api' | 'claude' | 'codex';

export const PROVIDER_LABELS: Record<AiProviderId | 'heuristic', string> = { api: 'Anthropic API', claude: 'Claude Code', codex: 'Codex', heuristic: '本地模板' };

export interface ProviderStatus { id: AiProviderId; label: string; available: boolean; reason?: string }

/** 只在 PATH（或 LOCAL_AGENT_*_BIN）里找可执行文件，不读取任何凭据；是否已登录要真正调用时才知道。 */
function findExecutable(name: string, env: NodeJS.ProcessEnv): boolean {
  const candidates = name.includes('/') ? [name] : (env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, name));
  return candidates.some((file) => { try { accessSync(file, constants.X_OK); return statSync(file).isFile(); } catch { return false; } });
}

export function detectProviders(env: NodeJS.ProcessEnv = process.env): ProviderStatus[] {
  const hasKey = Boolean(env.ANTHROPIC_API_KEY?.trim());
  const cli = (id: 'claude' | 'codex'): ProviderStatus => {
    const bin = env[id === 'claude' ? 'LOCAL_AGENT_CLAUDE_BIN' : 'LOCAL_AGENT_CODEX_BIN'] ?? id;
    const available = findExecutable(bin, env);
    return { id, label: PROVIDER_LABELS[id], available, ...(available ? {} : { reason: INSTALL_HINT[id] }) };
  };
  return [
    { id: 'api', label: PROVIDER_LABELS.api, available: hasKey, ...(hasKey ? {} : { reason: '未设置 ANTHROPIC_API_KEY 环境变量' }) },
    cli('claude'),
    cli('codex'),
  ];
}

export type ResolvedLlm = { ok: true; id: AiProviderId; label: string; llm: LlmFn } | { ok: false; error: string };

/**
 * 选择引擎：choice（请求体）> LLM_PROVIDER（api|claude-cli|codex-cli|claude|codex）> 自动探测 api → claude → codex。
 * 指定的引擎不可用时返回明确错误，不会悄悄换别的引擎。heuristic 不属于 AI，由调用方单独处理。
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env, choice?: ProviderChoice): ResolvedLlm {
  const fromEnv = env.LLM_PROVIDER?.trim().toLowerCase().replace(/-cli$/, '');
  const wanted = choice && choice !== 'auto' ? choice : (fromEnv === 'api' || fromEnv === 'claude' || fromEnv === 'codex' ? fromEnv : 'auto');
  if (wanted === 'heuristic') return { ok: false, error: '本地模板不是 AI 引擎' };
  const statuses = detectProviders(env);
  const pick = wanted === 'auto' ? statuses.find((s) => s.available) : statuses.find((s) => s.id === wanted);
  if (!pick) return { ok: false, error: '没有可用的 AI 引擎：请设置 ANTHROPIC_API_KEY，或安装并登录 Claude Code（claude login）/ Codex（codex login）后重试。' };
  if (!pick.available) return { ok: false, error: `${pick.label} 不可用：${pick.reason ?? '未知原因'}` };
  const llm = pick.id === 'api' ? createAnthropicLlm(env)! : createLocalAgentLlm(pick.id, env);
  return { ok: true, id: pick.id, label: pick.label, llm };
}

/** 兼容旧用法：解析失败返回 null。 */
export function resolveLlm(env: NodeJS.ProcessEnv = process.env): LlmFn | null {
  const resolved = resolveProvider(env);
  return resolved.ok ? resolved.llm : null;
}
