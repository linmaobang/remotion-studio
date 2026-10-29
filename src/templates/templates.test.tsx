import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Player } from '@remotion/player';
import type { Clip, TimelineState } from '../shared/types';
import { getTemplate, templates, type TemplateDef } from './registry';
import { TimelineComposition, schema as timelineSchema } from './blank-timeline';
import { getClipTransition } from './blank-timeline/transitions';
import { getGameState } from './signal-game/state';
import { configOf } from './ai-video';
import { parsePlan, planDuration, samplePlan } from '../plan/schema';
import { getRenderInputProps } from '../../server/render';

const markup = (template: TemplateDef, frame: number, inputProps = template.defaultProps) => (
  renderToStaticMarkup(<Player component={template.component} inputProps={inputProps} compositionWidth={template.defaultConfig.width} compositionHeight={template.defaultConfig.height} fps={template.defaultConfig.fps} durationInFrames={template.defaultConfig.durationInFrames} initialFrame={frame} />)
);

const clip: Clip = { id: 'text', type: 'text', text: '时间线文字', startFrame: 20, durationFrames: 60, trimStartFrame: 0, volume: 0.7, style: { color: '#ff0000' } };

test('九个模板分类齐全、编号唯一，默认参数和颜色均经过 schema 校验', () => {
  assert.equal(templates.length, 9);
  assert.equal(new Set(templates.map((t) => t.meta.id)).size, 9);
  assert.deepEqual(templates.reduce<Record<string, number>>((counts, t) => ({ ...counts, [t.meta.category]: (counts[t.meta.category] ?? 0) + 1 }), {}), {
    'Motion graphics': 2, Explainers: 3, '3D 场景': 1, 'Games & interactive': 1, '剪辑': 2,
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
  assert.ok(html.includes('<img')); // Remotion Img 在客户端才写入 src，真实渲染已用 ffmpeg 抽帧核验
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

test('创作画布对缺省字段的参数也能显示图层（渲染端不应用 schema 默认值）', () => {
  const template = getTemplate('studio-canvas')!;
  const props = { scenes: [{ id: 'a', layers: [{ id: 't', type: 'text', text: '画布文字' }] }] };
  assert.ok(markup(template, 5, props).includes('画布文字'));
});

const textOf = (html: string) => html.replace(/<[^>]*>/g, '');

test('AI 视频：samplePlan 的每个场景都能在各自时间段渲染并显示文案', () => {
  const template = getTemplate('ai-video')!;
  const plan = samplePlan();
  assert.deepEqual(configOf(plan), { width: 1920, height: 1080, fps: 30, durationInFrames: planDuration(plan) });
  assert.equal(template.defaultConfig.durationInFrames, 900);
  const config = { ...template.defaultConfig };
  let start = 0;
  for (const scene of plan.scenes) {
    const html = markup({ ...template, defaultConfig: config }, start + 100, { plan });
    assert.ok(textOf(html).includes(scene.title.slice(0, 4)), `${scene.kind} 缺少标题`);
    start += scene.durationFrames;
  }
  assert.ok(textOf(markup(template, 540 + 20, { plan })).includes('精选咖啡豆'));
  assert.notEqual(markup(template, 5, { plan }), markup(template, 60, { plan }));
});

test('AI 视频：非法方案显示占位而不抛错，竖屏与带音频方案可渲染', () => {
  const template = getTemplate('ai-video')!;
  for (const plan of [null, undefined, 42, {}, { scenes: [] }, { scenes: [{ kind: 'bad' }] }]) {
    assert.ok(markup(template, 0, { plan }).includes('视频方案无效'), JSON.stringify(plan));
  }
  assert.ok(markup(template, 0, {} as never).includes('视频方案无效'));
  const portrait = parsePlan({ format: { width: 1080, height: 1920 }, scenes: [{ kind: 'list', title: '竖屏列表', items: [] }, { kind: 'stat', title: '空数据' }, { kind: 'image-text', title: '无图', body: '' }], audio: { bgm: { src: '/files/uploads/a.mp3' }, voiceover: { src: '/files/uploads/v.mp3', startFrame: 10 } } });
  assert.ok(portrait.ok);
  if (portrait.ok) assert.ok(textOf(markup(template, 20, { plan: portrait.plan })).includes('竖屏列表'));
});

test('AI 视频：服务端把 plan 内以 / 开头的素材地址改写为本机服务地址', () => {
  const plan = parsePlan({ scenes: [{ kind: 'image-text', title: 'a', imageSrc: '/files/uploads/i.png', backgroundSrc: '/files/uploads/b.png' }, { kind: 'title', title: 'b', backgroundSrc: 'https://example.com/x.png' }], audio: { bgm: { src: '/files/uploads/a.mp3' }, voiceover: { src: '/files/uploads/v.mp3' } } });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  const origin = `http://127.0.0.1:${Number(process.env.PORT || 3217)}`;
  const input = getRenderInputProps({ id: 'p', name: 'n', templateId: 'ai-video', props: { plan: plan.plan }, width: 1920, height: 1080, fps: 30, durationInFrames: planDuration(plan.plan), updatedAt: '' }).plan as typeof plan.plan;
  const [first, second] = input.scenes as unknown as [{ imageSrc: string; backgroundSrc: string }, { backgroundSrc: string }];
  assert.equal(first.imageSrc, `${origin}/files/uploads/i.png`);
  assert.equal(first.backgroundSrc, `${origin}/files/uploads/b.png`);
  assert.equal(second.backgroundSrc, 'https://example.com/x.png');
  assert.equal(input.audio.bgm!.src, `${origin}/files/uploads/a.mp3`);
  assert.equal(input.audio.voiceover!.src, `${origin}/files/uploads/v.mp3`);
});
