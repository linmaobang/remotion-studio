import { createDefaultLayer, totalDuration, type Layer, type Scene, type StudioProps, type TextLayer } from './model';

export interface StudioPreset {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  props: StudioProps;
}

const text = (id: string, name: string, content: string, patch: Partial<TextLayer>): Layer => ({ ...createDefaultLayer('text'), id, name, text: content, ...patch } as Layer);
const shape = (id: string, name: string, patch: Record<string, unknown>): Layer => ({ ...createDefaultLayer('shape'), id, name, ...patch } as Layer);
const gradient = (from: string, to: string) => ({ type: 'gradient' as const, from, to, angle: 135 });
const scene = (id: string, name: string, durationFrames: number, background: Scene['background'], layers: Layer[], transitionIn?: Scene['transitionIn']): Scene => ({ id, name, durationFrames, background, layers, ...(transitionIn ? { transitionIn } : {}) });
const pop = { type: 'pop' as const, frames: 18 };
const rise = { type: 'slide-up' as const, frames: 20 };

export const studioPresets: StudioPreset[] = [
  {
    id: 'title-opener', name: '标题开场', description: '渐变背景、大标题、副标题与装饰线条，适合作为视频开头。', width: 1280, height: 720,
    props: { scenes: [scene('opener', '开场', 120, gradient('#4f46e5', '#0ea5e9'), [
      text('title', '主标题', '在这里写下你的标题', { x: 140, y: 240, width: 1000, height: 140, fontSize: 88, durationFrames: 120, animationIn: pop }),
      shape('rule', '装饰线', { shape: 'line', x: 440, y: 400, width: 400, height: 6, fill: '#ffffff', durationFrames: 120, animationIn: { type: 'slide-left', frames: 20 } }),
      text('subtitle', '副标题', '一句话说明你想表达的内容', { x: 190, y: 430, width: 900, height: 70, fontSize: 36, fontWeight: 400, startFrame: 20, durationFrames: 100, animationIn: rise }),
    ])] },
  },
  {
    id: 'image-text', name: '图文介绍', description: '两个场景：要点介绍（含图片占位）与收尾，演示场景转场。', width: 1280, height: 720,
    props: { scenes: [
      scene('intro', '要点介绍', 150, { type: 'solid', color: '#0f172a' }, [
        shape('card', '图片底板', { shape: 'rect', x: 700, y: 110, width: 480, height: 500, fill: '#1e293b', radius: 24, durationFrames: 150, animationIn: { type: 'zoom-in', frames: 18 } }),
        { ...createDefaultLayer('image'), id: 'photo', name: '图片（点击属性面板上传）', x: 720, y: 130, width: 440, height: 460, durationFrames: 150, animationIn: { type: 'fade', frames: 20 } } as Layer,
        text('heading', '标题', '核心要点', { x: 80, y: 130, width: 560, height: 100, fontSize: 64, align: 'left', durationFrames: 150, animationIn: rise }),
        text('body', '正文', '用两三句话说明第一个观点，\n再补充一个关键细节。', { x: 80, y: 260, width: 560, height: 200, fontSize: 34, fontWeight: 400, align: 'left', startFrame: 20, durationFrames: 130, animationIn: { type: 'slide-left', frames: 20 } }),
      ]),
      scene('outro', '收尾', 90, gradient('#7c3aed', '#db2777'), [
        text('thanks', '结语', '谢谢观看', { x: 190, y: 270, width: 900, height: 140, fontSize: 96, durationFrames: 90, animationIn: pop }),
      ], { type: 'slide-left', frames: 15 }),
    ] },
  },
  {
    id: 'social-vertical', name: '社交竖屏 720x1280', description: '竖屏短视频：标题、卖点与行动号召三个场景。', width: 720, height: 1280,
    props: { scenes: [
      scene('hook', '钩子', 90, gradient('#f97316', '#ec4899'), [
        text('hook-title', '钩子标题', '你知道吗？', { x: 60, y: 480, width: 600, height: 200, fontSize: 110, durationFrames: 90, animationIn: pop }),
      ]),
      scene('point', '卖点', 120, { type: 'solid', color: '#111827' }, [
        shape('badge', '色块', { shape: 'rect', x: 60, y: 400, width: 600, height: 480, fill: '#2563eb', radius: 36, durationFrames: 120, animationIn: { type: 'zoom-in', frames: 18 } }),
        text('point-text', '卖点文字', '一个让人记住的\n核心卖点', { x: 100, y: 500, width: 520, height: 280, fontSize: 64, startFrame: 12, durationFrames: 108, animationIn: rise }),
      ], { type: 'slide-up', frames: 15 }),
      scene('cta', '行动号召', 90, gradient('#0ea5e9', '#22c55e'), [
        text('cta-text', '号召', '关注我，\n看更多', { x: 60, y: 480, width: 600, height: 300, fontSize: 88, durationFrames: 90, animationIn: pop }),
      ], { type: 'fade', frames: 15 }),
    ] },
  },
];

export const presetDuration = (preset: StudioPreset) => totalDuration(preset.props.scenes);
