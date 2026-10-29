import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Layer } from '../../templates/studio-canvas/model';
import { FONT_FAMILIES } from '../../templates/studio-canvas/model';
import { HANDLES, clientToStage, fitScale, moveRect, nudgeRect, resizeRect, rotateRect, type Handle, type Point, type Rect } from '../../lib/studioGeometry';

type Gesture = { mode: 'move' | 'rotate' | Handle; start: Point; rect: Rect; id: string };

const rectOf = (layer: Layer): Rect => ({ x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation });
const handleClass: Record<Handle, string> = { nw: 'nw', n: 'n', ne: 'ne', e: 'e', se: 'se', s: 's', sw: 'sw', w: 'w' };

export default function StageOverlay({ layers, frame, width, selectedId, onSelect, onChange, onDelete }: {
  layers: Layer[];
  /** 当前场景内的局部帧，用于标出不在时间范围内的图层 */
  frame: number;
  width: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<Rect> | { text: string }) => void;
  onDelete: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [scale, setScale] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => setScale(fitScale(element.clientWidth, width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  const stagePoint = (event: PointerEvent): Point => {
    const box = root.current!.getBoundingClientRect();
    return clientToStage({ x: event.clientX, y: event.clientY }, { x: box.left, y: box.top }, scale);
  };

  const begin = (event: PointerEvent<HTMLElement>, layer: Layer, mode: Gesture['mode']) => {
    if (event.button !== 0 || layer.locked) return;
    event.stopPropagation();
    event.preventDefault();
    root.current?.focus();
    onSelect(layer.id);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 无活动指针（如合成事件）时忽略 */ }
    gesture.current = { mode, start: stagePoint(event), rect: rectOf(layer), id: layer.id };
  };

  const move = (event: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const point = stagePoint(event);
    const dx = point.x - g.start.x;
    const dy = point.y - g.start.y;
    let next: Rect;
    if (g.mode === 'move') next = moveRect(g.rect, dx, dy);
    else if (g.mode === 'rotate') next = rotateRect(g.rect, g.start, point, event.shiftKey);
    else next = resizeRect(g.rect, g.mode, dx, dy, event.shiftKey);
    onChange(g.id, next);
  };

  const end = () => { gesture.current = null; };

  const onKeyDown = (event: KeyboardEvent) => {
    if (editing || !selectedId) return;
    const layer = layers.find((item) => item.id === selectedId);
    if (!layer || layer.locked) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); onDelete(layer.id); return; }
    if (event.key.startsWith('Arrow')) { event.preventDefault(); onChange(layer.id, nudgeRect(rectOf(layer), event.key, event.shiftKey)); }
    if (event.key === 'Escape') onSelect(null);
  };

  return <div ref={root} className="studio-overlay" tabIndex={0} aria-label="画布交互层" onKeyDown={onKeyDown}>
    <div className="studio-overlay-hit" onPointerDown={() => { onSelect(null); setEditing(null); root.current?.focus(); }} />
    {layers.map((layer) => {
      if (!layer.visible || layer.type === 'audio') return null;
      const selected = layer.id === selectedId;
      const active = frame >= layer.startFrame && frame < layer.startFrame + layer.durationFrames;
      return <div key={layer.id}
        className={`studio-box${selected ? ' selected' : ''}${layer.locked ? ' locked' : ''}${active ? '' : ' inactive'}`}
        style={{ left: layer.x * scale, top: layer.y * scale, width: layer.width * scale, height: layer.height * scale, transform: `rotate(${layer.rotation}deg)` }}
        title={layer.locked ? `${layer.name}（已锁定）` : layer.name}
        onPointerDown={(event) => begin(event, layer, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        onDoubleClick={() => { if (layer.type === 'text' && !layer.locked) setEditing(layer.id); }}>
        {editing === layer.id && layer.type === 'text' && <textarea className="studio-inline-edit" autoFocus value={layer.text}
          style={{ fontSize: layer.fontSize * scale, fontWeight: layer.fontWeight, fontFamily: FONT_FAMILIES[layer.fontFamily], textAlign: layer.align, color: layer.color }}
          onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') setEditing(null); }}
          onChange={(event) => onChange(layer.id, { text: event.target.value })} onBlur={() => setEditing(null)} />}
        {selected && !layer.locked && editing !== layer.id && <>
          {HANDLES.map((handle) => <span key={handle} className={`studio-handle ${handleClass[handle]}`} aria-label={`缩放手柄 ${handle}`}
            onPointerDown={(event) => begin(event, layer, handle)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />)}
          <span className="studio-rotate" aria-label="旋转手柄" onPointerDown={(event) => begin(event, layer, 'rotate')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
        </>}
      </div>;
    })}
  </div>;
}
