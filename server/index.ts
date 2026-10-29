import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { ZodError } from 'zod';
import { projectsRouter } from './projects';
import { uploadRouter } from './upload';
import { renderRouter } from './render';
import { planRouter } from './plan';

const PORT = Number(process.env.PORT || 3217);
const HOST = '127.0.0.1';
const dataDir = path.resolve(process.cwd(), 'data');
for (const sub of ['projects', 'uploads', 'renders']) fs.mkdirSync(path.join(dataDir, sub), { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/files', express.static(dataDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/projects', projectsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/render', renderRouter);
app.use('/api/plan', planRouter);

app.use(((error, _req, res, _next) => {
  const code = (error as NodeJS.ErrnoException).code;
  const status = error instanceof ZodError ? 400
    : error instanceof multer.MulterError ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
    : code === 'ENOENT' ? 404
    : (error as { status?: number }).status || 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: status === 500 ? '服务内部错误' : error.message });
}) as express.ErrorRequestHandler);

app.listen(PORT, HOST, (error?: Error) => {
  if (error) {
    console.error(`API failed to listen on http://${HOST}:${PORT}`, error);
    process.exit(1);
  }
  console.log(`API listening on http://${HOST}:${PORT}`);
});
