import { useState } from 'react';
import type { Scene } from '../../templates/studio-canvas/model';

export default function SceneStrip({ scenes, activeIndex, fps, totalFrames, onSelect, onAdd, onDuplicate, onDelete, onRename, onReorder }: {
  scenes: Scene[];
  activeIndex: number;
  fps: number;
  totalFrames: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const seconds = (frames: number) => `${(frames / fps).toFixed(1)}s`;
  const finish = (scene: Scene, value: string) => {
    setRenaming(null);
    const name = value.trim();
    if (name && name !== scene.name) onRename(scene.id, name);
  };
  return <section className="studio-strip" aria-label="场景条">
    <div className="studio-strip-head"><h2>场景</h2><span>共 {scenes.length} 个 · 总时长 {seconds(totalFrames)}（{totalFrames} 帧）</span></div>
    <ol className="studio-strip-list">
      {scenes.map((scene, index) => <li key={scene.id} draggable={renaming !== scene.id}
        className={`${index === activeIndex ? 'active' : ''}${over === index && dragging !== null && dragging !== index ? ' drop' : ''}`}
        onDragStart={(event) => { setDragging(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }}
        onDragOver={(event) => { if (dragging !== null) { event.preventDefault(); setOver(index); } }}
        onDrop={(event) => { event.preventDefault(); if (dragging !== null) onReorder(dragging, index); setDragging(null); setOver(null); }}
        onDragEnd={() => { setDragging(null); setOver(null); }}>
        {renaming === scene.id
          ? <input className="studio-rename" aria-label="场景名称" autoFocus defaultValue={scene.name} onBlur={(event) => finish(scene, event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(null); }} />
          : <button className="studio-scene-main" title="点击切换，双击重命名，拖动排序" onClick={() => onSelect(index)} onDoubleClick={() => setRenaming(scene.id)}>
            <strong>{index + 1}. {scene.name}</strong><small>{seconds(scene.durationFrames)}</small></button>}
        <span className="studio-scene-actions">
          <button aria-label={`复制场景 ${scene.name}`} title="复制场景" onClick={() => onDuplicate(index)}>⧉</button>
          <button aria-label={`删除场景 ${scene.name}`} title="删除场景" disabled={scenes.length < 2} onClick={() => onDelete(index)}>×</button>
        </span>
      </li>)}
      <li className="studio-strip-add"><button onClick={onAdd}>＋ 新场景</button></li>
    </ol>
  </section>;
}
