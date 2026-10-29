import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlan, planDuration, samplePlan, createId } from './schema';

test('示例方案：5 个场景、900 帧，经 parsePlan 原样通过且无警告', () => {
  const sample = samplePlan();
  assert.equal(sample.scenes.length, 5);
  assert.equal(planDuration(sample), 900);
  const result = parsePlan(JSON.parse(JSON.stringify(sample)));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.plan.scenes.map((scene) => scene.kind), ['title', 'image-text', 'list', 'stat', 'cta']);
  assert.deepEqual(result.plan.format, { width: 1920, height: 1080, fps: 30 });
  assert.equal(planDuration(result.plan), 900);
});

test('只给场景也能补全默认值', () => {
  const result = parsePlan({ scenes: [{ kind: 'title', title: '你好' }] });
  assert.ok(result.ok);
  if (!result.ok) return;
  const { plan } = result;
  assert.equal(plan.version, 1);
  assert.equal(plan.title, '未命名方案');
  assert.deepEqual(plan.format, { width: 1920, height: 1080, fps: 30 });
  assert.equal(plan.scenes[0].durationFrames, 90);
  assert.deepEqual(plan.scenes[0].transition, { type: 'fade', frames: 15 });
  assert.ok(plan.scenes[0].id.length > 0);
  assert.deepEqual(plan.audio, {});
});

test('非法数值被钳制，未知字段被丢弃，坏场景被丢弃并给出警告', () => {
  const result = parsePlan({
    title: 123, hack: 'x',
    format: { width: '1080', height: 5000, fps: 999 },
    style: { theme: { primary: 'javascript:alert(1)', text: '#fff' } },
    scenes: [
      { kind: 'title', title: 'A', durationFrames: 3, transition: { type: 'wipe', frames: -5 }, extra: 1 },
      { kind: 'nope' },
      'garbage',
      { kind: 'list', title: 'L', items: ['a', '', 7, null], durationFrames: '120' },
      { kind: 'stat', stats: [{ value: 5, label: 'x' }, 'bad'] },
    ],
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  const { plan, warnings } = result;
  assert.equal(plan.title, '123');
  assert.deepEqual(plan.format, { width: 1080, height: 1920, fps: 60 }); // 竖屏上限 1080x1920
  assert.equal(plan.style.theme.primary, '#f59e0b'); // 非法颜色回落到默认值
  assert.equal(plan.style.theme.text, '#fff');
  assert.equal(plan.scenes.length, 3);
  assert.equal(plan.scenes[0].durationFrames, 15);
  assert.deepEqual(plan.scenes[0].transition, { type: 'fade', frames: 0 });
  assert.ok(!('extra' in plan.scenes[0]) && !('hack' in plan));
  const list = plan.scenes[1];
  assert.ok(list.kind === 'list' && list.durationFrames === 120);
  assert.deepEqual(list.kind === 'list' ? list.items : [], ['a', '7']);
  const stat = plan.scenes[2];
  assert.deepEqual(stat.kind === 'stat' ? stat.stats : [], [{ value: '5', label: 'x' }]);
  assert.equal(warnings.length, 2);
});

test('转场帧数不超过场景一半，重复或缺失的 id 会被替换为唯一值', () => {
  const result = parsePlan({ scenes: [
    { kind: 'cta', id: 'dup', durationFrames: 20, transition: { type: 'slide-up', frames: 100 } },
    { kind: 'cta', id: 'dup' },
    { kind: 'title' },
  ] });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.plan.scenes[0].transition.frames, 10);
  assert.equal(new Set(result.plan.scenes.map((scene) => scene.id)).size, 3);
});

test('音频：缺 src 被丢弃，音量与起始帧被钳制', () => {
  const result = parsePlan({ scenes: [{ kind: 'title' }], audio: { bgm: { volume: 0.5 }, voiceover: { src: '/files/uploads/v.mp3', volume: 9, startFrame: -3 } } });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.plan.audio.bgm, undefined);
  assert.deepEqual(result.plan.audio.voiceover, { src: '/files/uploads/v.mp3', volume: 1, startFrame: 0 });
});

test('非法输入返回错误而不抛异常', () => {
  for (const input of [null, undefined, 42, 'x', [], {}, { scenes: 'no' }, { scenes: [] }, { scenes: [{ kind: 'bad' }] }]) {
    const result = parsePlan(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    if (!result.ok) assert.ok(result.errors.length > 0);
  }
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.doesNotThrow(() => parsePlan({ scenes: [cyclic], title: cyclic }));
});

test('createId 生成不重复的 id', () => {
  assert.equal(new Set(Array.from({ length: 200 }, () => createId('x'))).size, 200);
});
