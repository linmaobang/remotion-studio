// 本机 CLI 适配层：用已登录的 Claude Code / Codex CLI 代替 API Key。
// 只启动子进程（spawn、参数数组、shell:false，prompt 走 stdin），不读取、不保存任何凭据。
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const LOGIN_HINT: Record<LocalProvider, string> = { claude: '请先在终端运行 claude login', codex: '请先在终端运行 codex login' };
const INSTALL_HINT: Record<LocalProvider, string> = {
  claude: '未找到 claude 命令，请先安装 Claude Code CLI 并运行 claude login',
  codex: '未找到 codex 命令，请先安装 Codex CLI 并运行 codex login',
};
const NOT_LOGGED_IN = /not logged in|please run .*login|log ?in|unauthori[sz]ed|authentication|401|invalid api key|credentials/i;

// —— 简单并发队列 ——
let running = 0;
const waiting: (() => void)[] = [];
const concurrencyLimit = (env: NodeJS.ProcessEnv = process.env) => {
  const n = Math.floor(Number(env.LOCAL_AGENT_CONCURRENCY));
  return Number.isFinite(n) && n >= 1 ? Math.min(2, n) : 1;
};
async function withSlot<T>(task: () => Promise<T>, limit: number): Promise<T> {
  if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
  else running++;
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next(); // 把名额直接交给下一个等待者
    else running--;
  }
}

interface SpawnResult { stdout: string; stderr: string; code: number | null }

function runProcess(provider: LocalProvider, bin: string, args: string[], stdin: string, cwd: string, timeout: number): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: process.env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); fn(); };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 3000); // SIGTERM 无效时兜底
      killTimer.unref();
      finish(() => reject(new LocalAgentError('TIMEOUT', `${provider} 调用超过 ${Math.round(timeout / 1000)} 秒未返回，已终止。可调大 LOCAL_AGENT_TIMEOUT_MS 或稍后重试`, provider)));
    }, timeout);
    child.stdout.setEncoding('utf8').on('data', (d: string) => { stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d: string) => { stderr += d; });
    child.on('error', (error: NodeJS.ErrnoException) => finish(() => reject(error.code === 'ENOENT'
      ? new LocalAgentError('NOT_INSTALLED', INSTALL_HINT[provider], provider)
      : new LocalAgentError('EXIT_NONZERO', `${provider} 启动失败：${error.message}`, provider))));
    child.on('close', (code) => { if (killTimer && settled) return; finish(() => resolve({ stdout, stderr, code })); });
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
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  return withSlot(async () => {
    const started = Date.now();
    let cwd = options.cwd;
    let ownDir: string | undefined;
    if (!cwd) {
      ownDir = join(tmpdir(), 'local-agent-cwd');
      await mkdir(ownDir, { recursive: true });
      cwd = ownDir; // 空目录，避免 CLI 读到项目文件
    }
    const run = provider === 'claude' ? runClaude : runCodex;
    const { text, raw } = await run(options, bin, cwd, timeout);
    return { text, provider, durationMs: Date.now() - started, ...(raw !== undefined ? { raw } : {}) };
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

/** LLM_PROVIDER=api|claude-cli|codex-cli；未设置时有 ANTHROPIC_API_KEY 用 api，否则 null（plan.ts 降级本地规则）。 */
export function resolveLlm(env: NodeJS.ProcessEnv = process.env): LlmFn | null {
  const choice = env.LLM_PROVIDER?.trim().toLowerCase();
  if (choice === 'claude-cli') return createLocalAgentLlm('claude', env);
  if (choice === 'codex-cli') return createLocalAgentLlm('codex', env);
  if (choice === 'api') return createAnthropicLlm(env);
  return createAnthropicLlm(env);
}
