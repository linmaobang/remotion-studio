import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlan, planDuration, samplePlan } from '../src/plan/schema';
import type { LlmFn } from './llm';
import { createAnthropicLlm } from './llm';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createPlanRouter, heuristicOptimize, normalizeOptimize, optimizePlan, PlanError, refinePlan } from './plan';
import type { ResolvedLlm } from './localAgent';

const req = normalizeOptimize({
  prompt: '咖啡店开业宣传',
  assets: [{ url: '/files/uploads/a.png', name: 'a.png', kind: 'image' }, { url: '/files/uploads/b.mp3', name: 'b.mp3', kind: 'audio' }],
})!;
const valid = () => JSON.stringify(samplePlan());
const assertValid = (plan: unknown) => assert.equal(parsePlan(plan).ok, true);

test('合法输出直接采用', async () => {
  const llm: LlmFn = async () => '```json\n' + valid() + '\n```';
  const result = await optimizePlan(req, llm);
  assert.equal(result.usedLLM, true);
  assertValid(result.plan);
  assert.equal(result.plan.audio.bgm?.src, '/files/uploads/b.mp3');
});

test('非法输出 → 带错误信息修复重试成功', async () => {
  const calls: string[][] = [];
  const llm: LlmFn = async ({ messages }) => {
    calls.push(messages.map((m) => m.content));
    return calls.length === 1 ? '不是 JSON' : valid();
  };
  const result = await optimizePlan(req, llm);
  assert.equal(calls.length, 2);
  assert.match(calls[1][2], /不合法/);
  assert.equal(result.usedLLM, true);
  assertValid(result.plan);
});

test('持续非法 → 最多 3 次调用后抛 502，不再静默降级', async () => {
  let n = 0;
  await assert.rejects(optimizePlan(req, async () => { n++; return '{"scenes":[]}'; }), (e: PlanError) => e.status === 502 && /修复仍不合法/.test(e.message) && /login/.test(e.message));
  assert.equal(n, 3);
});

test('LLM 抛错 → 502 并带原因', async () => {
  await assert.rejects(optimizePlan(req, async () => { throw new Error('network'); }), (e: PlanError) => e.status === 502 && e.message.includes('network'));
});

test('没有 AI 引擎 → 503', async () => {
  assert.equal(createAnthropicLlm({}), null);
  await assert.rejects(optimizePlan(req, null), (e: PlanError) => e.status === 503);
});

test('heuristicOptimize：明确标注本地模板，时长贴近要求，竖屏画幅，素材被放入', () => {
  const r = normalizeOptimize({ prompt: '科技产品发布', durationSec: 20, orientation: 'portrait', assets: [{ url: '/files/uploads/a.png', name: 'a', kind: 'image' }] })!;
  const result = heuristicOptimize(r);
  assert.equal(result.usedLLM, false);
  assert.equal(result.provider, 'heuristic');
  assert.match(result.warnings[0], /本地模板，未使用 AI/);
  assert.equal(planDuration(result.plan), 600);
  assert.equal(result.plan.format.height, 1920);
  assert.equal(result.plan.scenes.some((x) => x.kind === 'image-text' && x.imageSrc === '/files/uploads/a.png'), true);
  assertValid(result.plan);
});

test('空 prompt 视为无效请求', () => {
  assert.equal(normalizeOptimize({ prompt: '  ' }), null);
});

test('新增的场景字段（accentColor/emoji/enter）被保留，非法值被丢弃，旧方案不受影响', () => {
  const plan = samplePlan();
  const scenes = plan.scenes.map((x, i) => (i === 0 ? { ...x, accentColor: '#ff0000', emoji: '☕', enter: 'zoom' } : i === 1 ? { ...x, accentColor: 'not a color', enter: 'spin' } : x));
  const parsed = parsePlan({ ...plan, scenes });
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.deepEqual([parsed.plan.scenes[0].accentColor, parsed.plan.scenes[0].emoji, parsed.plan.scenes[0].enter], ['#ff0000', '☕', 'zoom']);
  assert.deepEqual([parsed.plan.scenes[1].accentColor, parsed.plan.scenes[1].enter], [undefined, undefined]);
  assert.equal(parsed.plan.scenes[2].enter, undefined);
});

test('refine：成功；失败与无引擎都抛错而不是原样返回', async () => {
  const base = samplePlan();
  const ok = await refinePlan(base, '改标题', async () => JSON.stringify({ ...base, title: '新标题' }));
  assert.equal(ok.usedLLM, true);
  assert.equal(ok.plan.title, '新标题');
  await assert.rejects(refinePlan(base, '改标题', async () => 'oops'), (e: PlanError) => e.status === 502);
  await assert.rejects(refinePlan(base, '改标题', null), (e: PlanError) => e.status === 503);
});

async function withServer(env: NodeJS.ProcessEnv, resolve: (choice?: never) => ResolvedLlm, run: (call: (path: string, body?: unknown) => Promise<{ status: number; json: any }>) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/plan', createPlanRouter(env, resolve as never));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/plan`;
  try {
    await run(async (path, body) => {
      const res = await fetch(base + path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: res.status, json: await res.json() };
    });
  } finally { server.close(); }
}
const okLlm = (llm: LlmFn): ResolvedLlm => ({ ok: true, id: 'claude', label: 'Claude Code', llm });
const none: ResolvedLlm = { ok: false, error: '没有可用的 AI 引擎：测试' };

test('路由：成功响应带 provider；provider 白名单；heuristic 显式选择', async () => {
  const seen: unknown[] = [];
  await withServer({}, ((choice: unknown) => { seen.push(choice); return okLlm(async () => valid()); }) as never, async (call) => {
    const ok = await call('/optimize', { prompt: '手冲咖啡', provider: 'codex' });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.json.usedLLM, ok.json.provider, ok.json.providerLabel], [true, 'claude', 'Claude Code']);
    assert.deepEqual(seen, ['codex']);
    assert.equal((await call('/optimize', { prompt: 'x', provider: 'rm -rf' })).status, 400);
    const h = await call('/optimize', { prompt: '手冲咖啡', provider: 'heuristic' });
    assert.equal(h.status, 200);
    assert.deepEqual([h.json.usedLLM, h.json.provider], [false, 'heuristic']);
    assert.equal((await call('/refine', { plan: samplePlan(), instruction: 'x', provider: 'heuristic' })).status, 400);
  });
});

test('路由：无引擎 503、AI 失败 502（均带 error），不返回本地模板', async () => {
  await withServer({}, (() => none) as never, async (call) => {
    const r = await call('/optimize', { prompt: '手冲咖啡' });
    assert.equal(r.status, 503);
    assert.match(r.json.error, /没有可用的 AI 引擎/);
    assert.equal(r.json.plan, undefined);
    assert.equal((await call('/refine', { plan: samplePlan(), instruction: '改' })).status, 503);
  });
  await withServer({}, (() => okLlm(async () => { throw new Error('超时'); })) as never, async (call) => {
    const r = await call('/optimize', { prompt: '手冲咖啡' });
    assert.equal(r.status, 502);
    assert.match(r.json.error, /超时/);
    assert.equal((await call('/refine', { plan: samplePlan(), instruction: '改' })).status, 502);
  });
});

test('路由：PLAN_ALLOW_HEURISTIC=1 时失败才退回本地模板，并明确标注', async () => {
  await withServer({ PLAN_ALLOW_HEURISTIC: '1' }, (() => none) as never, async (call) => {
    const r = await call('/optimize', { prompt: '手冲咖啡' });
    assert.equal(r.status, 200);
    assert.equal(r.json.usedLLM, false);
    assert.match(r.json.warnings.join(' '), /本地模板，未使用 AI/);
    const p = await call('/providers');
    assert.equal(p.json.allowHeuristic, true);
  });
});

test('GET /providers 返回各引擎可用状态', async () => {
  await withServer({ ANTHROPIC_API_KEY: 'k', PATH: '/nonexistent' }, (() => none) as never, async (call) => {
    const p = await call('/providers');
    assert.deepEqual(p.json.providers.map((x: { id: string; available: boolean }) => [x.id, x.available]), [['api', true], ['claude', false], ['codex', false]]);
    assert.equal(p.json.defaultProvider, 'api');
    assert.equal(JSON.stringify(p.json).includes('"k"'), false);
  });
});
