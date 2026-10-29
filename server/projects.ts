import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ProjectData } from '../src/shared/types';

export const projectsDir = path.resolve(process.cwd(), 'data/projects');
export const projectIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const projectSchema = z.object({
  id: projectIdSchema,
  name: z.string(),
  templateId: z.string().min(1),
  props: z.record(z.unknown()),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  fps: z.number().finite().positive(),
  durationInFrames: z.number().int().positive(),
  timeline: z.object({ tracks: z.array(z.object({
    id: z.string(),
    type: z.enum(['video', 'audio', 'text']),
    clips: z.array(z.object({
      id: z.string(),
      type: z.enum(['video', 'image', 'audio', 'text']),
      src: z.string().optional(),
      text: z.string().optional(),
      style: z.record(z.unknown()).optional(),
      startFrame: z.number().int().nonnegative(),
      durationFrames: z.number().int().positive(),
      trimStartFrame: z.number().int().nonnegative(),
      volume: z.number().min(0).max(1),
      transitionIn: z.object({ type: z.enum(['fade', 'slide-left', 'slide-up', 'none']), frames: z.number().int().nonnegative() }).optional(),
      transitionOut: z.object({ type: z.enum(['fade', 'slide-left', 'slide-up', 'none']), frames: z.number().int().nonnegative() }).optional(),
    })),
  })) }).optional(),
  updatedAt: z.string(),
});

export const readProject = async (id: string): Promise<ProjectData> => {
  projectIdSchema.parse(id);
  return projectSchema.parse(JSON.parse(await fs.readFile(path.join(projectsDir, `${id}.json`), 'utf8')));
};

const writeProject = async (project: ProjectData) => {
  await fs.mkdir(projectsDir, { recursive: true });
  const destination = path.join(projectsDir, `${project.id}.json`);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(project, null, 2));
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
};

export const projectsRouter = Router();
projectsRouter.param('id', (req, res, next, id: string) => {
  if (!projectIdSchema.safeParse(id).success) {
    res.status(400).json({ error: '项目 id 无效' });
    return;
  }
  next();
});
projectsRouter.get('/', async (_req, res) => {
  await fs.mkdir(projectsDir, { recursive: true });
  const files = await fs.readdir(projectsDir);
  const projects = await Promise.all(files.filter((file) => file.endsWith('.json')).map((file) => readProject(file.slice(0, -5))));
  res.json(projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});
projectsRouter.post('/', async (req, res) => {
  const project = projectSchema.parse({
    name: '未命名项目', templateId: 'blank-timeline', props: {},
    width: 1280, height: 720, fps: 30, durationInFrames: 150,
    ...req.body, id: randomUUID(), updatedAt: new Date().toISOString(),
  });
  await writeProject(project);
  res.status(201).json(project);
});
projectsRouter.get('/:id', async (req, res) => {
  res.json(await readProject(req.params.id));
});
projectsRouter.put('/:id', async (req, res) => {
  await readProject(req.params.id);
  const project = projectSchema.parse({ ...req.body, id: req.params.id, updatedAt: new Date().toISOString() });
  await writeProject(project);
  res.json(project);
});
projectsRouter.delete('/:id', async (req, res) => {
  await fs.unlink(path.join(projectsDir, `${req.params.id}.json`));
  res.status(204).end();
});
