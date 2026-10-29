import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { ProjectData } from '../src/shared/types';
import { getRenderInputProps } from './render';
import { sanitizeFilename } from './upload';

const project: ProjectData = {
  id: 'test', name: '测试', templateId: 'blank-timeline', props: { src: '/files/uploads/image.png', nested: [{ src: 'https://example.com/a.png' }] },
  width: 9999, height: 719, fps: 100, durationInFrames: 30, updatedAt: '',
  timeline: { tracks: [{ id: 'track', type: 'video', clips: [{ id: 'clip', type: 'image', src: '/files/uploads/image.png', startFrame: 0, durationFrames: 30, trimStartFrame: 0, volume: 1 }] }] },
};

test('渲染参数限制尺寸和 fps，递归改写素材地址且不修改项目', () => {
  const input = getRenderInputProps(project);
  assert.equal(input.width, 1920);
  assert.equal(input.height, 718);
  assert.equal(input.fps, 60);
  assert.equal(input.durationInFrames, 30);
  const origin = `http://127.0.0.1:${Number(process.env.PORT || 3217)}`;
  assert.equal(input.src, `${origin}/files/uploads/image.png`);
  assert.equal((input.timeline as ProjectData['timeline'])!.tracks[0].clips[0].src, `${origin}/files/uploads/image.png`);
  assert.deepEqual(input.nested, [{ src: 'https://example.com/a.png' }]);
  assert.equal(project.props.src, '/files/uploads/image.png');
  const minimum = getRenderInputProps({ ...project, width: 1, height: 1, fps: 0.1 });
  assert.deepEqual([minimum.width, minimum.height, minimum.fps], [2, 2, 1]);
  const portrait = getRenderInputProps({ ...project, width: 720, height: 1280 });
  assert.deepEqual([portrait.width, portrait.height], [720, 1280]);
  const huge = getRenderInputProps({ ...project, width: 2000, height: 4000 });
  assert.deepEqual([huge.width, huge.height], [1080, 1920]);
});

test('上传名称清除路径和特殊字符', () => {
  assert.equal(sanitizeFilename('../../a b.txt'), 'a_b.txt');
  assert.equal(sanitizeFilename('C:\\temp\\a.txt'), 'a.txt');
  assert.equal(sanitizeFilename('..'), 'file');
});

test('项目 CRUD、上传、错误响应通过已挂载 API', { timeout: 30000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remotion-api-test-'));
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', fileURLToPath(new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url)), fileURLToPath(new URL('./index.ts', import.meta.url))], {
    cwd: directory, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stderr.on('data', (chunk) => { logs += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`启动超时: ${logs}`)), 15000);
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('API listening')) { clearTimeout(timer); resolve(); }
      });
      child.once('exit', () => { clearTimeout(timer); reject(new Error(logs)); });
    });
    const created = await fetch(`${origin}/api/projects`, json('POST', { ...project, id: '../escape' }));
    assert.equal(created.status, 201);
    const saved = await created.json() as ProjectData;
    assert.match(saved.id, /^[a-z0-9-]+$/);
    assert.ok(saved.updatedAt);
    assert.equal((await (await fetch(`${origin}/api/projects`)).json() as ProjectData[]).length, 1);
    assert.deepEqual(await (await fetch(`${origin}/api/projects/${saved.id}`)).json(), saved);
    const updated = await fetch(`${origin}/api/projects/${saved.id}`, json('PUT', { ...saved, name: '更新' }));
    assert.equal(updated.status, 200);
    assert.equal((await updated.json() as ProjectData).name, '更新');
    assert.equal((await fetch(`${origin}/api/projects/..%2Fescape`)).status, 400);
    assert.equal((await fetch(`${origin}/api/projects`, json('POST', { width: -1 }))).status, 400);
    assert.equal((await fetch(`${origin}/api/render`, json('POST', { projectId: '../escape' }))).status, 400);
    assert.equal((await fetch(`${origin}/api/render`, json('POST', { projectId: 'missing' }))).status, 404);
    assert.equal((await fetch(`${origin}/api/render/missing`)).status, 404);
    const form = new FormData();
    form.append('file', new Blob(['small upload'], { type: 'text/plain' }), 'a b.txt');
    const uploaded = await fetch(`${origin}/api/upload`, { method: 'POST', body: form });
    assert.equal(uploaded.status, 200);
    const file = await uploaded.json() as { url: string; name: string; mime: string };
    assert.equal(file.name, 'a_b.txt');
    assert.equal(file.mime, 'text/plain');
    assert.equal(await (await fetch(`${origin}${file.url}`)).text(), 'small upload');
    assert.equal((await fetch(`${origin}/api/upload`, { method: 'POST', body: new FormData() })).status, 400);
    assert.equal((await fetch(`${origin}/api/projects/${saved.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(`${origin}/api/projects/${saved.id}`)).status, 404);
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});
