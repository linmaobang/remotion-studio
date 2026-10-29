export type TemplateCategory = 'Motion graphics' | 'Explainers' | '3D 场景' | 'Games & interactive' | '剪辑';

export interface TemplateMeta {
  id: string;
  name: string;
  category: TemplateCategory;
  tags: string[];
  prompt: string;
  description: string;
  thumbnail?: string;
}

export type TransitionType = 'fade' | 'slide-left' | 'slide-up' | 'none';

export interface ClipTransition {
  type: TransitionType;
  frames: number;
}

export interface Clip {
  id: string;
  type: 'video' | 'image' | 'audio' | 'text';
  src?: string;
  text?: string;
  style?: Record<string, unknown>;
  startFrame: number;
  durationFrames: number;
  /** 素材内起点（帧） */
  trimStartFrame: number;
  volume: number;
  transitionIn?: ClipTransition;
  transitionOut?: ClipTransition;
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text';
  clips: Clip[];
}

export interface TimelineState {
  tracks: Track[];
}

export interface ProjectData {
  id: string;
  name: string;
  templateId: string;
  props: Record<string, unknown>;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  timeline?: TimelineState;
  updatedAt: string;
}

export interface UploadResult {
  url: string;
  name: string;
  mime: string;
}

export type RenderStatus = 'queued' | 'rendering' | 'done' | 'error';

export interface RenderJob {
  status: RenderStatus;
  progress: number;
  outputUrl?: string;
  error?: string;
}

export const MAX_WIDTH = 1920;
export const MAX_HEIGHT = 1080;

/** 横屏上限 1920x1080；竖屏（高>宽）对调为 1080x1920，避免 720x1280 这类竖屏被压成 1080 高。 */
export const maxSizeFor = (width: number, height: number) => (height > width ? { width: MAX_HEIGHT, height: MAX_WIDTH } : { width: MAX_WIDTH, height: MAX_HEIGHT });
