import { useMemo } from 'react';
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { parsePlan, planDuration, type Scene, type VideoPlan } from '../../plan/schema';
import { Backdrop, fontStack, SceneView, type Theme } from './scenes';

export type AiVideoProps = { plan: unknown };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 场景入场转场：不与上一场景重叠，从舞台底色渐显/滑入。 */
export const getSceneTransitionStyle = (scene: Scene, local: number, width: number, height: number) => {
  const { type, frames } = scene.transition;
  if (type === 'none' || frames <= 0) return {};
  const p = interpolate(clamp01(local / frames), [0, 1], [0, 1], { easing: Easing.out(Easing.cubic) });
  if (type === 'fade') return { opacity: p };
  if (type === 'slide-left') return { transform: `translateX(${(1 - p) * width}px)` };
  return { transform: `translateY(${(1 - p) * height}px)` };
};

const SceneFrame = ({ scene, theme, font }: { scene: Scene; theme: Theme; font: string }) => {
  const local = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return <AbsoluteFill style={getSceneTransitionStyle(scene, local, width, height)}>
    <Backdrop scene={scene} theme={theme} />
    <SceneView scene={scene} theme={theme} font={font} />
  </AbsoluteFill>;
};

const Placeholder = ({ errors }: { errors: string[] }) => (
  <AbsoluteFill style={{ background: '#111827', color: '#e5e7eb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: fontStack('system'), textAlign: 'center', padding: 80 }}>
    <div style={{ fontSize: 56, fontWeight: 700 }}>视频方案无效</div>
    <div style={{ fontSize: 28, opacity: 0.7 }}>{errors[0] ?? '请检查方案内容'}</div>
  </AbsoluteFill>
);

const Soundtrack = ({ plan, total }: { plan: VideoPlan; total: number }) => {
  const { fps } = useVideoConfig();
  const { bgm, voiceover } = plan.audio;
  return <>
    {bgm && <Audio src={bgm.src} loop={bgm.loop} volume={(f) => bgm.volume * Math.min(clamp01(f / (fps * 0.5)), clamp01((total - f) / fps))} />}
    {voiceover && <Sequence from={voiceover.startFrame}><Audio src={voiceover.src} volume={voiceover.volume} /></Sequence>}
  </>;
};

export const AiVideoComposition = ({ plan }: AiVideoProps) => {
  const parsed = useMemo(() => parsePlan(plan), [plan]);
  if (!parsed.ok) return <Placeholder errors={parsed.errors} />;
  const { plan: valid } = parsed;
  const font = fontStack(valid.style.fontFamily);
  const total = planDuration(valid);
  let offset = 0;
  return <AbsoluteFill style={{ background: '#000000', overflow: 'hidden' }}>
    {valid.scenes.map((scene) => {
      const from = offset;
      offset += scene.durationFrames;
      return <Sequence key={scene.id} name={`${scene.kind}: ${scene.id}`} from={from} durationInFrames={scene.durationFrames}><SceneFrame scene={scene} theme={valid.style.theme} font={font} /></Sequence>;
    })}
    <Soundtrack plan={valid} total={total} />
  </AbsoluteFill>;
};
