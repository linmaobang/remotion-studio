import { useState } from 'react';
import type { Layer } from '../../templates/studio-canvas/model';

export default function LayerList({ layers, selectedId, onSelect, onToggle, onMove, onDuplicate, onRename, onDelete }: {
  layers: Layer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, key: 'visible' | 'locked') => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!layers.length) return <p className="studio-empty">当前场景还没有图层，从上方添加。</p>;
  const finish = (layer: Layer, value: string) => {
    setRenaming(null);
    const name = value.trim();
    if (name && name !== layer.name) onRename(layer.id, name);
  };
  return <ul className="studio-layers" aria-label="图层列表">
    {[...layers].reverse().map((layer) => {
      const index = layers.indexOf(layer);
      return <li key={layer.id} className={layer.id === selectedId ? 'selected' : ''}>
        {renaming === layer.id
          ? <input className="studio-rename" aria-label="图层名称" autoFocus defaultValue={layer.name} onBlur={(event) => finish(layer, event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(null); }} />
          : <button className="studio-layer-name" title="双击重命名" onClick={() => onSelect(layer.id)} onDoubleClick={() => setRenaming(layer.id)}>{layer.name}</button>}
        <button aria-label={`${layer.visible ? '隐藏' : '显示'} ${layer.name}`} title={layer.visible ? '隐藏' : '显示'} onClick={() => onToggle(layer.id, 'visible')}>{layer.visible ? '👁' : '—'}</button>
        <button aria-label={`${layer.locked ? '解锁' : '锁定'} ${layer.name}`} title={layer.locked ? '解锁' : '锁定'} onClick={() => onToggle(layer.id, 'locked')}>{layer.locked ? '🔒' : '🔓'}</button>
        <button aria-label={`上移 ${layer.name}`} title="上移一层" disabled={index === layers.length - 1} onClick={() => onMove(layer.id, 1)}>↑</button>
        <button aria-label={`下移 ${layer.name}`} title="下移一层" disabled={index === 0} onClick={() => onMove(layer.id, -1)}>↓</button>
        <button aria-label={`复制 ${layer.name}`} title="复制（⌘D）" onClick={() => onDuplicate(layer.id)}>⧉</button>
        <button aria-label={`删除 ${layer.name}`} title="删除" onClick={() => onDelete(layer.id)}>×</button>
      </li>;
    })}
  </ul>;
}
