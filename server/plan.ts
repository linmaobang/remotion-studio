import { Router } from 'express';
import type { AssetRef, OptimizeRequest, Orientation, PlanResponse, RefineRequest } from '../src/plan/api';
import { parsePlan, planDuration, type Scene, type VideoPlan } from '../src/plan/schema';
import { createAnthropicLlm, type LlmFn, type LlmMessage } from './llm';

const FPS = 30;
const DEFAULT_SECONDS = 30;
const MAX_REPAIRS = 2;

const SCHEMA_DOC = `VideoPlan JSON 结构：
{
  "version": 1,
  "title": "视频标题",
  "brief": "一句话概述（可选）",
  "style": { "theme": { "primary": "#hex 主色", "secondary": "#hex 辅色", "background": "#hex 深色背景", "text": "#hex 文字色（与背景对比度足够）" }, "fontFamily": "rounded | sans | serif 之一的字体风格名", "mood": "风格关键词（可选）" },
  "format": { "width": 1920, "height": 1080, "fps": 30 },
  "scenes": [ 场景... ],
  "audio": { "bgm": { "src": "url", "volume": 0.3, "loop": true }, "voiceover": { "src": "url", "volume": 1, "startFrame": 0 } }
}
每个场景都有公共字段：id（唯一短字符串）、kind、durationFrames（整数帧，最少 15）、transition { "type": "fade|slide-left|slide-up|none", "frames": 15 }，以及可选 backgroundColor、backgroundSrc（背景图 url）、notes。
场景类型与专有字段：
- title：title, subtitle?
- image-text：title, body（≤600 字，可含 \\n）, imageSrc?（图片 url）, imagePosition("left"|"right")
- list：title, items（字符串数组，3-6 条，每条 ≤120 字）
- stat：title, stats（1-4 个 { "value": "30+", "label": "说明" }）
- cta：title, buttonText, subtitle?
format：横屏最大 1920x1080，竖屏最大 1080x1920；fps 固定 30。`;

const RULES = `规则：
1. 只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。
2. 所有场景 durationFrames 之和 = 目标总帧数（秒数 × 30），允许 ±10% 偏差。
3. 开头用 title 场景，结尾用 cta 场景，中间穿插 image-text / list / stat，场景数通常 4-8 个，每个场景 3-8 秒。
4. 配色统一协调：深色背景 + 一个醒目主色，文字对比度高；文案简洁有力，使用用户的语言。
5. 素材只能通过清单里的 url 原样引用，不得编造 url。`;

const assetLines = (assets: AssetRef[]) => assets.length
  ? assets.map((a) => `- [${a.kind}] ${a.name}: ${a.url}`).join('\n')
  : '（无）';

const optimizeSystem = (req: { seconds: number; orientation: Orientation; assets: AssetRef[] }) => `你是专业的视频策划，把用户的一句话需求设计成可直接渲染的视频方案（VideoPlan）。

${SCHEMA_DOC}

${RULES}
素材使用：image 类素材按 url 填入 image-text 场景的 imageSrc（每张图至多用一次，优先），多余的可作为场景 backgroundSrc；audio 素材填入 audio.bgm.src；voiceover 素材填入 audio.voiceover.src。

本次要求：目标总时长 ${req.seconds} 秒（${req.seconds * FPS} 帧）；画幅 ${req.orientation === 'portrait' ? '竖屏 1080x1920' : '横屏 1920x1080'}。
用户上传素材清单：
${assetLines(req.assets)}`;

const refineSystem = `你是专业的视频策划，按用户的自然语言指令修改已有的视频方案（VideoPlan），未被要求修改的部分保持不变（包括场景 id 和素材 url）。

${SCHEMA_DOC}

${RULES}
输出修改后的完整 VideoPlan。`;

/** 从模型回复中提取 JSON：兼容 ```json 代码块与前后多余文字。 */
export function extractJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidates = [text, fenced, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch { /* 试下一个 */ }
  }
  throw new Error('回复中没有可解析的 JSON');
}

type Attempt = { ok: true; plan: VideoPlan; warnings: string[] } | { ok: false; reason: string };

/** 调用模型 → 提取 JSON → parsePlan；不合法时把错误回传给模型，最多修复 MAX_REPAIRS 次。 */
async function askLlm(llm: LlmFn, system: string, userMessage: string): Promise<Attempt> {
  const messages: LlmMessage[] = [{ role: 'user', content: userMessage }];
  let lastError = '';
  for (let round = 0; round <= MAX_REPAIRS; round++) {
    let reply: string;
    try {
      reply = await llm({ system, messages });
    } catch (error) {
      return { ok: false, reason: `LLM 调用失败：${error instanceof Error ? error.message : String(error)}` };
    }
    try {
      const result = parsePlan(extractJson(reply));
      if (result.ok) return { ok: true, plan: result.plan, warnings: result.warnings };
      lastError = result.errors.join('；');
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    messages.push(
      { role: 'assistant', content: reply },
      { role: 'user', content: `上面的输出不合法：${lastError}。请修正后重新只输出完整的 JSON 对象。` },
    );
  }
  return { ok: false, reason: `LLM 输出经 ${MAX_REPAIRS} 次修复仍不合法：${lastError}` };
}

// —— 本地启发式生成器 ——
const THEMES: { keys: RegExp; theme: VideoPlan['style']['theme']; mood: string }[] = [
  { keys: /咖啡|美食|餐|烘焙|茶|甜品|温暖|开业/, theme: { primary: '#d97706', secondary: '#92400e', background: '#1c1917', text: '#fef3c7' }, mood: '温暖、治愈' },
  { keys: /科技|AI|产品|发布|数码|软件|app|智能/i, theme: { primary: '#38bdf8', secondary: '#6366f1', background: '#0b1020', text: '#e0f2fe' }, mood: '科技、简洁' },
  { keys: /自然|旅行|旅游|户外|环保|健康|运动|健身/, theme: { primary: '#34d399', secondary: '#0d9488', background: '#0f1f1a', text: '#ecfdf5' }, mood: '清新、活力' },
  { keys: /时尚|美妆|品牌|奢|婚|节日|生日/, theme: { primary: '#f472b6', secondary: '#a855f7', background: '#1a0f1f', text: '#fdf2f8' }, mood: '时尚、浪漫' },
];
const DEFAULT_THEME = { theme: { primary: '#f59e0b', secondary: '#ef4444', background: '#111827', text: '#f9fafb' }, mood: '现代、醒目' };

const titleFrom = (prompt: string) => {
  const first = prompt.split(/[。！？!?\n,，;；]/)[0].trim() || prompt.trim();
  return first.length > 24 ? `${first.slice(0, 24)}…` : first;
};

const formatFor = (orientation: Orientation) => orientation === 'portrait' ? { width: 1080, height: 1920, fps: FPS } : { width: 1920, height: 1080, fps: FPS };

const audioFrom = (assets: AssetRef[]): VideoPlan['audio'] => {
  const bgm = assets.find((a) => a.kind === 'audio');
  const voice = assets.find((a) => a.kind === 'voiceover');
  return {
    ...(bgm ? { bgm: { src: bgm.url, volume: 0.3, loop: true } } : {}),
    ...(voice ? { voiceover: { src: voice.url, volume: 1, startFrame: 0 } } : {}),
  };
};

export function heuristicPlan(req: { prompt: string; seconds: number; orientation: Orientation; assets: AssetRef[] }): VideoPlan {
  const { prompt, seconds, orientation, assets } = req;
  const images = assets.filter((a) => a.kind === 'image');
  const themed = THEMES.find((t) => t.keys.test(prompt)) ?? DEFAULT_THEME;
  const title = titleFrom(prompt);
  const fade = { type: 'fade' as const, frames: 15 };
  const slide = { type: 'slide-left' as const, frames: 15 };

  type Draft = Omit<Scene, 'id' | 'durationFrames' | 'transition'> & { weight: number };
  const drafts: Draft[] = [{ kind: 'title', title, subtitle: '用心呈现每一个细节', weight: 3 } as Draft];
  const imageScenes = Math.max(1, Math.min(images.length, 3));
  for (let i = 0; i < imageScenes; i++) {
    drafts.push({
      kind: 'image-text',
      title: i === 0 ? '关于我们' : `亮点 ${i + 1}`,
      body: i === 0 ? prompt.trim().slice(0, 120) : '精心打磨，只为带给你更好的体验。',
      ...(images[i] ? { imageSrc: images[i].url } : {}),
      imagePosition: i % 2 === 0 ? 'right' : 'left',
      weight: 4,
    } as Draft);
  }
  if (seconds >= 15) drafts.push({ kind: 'list', title: '核心亮点', items: ['品质可靠，细节出众', '体验流畅，简单易用', '贴心服务，值得信赖'], weight: 4 } as Draft);
  if (seconds >= 25) drafts.push({ kind: 'stat', title: '用数据说话', stats: [{ value: '100%', label: '用心投入' }, { value: '10k+', label: '用户好评' }, { value: '24h', label: '贴心响应' }], weight: 3 } as Draft);
  drafts.push({ kind: 'cta', title: '现在就行动', buttonText: '立即了解', subtitle: title, weight: 3 } as Draft);

  const total = Math.max(drafts.length * 30, Math.round(seconds * FPS));
  const weightSum = drafts.reduce((sum, d) => sum + d.weight, 0);
  let used = 0;
  const scenes = drafts.map(({ weight, ...rest }, index) => {
    const last = index === drafts.length - 1;
    const durationFrames = last ? total - used : Math.round((total * weight) / weightSum);
    used += durationFrames;
    return { ...rest, id: `scene-${index + 1}`, durationFrames, transition: index % 2 ? slide : fade } as Scene;
  });

  return {
    version: 1,
    title,
    brief: prompt.trim().slice(0, 500),
    style: { theme: themed.theme, fontFamily: 'rounded', mood: themed.mood },
    format: formatFor(orientation),
    scenes,
    audio: audioFrom(assets),
  };
}

// —— 业务入口 ——
const normalizeAssets = (value: unknown): AssetRef[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AssetRef[] => {
    const a = item as Partial<AssetRef> | null;
    if (!a || typeof a.url !== 'string' || !a.url) return [];
    const kind = a.kind === 'audio' || a.kind === 'voiceover' ? a.kind : 'image';
    return [{ url: a.url, name: typeof a.name === 'string' ? a.name : a.url, kind }];
  }).slice(0, 30);
};

export interface NormalizedOptimize { prompt: string; seconds: number; orientation: Orientation; assets: AssetRef[] }

export function normalizeOptimize(body: Partial<OptimizeRequest> | null | undefined): NormalizedOptimize | null {
  if (!body || typeof body.prompt !== 'string' || !body.prompt.trim()) return null;
  const sec = Number(body.durationSec);
  return {
    prompt: body.prompt.trim().slice(0, 4000),
    seconds: Number.isFinite(sec) && sec > 0 ? Math.min(300, Math.max(3, Math.round(sec))) : DEFAULT_SECONDS,
    orientation: body.orientation === 'portrait' ? 'portrait' : 'landscape',
    assets: normalizeAssets(body.assets),
  };
}

export async function optimizePlan(req: NormalizedOptimize, llm: LlmFn | null): Promise<PlanResponse> {
  const warnings: string[] = [];
  if (!llm) {
    warnings.push('未配置 ANTHROPIC_API_KEY，已使用本地规则生成方案');
  } else {
    const attempt = await askLlm(llm, optimizeSystem(req), `用户需求：${req.prompt}`);
    if (attempt.ok) {
      const plan = attempt.plan;
      // 模型漏掉的音频素材由我们补上，避免用户上传的素材被忽略。
      const fallbackAudio = audioFrom(req.assets);
      plan.audio = { ...fallbackAudio, ...plan.audio };
      const target = req.seconds * FPS;
      if (Math.abs(planDuration(plan) - target) > target * 0.3) warnings.push(`总时长 ${Math.round(planDuration(plan) / FPS)} 秒与目标 ${req.seconds} 秒相差较大`);
      return { plan, usedLLM: true, warnings: [...attempt.warnings, ...warnings] };
    }
    warnings.push(`${attempt.reason}，已降级为本地规则生成`);
  }
  const parsed = parsePlan(heuristicPlan(req));
  if (!parsed.ok) throw new Error(parsed.errors.join('；')); // 本地生成器输出恒合法，仅作类型收窄
  return { plan: parsed.plan, usedLLM: false, warnings: [...warnings, ...parsed.warnings] };
}

export async function refinePlan(plan: VideoPlan, instruction: string, llm: LlmFn | null): Promise<PlanResponse> {
  if (!llm) return { plan, usedLLM: false, warnings: ['未配置 ANTHROPIC_API_KEY，无法按指令修改，已原样返回'] };
  const attempt = await askLlm(llm, refineSystem, `当前方案：\n${JSON.stringify(plan)}\n\n修改指令：${instruction}`);
  if (attempt.ok) return { plan: attempt.plan, usedLLM: true, warnings: attempt.warnings };
  return { plan, usedLLM: false, warnings: [`${attempt.reason}，已原样返回`] };
}

export function createPlanRouter(getLlm: () => LlmFn | null = () => createAnthropicLlm()) {
  const router = Router();
  router.post('/optimize', async (req, res) => {
    const request = normalizeOptimize(req.body);
    if (!request) { res.status(400).json({ error: 'prompt 不能为空' }); return; }
    try {
      res.json(await optimizePlan(request, getLlm()));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: '服务内部错误' });
    }
  });
  router.post('/refine', async (req, res) => {
    const body = req.body as Partial<RefineRequest> | undefined;
    const parsed = parsePlan(body?.plan);
    if (!body || !parsed.ok || typeof body.instruction !== 'string' || !body.instruction.trim()) {
      res.status(400).json({ error: '需要有效的 plan 与非空的 instruction' });
      return;
    }
    try {
      res.json(await refinePlan(parsed.plan, body.instruction.trim().slice(0, 2000), getLlm()));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: '服务内部错误' });
    }
  });
  return router;
}

export const planRouter = createPlanRouter();
