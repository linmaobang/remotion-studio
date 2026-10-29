import { useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import type { ProjectData } from '../../shared/types';
import type { TemplateDef } from '../../templates/registry';
import { inputProps } from '../../lib/editor';

export default function PreviewPane({ project, template, playerRef, onFrame }: {
  project: ProjectData;
  template: TemplateDef;
  playerRef: RefObject<PlayerRef | null>;
  onFrame: (frame: number) => void;
}) {
  const props = useMemo(() => inputProps(project), [project]);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const update = ({ detail }: { detail: { frame: number } }) => onFrame(detail.frame);
    player.addEventListener('frameupdate', update);
    return () => player.removeEventListener('frameupdate', update);
  }, [playerRef, onFrame]);
  useEffect(() => {
    const player = playerRef.current;
    if (player && player.getCurrentFrame() >= project.durationInFrames) player.seekTo(project.durationInFrames - 1);
  }, [project.durationInFrames, playerRef]);
  return <section className="editor-preview" aria-label="实时预览">
    <div className="editor-section-title"><h2>实时预览</h2><span>{project.width} × {project.height} · {project.fps} fps</span></div>
    <div className="editor-stage"><Player ref={playerRef} component={template.component} inputProps={props} compositionWidth={project.width} compositionHeight={project.height} fps={project.fps} durationInFrames={project.durationInFrames} controls style={{ width: '100%', maxHeight: '60vh', aspectRatio: `${project.width}/${project.height}` }} errorFallback={({ error }) => <p role="alert">预览失败：{error.message}</p>} /></div>
  </section>;
}
