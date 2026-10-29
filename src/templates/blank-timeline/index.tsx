import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import type { TemplateDef } from '../registry';
import { defaultConfig } from '../shared';
import { TimelineComposition } from './TimelineComposition';

const transitionSchema = z.object({
  type: z.enum(['fade', 'slide-left', 'slide-up', 'none']).describe('转场类型'),
  frames: z.number().int().min(0).describe('转场帧数'),
}).describe('片段转场');

const styleSchema = z.object({
  color: zColor().optional().describe('文字颜色'),
  backgroundColor: zColor().optional().describe('背景颜色'),
}).catchall(z.unknown()).describe('片段样式');

export const clipSchema = z.object({
  id: z.string().min(1).describe('片段编号'),
  type: z.enum(['video', 'image', 'audio', 'text']).describe('片段类型'),
  src: z.string().min(1).optional().describe('素材地址'),
  text: z.string().optional().describe('文字内容'),
  style: styleSchema.optional().describe('片段样式'),
  startFrame: z.number().int().min(0).describe('时间线起始帧'),
  durationFrames: z.number().int().min(1).describe('片段持续帧数'),
  trimStartFrame: z.number().int().min(0).describe('素材内起始帧'),
  volume: z.number().min(0).max(1).describe('素材音量'),
  transitionIn: transitionSchema.optional().describe('入场转场'),
  transitionOut: transitionSchema.optional().describe('出场转场'),
}).superRefine((clip, context) => {
  if (clip.type !== 'text' && !clip.src) context.addIssue({ code: z.ZodIssueCode.custom, path: ['src'], message: '音视频或图片片段需要素材地址' });
}).describe('时间线片段');

export const schema = z.object({
  timeline: z.object({
    tracks: z.array(z.object({
      id: z.string().min(1).describe('轨道编号'),
      type: z.enum(['video', 'audio', 'text']).describe('轨道类型'),
      clips: z.array(clipSchema).describe('轨道片段'),
    }).describe('时间线轨道')).describe('轨道列表'),
  }).describe('剪辑时间线'),
}).describe('空白剪辑模板');

export { TimelineComposition };

export default {
  meta: { id: 'blank-timeline', name: '空白剪辑', category: '剪辑', tags: ['时间线', '音视频', '自由剪辑'], prompt: '从空白画布开始，添加视频、图片、音频与文字轨道，按帧设置时长、素材内起点、音量以及淡入淡出或滑动转场。', description: '可复用的多轨时间线组件，后添加的轨道显示在上层。' },
  component: TimelineComposition,
  schema,
  defaultProps: { timeline: { tracks: [] } },
  defaultConfig,
} satisfies TemplateDef;
