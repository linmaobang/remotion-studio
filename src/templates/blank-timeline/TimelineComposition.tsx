import type { CSSProperties } from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Clip, TimelineState } from '../../shared/types';
import { fontFamily } from '../shared';
import { getClipTransition } from './transitions';

export type TimelineCompositionProps = { timeline: TimelineState };

const TimelineClip = ({ clip }: { clip: Clip }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const transition = getClipTransition(clip, frame, width, height);
  const style = clip.style as CSSProperties | undefined;
  const mediaStyle: CSSProperties = { width: '100%', height: '100%', objectFit: 'contain', ...style };
  const volume = (localFrame: number) => clip.volume * getClipTransition(clip, localFrame, width, height).opacity;
  if (clip.type !== 'text' && !clip.src) return null;
  return (
    <AbsoluteFill style={transition}>
      {clip.type === 'video' && <OffthreadVideo src={clip.src!} startFrom={clip.trimStartFrame} volume={volume} style={mediaStyle} />}
      {clip.type === 'image' && <Img src={clip.src!} style={mediaStyle} />}
      {clip.type === 'audio' && <Audio src={clip.src!} startFrom={clip.trimStartFrame} volume={volume} />}
      {clip.type === 'text' && <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'pre-wrap', color: '#ffffff', fontSize: width * 0.05, fontFamily, ...style }}>{clip.text ?? ''}</div>}
    </AbsoluteFill>
  );
};

export const TimelineComposition = ({ timeline }: TimelineCompositionProps) => (
  <AbsoluteFill style={{ background: '#111318', overflow: 'hidden' }}>
    {timeline.tracks.map((track) => track.clips.map((clip) => (
      <Sequence key={`${track.id}:${clip.id}`} name={`${track.type}: ${clip.text ?? clip.id}`} from={clip.startFrame} durationInFrames={clip.durationFrames}>
        <TimelineClip clip={clip} />
      </Sequence>
    )))}
  </AbsoluteFill>
);
