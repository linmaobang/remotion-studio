import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
export const sanitizeFilename = (name: string) => {
  const basename = path.posix.basename(name.replace(/\\/g, '/'));
  return basename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(-120) || 'file';
};
const AUDIO_MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' };
/** 浏览器常给音频标 application/octet-stream（或空）；此时按扩展名补全为 audio/*，其余保持原 mime。 */
const resolveMime = (mimetype: string, filename: string) => {
  if (mimetype && mimetype !== 'application/octet-stream') return mimetype;
  return AUDIO_MIME[path.extname(filename).slice(1).toLowerCase()] ?? mimetype;
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdir(uploadsDir, { recursive: true }, (error) => callback(error, uploadsDir));
    },
    filename: (_req, file, callback) => callback(null, `${randomUUID()}-${sanitizeFilename(file.originalname)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1 },
});

export const uploadRouter = Router();
uploadRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '缺少 file 文件' });
    return;
  }
  res.json({ url: `/files/uploads/${req.file.filename}`, name: sanitizeFilename(req.file.originalname), mime: resolveMime(req.file.mimetype, req.file.originalname) });
});
