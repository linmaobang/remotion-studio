import type { CSSProperties } from 'react';
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { StableStart } from '../shared';
import { FONT_FAMILIES, schema, type Background, type Layer, type Scene, type StudioProps } from './model';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => 1 - (1 - value) ** 3;

type Motion = { opacity: number; x: number; y: number; scale: number; rotate: number };

/** 返回动画预设在某一帧的显隐程度 amount（0 完全隐藏，1 完全显示）所对应的变换。 */
export const presetMotion = (preset: string, amount: number, direction: 'in' | 'out'): Motion => {
  const a = ease(clamp01(amount));
  const sign = direction === 'in' ? 1 : -1;
  const m: Motion = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 };
  if (preset === 'fade') m.opacity = a;
  if (preset === 'slide-up') { m.opacity = a; m.y = (1 - a) * 80; }
  if (preset === 'slide-left') { m.opacity = a; m.x = (1 - a) * 120 * sign; }
  if (preset === 'slide-right') { m.opacity = a; m.x = -(1 - a) * 120 * sign; }
  if (preset === 'zoom-in') { m.opacity = a; m.scale = 0.5 + 0.5 * a; }
  if (preset === 'pop') { m.opacity = Math.min(1, amount * 3); m.scale = interpolate(clamp01(amount), [0, 0.6, 0.8, 1], [0, 1.15, 0.95, 1]); }
  return m;
};

const appear = (local: number, length: number, direction: 'in' | 'out', duration: number) => {
  if (length <= 0) return 1;
  const span = Math.min(length, duration);
  return direction === 'in' ? clamp01(local / span) : clamp01((duration - local) / span);
};

export const getLayerMotion = (layer: Layer, local: number, fps: number): Motion => {
  const inAnim = 'animationIn' in layer ? layer.animationIn : undefined;
  const result: Motion = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 };
  const parts = [
    presetMotion(inAnim?.type ?? 'none', appear(local, inAnim?.frames ?? 0, 'in', layer.durationFrames), 'in'),
    presetMotion(layer.animationOut?.type ?? 'none', appear(local, layer.animationOut?.frames ?? 0, 'out', layer.durationFrames), 'out'),
  ];
  for (const part of parts) {
    result.opacity *= part.opacity; result.x += part.x; result.y += part.y; result.scale *= part.scale;
  }
  const t = local / fps;
  if (layer.loop === 'float') result.y += Math.sin(t * Math.PI * 2 * 0.5) * 12;
  if (layer.loop === 'pulse') result.scale *= 1 + Math.sin(t * Math.PI * 2) * 0.05;
  if (layer.loop === 'spin') result.rotate += t * 90;
  return result;
};

const backgroundCss = (background: Background) => background.type === 'solid'
  ? background.color : `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`;

export const getSceneTransition = (scene: Scene, local: number, width: number, height: number): CSSProperties => {
  const t = scene.transitionIn;
  if (!t || t.type === 'none' || t.frames <= 0) return {};
  const amount = 1 - ease(clamp01(local / Math.min(t.frames, Math.max(1, scene.durationFrames))));
  if (t.type === 'fade') return { opacity: 1 - amount };
  if (t.type === 'slide-left') return { transform: `translateX(${amount * width}px)` };
  if (t.type === 'slide-up') return { transform: `translateY(${amount * height}px)` };
  return { opacity: 1 - amount, transform: `scale(${1 - amount * 0.4})` };
};

const Placeholder = ({ label }: { label: string }) => (
  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(255,255,255,0.4)', color: 'rgba(255,255,255,0.6)', fontSize: 20, boxSizing: 'border-box' }}>{label}</div>
);

const LayerContent = ({ layer, local }: { layer: Layer; local: number }) => {
  if (layer.type === 'text') {
    const inAnim = layer.animationIn;
    const typed = inAnim?.type === 'typewriter';
    const chars = [...layer.text];
    const shown = typed ? chars.slice(0, Math.ceil(chars.length * appear(local, inAnim!.frames, 'in', layer.durationFrames))).join('') : layer.text;
    return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: layer.align === 'left' ? 'flex-start' : layer.align === 'right' ? 'flex-end' : 'center', textAlign: layer.align, whiteSpace: 'pre-wrap', color: layer.color, fontSize: layer.fontSize, fontWeight: layer.fontWeight, fontFamily: FONT_FAMILIES[layer.fontFamily], lineHeight: 1.2 }}>{shown}</div>;
  }
  if (layer.type === 'shape') {
    const sw = layer.strokeWidth;
    const stroke = sw > 0 ? { stroke: layer.stroke, strokeWidth: sw } : {};
    return <svg width="100%" height="100%" viewBox={`0 0 ${layer.width} ${layer.height}`} style={{ overflow: 'visible' }}>
      {layer.shape === 'rect' && <rect x={sw / 2} y={sw / 2} width={Math.max(0, layer.width - sw)} height={Math.max(0, layer.height - sw)} rx={layer.radius} fill={layer.fill} {...stroke} />}
      {layer.shape === 'ellipse' && <ellipse cx={layer.width / 2} cy={layer.height / 2} rx={Math.max(0, (layer.width - sw) / 2)} ry={Math.max(0, (layer.height - sw) / 2)} fill={layer.fill} {...stroke} />}
      {layer.shape === 'line' && <line x1={0} y1={layer.height / 2} x2={layer.width} y2={layer.height / 2} stroke={layer.fill} strokeWidth={Math.max(1, layer.height)} strokeLinecap="round" />}
    </svg>;
  }
  const media: CSSProperties = { width: '100%', height: '100%', objectFit: layer.type === 'audio' ? undefined : layer.fit };
  if (layer.type === 'image') return layer.src ? <Img src={layer.src} style={media} /> : <Placeholder label="图片" />;
  if (layer.type === 'video') return layer.src ? <OffthreadVideo src={layer.src} volume={layer.volume} style={media} /> : <Placeholder label="视频" />;
  return null;
};

const LayerView = ({ layer }: { layer: Layer }) => {
  const local = useCurrentFrame();
  const { fps } = useVideoConfig();
  const motion = getLayerMotion(layer, local, fps);
  if (layer.type === 'audio') return layer.src ? <Audio src={layer.src} volume={layer.volume} /> : null;
  return <div style={{ position: 'absolute', left: layer.x, top: layer.y, width: layer.width, height: layer.height, opacity: layer.opacity * motion.opacity, transform: `translate(${motion.x}px, ${motion.y}px) rotate(${layer.rotation + motion.rotate}deg) scale(${motion.scale})`, transformOrigin: 'center' }}>
    <LayerContent layer={layer} local={local} />
  </div>;
};

const SceneView = ({ scene }: { scene: Scene }) => {
  const local = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return <AbsoluteFill style={{ overflow: 'hidden', ...getSceneTransition(scene, local, width, height) }}>
    <AbsoluteFill style={{ background: backgroundCss(scene.background) }} />
    {scene.layers.map((layer) => layer.visible && (
      <Sequence key={layer.id} name={`${layer.type}: ${layer.name}`} from={layer.startFrame} durationInFrames={layer.durationFrames}>
        <LayerView layer={layer} />
      </Sequence>
    ))}
  </AbsoluteFill>;
};

/** 场景首个稳定帧：转场与各图层入场动画都结束后。 */
const stableOffset = (scene: Scene) => Math.min(
  Math.max(1, scene.durationFrames) - 1,
  Math.max(scene.transitionIn?.frames ?? 0, ...scene.layers.filter((l) => l.visible).map((l) => l.startFrame + (l.type === 'audio' ? 0 : l.animationIn?.frames ?? 0))),
);

export const StudioComposition = (props: StudioProps) => {
  // 渲染端（renderMedia inputProps）不会自动应用 schema 默认值，这里统一补全。
  const parsed = schema.safeParse(props);
  const { scenes } = parsed.success ? parsed.data : props;
  let offset = 0;
  return <AbsoluteFill style={{ background: '#000000', overflow: 'hidden' }}>
    {scenes.map((scene) => {
      const from = offset;
      offset += Math.max(1, scene.durationFrames);
      return <Sequence key={scene.id} name={`场景: ${scene.name}`} from={from} durationInFrames={Math.max(1, scene.durationFrames)}><StableStart offset={stableOffset(scene)}><SceneView scene={scene} /></StableStart></Sequence>;
    })}
  </AbsoluteFill>;
};
