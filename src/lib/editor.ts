import { useEffect, useState, type RefObject } from 'react';
import type { PlayerRef } from '@remotion/player';
import { z } from 'zod';
import type { Clip, ProjectData, TimelineState } from '../shared/types';
import { totalDuration } from '../templates/studio-canvas/model';

/** 跟踪 Player 是否暂停（预览停在场景起点时用来显示稳定帧）。 */
export function usePlayerPaused(playerRef: RefObject<PlayerRef | null>, ready = true) {
  const [paused, setPaused] = useState(true);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const on = () => setPaused(false);
    const off = () => setPaused(true);
    player.addEventListener('play', on);
    player.addEventListener('pause', off);
    player.addEventListener('ended', off);
    return () => { player.removeEventListener('play', on); player.removeEventListener('pause', off); player.removeEventListener('ended', off); };
  }, [playerRef, ready]);
  return paused;
}

export function inputProps(project: ProjectData) {
  return {
    ...project.props,
    ...(project.templateId === 'blank-timeline' ? { timeline: project.timeline ?? project.props.timeline ?? { tracks: [] } } : {}),
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationInFrames: project.durationInFrames,
  };
}

export function timelineOf(project: ProjectData): TimelineState {
  return (project.timeline ?? project.props.timeline ?? { tracks: [] }) as TimelineState;
}

export function withTimeline(project: ProjectData, timeline: TimelineState): ProjectData {
  const durationInFrames = Math.max(1, ...timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.startFrame + clip.durationFrames)));
  return { ...project, timeline, props: { ...project.props, timeline }, durationInFrames };
}

/** 创作画布的时长由场景总帧数推导，编辑场景后调用以同步 durationInFrames。 */
export function withStudioDuration(project: ProjectData): ProjectData {
  const scenes = project.props.scenes;
  if (!Array.isArray(scenes)) return project;
  return { ...project, durationInFrames: totalDuration(scenes.filter((scene) => scene && typeof scene.durationFrames === 'number')) };
}

export function splitClip(clip: Clip, frame: number, id: string): Clip[] {
  const offset = frame - clip.startFrame;
  if (offset <= 0 || offset >= clip.durationFrames) return [clip];
  return [
    { ...clip, durationFrames: offset, transitionOut: undefined },
    { ...clip, id, startFrame: frame, durationFrames: clip.durationFrames - offset, trimStartFrame: clip.trimStartFrame + offset, transitionIn: undefined },
  ];
}

export function resizeClip(clip: Clip, edge: 'left' | 'right', delta: number): Clip {
  if (edge === 'right') return { ...clip, durationFrames: Math.max(1, clip.durationFrames + delta) };
  const change = Math.min(clip.durationFrames - 1, Math.max(-clip.startFrame, -clip.trimStartFrame, delta));
  return { ...clip, startFrame: clip.startFrame + change, trimStartFrame: clip.trimStartFrame + change, durationFrames: clip.durationFrames - change };
}

export function fieldInfo(schema: z.ZodTypeAny): { schema: z.ZodTypeAny; color: boolean } {
  let current = schema;
  let color = false;
  while (true) {
    color ||= current.description === '__remotion-color';
    if (current instanceof z.ZodEffects) current = current.innerType();
    else if (current instanceof z.ZodDefault) current = current.removeDefault();
    else if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) current = current.unwrap();
    else break;
  }
  return { schema: current, color };
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = typeof body.error === 'string' ? body.error : '';
    } catch { /* 非 JSON 错误使用状态码。 */ }
    throw new Error(detail || `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export const jsonBody = (method: string, value: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
