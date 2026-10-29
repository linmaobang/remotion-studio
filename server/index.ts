import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { projectsRouter } from './projects';
import { uploadRouter } from './upload';
import { renderRouter } from './render';

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

app.listen(PORT, HOST, (error?: Error) => {
  if (error) {
    console.error(`API failed to listen on http://${HOST}:${PORT}`, error);
    process.exit(1);
  }
  console.log(`API listening on http://${HOST}:${PORT}`);
});
