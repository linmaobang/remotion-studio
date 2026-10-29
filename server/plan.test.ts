import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlan, planDuration, samplePlan } from '../src/plan/schema';
import type { LlmFn } from './llm';
import { createAnthropicLlm } from './llm';
import { normalizeOptimize, optimizePlan, refinePlan } from './plan';

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

test('持续非法 → 最多 3 次调用后降级', async () => {
  let n = 0;
  const result = await optimizePlan(req, async () => { n++; return '{"scenes":[]}'; });
  assert.equal(n, 3);
  assert.equal(result.usedLLM, false);
  assert.match(result.warnings.join(' '), /降级/);
  assertValid(result.plan);
  assert.equal(result.plan.scenes.some((s) => s.kind === 'image-text' && s.imageSrc === '/files/uploads/a.png'), true);
  assert.equal(result.plan.audio.bgm?.src, '/files/uploads/b.mp3');
});

test('LLM 抛错 → 降级', async () => {
  const result = await optimizePlan(req, async () => { throw new Error('network'); });
  assert.equal(result.usedLLM, false);
  assertValid(result.plan);
});

test('无 key → 降级，时长贴近要求，竖屏画幅', async () => {
  assert.equal(createAnthropicLlm({}), null);
  const r = normalizeOptimize({ prompt: '科技产品发布', durationSec: 20, orientation: 'portrait' })!;
  const result = await optimizePlan(r, null);
  assert.equal(result.usedLLM, false);
  assert.equal(planDuration(result.plan), 600);
  assert.equal(result.plan.format.height, 1920);
  assertValid(result.plan);
});

test('空 prompt 视为无效请求', () => {
  assert.equal(normalizeOptimize({ prompt: '  ' }), null);
});

test('refine：成功、失败原样返回、无 key 原样返回', async () => {
  const base = samplePlan();
  const edited = { ...base, title: '新标题' };
  const ok = await refinePlan(base, '改标题', async () => JSON.stringify(edited));
  assert.equal(ok.usedLLM, true);
  assert.equal(ok.plan.title, '新标题');
  const bad = await refinePlan(base, '改标题', async () => 'oops');
  assert.equal(bad.usedLLM, false);
  assert.equal(bad.plan.title, base.title);
  assert.ok(bad.warnings.length > 0);
  const none = await refinePlan(base, '改标题', null);
  assert.equal(none.plan.title, base.title);
  assert.ok(none.warnings.length > 0);
});
