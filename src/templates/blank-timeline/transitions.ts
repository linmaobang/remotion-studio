import { interpolate } from 'remotion';
import type { Clip } from '../../shared/types';

export const getClipTransition = (clip: Clip, frame: number, width: number, height: number) => {
  let opacity = 1;
  let x = 0;
  let y = 0;
  for (const direction of ['in', 'out'] as const) {
    const transition = direction === 'in' ? clip.transitionIn : clip.transitionOut;
    if (!transition || transition.type === 'none' || transition.frames <= 0 || clip.durationFrames <= 1) continue;
    const frames = Math.min(transition.frames, clip.durationFrames - 1);
    const range = direction === 'in' ? [0, frames] : [clip.durationFrames - 1 - frames, clip.durationFrames - 1];
    const amount = interpolate(frame, range, direction === 'in' ? [1, 0] : [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    if (transition.type === 'fade') opacity *= 1 - amount;
    if (transition.type === 'slide-left') x += amount * width * (direction === 'in' ? 1 : -1);
    if (transition.type === 'slide-up') y += amount * height * (direction === 'in' ? 1 : -1);
  }
  return { opacity, transform: `translate(${x}px, ${y}px)` };
};
