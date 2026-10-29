import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate } from 'remotion';

export const defaultConfig = { width: 1280, height: 720, fps: 30, durationInFrames: 180 };
export const fontFamily = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
export const progress = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export const Stage = ({ background, children, style }: { background: string; children: ReactNode; style?: CSSProperties }) => (
  <AbsoluteFill style={{ background, color: '#ffffff', fontFamily, overflow: 'hidden', ...style }}>
    {children}
  </AbsoluteFill>
);
