// 视频方案相关 API 的请求/响应契约（仅类型，前后端共用）。
import type { VideoPlan } from './schema';

export type AssetKind = 'image' | 'audio' | 'voiceover';

/** 用户上传的素材引用，url 即 /api/upload 返回的 /files/uploads/... 地址。 */
export interface AssetRef {
  url: string;
  name: string;
  kind: AssetKind;
}

export type Orientation = 'landscape' | 'portrait';

/** POST /api/plan/optimize：把一句需求优化成完整方案。 */
export interface OptimizeRequest {
  prompt: string;
  assets?: AssetRef[];
  durationSec?: number;
  orientation?: Orientation;
}

/** POST /api/plan/refine：按自然语言指令修改已有方案。 */
export interface RefineRequest {
  plan: VideoPlan;
  instruction: string;
}

/** 两个接口共用的成功响应；usedLLM 为 false 表示走了本地兜底生成。 */
export interface PlanResponse {
  plan: VideoPlan;
  usedLLM: boolean;
  warnings: string[];
}

export type OptimizeResponse = PlanResponse;
export type RefineResponse = PlanResponse;

/** 失败时的响应体（HTTP 4xx/5xx）。 */
export interface PlanErrorResponse {
  error: string;
}
