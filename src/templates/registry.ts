import type { FC } from 'react';
import type { z } from 'zod';
import type { TemplateMeta } from '../shared/types';
import { templates } from './index';

export interface TemplateDef {
  meta: TemplateMeta;
  component: FC<any>;
  schema: z.ZodTypeAny;
  defaultProps: Record<string, unknown>;
  defaultConfig: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
  };
}

export { templates };

export const getTemplate = (id: string): TemplateDef | undefined => templates.find((t) => t.meta.id === id);
