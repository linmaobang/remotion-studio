// 「视频方案」VideoPlan：纯 zod + 类型，前端、服务端与 Remotion 共用，不依赖 node/浏览器 API。
import { z } from 'zod';

const MIN_SCENE_FRAMES = 15;
const MAX_SCENE_FRAMES = 3600;
const MAX_SCENES = 30;

// —— 宽松字段：不合法时补默认或钳制，而不是报错 ——
const numberOf = (value: unknown): number | undefined => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const int = (min: number, max: number, fallback: number) => z.unknown().transform((value) => {
  const n = numberOf(value);
  return n === undefined ? fallback : Math.min(max, Math.max(min, Math.round(n)));
});
const num = (min: number, max: number, fallback: number) => z.unknown().transform((value) => {
  const n = numberOf(value);
  return n === undefined ? fallback : Math.min(max, Math.max(min, n));
});
const text = (fallback: string, max = 200) => z.unknown().transform((value) => {
  const s = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  return s ? s.slice(0, max) : fallback;
});
const optText = (max = 500) => z.unknown().transform((value) => {
  const s = typeof value === 'string' ? value.trim() : '';
  return s ? s.slice(0, max) : undefined;
});
const oneOf = <T extends string>(values: readonly T[], fallback: T) => z.unknown().transform((value): T => (values as readonly unknown[]).includes(value) ? value as T : fallback);
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([^)]*\))$/i;
const color = (fallback: string) => z.unknown().transform((value) => typeof value === 'string' && COLOR.test(value.trim()) ? value.trim() : fallback);
const optColor = () => z.unknown().transform((value) => typeof value === 'string' && COLOR.test(value.trim()) ? value.trim() : undefined);
const optOneOf = <T extends string>(values: readonly T[]) => z.unknown().transform((value): T | undefined => (values as readonly unknown[]).includes(value) ? value as T : undefined);
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.unknown().transform((value) => {
  if (!Array.isArray(value)) return [] as z.output<T>[];
  const out: z.output<T>[] = [];
  for (const entry of value) {
    const parsed = item.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= max) break;
  }
  return out;
});

export const TRANSITION_TYPES = ['fade', 'slide-left', 'slide-up', 'none'] as const;
export const SCENE_KINDS = ['title', 'image-text', 'list', 'stat', 'cta'] as const;
export const ENTER_TYPES = ['rise', 'zoom', 'fade', 'none'] as const;
export type EnterType = (typeof ENTER_TYPES)[number];
export type TransitionType = (typeof TRANSITION_TYPES)[number];
export type SceneKind = (typeof SCENE_KINDS)[number];

const transitionSchema = z.unknown().transform((value) => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const type = oneOf(TRANSITION_TYPES, 'fade').parse(raw.type);
  return { type, frames: type === 'none' ? 0 : int(0, 120, 15).parse(raw.frames) };
});

const common = {
  id: text('', 64),
  durationFrames: int(MIN_SCENE_FRAMES, MAX_SCENE_FRAMES, 90),
  transition: transitionSchema,
  backgroundColor: optColor(),
  backgroundSrc: optText(500),
  /** 本场景强调色，覆盖主题主色。 */
  accentColor: optColor(),
  /** 场景角落的装饰 emoji。 */
  emoji: optText(8),
  /** 内容入场动画，缺省为 rise（上浮）。 */
  enter: optOneOf(ENTER_TYPES),
  notes: optText(1000),
};

const statSchema = z.object({ value: text('—', 40), label: text('', 60) });

export const sceneSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('title'), title: text('标题'), subtitle: optText(200) }),
  z.object({ ...common, kind: z.literal('image-text'), title: text('标题'), body: text('', 600), imageSrc: optText(500), imagePosition: oneOf(['left', 'right'] as const, 'right') }),
  z.object({ ...common, kind: z.literal('list'), title: text('要点'), items: list(text('', 120).pipe(z.string().min(1)), 8) }),
  z.object({ ...common, kind: z.literal('stat'), title: text('数据'), stats: list(statSchema, 4) }),
  z.object({ ...common, kind: z.literal('cta'), title: text('立即行动'), buttonText: text('立即了解', 30), subtitle: optText(200) }),
]);
export type Scene = z.output<typeof sceneSchema>;
export type TitleScene = Extract<Scene, { kind: 'title' }>;
export type ImageTextScene = Extract<Scene, { kind: 'image-text' }>;
export type ListScene = Extract<Scene, { kind: 'list' }>;
export type StatScene = Extract<Scene, { kind: 'stat' }>;
export type CtaScene = Extract<Scene, { kind: 'cta' }>;

const obj = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;

/** 横屏上限 1920x1080，竖屏（高>宽）上限 1080x1920，宽高取偶数。 */
const formatSchema = z.unknown().transform((value) => {
  const raw = obj(value);
  const w = int(240, 1920, 1920).parse(raw.width);
  const h = int(240, 1920, 1080).parse(raw.height);
  const max = h > w ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  return { width: even(Math.min(w, max.width)), height: even(Math.min(h, max.height)), fps: int(1, 60, 30).parse(raw.fps) };
});

const styleSchema = z.unknown().transform((value) => {
  const raw = obj(value);
  const theme = obj(raw.theme);
  return {
    theme: { primary: color('#f59e0b').parse(theme.primary), secondary: color('#10b981').parse(theme.secondary), background: color('#111827').parse(theme.background), text: color('#ffffff').parse(theme.text) },
    fontFamily: text('system', 80).parse(raw.fontFamily),
    mood: optText(80).parse(raw.mood),
  };
});

const audioSchema = z.unknown().transform((value) => {
  const raw = obj(value);
  const bgm = obj(raw.bgm);
  const voice = obj(raw.voiceover);
  const bgmSrc = optText(500).parse(bgm.src);
  const voiceSrc = optText(500).parse(voice.src);
  return {
    ...(bgmSrc ? { bgm: { src: bgmSrc, volume: num(0, 1, 0.3).parse(bgm.volume), loop: bgm.loop === false ? false : true } } : {}),
    ...(voiceSrc ? { voiceover: { src: voiceSrc, volume: num(0, 1, 1).parse(voice.volume), startFrame: int(0, 1_000_000, 0).parse(voice.startFrame) } } : {}),
  } as {
    bgm?: { src: string; volume: number; loop: boolean };
    voiceover?: { src: string; volume: number; startFrame: number };
  };
});

export interface VideoPlan {
  version: 1;
  title: string;
  brief?: string;
  style: { theme: { primary: string; secondary: string; background: string; text: string }; fontFamily: string; mood?: string };
  format: { width: number; height: number; fps: number };
  scenes: Scene[];
  audio: { bgm?: { src: string; volume: number; loop: boolean }; voiceover?: { src: string; volume: number; startFrame: number } };
}

let counter = 0;
/** 生成带前缀的唯一 id（不依赖 crypto，前后端通用）。 */
export const createId = (prefix = 'scene') => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const finishScenes = (scenes: Scene[]): Scene[] => {
  const seen = new Set<string>();
  return scenes.map((scene) => {
    let id = scene.id;
    if (!id || seen.has(id)) id = createId('scene');
    seen.add(id);
    const frames = Math.min(scene.transition.frames, Math.floor(scene.durationFrames / 2));
    return { ...scene, id, transition: { ...scene.transition, frames } };
  });
};

export type ParseResult = { ok: true; plan: VideoPlan; warnings: string[] } | { ok: false; errors: string[] };

/**
 * 宽松解析：补默认值、钳制数值、丢弃未知字段、丢弃无法修复的场景；永不抛异常。
 * 没有任何可用场景或输入不是对象时返回 {ok:false}。
 */
export function parsePlan(input: unknown): ParseResult {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['方案必须是一个对象'] };
    const raw = input as Record<string, unknown>;
    if (!Array.isArray(raw.scenes)) return { ok: false, errors: ['缺少 scenes 数组'] };
    const warnings: string[] = [];
    const scenes: Scene[] = [];
    raw.scenes.slice(0, MAX_SCENES).forEach((item, index) => {
      const parsed = sceneSchema.safeParse(item);
      if (!parsed.success) { warnings.push(`第 ${index + 1} 个场景无法识别（kind 无效），已丢弃`); return; }
      scenes.push(parsed.data);
      if (parsed.data.kind === 'list' && parsed.data.items.length === 0) warnings.push(`第 ${index + 1} 个场景（list）没有要点`);
      if (parsed.data.kind === 'stat' && parsed.data.stats.length === 0) warnings.push(`第 ${index + 1} 个场景（stat）没有数据`);
    });
    if (raw.scenes.length > MAX_SCENES) warnings.push(`场景数超过 ${MAX_SCENES}，多余部分已丢弃`);
    if (scenes.length === 0) return { ok: false, errors: ['没有可用的场景', ...warnings] };
    const plan: VideoPlan = {
      version: 1,
      title: text('未命名方案', 100).parse(raw.title),
      brief: optText(2000).parse(raw.brief),
      style: styleSchema.parse(raw.style),
      format: formatSchema.parse(raw.format),
      scenes: finishScenes(scenes),
      audio: audioSchema.parse(raw.audio),
    };
    if (plan.brief === undefined) delete plan.brief;
    if (plan.style.mood === undefined) delete plan.style.mood;
    return { ok: true, plan, warnings };
  } catch (error) {
    return { ok: false, errors: [`方案解析失败：${error instanceof Error ? error.message : String(error)}`] };
  }
}

/** 场景时长之和；转场不重叠，保持简单。 */
export const planDuration = (plan: Pick<VideoPlan, 'scenes'>): number => plan.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);

const fade = { type: 'fade' as const, frames: 15 };

/** 咖啡店开业 30 秒示例（30fps，5 个场景，共 900 帧）。 */
export function samplePlan(): VideoPlan {
  return {
    version: 1,
    title: '暖阳咖啡 · 开业啦',
    brief: '为新开的社区咖啡店「暖阳咖啡」做一条 30 秒开业宣传视频，温暖、有活力。',
    style: { theme: { primary: '#d97706', secondary: '#92400e', background: '#1c1917', text: '#fef3c7' }, fontFamily: 'rounded', mood: '温暖、治愈' },
    format: { width: 1920, height: 1080, fps: 30 },
    scenes: [
      { id: 'scene-opening', kind: 'title', durationFrames: 150, transition: { type: 'fade', frames: 15 }, title: '暖阳咖啡 盛大开业', subtitle: '一杯咖啡，一段好时光' },
      { id: 'scene-space', kind: 'image-text', durationFrames: 180, transition: { type: 'slide-left', frames: 15 }, title: '温暖的小空间', body: '原木与绿植，窗边的阳光，\n给你一个可以慢下来的角落。', imagePosition: 'right' },
      { id: 'scene-menu', kind: 'list', durationFrames: 210, transition: fade, title: '招牌饮品', items: ['手冲单品 · 每日精选', '燕麦拿铁 · 顺滑绵密', '桂花冷萃 · 开业限定', '现烤可颂 · 每天新鲜出炉'] },
      { id: 'scene-stats', kind: 'stat', durationFrames: 180, transition: { type: 'slide-up', frames: 15 }, title: '我们的用心', stats: [{ value: '30+', label: '精选咖啡豆' }, { value: '7:00', label: '早安营业' }, { value: '100%', label: '现磨现做' }] },
      { id: 'scene-cta', kind: 'cta', durationFrames: 180, transition: fade, title: '开业首周，第二杯半价', buttonText: '到店领取', subtitle: '阳光路 88 号 · 每天 7:00–21:00' },
    ],
    audio: {},
  };
}
