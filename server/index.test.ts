import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('端口被占用时报告失败，不输出启动成功', async () => {
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve();
      else reject(error);
    });
    blocker.listen(3001, '127.0.0.1', resolve);
  });
  try {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /EADDRINUSE/);
    assert.doesNotMatch(result.stdout, /API listening/);
  } finally {
    if (blocker.listening) {
      await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
    }
  }
});
