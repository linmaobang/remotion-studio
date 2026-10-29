// 方案编辑器的纯逻辑（无 React / DOM 依赖），便于单测。
import type { AssetRef } from '../../plan/api';
import { createId, planDuration, type Scene, type SceneKind, type VideoPlan } from '../../plan/schema';
import { planToConfig } from '../../templates/ai-video';
import type { ProjectData } from '../../shared/types';

export const MIN_SCENE_FRAMES = 15;

export const SCENE_KIND_LABELS: Record<SceneKind, string> = { title: '标题', 'image-text': '图文', list: '要点列表', stat: '数据', cta: '行动号召' };
export const TRANSITION_LABELS = { fade: '淡入', 'slide-left': '左滑入', 'slide-up': '上滑入', none: '无' } as const;

export const sceneStart = (scenes: readonly Pick<Scene, 'durationFrames'>[], index: number) =>
  scenes.slice(0, index).reduce((sum, scene) => sum + scene.durationFrames, 0);

/** 帧 → 场景下标；超出范围落在首/末场景。 */
export function sceneIndexAtFrame(scenes: readonly Pick<Scene, 'durationFrames'>[], frame: number): number {
  let end = 0;
  for (let i = 0; i < scenes.length; i++) {
    end += scenes[i].durationFrames;
    if (frame < end) return i;
  }
  return Math.max(0, scenes.length - 1);
}

/** 时长吸附：靠近 0.5 秒整数倍（阈值 5 帧）时吸附，否则取整帧；不小于 15 帧。 */
export function snapDuration(frames: number, fps: number, threshold = 5): number {
  const half = fps / 2;
  const nearest = Math.round(frames / half) * half;
  const snapped = Math.abs(frames - nearest) <= threshold ? Math.round(nearest) : Math.round(frames);
  return Math.max(MIN_SCENE_FRAMES, snapped);
}

/** 鼠标位置（相对时间轴内容左侧的像素）→ 插入位置 0..n（插入到该下标之前）。 */
export function insertGapAt(scenes: readonly Pick<Scene, 'durationFrames'>[], x: number, pxPerFrame: number): number {
  const frame = x / pxPerFrame;
  let start = 0;
  for (let i = 0; i < scenes.length; i++) {
    if (frame < start + scenes[i].durationFrames / 2) return i;
    start += scenes[i].durationFrames;
  }
  return scenes.length;
}

/** 把 from 场景移到插入位置 gap（0..n）。gap 为原位置前后时原样返回。 */
export function moveScene<T>(scenes: readonly T[], from: number, gap: number): T[] {
  if (from < 0 || from >= scenes.length || gap < 0 || gap > scenes.length || gap === from || gap === from + 1) return [...scenes];
  const next = [...scenes];
  const [item] = next.splice(from, 1);
  next.splice(gap > from ? gap - 1 : gap, 0, item);
  return next;
}

/** 调整场景时长（含吸附与最小值），转场帧数同步不超过时长一半。 */
export function resizeScene(scenes: readonly Scene[], index: number, frames: number, fps: number): Scene[] {
  return scenes.map((scene, i) => {
    if (i !== index) return scene;
    const durationFrames = snapDuration(frames, fps);
    return { ...scene, durationFrames, transition: { ...scene.transition, frames: Math.min(scene.transition.frames, Math.floor(durationFrames / 2)) } };
  });
}

const base = (kind: SceneKind, durationFrames: number) => ({ id: createId('scene'), kind, durationFrames, transition: { type: 'fade' as const, frames: 15 } });

export function createSceneOfKind(kind: SceneKind): Scene {
  switch (kind) {
    case 'title': return { ...base(kind, 120), kind, title: '新标题', subtitle: '副标题' };
    case 'image-text': return { ...base(kind, 150), kind, title: '图文介绍', body: '在这里写一两句说明。', imagePosition: 'right' };
    case 'list': return { ...base(kind, 150), kind, title: '核心要点', items: ['要点一', '要点二', '要点三'] };
    case 'stat': return { ...base(kind, 150), kind, title: '关键数据', stats: [{ value: '100+', label: '说明' }, { value: '95%', label: '说明' }] };
    case 'cta': return { ...base(kind, 120), kind, title: '立即行动', buttonText: '立即了解', subtitle: '了解更多' };
  }
}

export const duplicateSceneCopy = (scene: Scene): Scene => ({ ...structuredClone(scene), id: createId('scene') });

export type Orientation = 'landscape' | 'portrait';
export const orientationOf = (plan: VideoPlan): Orientation => (plan.format.height > plan.format.width ? 'portrait' : 'landscape');
export const setOrientation = (plan: VideoPlan, orientation: Orientation): VideoPlan => ({
  ...plan, format: { ...plan.format, ...(orientation === 'portrait' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }) },
});

/** 把方案写回项目，并同步画幅与总时长（Root 的 calculateMetadata 读取项目字段）。 */
export const withPlan = (project: ProjectData, plan: VideoPlan): ProjectData => {
  const config = planToConfig(plan);
  return { ...project, props: { ...project.props, plan }, width: config.width, height: config.height, fps: config.fps, durationInFrames: Math.max(1, planDuration(plan)) };
};

const fileName = (url: string) => decodeURIComponent(url.split('?')[0].split('/').pop() || url);
export const assetName = fileName;

/** 方案里已引用的素材，用于初始化素材库。 */
export function collectAssets(plan: VideoPlan): AssetRef[] {
  const found = new Map<string, AssetRef>();
  const add = (url: string | undefined, kind: AssetRef['kind']) => { if (url && !found.has(url)) found.set(url, { url, name: fileName(url), kind }); };
  for (const scene of plan.scenes) {
    add(scene.backgroundSrc, 'image');
    if (scene.kind === 'image-text') add(scene.imageSrc, 'image');
  }
  add(plan.audio.bgm?.src, 'audio');
  add(plan.audio.voiceover?.src, 'voiceover');
  return [...found.values()];
}

export const isTypingTarget = (target: EventTarget | null) =>
  typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
