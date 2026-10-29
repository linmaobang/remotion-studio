import assert from 'node:assert/strict';
import test from 'node:test';
import { schema } from './model';
import { presetDuration, studioPresets } from './presets';

test('三个起手预设通过 schema，id 唯一，竖屏预设为 720x1280', () => {
  assert.equal(studioPresets.length, 3);
  assert.equal(new Set(studioPresets.map((preset) => preset.id)).size, 3);
  for (const preset of studioPresets) {
    assert.ok(schema.safeParse(preset.props).success, preset.id);
    assert.ok(presetDuration(preset) > 0);
    const ids = preset.props.scenes.flatMap((scene) => scene.layers.map((layer) => layer.id));
    assert.equal(new Set(ids).size, ids.length, `${preset.id} 图层 id 重复`);
  }
  const vertical = studioPresets.find((preset) => preset.id === 'social-vertical')!;
  assert.deepEqual([vertical.width, vertical.height], [720, 1280]);
});
