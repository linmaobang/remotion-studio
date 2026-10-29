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
  res.json({ url: `/files/uploads/${req.file.filename}`, name: sanitizeFilename(req.file.originalname), mime: req.file.mimetype });
});
