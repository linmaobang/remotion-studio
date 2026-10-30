import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLocalAgentLlm, LocalAgentError, resolveLlm, runLocalAgent } from './localAgent';

let dir: string;
test.before(async () => { dir = await mkdtemp(join(tmpdir(), 'fake-cli-')); });
test.after(async () => { await rm(dir, { recursive: true, force: true }); });

/** 在临时目录写一个 node 脚本当假 CLI。 */
async function fakeCli(name: string, body: string): Promise<string> {
  const file = join(dir, name);
  await writeFile(file, `#!/usr/bin/env node\n${body}`);
  await chmod(file, 0o755);
  return file;
}
const readStdin = `let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{`;

test('claude：解析 result，prompt 与 system 原样传递，工具默认禁用', async () => {
  const bin = await fakeCli('claude-ok', `${readStdin}console.log(JSON.stringify({is_error:false,result:'回复:'+input,args:process.argv.slice(2)}));});`);
  const out = await runLocalAgent({ provider: 'claude', prompt: 'hello', system: 'SYS', bin, json: true });
  assert.equal(out.text, '回复:hello');
  assert.equal(out.provider, 'claude');
  const args = (out.raw as { args: string[] }).args;
  assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2), ['--tools', '']);
  assert.equal(args[args.indexOf('--system-prompt') + 1], 'SYS');
});

test('claude：is_error 视为失败；未登录给出 NOT_LOGGED_IN', async () => {
  const bad = await fakeCli('claude-err', `console.log(JSON.stringify({is_error:true,result:'boom'}));`);
  await assert.rejects(runLocalAgent({ provider: 'claude', prompt: 'x', bin: bad }), (e: LocalAgentError) => e.code === 'EXIT_NONZERO' && e.message.includes('boom'));
  const login = await fakeCli('claude-login', `console.log(JSON.stringify({is_error:true,result:'Not logged in · Please run /login'}));`);
  await assert.rejects(runLocalAgent({ provider: 'claude', prompt: 'x', bin: login }), (e: LocalAgentError) => e.code === 'NOT_LOGGED_IN' && e.message.includes('claude login'));
});

test('claude：非 JSON 输出 → BAD_OUTPUT', async () => {
  const bin = await fakeCli('claude-bad', `console.log('not json');`);
  await assert.rejects(runLocalAgent({ provider: 'claude', prompt: 'x', bin }), (e: LocalAgentError) => e.code === 'BAD_OUTPUT');
});

test('codex：读取 -o 文件，默认只读沙箱，结束后清理临时目录', async () => {
  const bin = await fakeCli('codex-ok', `${readStdin}const a=process.argv.slice(2);require('fs').writeFileSync(a[a.indexOf('-o')+1],'codex:'+input+'|'+a.join(' '));console.log('noise');});`);
  const out = await runLocalAgent({ provider: 'codex', prompt: 'hi', system: 'SYS', bin });
  assert.match(out.text, /^codex:SYS\n\n---\n\nhi\|exec --sandbox read-only --skip-git-repo-check --ephemeral/);
  const outFile = out.text.split('|')[1].split(' ').at(-2)!;
  await assert.rejects(readFile(outFile));
  const rw = await runLocalAgent({ provider: 'codex', prompt: 'hi', bin, allowTools: true });
  assert.match(rw.text, /--sandbox workspace-write/);
});

test('codex：未写输出 → BAD_OUTPUT', async () => {
  const bin = await fakeCli('codex-empty', `${readStdin}});`);
  await assert.rejects(runLocalAgent({ provider: 'codex', prompt: 'x', bin }), (e: LocalAgentError) => e.code === 'BAD_OUTPUT');
});

test('CLI 缺失 → NOT_INSTALLED，带安装/登录指引', async () => {
  await assert.rejects(
    runLocalAgent({ provider: 'codex', prompt: 'x', bin: join(dir, 'does-not-exist') }),
    (e: LocalAgentError) => e.code === 'NOT_INSTALLED' && e.message.includes('codex login'),
  );
});

test('非零退出 → EXIT_NONZERO，stderr 进入错误信息', async () => {
  const bin = await fakeCli('claude-fail', `console.error('kaboom');process.exit(3);`);
  await assert.rejects(runLocalAgent({ provider: 'claude', prompt: 'x', bin }), (e: LocalAgentError) => e.code === 'EXIT_NONZERO' && e.message.includes('kaboom') && e.message.includes('3'));
});

test('超时 → TIMEOUT 并真正杀掉子进程（含忽略 SIGTERM 的进程）', async () => {
  const pidFile = join(dir, 'stubborn.pid');
  const bin = await fakeCli('claude-hang', `process.on('SIGTERM',()=>{});require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000);`);
  const started = Date.now();
  await assert.rejects(runLocalAgent({ provider: 'claude', prompt: 'x', bin, timeout: 1500 }), (e: LocalAgentError) => e.code === 'TIMEOUT');
  assert.ok(Date.now() - started < 3000, '超时应立即报错，不等 SIGKILL');
  const pid = Number(await readFile(pidFile, 'utf8'));
  await new Promise((r) => setTimeout(r, 3500)); // SIGKILL 兜底在 3 秒后
  assert.throws(() => process.kill(pid, 0), '子进程应已被杀死');
});

test('含 shell 特殊字符的 prompt 原样到达子进程，不被 shell 解释', async () => {
  const marker = join(dir, 'pwned');
  const bin = await fakeCli('claude-echo', `${readStdin}console.log(JSON.stringify({result:input}));});`);
  const prompt = `$(touch ${marker}); \`touch ${marker}\` ; rm -rf / # "quoted" 'single' \\n 中文 && echo hi`;
  const out = await runLocalAgent({ provider: 'claude', prompt, bin });
  assert.equal(out.text, prompt);
  await assert.rejects(readFile(marker));
});

test('并发上限：默认 1 串行，LOCAL_AGENT_CONCURRENCY=2 允许两个并行，超过 2 按 2', async () => {
  const log = join(dir, 'conc.log');
  const bin = await fakeCli('claude-slow', `${readStdin}const fs=require('fs');fs.appendFileSync(${JSON.stringify(log)},'S');setTimeout(()=>{fs.appendFileSync(${JSON.stringify(log)},'E');console.log(JSON.stringify({result:'ok'}));},300);});`);
  const run = (env: NodeJS.ProcessEnv, n: number) => Promise.all(Array.from({ length: n }, () => runLocalAgent({ provider: 'claude', prompt: 'x', bin, env })));
  await writeFile(log, '');
  await run({}, 2);
  assert.equal(await readFile(log, 'utf8'), 'SESE');
  await writeFile(log, '');
  await run({ LOCAL_AGENT_CONCURRENCY: '2' }, 2);
  assert.equal(await readFile(log, 'utf8'), 'SSEE');
  await writeFile(log, '');
  await run({ LOCAL_AGENT_CONCURRENCY: '9' }, 3);
  assert.match(await readFile(log, 'utf8'), /^SS(ES|EE)/);
});

test('createLocalAgentLlm：多轮拼成带标记的 prompt，system 单独传', async () => {
  const bin = await fakeCli('claude-llm', `${readStdin}console.log(JSON.stringify({result:input}));});`);
  const llm = createLocalAgentLlm('claude', { LOCAL_AGENT_CLAUDE_BIN: bin });
  assert.equal(await llm({ system: 's', messages: [{ role: 'user', content: 'Q1' }] }), 'Q1');
  const multi = await llm({ system: 's', messages: [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' }, { role: 'user', content: 'Q2' }] });
  assert.match(multi, /\[用户\]\nQ1\n\n\[助手\]\nA1\n\n\[用户\]\nQ2/);
});

test('resolveLlm：按 LLM_PROVIDER / API key 选择', () => {
  assert.equal(resolveLlm({}), null);
  assert.equal(typeof resolveLlm({ ANTHROPIC_API_KEY: 'k' }), 'function');
  assert.equal(typeof resolveLlm({ LLM_PROVIDER: 'claude-cli' }), 'function');
  assert.equal(typeof resolveLlm({ LLM_PROVIDER: 'codex-cli' }), 'function');
  assert.equal(resolveLlm({ LLM_PROVIDER: 'api' }), null);
});
