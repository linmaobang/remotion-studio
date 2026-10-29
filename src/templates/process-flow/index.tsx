import { useCurrentFrame } from 'remotion';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import type { TemplateDef } from '../registry';
import { defaultConfig, progress, Stage } from '../shared';

export const schema = z.object({
  title: z.string().max(24).describe('流程标题'),
  steps: z.array(z.string().min(1).max(12).describe('步骤名称')).min(2).max(5).describe('流程步骤'),
  accent: zColor().describe('流程强调色'),
  background: zColor().describe('背景色'),
}).describe('分步流程讲解');

export const ProcessFlow = ({ title, steps, accent, background }: z.infer<typeof schema>) => {
  const frame = useCurrentFrame();
  const spacing = 1040 / (steps.length - 1);
  return (
    <Stage background={background}>
      <svg viewBox="0 0 1280 720" width="100%" height="100%">
        <text x="100" y="130" fontSize="18" fill={accent} letterSpacing="6">把过程说清楚</text>
        <text x="100" y="210" fontSize="54" fontWeight="700" fill="#ffffff">{title}</text>
        <path d="M120 390H1160" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="4" />
        <path d={`M120 390H${120 + 1040 * progress(frame, 15, 130)}`} stroke={accent} strokeWidth="4" />
        {steps.map((step, i) => {
          const p = progress(frame, i * 24 + 5, i * 24 + 22);
          const x = 120 + i * spacing;
          return <g key={i} opacity={p} transform={`translate(0 ${24 * (1 - p)})`}>
            <circle cx={x} cy="390" r="32" fill={accent} />
            <text x={x} y="398" textAnchor="middle" fontSize="24" fontWeight="700" fill={background}>{i + 1}</text>
            <text x={x} y="478" textAnchor="middle" fontSize="24" fill="#ffffff">{step}</text>
            <text x={x} y="520" textAnchor="middle" fontSize="16" fill={accent}>步骤 {i + 1}</text>
          </g>;
        })}
        <text x="100" y="640" fontSize="20" fill="#ffffff" opacity="0.55">一步一步，把想法变成结果。</text>
      </svg>
    </Stage>
  );
};

export default {
  meta: { id: 'process-flow', name: '一步一步', category: 'Explainers', tags: ['流程', '讲解', '步骤'], prompt: '将一个过程拆成四个步骤，让连接线从左向右延伸，节点和中文步骤名称依次出现。', description: '适合方法介绍、产品流程与知识讲解的原创节点动画。' },
  component: ProcessFlow,
  schema,
  defaultProps: { title: '一个想法如何落地', steps: ['观察问题', '提出假设', '小步尝试', '复盘改进'], accent: '#78dac8', background: '#172d32' },
  defaultConfig,
} satisfies TemplateDef;
