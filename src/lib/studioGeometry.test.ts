import assert from 'node:assert/strict';
import test from 'node:test';
import { clientToStage, fitScale, nudgeRect, normalizeAngle, pointerAngle, resizeRect, rotatePoint, rotateRect, sceneIndexAt, sceneStartFrame, type Rect } from './studioGeometry';

const rect: Rect = { x: 100, y: 100, width: 200, height: 100, rotation: 0 };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test('坐标换算：缩放与原点', () => {
  assert.equal(fitScale(640, 1280), 0.5);
  assert.equal(fitScale(0, 1280), 1);
  assert.deepEqual(clientToStage({ x: 120, y: 70 }, { x: 20, y: 10 }, 0.5), { x: 200, y: 120 });
});

test('缩放：右下角手柄固定左上角，西侧手柄固定右边', () => {
  assert.deepEqual(resizeRect(rect, 'se', 50, 20), { ...rect, width: 250, height: 120 });
  const west = resizeRect(rect, 'w', -40, 0);
  assert.equal(west.width, 240);
  assert.equal(west.x + west.width, 300);
});

test('缩放：保持比例、最小尺寸', () => {
  const ratio = resizeRect(rect, 'se', 100, 0, true);
  close(ratio.width / ratio.height, 2);
  assert.equal(resizeRect(rect, 'e', -1000, 0).width, 8);
});

test('缩放：旋转 90° 后对边在屏幕上保持不动', () => {
  const turned: Rect = { ...rect, rotation: 90 };
  // 局部 e 方向在屏幕上朝下：向下拖 40 即宽度 +40
  const next = resizeRect(turned, 'e', 0, 40);
  close(next.width, 240);
  const anchor = (r: Rect) => rotatePoint({ x: r.x, y: r.y + r.height / 2 }, r.rotation, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const before = anchor(turned);
  const after = anchor(next);
  close(before.x, after.x);
  close(before.y, after.y);
});

test('旋转：角度累加、吸附与归一化', () => {
  close(pointerAngle({ x: 0, y: 0 }, { x: 0, y: -10 }), 0);
  close(pointerAngle({ x: 0, y: 0 }, { x: 10, y: 0 }), 90);
  const center = { x: 200, y: 150 };
  const rotated = rotateRect(rect, { x: center.x, y: 0 }, { x: 400, y: center.y });
  close(rotated.rotation, 90);
  assert.equal(rotateRect(rect, { x: center.x, y: 0 }, { x: 400, y: 120 }, true).rotation % 15, 0);
  assert.equal(normalizeAngle(270), -90);
  assert.equal(normalizeAngle(-190), 170);
});

test('方向键微调：普通 1px，shift 10px，其他键不动', () => {
  assert.equal(nudgeRect(rect, 'ArrowLeft').x, 99);
  assert.equal(nudgeRect(rect, 'ArrowDown', true).y, 110);
  assert.equal(nudgeRect(rect, 'a'), rect);
});

test('播放头所在场景与场景起始帧', () => {
  const durations = [30, 60, 30];
  assert.equal(sceneIndexAt(durations, 0), 0);
  assert.equal(sceneIndexAt(durations, 29), 0);
  assert.equal(sceneIndexAt(durations, 30), 1);
  assert.equal(sceneIndexAt(durations, 500), 2);
  assert.equal(sceneStartFrame(durations, 2), 90);
});
