import assert from 'node:assert/strict';
import test from 'node:test';
import type { TemplateDef } from '../../templates/registry';
import { createProject, deleteProject, filterTemplates, loadProjects, PROJECT_STORAGE_KEY, readLocalProjects } from './library';

const template: TemplateDef = {
  meta: { id: 'test', name: '纸上星河', description: '温柔的开场动画', category: 'Motion graphics', tags: ['SVG', '粒子'], prompt: '星河缓慢展开' },
  component: () => null,
  schema: {} as TemplateDef['schema'],
  defaultProps: { title: '星河' },
  defaultConfig: { width: 1280, height: 720, fps: 30, durationInFrames: 90 },
};

test('搜索覆盖名称、标签、描述，并与分类共同生效', () => {
  for (const query of ['星河', ' svg ', '开场']) {
    assert.equal(filterTemplates([template], query, 'all').length, 1);
  }
  assert.equal(filterTemplates([template], 'SVG', '剪辑').length, 0);
  assert.equal(filterTemplates([template], '不存在', 'all').length, 0);
  assert.deepEqual(filterTemplates([], '', 'all'), []);
});

test('项目 API 契约和本地回落', async (context) => {
  const storage = new Map<string, string>();
  context.mock.method(globalThis, 'fetch');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  } });
  context.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const remote = { ...template.defaultConfig, id: 'remote', name: '远端作品', templateId: 'test', props: {}, updatedAt: '2026-01-01T00:00:00.000Z' };
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(remote), { status: 200 });
  };
  const created = await createProject(template);
  assert.equal(created.local, false);
  assert.equal(created.project.id, 'remote');
  assert.equal(calls[0].url, '/api/projects');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    name: template.meta.name, templateId: 'test', props: template.defaultProps, ...template.defaultConfig,
  });
  globalThis.fetch = async () => { throw new Error('offline'); };
  const local = await createProject(template);
  assert.equal(local.local, true);
  assert.equal(local.project.props.title, '星河');
  assert.equal(readLocalProjects().length, 2);
  assert.equal((await loadProjects()).local, true);
  globalThis.fetch = async () => new Response(JSON.stringify([remote]));
  const merged = await loadProjects();
  assert.equal(merged.projects.length, 2);
  assert.equal(merged.local, true);
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  assert.equal(await deleteProject(local.project.id), true);
  assert.deepEqual(readLocalProjects().map((project) => project.id), ['remote']);
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await deleteProject('remote'), false);
  assert.equal(readLocalProjects().length, 0);
  storage.set(PROJECT_STORAGE_KEY, '{broken');
  assert.deepEqual(readLocalProjects(), []);
  storage.set(PROJECT_STORAGE_KEY, '[null, {"id":"incomplete"}]');
  assert.deepEqual(readLocalProjects(), []);
});
