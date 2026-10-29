import { useState } from 'react';
import { useCurrentFrame, useRemotionEnvironment, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import type { TemplateDef } from '../registry';
import { defaultConfig, Stage } from '../shared';
import { getGameState } from './state';

export const schema = z.object({
  title: z.string().max(24).describe('游戏标题'),
  seed: z.string().describe('关卡随机种子'),
  accent: zColor().describe('光点颜色'),
  background: zColor().describe('背景颜色'),
}).describe('追光小游戏');

export const SignalGame = ({ title, seed, accent, background }: z.infer<typeof schema>) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const { isRendering } = useRemotionEnvironment();
  const [hits, setHits] = useState(0);
  const state = getGameState(frame, seed);
  const manualScore = isRendering ? 0 : hits * 10;
  return (
    <Stage background={background}>
      <svg viewBox="0 0 1280 720" width="100%" height="100%">
        <rect x="70" y="220" width="1140" height="380" rx="30" fill={accent} opacity="0.08" />
        <path d="M120 320H1160 M120 420H1160 M120 520H1160" stroke={accent} strokeOpacity="0.14" strokeDasharray="5 12" />
        <text x="80" y="100" fontSize="18" fill={accent} letterSpacing="6">追光训练场</text>
        <text x="80" y="175" fontSize="48" fill="#ffffff" fontWeight="700">{title}</text>
        <text x="1190" y="165" textAnchor="end" fontSize="42" fill={accent}>{String(state.score + manualScore).padStart(3, '0')}</text>
        <text x="80" y="665" fontSize="21" fill="#ffffff" opacity="0.7">{isRendering ? '光点按固定种子移动 · 自动演示' : `点击光点加分 · 已击中 ${hits} 次`}</text>
      </svg>
      <button type="button" aria-label="击中光点" disabled={isRendering} onClick={() => { if (!isRendering) setHits((value) => value + 1); }} style={{ position: 'absolute', left: `${state.x * 100}%`, top: `${state.y * 100}%`, transform: `translate(-50%, -50%) scale(${1 + Math.sin(frame / 5) * 0.08})`, width: width * 0.055, height: width * 0.055, borderRadius: '50%', border: `${width * 0.004}px solid #ffffff`, background: accent, boxShadow: `0 0 ${width * 0.025}px ${accent}`, cursor: isRendering ? 'default' : 'pointer', padding: 0 }} />
    </Stage>
  );
};

export default {
  meta: { id: 'signal-game', name: '追光训练场', category: 'Games & interactive', tags: ['小游戏', '点击', '确定性'], prompt: '制作一个追光小游戏，光点按固定种子生成的位置移动，预览时点击加分；视频导出使用纯帧驱动的自动演示分数。', description: '预览支持鼠标与键盘点击，渲染忽略手动分数并保持确定性。' },
  component: SignalGame,
  schema,
  defaultProps: { title: '跟上这束光', seed: 'signal-01', accent: '#ffd46d', background: '#22243b' },
  defaultConfig,
} satisfies TemplateDef;
