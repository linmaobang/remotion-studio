import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import type { TemplateDef } from '../registry';
import { defaultConfig, Stage } from '../shared';

export const schema = z.object({
  title: z.string().min(1).max(18).describe('主标题'),
  subtitle: z.string().max(40).describe('副标题'),
  accent: zColor().describe('强调色'),
  background: zColor().describe('背景色'),
}).describe('弹性文字海报');

export const KineticType = ({ title, subtitle, accent, background }: z.infer<typeof schema>) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage background={background}>
      <svg viewBox="0 0 1280 720" width="100%" height="100%">
        <circle cx="1080" cy="120" r={180 + Math.sin(frame / 22) * 16} fill={accent} opacity="0.16" />
        <text x="90" y="135" fontSize="20" fill={accent} letterSpacing="8">文字 / 节奏 / 表达</text>
        {Array.from(title).map((letter, index) => {
          const enter = spring({ frame: frame - index * 4, fps, config: { damping: 14, stiffness: 120 } });
          const size = Math.min(112, 1080 / Array.from(title).length);
          return <text key={index} x={90 + index * size} y={365 + (1 - enter) * 140} fontSize={size} fontWeight="800" fill="#ffffff" opacity={Math.min(1, enter)}>{letter}</text>;
        })}
        <rect x="90" y="420" width={interpolate(frame, [18, 65], [0, 1100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} height="6" fill={accent} />
        <text x="90" y="500" fontSize="30" fill="#ffffff">{subtitle}</text>
        <text x="90" y="640" fontSize="18" fill={accent}>让每一个字，都有登场的时刻。</text>
      </svg>
    </Stage>
  );
};

export default {
  meta: { id: 'kinetic-type', name: '字有回响', category: 'Motion graphics', tags: ['文字', '弹性', '海报'], prompt: '制作一张深色文字海报，让主标题逐字弹入，强调线从左向右展开，背景圆形缓慢呼吸。', description: '逐字弹性入场的原创动态文字海报。' },
  component: KineticType,
  schema,
  defaultProps: { title: '让想法发生', subtitle: '从一个念头，到一次行动', accent: '#b9f86b', background: '#14241e' },
  defaultConfig,
} satisfies TemplateDef;
