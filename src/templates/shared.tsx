import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';

/** 仅编辑器预览提供：暂停时，停在场景起点显示该场景首个稳定帧。导出渲染不提供，默认 false。 */
export const HoldStartContext = createContext(false);

/** 暂停且在场景第 0 帧时，把子树时间前移 offset 帧（只影响显示，不改时间轴）。 */
export const StableStart = ({ offset, children }: { offset: number; children: ReactNode }) => {
  const hold = useContext(HoldStartContext);
  const local = useCurrentFrame();
  if (!hold || local !== 0 || offset <= 0) return <>{children}</>;
  return <Sequence from={-offset}>{children}</Sequence>;
};

export const defaultConfig = { width: 1280, height: 720, fps: 30, durationInFrames: 180 };
export const fontFamily = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
export const progress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const Stage = ({ background, children, style }: { background: string; children: ReactNode; style?: CSSProperties }) => (
  <AbsoluteFill style={{ background, color: '#ffffff', fontFamily, overflow: 'hidden', ...style }}>
    {children}
  </AbsoluteFill>
);
