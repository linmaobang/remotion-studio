import { z } from 'zod';
import type { TemplateDef } from '../registry';
import { parsePlan, planDuration, samplePlan, type VideoPlan } from '../../plan/schema';
import { AiVideoComposition } from './AiVideoComposition';

export const schema = z.object({ plan: z.any().describe('视频方案') }).describe('AI 视频');

/** 由方案推导项目的画幅与时长（calculateMetadata 读取项目的 width/height/fps/durationInFrames）。 */
export const planToConfig = (plan: VideoPlan) => ({ ...plan.format, durationInFrames: planDuration(plan) });

/** 容错版：非法方案回落到示例方案，供创建项目时使用。 */
export const configOf = (plan: unknown) => {
  const parsed = parsePlan(plan);
  return planToConfig(parsed.ok ? parsed.plan : samplePlan());
};

const sample = samplePlan();

export { AiVideoComposition };

export default {
  meta: { id: 'ai-video', name: 'AI 视频', category: 'Explainers', tags: ['AI', '方案驱动', '多场景'], prompt: '由视频方案（标题、图文、要点、数据、行动号召等场景，加主题色、字体、转场与配乐）驱动的整片成片，修改方案即可重新生成画面。', description: '把结构化的视频方案渲染成带转场、入场动画与配乐的完整视频；预览与导出共用同一组件。' },
  component: AiVideoComposition,
  schema,
  defaultProps: { plan: sample },
  defaultConfig: planToConfig(sample),
} satisfies TemplateDef;
