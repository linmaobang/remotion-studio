import { random } from 'remotion';
import { progress } from '../shared';

export const getGameState = (frame: number, seed: string) => {
  const round = Math.floor(Math.max(0, frame) / 30);
  const point = (index: number) => ({ x: 0.2 + random(`${seed}-${index}-x`) * 0.6, y: 0.38 + random(`${seed}-${index}-y`) * 0.36 });
  const previous = point(Math.max(0, round - 1));
  const next = point(round);
  const p = progress(frame % 30, 0, 12);
  return { x: previous.x + (next.x - previous.x) * p, y: previous.y + (next.y - previous.y) * p, score: round * 10 };
};
