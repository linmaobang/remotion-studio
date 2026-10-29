import { z } from 'zod';
import { zColor } from '@remotion/zod-types';

export const FONT_FAMILIES = {
  system: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Songti SC", "SimSun", serif',
  songti: '"Songti SC", "SimSun", serif',
  kaiti: '"Kaiti SC", "KaiTi", serif',
  mono: 'Menlo, Monaco, "Courier New", monospace',
  rounded: '"PingFang SC", "Hiragino Maru Gothic ProN", "Microsoft YaHei", sans-serif',
} as const;
export type FontKey = keyof typeof FONT_FAMILIES;
const fontKeys = Object.keys(FONT_FAMILIES) as [FontKey, ...FontKey[]];

export const SCENE_TRANSITIONS = ['none', 'fade', 'slide-left', 'slide-up', 'zoom'] as const;
export const ANIMATION_PRESETS = ['none', 'fade', 'slide-up', 'slide-left', 'slide-right', 'zoom-in', 'pop'] as const;
export const TEXT_ANIMATION_PRESETS = [...ANIMATION_PRESETS, 'typewriter'] as const;
export const LOOP_PRESETS = ['none', 'float', 'pulse', 'spin'] as const;

const color = (fallback: string, label: string) => zColor().default(fallback).describe(label);
const frames = (fallback: number) => z.number().int().min(0).default(fallback);

const animation = (presets: readonly [string, ...string[]]) => z.object({
  type: z.enum(presets as [string, ...string[]]).default('none').describe('动画预设'),
  frames: frames(15).describe('动画帧数'),
});

export const backgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: color('#111318', '背景颜色') }),
  z.object({ type: z.literal('gradient'), from: color('#4f46e5', '渐变起点'), to: color('#0ea5e9', '渐变终点'), angle: z.number().default(135).describe('渐变角度') }),
]).describe('场景背景');

const baseShape = {
  id: z.string().min(1).describe('图层编号'),
  name: z.string().default('图层').describe('图层名称'),
  x: z.number().default(0).describe('横坐标'),
  y: z.number().default(0).describe('纵坐标'),
  width: z.number().positive().default(200).describe('宽度'),
  height: z.number().positive().default(100).describe('高度'),
  rotation: z.number().default(0).describe('旋转角度'),
  opacity: z.number().min(0).max(1).default(1).describe('不透明度'),
  startFrame: frames(0).describe('场景内起始帧'),
  durationFrames: z.number().int().min(1).default(90).describe('持续帧数'),
  visible: z.boolean().default(true).describe('是否可见'),
  locked: z.boolean().default(false).describe('是否锁定'),
  animationOut: animation(ANIMATION_PRESETS).optional().describe('出场动画'),
  loop: z.enum(LOOP_PRESETS).default('none').describe('循环动画'),
};

const textLayer = z.object({
  ...baseShape,
  type: z.literal('text'),
  animationIn: animation(TEXT_ANIMATION_PRESETS).optional().describe('入场动画'),
  text: z.string().default('输入文字').describe('文字内容'),
  fontSize: z.number().positive().default(64).describe('字号'),
  fontWeight: z.number().int().min(100).max(900).default(700).describe('字重'),
  color: color('#ffffff', '文字颜色'),
  align: z.enum(['left', 'center', 'right']).default('center').describe('对齐'),
  fontFamily: z.enum(fontKeys).default('system').describe('字体'),
});

const shapeLayer = z.object({
  ...baseShape,
  type: z.literal('shape'),
  animationIn: animation(ANIMATION_PRESETS).optional().describe('入场动画'),
  shape: z.enum(['rect', 'ellipse', 'line']).default('rect').describe('形状'),
  fill: color('#4f46e5', '填充颜色'),
  stroke: color('#ffffff', '描边颜色'),
  strokeWidth: z.number().min(0).default(0).describe('描边宽度'),
  radius: z.number().min(0).default(0).describe('圆角'),
});

const imageLayer = z.object({
  ...baseShape,
  type: z.literal('image'),
  animationIn: animation(ANIMATION_PRESETS).optional().describe('入场动画'),
  src: z.string().default('').describe('素材地址'),
  fit: z.enum(['cover', 'contain']).default('cover').describe('填充方式'),
});

const videoLayer = z.object({
  ...baseShape,
  type: z.literal('video'),
  animationIn: animation(ANIMATION_PRESETS).optional().describe('入场动画'),
  src: z.string().default('').describe('素材地址'),
  fit: z.enum(['cover', 'contain']).default('cover').describe('填充方式'),
  volume: z.number().min(0).max(1).default(1).describe('音量'),
});

const audioLayer = z.object({
  ...baseShape,
  type: z.literal('audio'),
  src: z.string().default('').describe('素材地址'),
  volume: z.number().min(0).max(1).default(1).describe('音量'),
});

export const layerSchema = z.discriminatedUnion('type', [textLayer, shapeLayer, imageLayer, videoLayer, audioLayer]).describe('图层');

export const sceneSchema = z.object({
  id: z.string().min(1).describe('场景编号'),
  name: z.string().default('场景').describe('场景名称'),
  durationFrames: z.number().int().min(1).default(90).describe('场景帧数'),
  background: backgroundSchema.default({ type: 'solid', color: '#111318' }),
  transitionIn: z.object({
    type: z.enum(SCENE_TRANSITIONS).default('none').describe('转场类型'),
    frames: frames(15).describe('转场帧数'),
  }).optional().describe('场景转场'),
  layers: z.array(layerSchema).default([]).describe('图层（靠后的在上层）'),
}).describe('场景');

export const schema = z.object({
  scenes: z.array(sceneSchema).min(1).describe('场景列表'),
}).describe('创作画布');

export type Background = z.infer<typeof backgroundSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type LayerType = Layer['type'];
export type TextLayer = z.infer<typeof textLayer>;
export type ShapeLayer = z.infer<typeof shapeLayer>;
export type ImageLayer = z.infer<typeof imageLayer>;
export type VideoLayer = z.infer<typeof videoLayer>;
export type AudioLayer = z.infer<typeof audioLayer>;
export type Scene = z.infer<typeof sceneSchema>;
export type StudioProps = z.infer<typeof schema>;
export type SceneTransitionType = (typeof SCENE_TRANSITIONS)[number];
export type AnimationPreset = (typeof TEXT_ANIMATION_PRESETS)[number];
export type LoopPreset = (typeof LOOP_PRESETS)[number];

export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);

const layerNames: Record<LayerType, string> = { text: '文字', shape: '形状', image: '图片', video: '视频', audio: '音频' };

/** 新图层带完整默认值；坐标为左上角，默认放在 1280x720 画布中央附近。 */
export function createDefaultLayer(type: LayerType, shape: ShapeLayer['shape'] = 'rect'): Layer {
  const base = {
    id: newId(), name: layerNames[type], x: 440, y: 260, width: 400, height: 200, rotation: 0, opacity: 1,
    startFrame: 0, durationFrames: 90, visible: true, locked: false, loop: 'none' as const,
  };
  const inAnimation = { type: 'none' as const, frames: 15 };
  switch (type) {
    case 'text': return { ...base, type, name: '文字', text: '输入文字', fontSize: 64, fontWeight: 700, color: '#ffffff', align: 'center', fontFamily: 'system', animationIn: inAnimation };
    case 'shape': return { ...base, type, name: shape === 'rect' ? '矩形' : shape === 'ellipse' ? '椭圆' : '线条', shape, height: shape === 'line' ? 8 : 200, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 0, radius: 0, animationIn: inAnimation };
    case 'image': return { ...base, type, src: '', fit: 'cover', animationIn: inAnimation };
    case 'video': return { ...base, type, src: '', fit: 'cover', volume: 1, animationIn: inAnimation };
    case 'audio': return { ...base, type, src: '', volume: 1, width: 100, height: 100 };
  }
}

export function createScene(): Scene {
  return { id: newId(), name: '新场景', durationFrames: 90, background: { type: 'solid', color: '#111318' }, layers: [] };
}

/** 场景按顺序首尾相接，转场只作用于入场场景自身，不产生重叠。 */
export function totalDuration(scenes: readonly Pick<Scene, 'durationFrames'>[]): number {
  return Math.max(1, scenes.reduce((sum, scene) => sum + Math.max(0, Math.floor(scene.durationFrames)), 0));
}
