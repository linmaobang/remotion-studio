// 视频方案相关 API 的请求/响应契约（仅类型，前后端共用）。
import type { VideoPlan } from './schema';

export type AssetKind = 'image' | 'audio' | 'voiceover';

/** 用户上传的素材引用，url 即 /api/upload 返回的 /files/uploads/... 地址。 */
export interface AssetRef {
  url: string;
  name: string;
  kind: AssetKind;
}

/** AI 引擎选择：auto 按 API Key → Claude Code → Codex 探测；heuristic 是本地固定模板（非 AI）。 */
export type ProviderChoice = 'auto' | 'api' | 'claude' | 'codex' | 'heuristic';

export type Orientation = 'landscape' | 'portrait';

/** POST /api/plan/optimize：把一句需求优化成完整方案。 */
export interface OptimizeRequest {
  prompt: string;
  assets?: AssetRef[];
  durationSec?: number;
  orientation?: Orientation;
  provider?: ProviderChoice;
}

/** POST /api/plan/refine：按自然语言指令修改已有方案。 */
export interface RefineRequest {
  plan: VideoPlan;
  instruction: string;
  provider?: Exclude<ProviderChoice, 'heuristic'>;
}

/** 两个接口共用的成功响应；usedLLM 为 false 只会出现在显式选择/允许的本地模板（provider 为 heuristic）。 */
export interface PlanResponse {
  plan: VideoPlan;
  usedLLM: boolean;
  /** 实际使用的引擎 id（api / claude / codex / heuristic）。 */
  provider?: string;
  providerLabel?: string;
  warnings: string[];
}

export type OptimizeResponse = PlanResponse;
export type RefineResponse = PlanResponse;

/** 失败时的响应体（HTTP 4xx/5xx）。 */
export interface PlanErrorResponse {
  error: string;
}

/** GET /api/plan/providers */
export interface ProviderInfo { id: 'api' | 'claude' | 'codex'; label: string; available: boolean; reason?: string }
export interface ProvidersResponse { providers: ProviderInfo[]; defaultProvider: ProviderInfo['id'] | null; allowHeuristic: boolean }
