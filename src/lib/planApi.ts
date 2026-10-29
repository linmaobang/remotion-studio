// 视频方案相关接口的 fetch 封装：后端未就绪或返回异常时抛出带中文提示的 PlanApiError，不让页面崩溃。
import type { AssetKind, AssetRef, OptimizeRequest, PlanResponse, RefineRequest } from '../plan/api';
import { parsePlan, planDuration, type VideoPlan } from '../plan/schema';
import type { ProjectData } from '../shared/types';
import { readLocalProjects, saveLocalProjects } from '../components/home/library';

export class PlanApiError extends Error {}

export const MODE_STORAGE_KEY = 'remotion-studio.create-mode';
export type CreateMode = 'auto' | 'step';

export function readMode(): CreateMode {
  try { return localStorage.getItem(MODE_STORAGE_KEY) === 'step' ? 'step' : 'auto'; } catch { return 'auto'; }
}
export function saveMode(mode: CreateMode) {
  try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* 无法保存时忽略。 */ }
}

async function request<T>(url: string, init: RequestInit, what: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new PlanApiError(`${what}失败：无法连接后端服务，请确认后端已启动后重试。`);
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* 非 JSON 响应。 */ }
  if (!response.ok) {
    const message = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : '';
    if (response.status === 404 && !message) throw new PlanApiError(`${what}失败：后端暂未提供该接口（404），请更新并重启后端后重试。`);
    throw new PlanApiError(`${what}失败：${message || `服务返回 ${response.status}`}`);
  }
  return body as T;
}

function toPlanResponse(body: unknown, what: string): PlanResponse {
  const raw = (body && typeof body === 'object' ? body : {}) as Partial<PlanResponse>;
  const parsed = parsePlan(raw.plan);
  if (!parsed.ok) throw new PlanApiError(`${what}失败：返回的方案格式不正确（${parsed.errors.slice(0, 2).join('；')}）。`);
  const warnings = [...(Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : []), ...parsed.warnings];
  return { plan: parsed.plan, usedLLM: raw.usedLLM !== false, warnings };
}

const post = (payload: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export async function optimizePlan(req: OptimizeRequest): Promise<PlanResponse> {
  return toPlanResponse(await request('/api/plan/optimize', post(req), '生成方案'), '生成方案');
}

export async function refinePlan(req: RefineRequest): Promise<PlanResponse> {
  return toPlanResponse(await request('/api/plan/refine', post(req), '修改方案'), '修改方案');
}

export async function uploadAsset(file: File, kind: AssetKind): Promise<AssetRef> {
  const form = new FormData();
  form.append('file', file);
  const body = await request<{ url?: unknown; name?: unknown }>('/api/upload', { method: 'POST', body: form }, `上传「${file.name}」`);
  if (typeof body?.url !== 'string') throw new PlanApiError(`上传「${file.name}」失败：服务返回格式错误。`);
  return { url: body.url, name: typeof body.name === 'string' ? body.name : file.name, kind };
}

/** 用方案创建 ai-video 项目；服务端不可用时退回浏览器本地缓存（与首页一致）。 */
export async function createPlanProject(plan: VideoPlan): Promise<{ project: ProjectData; local: boolean }> {
  const draft = {
    name: plan.title,
    templateId: 'ai-video',
    props: { plan } as Record<string, unknown>,
    width: plan.format.width,
    height: plan.format.height,
    fps: plan.format.fps,
    durationInFrames: Math.max(1, planDuration(plan)),
  };
  let project: ProjectData;
  let local = false;
  try {
    const value = await request<ProjectData>('/api/projects', post(draft), '创建项目');
    if (!value || typeof value.id !== 'string') throw new PlanApiError('创建项目失败：服务返回格式错误。');
    project = value;
  } catch (error) {
    if (error instanceof PlanApiError && !error.message.includes('无法连接')) throw error;
    project = { ...draft, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    local = true;
  }
  try { saveLocalProjects([project, ...readLocalProjects().filter((p) => p.id !== project.id)]); } catch {
    if (local) throw new PlanApiError('服务不可用，且浏览器无法保存项目，请稍后重试。');
  }
  return { project, local };
}
