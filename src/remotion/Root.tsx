import React from 'react';
import { Composition } from 'remotion';
import { templates } from '../templates/registry';
import { maxSizeFor } from '../shared/types';

const clamp = (v: unknown, fallback: number, max?: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : fallback;
  return max ? Math.min(n, max) : n;
};

export const RemotionRoot: React.FC = () => (
  <>
    {templates.map((t) => (
      <Composition
        key={t.meta.id}
        id={t.meta.id}
        component={t.component}
        schema={t.schema as any}
        defaultProps={t.defaultProps as any}
        width={t.defaultConfig.width}
        height={t.defaultConfig.height}
        fps={t.defaultConfig.fps}
        durationInFrames={t.defaultConfig.durationInFrames}
        calculateMetadata={({ props }: { props: Record<string, unknown> }) => {
          const max = maxSizeFor(clamp(props.width, t.defaultConfig.width), clamp(props.height, t.defaultConfig.height));
          return {
          width: clamp(props.width, t.defaultConfig.width, max.width),
          height: clamp(props.height, t.defaultConfig.height, max.height),
          fps: clamp(props.fps, t.defaultConfig.fps),
          durationInFrames: clamp(props.durationInFrames, t.defaultConfig.durationInFrames),
          };
        }}
      />
    ))}
  </>
);
