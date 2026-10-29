import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { planDuration, type Scene, type SceneKind, type VideoPlan } from '../../plan/schema';
import { SCENE_KIND_LABELS, assetName, insertGapAt, sceneStart } from './logic';

type Drag =
  | { mode: 'reorder'; index: number; startX: number; moved: boolean; gap: number }
  | { mode: 'resize'; index: number; startX: number; startFrames: number; group: string };

let gestureCount = 0;
/** 轨道左侧标签宽度：时间轴内容的 x 坐标从它之后开始。 */
const LABEL_WIDTH = 90;
const kinds = Object.keys(SCENE_KIND_LABELS) as SceneKind[];
const preview = (scene: Scene) => scene.title;

export default function PlanTimeline({ plan, frame, selectedId, onSelect, onSeek, onReorder, onResize, onAdd, onDuplicate, onDelete, onOpenGlobal }: {
  plan: VideoPlan;
  frame: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeek: (frame: number) => void;
  onReorder: (from: number, gap: number) => void;
  onResize: (index: number, frames: number, group: string) => void;
  onAdd: (kind: SceneKind) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenGlobal: () => void;
}) {
  const { scenes, format, audio } = plan;
  const total = planDuration(plan);
  const [scale, setScale] = useState(0.5);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const width = Math.max(total * scale + 60, 300);
  const xOf = (event: PointerEvent) => event.clientX - (content.current?.getBoundingClientRect().left ?? 0) - LABEL_WIDTH;
  const capture = (event: PointerEvent<HTMLElement>) => { try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 合成事件无活动指针时忽略 */ } };

  const beginReorder = (event: PointerEvent<HTMLElement>, index: number) => {
    if (event.button !== 0) return;
    capture(event);
    onSelect(scenes[index].id);
    onSeek(sceneStart(scenes, index));
    setDrag({ mode: 'reorder', index, startX: event.clientX, moved: false, gap: index });
  };
  const beginResize = (event: PointerEvent<HTMLElement>, index: number) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    capture(event);
    setDrag({ mode: 'resize', index, startX: event.clientX, startFrames: scenes[index].durationFrames, group: `resize-${++gestureCount}` });
  };
  const move = (event: PointerEvent) => {
    if (!drag) return;
    if (drag.mode === 'resize') { onResize(drag.index, drag.startFrames + (event.clientX - drag.startX) / scale, drag.group); return; }
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < 5) return;
    setDrag({ ...drag, moved: true, gap: insertGapAt(scenes, xOf(event), scale) });
  };
  const end = () => {
    if (drag?.mode === 'reorder' && drag.moved && drag.gap !== drag.index && drag.gap !== drag.index + 1) onReorder(drag.index, drag.gap);
    setDrag(null);
  };

  const scrub = (event: PointerEvent<HTMLElement>) => {
    if (event.type === 'pointerdown') capture(event);
    else if (event.buttons === 0) return;
    onSeek(Math.min(total - 1, Math.max(0, Math.round(xOf(event) / scale))));
  };
  const seconds = Math.ceil(total / format.fps);
  const tickStep = Math.max(1, Math.ceil(60 / (scale * format.fps)));
  const ticks = Array.from({ length: Math.floor(seconds / tickStep) + 1 }, (_, i) => i * tickStep);
  const gapX = drag?.mode === 'reorder' && drag.moved ? sceneStart(scenes, drag.gap) * scale : null;
  const selectedIndex = scenes.findIndex((scene) => scene.id === selectedId);

  const audioBar = (label: string, name: string | undefined, startFrame = 0) => (
    <div className="pe-track-row">
      <span className="pe-track-label">{label}</span>
      <div className="pe-track-lane" style={{ width }}>
        <button type="button" className={`pe-audio-bar${name ? ' set' : ''}`} style={{ left: startFrame * scale, width: name ? Math.max(60, (total - startFrame) * scale) : 140 }} onClick={onOpenGlobal}
          title={name ? `${label}：${name}（点击在右侧修改）` : `${label}未设置，点击在右侧设置`}>
          {name ? `♪ ${name}` : `未设置 ${label}`}
        </button>
      </div>
    </div>
  );

  return <section className="pe-timeline" aria-label="时间轴">
    <div className="pe-timeline-bar">
      <div className="pe-add">
        <button type="button" onClick={() => setMenu((open) => !open)} aria-expanded={menu}>＋ 添加场景</button>
        {menu && <div className="pe-menu" role="menu">{kinds.map((kind) => <button type="button" role="menuitem" key={kind} onClick={() => { setMenu(false); onAdd(kind); }}>{SCENE_KIND_LABELS[kind]}</button>)}</div>}
      </div>
      <button type="button" disabled={selectedIndex < 0} onClick={onDuplicate}>复制</button>
      <button type="button" disabled={selectedIndex < 0 || scenes.length < 2} onClick={onDelete}>删除</button>
      <span className="pe-spacer" />
      <span className="pe-total">总时长 {(total / format.fps).toFixed(1)}s · {scenes.length} 个场景</span>
      <label className="pe-zoom">缩放<input type="range" aria-label="时间轴缩放" min={0.15} max={1.4} step={0.05} value={scale} onChange={(event) => setScale(Number(event.target.value))} /></label>
    </div>
    <div className="pe-timeline-scroll">
      <div className="pe-timeline-content" ref={content} style={{ width: width + 90 }}>
        <div className="pe-track-row">
          <span className="pe-track-label" />
          <div className="pe-ruler" style={{ width }} onPointerDown={scrub} onPointerMove={scrub}>
            {ticks.map((s) => <span key={s} style={{ left: s * format.fps * scale }}>{s}s</span>)}
          </div>
        </div>
        <div className="pe-track-row">
          <span className="pe-track-label">场景</span>
          <div className="pe-track-lane pe-scenes" style={{ width }}>
            {scenes.map((scene, index) => {
              const dragging = drag?.mode === 'reorder' && drag.moved && drag.index === index;
              return <div key={scene.id} className={`pe-block pe-kind-${scene.kind}${scene.id === selectedId ? ' selected' : ''}${dragging ? ' dragging' : ''}`}
                style={{ left: sceneStart(scenes, index) * scale, width: Math.max(36, scene.durationFrames * scale - 2) }}
                role="button" tabIndex={0} aria-label={`场景 ${index + 1}：${preview(scene)}`} aria-pressed={scene.id === selectedId}
                onPointerDown={(event) => beginReorder(event, index)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(scene.id); onSeek(sceneStart(scenes, index)); } }}>
                <b>{index + 1}</b><span className="pe-block-kind">{SCENE_KIND_LABELS[scene.kind]}</span><span className="pe-block-title">{preview(scene)}</span><em>{(scene.durationFrames / format.fps).toFixed(1)}s</em>
                <i className="pe-resize" role="separator" aria-label={`调整场景 ${index + 1} 时长`} onPointerDown={(event) => beginResize(event, index)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)} />
              </div>;
            })}
            {gapX !== null && <div className="pe-insert" style={{ left: gapX }} aria-hidden="true" />}
          </div>
        </div>
        {audioBar('BGM', audio.bgm && assetName(audio.bgm.src))}
        {audioBar('配音', audio.voiceover && assetName(audio.voiceover.src), audio.voiceover?.startFrame)}
        <div className="pe-playhead" style={{ left: LABEL_WIDTH + Math.min(frame, total) * scale }} aria-hidden="true" />
      </div>
    </div>
  </section>;
}
