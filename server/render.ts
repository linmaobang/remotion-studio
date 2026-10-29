import { Router } from 'express';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { maxSizeFor, type ProjectData, type RenderJob } from '../src/shared/types';
import { projectIdSchema, projectSchema, readProject } from './projects';

const jobs = new Map<string, RenderJob>();
let bundlePromise: Promise<string> | undefined;
const getBundle = () => {
  bundlePromise ??= bundle({ entryPoint: path.resolve(process.cwd(), 'src/remotion/index.ts'), enableCaching: true }).catch((error) => {
    bundlePromise = undefined;
    throw error;
  });
  return bundlePromise;
};

const rewriteSources = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(rewriteSources);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      (key === 'src' || key === 'imageSrc' || key === 'backgroundSrc') && typeof item === 'string' && item.startsWith('/')
        ? `http://127.0.0.1:${Number(process.env.PORT || 3217)}${item}` : rewriteSources(item),
    ]));
  }
  return value;
};

export const getRenderInputProps = (project: ProjectData): Record<string, unknown> => {
  const max = maxSizeFor(project.width, project.height);
  return {
  ...rewriteSources(project.props) as Record<string, unknown>,
  ...(project.timeline ? { timeline: rewriteSources(project.timeline) } : {}),
  width: Math.max(2, Math.floor(Math.min(project.width, max.width) / 2) * 2),
  height: Math.max(2, Math.floor(Math.min(project.height, max.height) / 2) * 2),
  fps: Math.max(1, Math.min(project.fps, 60)),
  durationInFrames: project.durationInFrames,
  };
};

const runRender = async (jobId: string, project: ProjectData) => {
  const job = jobs.get(jobId)!;
  const outputLocation = path.resolve(process.cwd(), 'data/renders', `${jobId}.mp4`);
  try {
    job.status = 'rendering';
    const serveUrl = await getBundle();
    const inputProps = getRenderInputProps(project);
    const composition = await selectComposition({ serveUrl, id: project.templateId, inputProps });
    await fs.mkdir(path.dirname(outputLocation), { recursive: true });
    await renderMedia({
      serveUrl, composition, inputProps, codec: 'h264', outputLocation,
      onProgress: ({ progress }) => { job.progress = Math.max(job.progress, Math.min(1, progress)); },
    });
    job.status = 'done';
    job.progress = 1;
    job.outputUrl = `/files/renders/${jobId}.mp4`;
  } catch (error) {
    console.error('Render failed:', error);
    job.status = 'error';
    job.error = error && typeof error === 'object' && 'message' in error
      ? String(error.message) : String(error);
    await fs.rm(outputLocation, { force: true }).catch(() => {});
  }
};

export const renderRouter = Router();
const renderRequestSchema = z.union([
  z.object({ projectId: projectIdSchema, project: z.never().optional() }),
  z.object({ project: projectSchema, projectId: z.never().optional() }),
]);
renderRouter.post('/', async (req, res) => {
  const request = renderRequestSchema.parse(req.body);
  const project = request.project ?? await readProject(request.projectId!);
  const jobId = randomUUID();
  jobs.set(jobId, { status: 'queued', progress: 0 });
  res.status(202).json({ jobId });
  setImmediate(() => { void runRender(jobId, project); });
});
renderRouter.get('/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: '渲染任务不存在' });
    return;
  }
  res.json(job);
});
