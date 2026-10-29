import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Player } from '@remotion/player';
import type { Clip, TimelineState } from '../shared/types';
import { getTemplate, templates, type TemplateDef } from './registry';
import { TimelineComposition, schema as timelineSchema } from './blank-timeline';
import { getClipTransition } from './blank-timeline/transitions';
import { getGameState } from './signal-game/state';

const markup = (template: TemplateDef, frame: number, inputProps = template.defaultProps) => (
  renderToStaticMarkup(<Player component={template.component} inputProps={inputProps} compositionWidth={template.defaultConfig.width} compositionHeight={template.defaultConfig.height} fps={template.defaultConfig.fps} durationInFrames={template.defaultConfig.durationInFrames} initialFrame={frame} />)
);

const clip: Clip = { id: 'text', type: 'text', text: '时间线文字', startFrame: 20, durationFrames: 60, trimStartFrame: 0, volume: 0.7, style: { color: '#ff0000' } };

test('七个模板分类齐全、编号唯一，默认参数和颜色均经过 schema 校验', () => {
  assert.equal(templates.length, 7);
  assert.equal(new Set(templates.map((t) => t.meta.id)).size, 7);
  assert.deepEqual(templates.reduce<Record<string, number>>((counts, t) => ({ ...counts, [t.meta.category]: (counts[t.meta.category] ?? 0) + 1 }), {}), {
    'Motion graphics': 2, Explainers: 2, '3D 场景': 1, 'Games & interactive': 1, '剪辑': 1,
  });
  for (const template of templates) {
    assert.equal(getTemplate(template.meta.id), template);
    assert.ok(template.schema.description);
    assert.ok(template.meta.tags.length > 0);
    assert.match(template.meta.prompt, /[\u4e00-\u9fff]/);
    assert.ok(template.schema.safeParse(template.defaultProps).success, template.meta.id);
    for (const key of ['accent', 'color', 'background']) {
      if (key in template.defaultProps) assert.equal(template.schema.safeParse({ ...template.defaultProps, [key]: '这不是颜色' }).success, false);
    }
  }
  assert.equal(getTemplate('missing'), undefined);
});

test('帧驱动的二维模板可供 Player 渲染，倒序访问同帧仍输出相同结果', () => {
  for (const template of templates.filter((t) => !['crystal-orbit', 'blank-timeline'].includes(t.meta.id))) {
    const first = markup(template, 0);
    const later = markup(template, 65);
    assert.notEqual(first, later, template.meta.id);
    assert.equal(markup(template, 0), first, template.meta.id);
  }
});

test('游戏位置与演示分数只依赖帧与种子', () => {
  const expected = getGameState(85, 'test');
  getGameState(150, 'another-seed');
  assert.deepEqual(getGameState(85, 'test'), expected);
  assert.notDeepEqual(getGameState(85, 'other'), expected);
  assert.equal(expected.score, 20);
  assert.ok(expected.x >= 0.2 && expected.x <= 0.8);
  assert.ok(expected.y >= 0.38 && expected.y <= 0.74);
});

test('时间线按 Sequence 的起止帧显示文字，并保留样式', () => {
  const template = getTemplate('blank-timeline')!;
  assert.equal(template.component, TimelineComposition);
  const props = { timeline: { tracks: [{ id: 'text-track', type: 'text', clips: [clip] }] } satisfies TimelineState };
  assert.ok(timelineSchema.safeParse(props).success);
  assert.ok(!markup(template, 19, props).includes('时间线文字'));
  const active = markup(template, 20, props);
  assert.ok(active.includes('时间线文字'));
  assert.ok(active.includes('color:#ff0000'));
  assert.ok(markup(template, 79, props).includes('时间线文字'));
  assert.ok(!markup(template, 80, props).includes('时间线文字'));
});

test('时间线保留根相对素材地址，拒绝无地址素材和零时长片段', () => {
  const template = getTemplate('blank-timeline')!;
  const props = { timeline: { tracks: [{ id: 'video-track', type: 'video', clips: [{ ...clip, type: 'image', src: '/files/uploads/image.png' }, { ...clip, id: 'video', type: 'video', src: '/files/uploads/clip.mp4', trimStartFrame: 12 }] }] } satisfies TimelineState };
  const html = markup(template, 30, props);
  assert.ok(html.includes('/files/uploads/image.png'));
  assert.ok(html.includes('/files/uploads/clip.mp4'));
  const invalid = (update: Partial<Clip>) => ({ timeline: { tracks: [{ id: 'track', type: 'video', clips: [{ ...clip, ...update }] }] } });
  assert.equal(timelineSchema.safeParse(invalid({ type: 'audio' })).success, false);
  assert.equal(timelineSchema.safeParse(invalid({ durationFrames: 0 })).success, false);
  assert.equal(timelineSchema.safeParse(invalid({ style: { color: '非法颜色' } })).success, false);
});

test('淡入淡出、左右上下滑动及退化转场均有确定边界', () => {
  const fade: Clip = { ...clip, transitionIn: { type: 'fade', frames: 10 }, transitionOut: { type: 'fade', frames: 10 } };
  assert.equal(getClipTransition(fade, 0, 1280, 720).opacity, 0);
  assert.equal(getClipTransition(fade, 5, 1280, 720).opacity, 0.5);
  assert.equal(getClipTransition(fade, 30, 1280, 720).opacity, 1);
  assert.equal(getClipTransition(fade, 59, 1280, 720).opacity, 0);
  assert.equal(getClipTransition({ ...clip, transitionIn: { type: 'slide-left', frames: 10 } }, 0, 1280, 720).transform, 'translate(1280px, 0px)');
  assert.equal(getClipTransition({ ...clip, transitionOut: { type: 'slide-left', frames: 10 } }, 59, 1280, 720).transform, 'translate(-1280px, 0px)');
  assert.equal(getClipTransition({ ...clip, transitionIn: { type: 'slide-up', frames: 10 } }, 0, 1280, 720).transform, 'translate(0px, 720px)');
  assert.equal(getClipTransition({ ...clip, transitionOut: { type: 'slide-up', frames: 10 } }, 59, 1280, 720).transform, 'translate(0px, -720px)');
  for (const frames of [0, 500]) {
    assert.ok(Number.isFinite(getClipTransition({ ...fade, durationFrames: 1, transitionIn: { type: 'fade', frames } }, 0, 1280, 720).opacity));
  }
  assert.equal(getClipTransition({ ...clip, transitionIn: { type: 'none', frames: 10 } }, 0, 1280, 720).opacity, 1);
});
