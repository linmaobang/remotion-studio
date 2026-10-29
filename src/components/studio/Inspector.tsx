import type { ReactNode } from 'react';
import type { ProjectData } from '../../shared/types';
import { ANIMATION_PRESETS, FONT_FAMILIES, LOOP_PRESETS, SCENE_TRANSITIONS, TEXT_ANIMATION_PRESETS, type Layer, type Scene } from '../../templates/studio-canvas/model';
import { uploadFile } from './AddToolbar';

const animationLabels: Record<string, string> = { none: '无', fade: '淡入淡出', 'slide-up': '上滑', 'slide-left': '左滑', 'slide-right': '右滑', 'zoom-in': '缩放', pop: '弹出', typewriter: '打字机', float: '漂浮', pulse: '脉冲', spin: '旋转', zoom: '缩放' };
const fontLabels: Record<string, string> = { system: '系统黑体', serif: '衬线', songti: '宋体', kaiti: '楷体', mono: '等宽', rounded: '圆体' };
const resolutions = ['1920x1080', '1280x720', '1080x1080', '720x1080'];

const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="editor-field"><span>{label}</span>{children}</label>;
const Num = ({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) => (
  <Field label={label}><input type="number" aria-label={label} min={min} max={max} step={step} value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ''} onChange={(event) => { if (event.target.value !== '') onChange(Number(event.target.value)); }} /></Field>
);
const Choice = ({ label, value, options, labels, onChange }: { label: string; value: string; options: readonly string[]; labels: Record<string, string>; onChange: (value: string) => void }) => (
  <Field label={label}><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{labels[option] ?? option}</option>)}</select></Field>
);
const Color = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <Field label={label}><div className="editor-color"><input aria-label={`${label}拾色器`} type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(event) => onChange(event.target.value)} /><input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} /></div></Field>
);

type Patch = Record<string, unknown>;

function AnimationFields({ layer, onChange }: { layer: Layer; onChange: (patch: Patch) => void }) {
  const inAnim = ('animationIn' in layer ? layer.animationIn : undefined) ?? { type: 'none', frames: 15 };
  const outAnim = layer.animationOut ?? { type: 'none', frames: 15 };
  const hasIn = layer.type !== 'audio';
  return <fieldset><legend>动画</legend>
    {hasIn && <div className="editor-row">
      <Choice label="入场动画" value={inAnim.type} options={layer.type === 'text' ? TEXT_ANIMATION_PRESETS : ANIMATION_PRESETS} labels={animationLabels} onChange={(type) => onChange({ animationIn: { ...inAnim, type } })} />
      <Num label="入场帧数" min={0} value={inAnim.frames} onChange={(frames) => onChange({ animationIn: { ...inAnim, frames: Math.max(0, Math.round(frames)) } })} />
    </div>}
    <div className="editor-row">
      <Choice label="出场动画" value={outAnim.type} options={ANIMATION_PRESETS} labels={animationLabels} onChange={(type) => onChange({ animationOut: { ...outAnim, type } })} />
      <Num label="出场帧数" min={0} value={outAnim.frames} onChange={(frames) => onChange({ animationOut: { ...outAnim, frames: Math.max(0, Math.round(frames)) } })} />
    </div>
    {hasIn && <Choice label="循环动画" value={layer.loop} options={LOOP_PRESETS} labels={animationLabels} onChange={(loop) => onChange({ loop })} />}
  </fieldset>;
}

export function LayerInspector({ layer, onChange }: { layer: Layer; onChange: (patch: Patch) => void }) {
  const media = layer.type === 'image' || layer.type === 'video' || layer.type === 'audio';
  return <div className="studio-inspector-body">
    <Field label="图层名称"><input aria-label="图层名称" value={layer.name} onChange={(event) => onChange({ name: event.target.value })} /></Field>
    {layer.type !== 'audio' && <>
      <div className="editor-row"><Num label="X" value={layer.x} onChange={(x) => onChange({ x })} /><Num label="Y" value={layer.y} onChange={(y) => onChange({ y })} /></div>
      <div className="editor-row"><Num label="宽度" min={1} value={layer.width} onChange={(width) => onChange({ width: Math.max(1, width) })} /><Num label="高度" min={1} value={layer.height} onChange={(height) => onChange({ height: Math.max(1, height) })} /></div>
      <div className="editor-row"><Num label="旋转" value={layer.rotation} onChange={(rotation) => onChange({ rotation })} /><Num label="不透明度" min={0} max={1} step={0.05} value={layer.opacity} onChange={(opacity) => onChange({ opacity: Math.min(1, Math.max(0, opacity)) })} /></div>
    </>}
    <div className="editor-row"><Num label="起始帧" min={0} value={layer.startFrame} onChange={(startFrame) => onChange({ startFrame: Math.max(0, Math.round(startFrame)) })} /><Num label="持续帧数" min={1} value={layer.durationFrames} onChange={(durationFrames) => onChange({ durationFrames: Math.max(1, Math.round(durationFrames)) })} /></div>
    {layer.type === 'text' && <fieldset><legend>文字</legend>
      <Field label="文字内容"><textarea aria-label="文字内容" value={layer.text} onChange={(event) => onChange({ text: event.target.value })} /></Field>
      <div className="editor-row"><Num label="字号" min={1} value={layer.fontSize} onChange={(fontSize) => onChange({ fontSize: Math.max(1, fontSize) })} /><Num label="字重" min={100} max={900} step={100} value={layer.fontWeight} onChange={(fontWeight) => onChange({ fontWeight: Math.min(900, Math.max(100, Math.round(fontWeight))) })} /></div>
      <Color label="文字颜色" value={layer.color} onChange={(color) => onChange({ color })} />
      <div className="editor-row"><Choice label="对齐" value={layer.align} options={['left', 'center', 'right']} labels={{ left: '左', center: '中', right: '右' }} onChange={(align) => onChange({ align })} /><Choice label="字体" value={layer.fontFamily} options={Object.keys(FONT_FAMILIES)} labels={fontLabels} onChange={(fontFamily) => onChange({ fontFamily })} /></div>
    </fieldset>}
    {layer.type === 'shape' && <fieldset><legend>形状</legend>
      <Choice label="形状类型" value={layer.shape} options={['rect', 'ellipse', 'line']} labels={{ rect: '矩形', ellipse: '椭圆', line: '线条' }} onChange={(shape) => onChange({ shape })} />
      <Color label={layer.shape === 'line' ? '线条颜色' : '填充颜色'} value={layer.fill} onChange={(fill) => onChange({ fill })} />
      {layer.shape !== 'line' && <><Color label="描边颜色" value={layer.stroke} onChange={(stroke) => onChange({ stroke })} />
        <div className="editor-row"><Num label="描边宽度" min={0} value={layer.strokeWidth} onChange={(strokeWidth) => onChange({ strokeWidth: Math.max(0, strokeWidth) })} />{layer.shape === 'rect' && <Num label="圆角" min={0} value={layer.radius} onChange={(radius) => onChange({ radius: Math.max(0, radius) })} />}</div></>}
    </fieldset>}
    {media && <fieldset><legend>素材</legend>
      <Field label="素材地址"><input aria-label="素材地址" value={layer.src} placeholder="/files/uploads/… 或 https://…" onChange={(event) => onChange({ src: event.target.value })} /></Field>
      <label className="editor-upload">替换素材…<input type="file" aria-label="替换素材" accept={layer.type + '/*'} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadFile(file).then((result) => onChange({ src: result.url, name: result.name })).catch(() => undefined); }} /></label>
      {layer.type !== 'audio' && <Choice label="填充方式" value={layer.fit} options={['cover', 'contain']} labels={{ cover: '铺满裁切', contain: '完整显示' }} onChange={(fit) => onChange({ fit })} />}
      {layer.type !== 'image' && <Num label="音量" min={0} max={1} step={0.05} value={layer.volume} onChange={(volume) => onChange({ volume: Math.min(1, Math.max(0, volume)) })} />}
    </fieldset>}
    <AnimationFields layer={layer} onChange={onChange} />
  </div>;
}

export function SceneInspector({ project, scene, canDelete, onScene, onProject, onDelete }: {
  project: ProjectData; scene: Scene; canDelete: boolean;
  onScene: (patch: Patch) => void; onProject: (patch: Partial<ProjectData>) => void; onDelete: () => void;
}) {
  const bg = scene.background;
  const transition = scene.transitionIn ?? { type: 'none' as const, frames: 15 };
  const size = `${project.width}x${project.height}`;
  return <div className="studio-inspector-body">
    <Field label="项目名称"><input aria-label="项目名称" value={project.name} onChange={(event) => onProject({ name: event.target.value })} /></Field>
    <Field label="分辨率"><select aria-label="分辨率" value={resolutions.includes(size) ? size : 'custom'} onChange={(event) => { if (event.target.value === 'custom') return; const [width, height] = event.target.value.split('x').map(Number); onProject({ width, height }); }}>
      <option value="1920x1080">横屏 · 1920 × 1080</option><option value="1280x720">横屏 · 1280 × 720</option><option value="1080x1080">方形 · 1080 × 1080</option><option value="720x1080">竖屏 · 720 × 1080</option>{!resolutions.includes(size) && <option value="custom">自定义 · {size}</option>}
    </select></Field>
    <Field label="场景名称"><input aria-label="场景名称" value={scene.name} onChange={(event) => onScene({ name: event.target.value })} /></Field>
    <Num label="场景帧数" min={1} value={scene.durationFrames} onChange={(durationFrames) => onScene({ durationFrames: Math.max(1, Math.round(durationFrames)) })} />
    <fieldset><legend>背景</legend>
      <Choice label="背景类型" value={bg.type} options={['solid', 'gradient']} labels={{ solid: '纯色', gradient: '线性渐变' }} onChange={(type) => onScene({ background: type === 'solid' ? { type: 'solid', color: bg.type === 'solid' ? bg.color : bg.from } : { type: 'gradient', from: bg.type === 'solid' ? bg.color : bg.from, to: bg.type === 'solid' ? '#0ea5e9' : bg.to, angle: bg.type === 'solid' ? 135 : bg.angle } })} />
      {bg.type === 'solid' ? <Color label="背景颜色" value={bg.color} onChange={(color) => onScene({ background: { ...bg, color } })} /> : <>
        <Color label="渐变起点" value={bg.from} onChange={(from) => onScene({ background: { ...bg, from } })} />
        <Color label="渐变终点" value={bg.to} onChange={(to) => onScene({ background: { ...bg, to } })} />
        <Num label="渐变角度" value={bg.angle} onChange={(angle) => onScene({ background: { ...bg, angle } })} /></>}
    </fieldset>
    <fieldset><legend>入场转场</legend><div className="editor-row">
      <Choice label="转场类型" value={transition.type} options={SCENE_TRANSITIONS} labels={{ none: '无', fade: '淡入', 'slide-left': '左滑', 'slide-up': '上滑', zoom: '缩放' }} onChange={(type) => onScene({ transitionIn: { ...transition, type } })} />
      <Num label="转场帧数" min={0} value={transition.frames} onChange={(frames) => onScene({ transitionIn: { ...transition, frames: Math.max(0, Math.round(frames)) } })} />
    </div></fieldset>
    {canDelete && <button onClick={onDelete}>删除当前场景</button>}
  </div>;
}

export function LayerList({ layers, selectedId, onSelect, onToggle, onMove, onDelete }: {
  layers: Layer[]; selectedId: string | null; onSelect: (id: string) => void;
  onToggle: (id: string, key: 'visible' | 'locked') => void; onMove: (id: string, delta: -1 | 1) => void; onDelete: (id: string) => void;
}) {
  if (!layers.length) return <p className="studio-empty">当前场景还没有图层，从上方添加。</p>;
  return <ul className="studio-layers" aria-label="图层列表">
    {[...layers].reverse().map((layer) => {
      const index = layers.indexOf(layer);
      return <li key={layer.id} className={layer.id === selectedId ? 'selected' : ''}>
        <button className="studio-layer-name" onClick={() => onSelect(layer.id)}>{layer.name}</button>
        <button aria-label={`${layer.visible ? '隐藏' : '显示'} ${layer.name}`} title={layer.visible ? '隐藏' : '显示'} onClick={() => onToggle(layer.id, 'visible')}>{layer.visible ? '👁' : '—'}</button>
        <button aria-label={`${layer.locked ? '解锁' : '锁定'} ${layer.name}`} title={layer.locked ? '解锁' : '锁定'} onClick={() => onToggle(layer.id, 'locked')}>{layer.locked ? '🔒' : '🔓'}</button>
        <button aria-label={`上移 ${layer.name}`} disabled={index === layers.length - 1} onClick={() => onMove(layer.id, 1)}>↑</button>
        <button aria-label={`下移 ${layer.name}`} disabled={index === 0} onClick={() => onMove(layer.id, -1)}>↓</button>
        <button aria-label={`删除 ${layer.name}`} onClick={() => onDelete(layer.id)}>×</button>
      </li>;
    })}
  </ul>;
}
