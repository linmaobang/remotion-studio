import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlan, planDuration, samplePlan } from '../../plan/schema';
import { collectAssets, createSceneOfKind, insertGapAt, moveScene, orientationOf, resizeScene, sceneIndexAtFrame, sceneStart, setOrientation, snapDuration, withPlan } from './logic';
import type { ProjectData } from '../../shared/types';

const scenes = [{ durationFrames: 100 }, { durationFrames: 50 }, { durationFrames: 200 }];

test('时间到场景映射与场景起点', () => {
  assert.equal(sceneIndexAtFrame(scenes, 0), 0);
  assert.equal(sceneIndexAtFrame(scenes, 99), 0);
  assert.equal(sceneIndexAtFrame(scenes, 100), 1);
  assert.equal(sceneIndexAtFrame(scenes, 150), 2);
  assert.equal(sceneIndexAtFrame(scenes, 9999), 2);
  assert.equal(sceneStart(scenes, 2), 150);
});

test('时长吸附到 0.5 秒或整帧，最小 15 帧', () => {
  assert.equal(snapDuration(88, 30), 90);
  assert.equal(snapDuration(94, 30), 90); // 距 3 秒整 4 帧，吸附
  assert.equal(snapDuration(99, 30), 99); // 距任何半秒整数倍都超过 5 帧，保持整帧
  assert.equal(snapDuration(3, 30), 15);
  assert.equal(snapDuration(-40, 30), 15);
  assert.equal(snapDuration(31.4, 30), 30);
});

test('拖动位置换算插入下标，moveScene 重排', () => {
  assert.equal(insertGapAt(scenes, 10, 1), 0);
  assert.equal(insertGapAt(scenes, 120, 1), 1); // 位于第二场景前半
  assert.equal(insertGapAt(scenes, 140, 1), 2);
  assert.equal(insertGapAt(scenes, 9999, 1), 3);
  assert.deepEqual(moveScene(['a', 'b', 'c'], 0, 3), ['b', 'c', 'a']);
  assert.deepEqual(moveScene(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveScene(['a', 'b', 'c'], 0, 2), ['b', 'a', 'c']);
  assert.deepEqual(moveScene(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
  assert.deepEqual(moveScene(['a', 'b', 'c'], 1, 2), ['a', 'b', 'c']);
  assert.deepEqual(moveScene(['a', 'b', 'c'], 5, 0), ['a', 'b', 'c']);
});

test('resizeScene：吸附、最小值，转场帧数不超过一半', () => {
  const plan = samplePlan();
  const next = resizeScene(plan.scenes, 0, 22, 30);
  assert.equal(next[0].durationFrames, 22);
  assert.equal(next[0].transition.frames, 11);
  assert.equal(resizeScene(plan.scenes, 0, 20, 30)[0].durationFrames, 15); // 距 0.5 秒 5 帧内，吸附
  assert.equal(resizeScene(plan.scenes, 1, 2, 30)[1].durationFrames, 15);
  assert.equal(resizeScene(plan.scenes, 1, 178, 30)[1].durationFrames, 180);
  assert.equal(plan.scenes[0].durationFrames, 150); // 不修改原数据
});

test('新增场景对每种 kind 都通过 parsePlan 且无警告', () => {
  for (const kind of ['title', 'image-text', 'list', 'stat', 'cta'] as const) {
    const scene = createSceneOfKind(kind);
    const result = parsePlan({ scenes: [scene] });
    assert.ok(result.ok && result.warnings.length === 0, kind);
    if (result.ok) assert.deepEqual(result.plan.scenes[0].kind, kind);
  }
});

test('横竖屏切换与 withPlan 同步画幅和总时长', () => {
  const plan = samplePlan();
  assert.equal(orientationOf(plan), 'landscape');
  const portrait = setOrientation(plan, 'portrait');
  assert.deepEqual([portrait.format.width, portrait.format.height], [1080, 1920]);
  const project = { id: 'p', name: 'n', templateId: 'ai-video', props: { plan }, width: 1920, height: 1080, fps: 30, durationInFrames: 900, updatedAt: '' } as ProjectData;
  const next = withPlan(project, { ...portrait, scenes: portrait.scenes.slice(0, 2) });
  assert.deepEqual([next.width, next.height, next.durationInFrames], [1080, 1920, 330]);
  assert.equal(planDuration(next.props.plan as typeof plan), next.durationInFrames);
});

test('collectAssets 收集方案中已引用的素材并去重', () => {
  const parsed = parsePlan({ scenes: [{ kind: 'image-text', title: 'a', imageSrc: '/files/uploads/a%20b.png', backgroundSrc: '/files/uploads/a%20b.png' }], audio: { bgm: { src: '/files/uploads/m.mp3' }, voiceover: { src: '/files/uploads/v.mp3' } } });
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.deepEqual(collectAssets(parsed.plan).map((a) => [a.kind, a.name]), [['image', 'a b.png'], ['audio', 'm.mp3'], ['voiceover', 'v.mp3']]);
});
