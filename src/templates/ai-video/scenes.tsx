import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CtaScene, ImageTextScene, ListScene, Scene, StatScene, TitleScene, VideoPlan } from '../../plan/schema';
import { FONT_FAMILIES, type FontKey } from '../studio-canvas/model';

export type Theme = VideoPlan['style']['theme'];
export type SceneContext = { theme: Theme; font: string };

export const fontStack = (name: string) => (name in FONT_FAMILIES ? FONT_FAMILIES[name as FontKey] : `"${name.replace(/"/g, '')}", ${FONT_FAMILIES.system}`);

/** 设计稿按 1080 短边排版，横竖屏通用。 */
const useUnit = () => { const { width, height } = useVideoConfig(); return Math.min(width, height) / 1080; };

const Reveal = ({ delay = 0, distance = 40, style, children }: { delay?: number; distance?: number; style?: CSSProperties; children: ReactNode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * distance}px)`, ...style }}>{children}</div>;
};

const Chars = ({ text, delay = 0, stagger = 2 }: { text: string; delay?: number; stagger?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = [...text];
  if (chars.length > 28) return <Reveal delay={delay}>{text}</Reveal>;
  return <>{chars.map((char, i) => {
    const p = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 18, stiffness: 140 } });
    return <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 50}px)` }}>{char}</span>;
  })}</>;
};

const NUMBER = /^([^\d-]*)(-?\d[\d,]*(?:\.\d+)?)(.*)$/;
const CountUp = ({ value, delay = 0 }: { value: string; delay?: number }) => {
  const frame = useCurrentFrame();
  const match = NUMBER.exec(value);
  if (!match) return <>{value}</>;
  const [, prefix, digits, suffix] = match;
  const target = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(target) || /^0\d/.test(digits)) return <>{value}</>;
  const progress = interpolate(frame - delay, [0, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const decimals = digits.includes('.') ? digits.split('.')[1].length : 0;
  const current = (target * progress).toFixed(decimals);
  const shown = digits.includes(',') ? Number(current).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : current;
  return <>{prefix}{shown}{suffix}</>;
};

const AccentBar = ({ color, width, delay = 0 }: { color: string; width: number; delay?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ width: width * p, height: 10, borderRadius: 5, background: color }} />;
};

/** 场景背景：背景图（加暗化罩）或背景色 + 缓慢漂移的主题色光斑。 */
export const Backdrop = ({ scene, theme }: { scene: Scene; theme: Theme }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const base = scene.backgroundColor ?? theme.background;
  const drift = Math.sin(frame / 60);
  const blob = (color: string, size: number, x: number, y: number, phase: number): CSSProperties => ({
    position: 'absolute', width: size, height: size, borderRadius: '50%', background: color, opacity: 0.22, filter: `blur(${size / 5}px)`,
    left: x + Math.sin(frame / 70 + phase) * size * 0.08, top: y + Math.cos(frame / 90 + phase) * size * 0.08,
  });
  return <AbsoluteFill style={{ background: base, overflow: 'hidden' }}>
    {scene.backgroundSrc
      ? <><Img src={scene.backgroundSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.04 + drift * 0.02})` }} /><AbsoluteFill style={{ background: base, opacity: 0.55 }} /></>
      : <><div style={blob(theme.primary, width * 0.7, -width * 0.15, -height * 0.25, 0)} /><div style={blob(theme.secondary, width * 0.6, width * 0.6, height * 0.45, 2)} /></>}
  </AbsoluteFill>;
};

const Frame = ({ children, theme, font, style }: { children: ReactNode; theme: Theme; font: string; style?: CSSProperties }) => {
  const u = useUnit();
  return <AbsoluteFill style={{ color: theme.text, fontFamily: font, padding: `${110 * u}px ${130 * u}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', ...style }}>{children}</AbsoluteFill>;
};

export const TitleView = ({ scene, theme, font }: SceneContext & { scene: TitleScene }) => {
  const u = useUnit();
  return <Frame theme={theme} font={font} style={{ alignItems: 'center', textAlign: 'center' }}>
    <div style={{ fontSize: 120 * u, fontWeight: 800, lineHeight: 1.15, letterSpacing: 2 * u }}><Chars text={scene.title} /></div>
    <div style={{ margin: `${36 * u}px 0` }}><AccentBar color={theme.primary} width={220 * u} delay={20} /></div>
    {scene.subtitle && <Reveal delay={28} distance={24 * u}><div style={{ fontSize: 48 * u, fontWeight: 400, opacity: 0.85 }}>{scene.subtitle}</div></Reveal>}
  </Frame>;
};

export const ImageTextView = ({ scene, theme, font }: SceneContext & { scene: ImageTextScene }) => {
  const u = useUnit();
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const imageFirst = scene.imagePosition === 'left';
  const lines = scene.body.split(/\n+/).filter(Boolean);
  const zoom = 1 + frame / Math.max(1, scene.durationFrames) * 0.08;
  const image = <Reveal delay={4} distance={30 * u} style={{ flex: portrait ? '0 0 42%' : 1, minHeight: 0, minWidth: 0 }}>
    <div style={{ width: '100%', height: '100%', borderRadius: 28 * u, overflow: 'hidden', boxShadow: `0 ${24 * u}px ${70 * u}px rgba(0,0,0,0.45)`, background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {scene.imageSrc ? <Img src={scene.imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} /> : <span style={{ fontSize: 220 * u, fontWeight: 800, color: theme.background, opacity: 0.55 }}>{[...scene.title][0]}</span>}
    </div>
  </Reveal>;
  const copy = <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 * u }}>
    <AccentBar color={theme.primary} width={120 * u} />
    <div style={{ fontSize: 78 * u, fontWeight: 800, lineHeight: 1.2 }}><Chars text={scene.title} stagger={1.5} /></div>
    {lines.map((line, i) => <Reveal key={i} delay={18 + i * 12} distance={24 * u}><div style={{ fontSize: 40 * u, lineHeight: 1.55, opacity: 0.88 }}>{line}</div></Reveal>)}
  </div>;
  return <Frame theme={theme} font={font} style={{ flexDirection: portrait ? 'column' : 'row', gap: 70 * u, alignItems: 'stretch' }}>
    {imageFirst || portrait ? <>{image}{copy}</> : <>{copy}{image}</>}
  </Frame>;
};

export const ListView = ({ scene, theme, font }: SceneContext & { scene: ListScene }) => {
  const u = useUnit();
  const items = scene.items.length ? scene.items : ['（暂无要点）'];
  return <Frame theme={theme} font={font} style={{ gap: 36 * u }}>
    <AccentBar color={theme.primary} width={120 * u} />
    <div style={{ fontSize: 84 * u, fontWeight: 800, marginBottom: 12 * u }}><Chars text={scene.title} stagger={1.5} /></div>
    {items.map((item, i) => <Reveal key={i} delay={14 + i * 12} distance={30 * u}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 * u, padding: `${22 * u}px ${34 * u}px`, borderRadius: 24 * u, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
        <div style={{ width: 68 * u, height: 68 * u, borderRadius: '50%', flex: '0 0 auto', background: theme.primary, color: theme.background, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 * u, fontWeight: 800 }}>{i + 1}</div>
        <div style={{ fontSize: 46 * u, lineHeight: 1.3 }}>{item}</div>
      </div>
    </Reveal>)}
  </Frame>;
};

export const StatView = ({ scene, theme, font }: SceneContext & { scene: StatScene }) => {
  const u = useUnit();
  const { width, height } = useVideoConfig();
  const stats = scene.stats.length ? scene.stats : [{ value: '—', label: '暂无数据' }];
  return <Frame theme={theme} font={font} style={{ gap: 60 * u }}>
    <div><AccentBar color={theme.primary} width={120 * u} /><div style={{ fontSize: 84 * u, fontWeight: 800, marginTop: 24 * u }}><Chars text={scene.title} stagger={1.5} /></div></div>
    <div style={{ display: 'flex', flexDirection: height > width ? 'column' : 'row', gap: 40 * u }}>
      {stats.map((stat, i) => <Reveal key={i} delay={16 + i * 12} distance={40 * u} style={{ flex: 1 }}>
        <div style={{ padding: `${50 * u}px ${36 * u}px`, borderRadius: 30 * u, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', textAlign: 'center' }}>
          <div style={{ fontSize: 130 * u, fontWeight: 800, lineHeight: 1.1, color: theme.primary, fontVariantNumeric: 'tabular-nums' }}><CountUp value={stat.value} delay={20 + i * 12} /></div>
          <div style={{ fontSize: 40 * u, marginTop: 16 * u, opacity: 0.85 }}>{stat.label}</div>
        </div>
      </Reveal>)}
    </div>
  </Frame>;
};

export const CtaView = ({ scene, theme, font }: SceneContext & { scene: CtaScene }) => {
  const u = useUnit();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 26, fps, config: { damping: 12, stiffness: 120 } });
  const pulse = 1 + Math.sin(Math.max(0, frame - 40) / 8) * 0.025;
  return <Frame theme={theme} font={font} style={{ alignItems: 'center', textAlign: 'center', gap: 40 * u }}>
    <div style={{ fontSize: 100 * u, fontWeight: 800, lineHeight: 1.2 }}><Chars text={scene.title} /></div>
    {scene.subtitle && <Reveal delay={18} distance={24 * u}><div style={{ fontSize: 44 * u, opacity: 0.85 }}>{scene.subtitle}</div></Reveal>}
    <div style={{ transform: `scale(${pop * pulse})`, opacity: Math.min(1, pop * 1.5), padding: `${28 * u}px ${80 * u}px`, borderRadius: 999, background: theme.primary, color: theme.background, fontSize: 54 * u, fontWeight: 800, boxShadow: `0 0 ${60 * u}px ${theme.primary}88` }}>{scene.buttonText}</div>
  </Frame>;
};

export const SceneView = ({ scene, theme, font }: SceneContext & { scene: Scene }) => {
  switch (scene.kind) {
    case 'title': return <TitleView scene={scene} theme={theme} font={font} />;
    case 'image-text': return <ImageTextView scene={scene} theme={theme} font={font} />;
    case 'list': return <ListView scene={scene} theme={theme} font={font} />;
    case 'stat': return <StatView scene={scene} theme={theme} font={font} />;
    case 'cta': return <CtaView scene={scene} theme={theme} font={font} />;
  }
};
