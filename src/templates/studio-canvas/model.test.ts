import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultLayer, createScene, layerSchema, schema, sceneSchema, totalDuration, type LayerType } from './model';
import template from './index';
import { withStudioDuration } from '../../lib/editor';
import type { ProjectData } from '../../shared/types';

test('schema 为缺省字段补全默认值', () => {
  const scene = sceneSchema.parse({ id: 's' });
  assert.equal(scene.durationFrames, 90);
  assert.deepEqual(scene.layers, []);
  assert.equal(scene.background.type, 'solid');
  const text = layerSchema.parse({ id: 'l', type: 'text' });
  assert.ok(text.type === 'text' && text.fontSize === 64 && text.fontFamily === 'system' && text.visible && !text.locked && text.loop === 'none');
  assert.equal(schema.safeParse({ scenes: [] }).success, false);
});

test('schema 拒绝未知字体、非法动画与 typewriter 用于非文字图层', () => {
  assert.equal(layerSchema.safeParse({ id: 'l', type: 'text', fontFamily: 'Comic Sans' }).success, false);
  assert.equal(layerSchema.safeParse({ id: 'l', type: 'shape', animationIn: { type: 'typewriter', frames: 10 } }).success, false);
  assert.equal(layerSchema.safeParse({ id: 'l', type: 'text', animationIn: { type: 'typewriter', frames: 10 } }).success, true);
});

test('createDefaultLayer 为每种类型生成可通过 schema 的图层', () => {
  const ids = new Set<string>();
  for (const type of ['text', 'shape', 'image', 'video', 'audio'] as LayerType[]) {
    const layer = createDefaultLayer(type);
    assert.equal(layer.type, type);
    assert.ok(layerSchema.safeParse(layer).success, type);
    ids.add(layer.id);
  }
  assert.equal(ids.size, 5);
  const line = createDefaultLayer('shape', 'line');
  assert.ok(line.type === 'shape' && line.shape === 'line' && line.height === 8);
});

test('totalDuration 累加场景帧数且至少为 1', () => {
  assert.equal(totalDuration([]), 1);
  assert.equal(totalDuration([{ durationFrames: 90 }, { durationFrames: 45 }]), 135);
  assert.ok(sceneSchema.safeParse(createScene()).success);
});

test('模板默认值通过 schema，时长等于场景总帧数，withStudioDuration 同步项目时长', () => {
  assert.ok(template.schema.safeParse(template.defaultProps).success);
  assert.equal(template.defaultConfig.durationInFrames, 90);
  const project = { id: 'p', name: 'n', templateId: 'studio-canvas', props: { scenes: [{ durationFrames: 60 }, { durationFrames: 30 }] }, width: 1280, height: 720, fps: 30, durationInFrames: 1, updatedAt: '' } as ProjectData;
  assert.equal(withStudioDuration(project).durationInFrames, 90);
});
