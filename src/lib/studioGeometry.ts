export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number; rotation: number };
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const MIN_SIZE = 8;

const rad = (deg: number) => (deg * Math.PI) / 180;

export const rotatePoint = (point: Point, deg: number, center: Point = { x: 0, y: 0 }): Point => {
  const cos = Math.cos(rad(deg));
  const sin = Math.sin(rad(deg));
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
};

/** 预览容器宽度换算为合成像素到屏幕像素的缩放比例。 */
export const fitScale = (containerWidth: number, compositionWidth: number) =>
  compositionWidth > 0 && containerWidth > 0 ? containerWidth / compositionWidth : 1;

/** 屏幕坐标（相对预览容器左上角）→ 合成坐标。 */
export const clientToStage = (client: Point, origin: Point, scale: number): Point => ({
  x: (client.x - origin.x) / scale,
  y: (client.y - origin.y) / scale,
});

export const centerOf = (rect: Rect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

export const normalizeAngle = (deg: number) => {
  const value = ((deg % 360) + 360) % 360;
  return value > 180 ? value - 360 : value;
};

export const moveRect = (rect: Rect, dx: number, dy: number): Rect => ({ ...rect, x: rect.x + dx, y: rect.y + dy });

const SIGNS: Record<Handle, [number, number]> = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };

/**
 * 拖动手柄缩放：delta 为合成坐标下的指针位移；对边（角点时为对角）在屏幕上保持不动，旋转后同样成立。
 * keepRatio 仅对角点生效。
 */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number, keepRatio = false): Rect {
  const [sx, sy] = SIGNS[handle];
  const local = rotatePoint({ x: dx, y: dy }, -rect.rotation);
  let width = Math.max(MIN_SIZE, rect.width + sx * local.x);
  let height = Math.max(MIN_SIZE, rect.height + sy * local.y);
  if (keepRatio && sx !== 0 && sy !== 0) {
    const ratio = Math.max(width / rect.width, height / rect.height);
    width = Math.max(MIN_SIZE, rect.width * ratio);
    height = Math.max(MIN_SIZE, rect.height * ratio);
  }
  const shift = rotatePoint({ x: (sx * (width - rect.width)) / 2, y: (sy * (height - rect.height)) / 2 }, rect.rotation);
  const center = centerOf(rect);
  return { ...rect, width, height, x: center.x + shift.x - width / 2, y: center.y + shift.y - height / 2 };
}

/** 指针相对中心的角度（度），以正上方为 0，顺时针为正。 */
export const pointerAngle = (center: Point, pointer: Point) =>
  (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI + 90;

/** 旋转手柄：以起始角度为基准累加指针转过的角度；snap 时吸附到 15°。 */
export function rotateRect(rect: Rect, startPointer: Point, pointer: Point, snap = false): Rect {
  const center = centerOf(rect);
  let rotation = rect.rotation + pointerAngle(center, pointer) - pointerAngle(center, startPointer);
  if (snap) rotation = Math.round(rotation / 15) * 15;
  return { ...rect, rotation: normalizeAngle(rotation) };
}

export function nudgeRect(rect: Rect, key: string, big = false): Rect {
  const step = big ? 10 : 1;
  if (key === 'ArrowLeft') return moveRect(rect, -step, 0);
  if (key === 'ArrowRight') return moveRect(rect, step, 0);
  if (key === 'ArrowUp') return moveRect(rect, 0, -step);
  if (key === 'ArrowDown') return moveRect(rect, 0, step);
  return rect;
}

/** 返回播放头所在场景的下标；超出范围时落在首/末场景。 */
export function sceneIndexAt(durations: readonly number[], frame: number): number {
  let start = 0;
  for (let i = 0; i < durations.length; i++) {
    start += Math.max(1, durations[i]);
    if (frame < start) return i;
  }
  return Math.max(0, durations.length - 1);
}

export const sceneStartFrame = (durations: readonly number[], index: number) =>
  durations.slice(0, index).reduce((sum, value) => sum + Math.max(1, value), 0);
