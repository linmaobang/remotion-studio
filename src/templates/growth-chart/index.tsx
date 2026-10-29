import { useCurrentFrame } from 'remotion';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import type { TemplateDef } from '../registry';
import { defaultConfig, progress, Stage } from '../shared';

export const schema = z.object({
  title: z.string().max(24).describe('图表标题'),
  items: z.array(z.object({ label: z.string().max(10).describe('数据名称'), value: z.number().min(0).max(10000).describe('数据数值') }).describe('单项数据')).min(2).max(6).describe('对比数据'),
  unit: z.string().max(8).describe('数值单位'),
  accent: zColor().describe('柱形颜色'),
  background: zColor().describe('背景颜色'),
}).describe('柱形数据讲解');

export const GrowthChart = ({ title, items, unit, accent, background }: z.infer<typeof schema>) => {
  const frame = useCurrentFrame();
  const max = Math.max(1, ...items.map((item) => item.value));
  const spacing = 1020 / items.length;
  return (
    <Stage background={background}>
      <svg viewBox="0 0 1280 720" width="100%" height="100%">
        <text x="100" y="100" fontSize="18" fill={accent} letterSpacing="6">让变化看得见</text>
        <text x="100" y="180" fontSize="52" fontWeight="700" fill="#ffffff">{title}</text>
        {[0, 1, 2, 3].map((i) => <line key={i} x1="100" x2="1180" y1={280 + i * 100} y2={280 + i * 100} stroke="#ffffff" strokeOpacity="0.1" />)}
        {items.map((item, i) => {
          const p = progress(frame, 12 + i * 10, 80 + i * 10);
          const h = item.value / max * 280 * p;
          const x = 130 + i * spacing;
          return <g key={i}>
            <rect x={x} y={580 - h} width={spacing * 0.6} height={h} rx="10" fill={accent} opacity={0.5 + i / items.length * 0.5} />
            <text x={x + spacing * 0.3} y={558 - h} textAnchor="middle" fontSize="28" fontWeight="700" fill="#ffffff">{Math.round(item.value * p)}{unit}</text>
            <text x={x + spacing * 0.3} y="625" textAnchor="middle" fontSize="24" fill="#ffffff">{item.label}</text>
          </g>;
        })}
        <text x="1180" y="680" textAnchor="end" fontSize="16" fill="#ffffff" opacity="0.45">演示数据 · 可自行编辑</text>
      </svg>
    </Stage>
  );
};

export default {
  meta: { id: 'growth-chart', name: '变化可见', category: 'Explainers', tags: ['数据', '柱状图', '对比'], prompt: '制作一段中文数据讲解，用依次生长的柱形和同步增长的数字展示四个阶段的变化，并标明演示数据。', description: '可编辑数值、名称和单位的原创数据对比动画。' },
  component: GrowthChart,
  schema,
  defaultProps: { title: '每天多一点积累', items: [{ label: '第一周', value: 24 }, { label: '第二周', value: 46 }, { label: '第三周', value: 68 }, { label: '第四周', value: 92 }], unit: '次', accent: '#cbb4ff', background: '#252035' },
  defaultConfig,
} satisfies TemplateDef;
