import type { TemplateDef } from '../registry';
import { StudioComposition } from './StudioComposition';
import { createDefaultLayer, schema, totalDuration, type StudioProps } from './model';

const title = { ...createDefaultLayer('text'), name: '标题', x: 140, y: 280, width: 1000, height: 160, text: '在这里写下你的标题', fontSize: 80, durationFrames: 90, animationIn: { type: 'slide-up' as const, frames: 20 } };

const defaultProps: StudioProps = {
  scenes: [{ id: 'scene-1', name: '场景 1', durationFrames: 90, background: { type: 'gradient', from: '#4f46e5', to: '#0ea5e9', angle: 135 }, layers: [{ ...title, id: 'title' }] }],
};

export { StudioComposition };

export default {
  meta: { id: 'studio-canvas', name: '创作画布', category: '剪辑', tags: ['自由创作', '多场景', '图层'], prompt: '从空白画布开始自由创作：按场景组织内容，在每个场景里叠加文字、形状、图片、视频与音频图层，设置位置、旋转、不透明度、入场/出场/循环动画以及场景转场。', description: '多场景、多图层的自由创作底座，时长由场景总帧数决定。' },
  component: StudioComposition,
  schema,
  defaultProps,
  defaultConfig: { width: 1280, height: 720, fps: 30, durationInFrames: totalDuration(defaultProps.scenes) },
} satisfies TemplateDef;
