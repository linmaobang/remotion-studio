import { random, useCurrentFrame } from 'remotion';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import type { TemplateDef } from '../registry';
import { defaultConfig, Stage } from '../shared';

export const schema = z.object({
  title: z.string().max(24).describe('海报标题'),
  seed: z.string().describe('图形随机种子'),
  accent: zColor().describe('轨道颜色'),
  background: zColor().describe('背景颜色'),
}).describe('轨道粒子海报');

export const OrbitalGrid = ({ title, seed, accent, background }: z.infer<typeof schema>) => {
  const frame = useCurrentFrame();
  return (
    <Stage background={background}>
      <svg viewBox="0 0 1280 720" width="100%" height="100%">
        {Array.from({ length: 19 }, (_, i) => <path key={`grid-${i}`} d={`M${i * 72} 0V720 M0 ${i * 72}H1280`} stroke={accent} opacity="0.08" />)}
        {[130, 205, 280].map((r, i) => <ellipse key={r} cx="830" cy="360" rx={r} ry={r * 0.62} fill="none" stroke={accent} opacity={0.2 + i * 0.15} transform={`rotate(${i * 40 + frame * 0.15} 830 360)`} />)}
        {Array.from({ length: 30 }, (_, i) => {
          const angle = random(`${seed}-${i}-angle`) * Math.PI * 2 + frame * (0.008 + random(`${seed}-${i}-speed`) * 0.008);
          const r = 100 + random(`${seed}-${i}-radius`) * 190;
          return <circle key={i} cx={830 + Math.cos(angle) * r} cy={360 + Math.sin(angle) * r * 0.72} r={3 + random(`${seed}-${i}-size`) * 7} fill={accent} opacity={0.35 + random(`${seed}-${i}-opacity`) * 0.65} />;
        })}
        <circle cx="830" cy="360" r={36 + Math.sin(frame / 15) * 5} fill={accent} />
        <text x="80" y="190" fontSize="18" fill={accent} letterSpacing="6">秩序之中的流动</text>
        <text x="80" y="290" fontSize="52" fontWeight="700" fill="#ffffff">{title}</text>
        <text x="80" y="355" fontSize="24" fill="#ffffff" opacity="0.6">每条轨迹，都有自己的节奏。</text>
        <text x="80" y="640" fontSize="18" fill={accent}>轨道实验 / 生成图形</text>
      </svg>
    </Stage>
  );
};

export default {
  meta: { id: 'orbital-grid', name: '轨道实验', category: 'Motion graphics', tags: ['粒子', '轨道', '几何'], prompt: '用网格、椭圆轨道和带固定种子的粒子，制作一张持续运动的几何海报，左侧保留中文标题。', description: '固定种子的粒子沿轨道运动，重复渲染保持一致。' },
  component: OrbitalGrid,
  schema,
  defaultProps: { title: '万物自有轨迹', seed: 'orbit-01', accent: '#ffae70', background: '#151c32' },
  defaultConfig,
} satisfies TemplateDef;
