import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import type { ProjectData } from '../../shared/types';
import type { TemplateDef } from '../../templates/registry';
import { createScene, newId, schema, totalDuration, type Layer, type Scene } from '../../templates/studio-canvas/model';
import { inputProps, withStudioDuration } from '../../lib/editor';
import { canRedo, canUndo, createHistory, moveItem, push, redo, undo } from '../../lib/history';
import { sceneIndexAt, sceneStartFrame } from '../../lib/studioGeometry';
import AddToolbar from './AddToolbar';
import StageOverlay from './StageOverlay';
import SceneStrip from './SceneStrip';
import LayerList from './LayerList';
import { LayerInspector, SceneInspector } from './Inspector';

type Change = (change: (project: ProjectData) => ProjectData) => void;

const readScenes = (project: ProjectData): Scene[] => {
  const parsed = schema.safeParse({ scenes: project.props.scenes });
  return parsed.success ? parsed.data.scenes : Array.isArray(project.props.scenes) ? project.props.scenes as Scene[] : [];
};

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName));

export default function StudioWorkbench({ project, template, playerRef, frame, onFrame, seek, onChange }: {
  project: ProjectData;
  template: TemplateDef;
  playerRef: RefObject<PlayerRef | null>;
  frame: number;
  onFrame: (frame: number) => void;
  seek: (frame: number) => void;
  onChange: Change;
}) {
  const scenes = useMemo(() => readScenes(project), [project.props.scenes]);
  const props = useMemo(() => inputProps(project), [project]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 撤销栈保存整个项目快照；latest 保证同一帧内多次修改基于最新状态，而不是过期的 props。
  const latest = useRef(project);
  const history = useRef(createHistory(project));
  const [, rerender] = useState(0);
  const durations = scenes.map((scene) => scene.durationFrames);
  const index = sceneIndexAt(durations, frame);
  const scene = scenes[index];
  const start = sceneStartFrame(durations, index);
  const layer = scene?.layers.find((item) => item.id === selectedId);

  const edit = (change: (project: ProjectData) => ProjectData, group?: string) => {
    const next = change(latest.current);
    latest.current = next;
    history.current = push(history.current, next, group);
    rerender((n) => n + 1);
    onChange(() => next);
  };
  const jump = (next: ProjectData) => {
    latest.current = next;
    rerender((n) => n + 1);
    onChange(() => next);
  };
  const doUndo = () => { history.current = undo(history.current); jump(history.current.present); };
  const doRedo = () => { history.current = redo(history.current); jump(history.current.present); };

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

  // 键盘快捷键：每次渲染重新绑定，始终使用最新的闭包。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) doRedo(); else doUndo(); }
      else if (mod && key === 'y') { event.preventDefault(); doRedo(); }
      else if (mod && key === 'd') { event.preventDefault(); if (layer) duplicateLayer(layer.id); }
      else if (!mod && event.key === ' ') { event.preventDefault(); playerRef.current?.toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!scene) return <p role="alert">项目缺少场景数据</p>;

  const setScenes = (change: (scenes: Scene[]) => Scene[], group?: string) => edit((old) => withStudioDuration({ ...old, props: { ...old.props, scenes: change(readScenes(old)) } }), group);
  const editScene = (patch: Record<string, unknown>, group?: string) => setScenes((all) => all.map((item) => item.id === scene.id ? { ...item, ...patch } as Scene : item), group);
  const editLayers = (change: (layers: Layer[]) => Layer[], group?: string) => setScenes((all) => all.map((item) => item.id === scene.id ? { ...item, layers: change(item.layers) } : item), group);
  const patchLayer = (id: string, patch: Record<string, unknown>, group?: string) => editLayers((layers) => layers.map((item) => item.id === id ? { ...item, ...patch } as Layer : item), group);
  const removeLayer = (id: string) => { editLayers((layers) => layers.filter((item) => item.id !== id)); setSelectedId(null); };
  const moveLayer = (id: string, delta: -1 | 1) => editLayers((layers) => {
    const from = layers.findIndex((item) => item.id === id);
    return moveItem(layers, from, from + delta);
  });
  const addLayer = (added: Layer) => { editLayers((layers) => [...layers, added]); setSelectedId(added.id); };
  function duplicateLayer(id: string) {
    const source = scene.layers.find((item) => item.id === id);
    if (!source) return;
    const copy = { ...source, id: newId(), name: `${source.name} 副本`, x: source.x + 20, y: source.y + 20 } as Layer;
    editLayers((layers) => { const at = layers.findIndex((item) => item.id === id); return [...layers.slice(0, at + 1), copy, ...layers.slice(at + 1)]; });
    setSelectedId(copy.id);
  }
  // 场景结构变化后，播放头跳到目标场景起点（等预览拿到新时长后再 seek）。
  const goto = (frameTo: number) => window.setTimeout(() => seek(frameTo), 80);
  const addScene = () => {
    const target = totalDuration(scenes);
    setScenes((all) => [...all, createScene()]);
    setSelectedId(null);
    goto(target);
  };
  const duplicateScene = (at: number) => {
    const source = scenes[at];
    const copy: Scene = { ...structuredClone(source), id: newId(), name: `${source.name} 副本` };
    copy.layers = copy.layers.map((item) => ({ ...item, id: newId() }));
    setScenes((all) => [...all.slice(0, at + 1), copy, ...all.slice(at + 1)]);
    setSelectedId(null);
    goto(sceneStartFrame(durations, at + 1));
  };
  const removeScene = (at: number) => {
    if (scenes.length < 2) return;
    const id = scenes[at].id;
    setScenes((all) => all.filter((item) => item.id !== id));
    setSelectedId(null);
    goto(sceneStartFrame(durations, Math.max(0, at - 1)));
  };
  const reorderScenes = (from: number, to: number) => {
    if (from === to) return;
    const after = moveItem(scenes, from, to);
    setScenes((all) => moveItem(all, from, to));
    goto(sceneStartFrame(after.map((item) => item.durationFrames), to));
  };
  const selectScene = (at: number) => { setSelectedId(null); seek(sceneStartFrame(durations, at)); };
  const inspect = (id: string) => (patch: Record<string, unknown>) => patchLayer(id, patch, `inspect-${id}-${Object.keys(patch).join(',')}`);

  return <div className="studio-workbench">
    <div className="studio-left">
      <AddToolbar canvas={project} sceneFrames={scene.durationFrames} onAdd={addLayer} />
      <section aria-label="图层"><h2>图层</h2>
        <LayerList layers={scene.layers} selectedId={selectedId} onSelect={setSelectedId} onDelete={removeLayer} onMove={moveLayer} onDuplicate={duplicateLayer}
          onRename={(id, name) => patchLayer(id, { name })}
          onToggle={(id, key) => patchLayer(id, { [key]: !scene.layers.find((item) => item.id === id)![key] })} />
      </section>
    </div>
    <section className="editor-preview studio-center" aria-label="实时预览">
      <div className="editor-section-title"><h2>{scene.name}</h2>
        <div className="studio-history"><button onClick={doUndo} disabled={!canUndo(history.current)} title="撤销（⌘Z）">↶ 撤销</button><button onClick={doRedo} disabled={!canRedo(history.current)} title="重做（⇧⌘Z）">↷ 重做</button></div>
      </div>
      <p className="studio-hint">{project.width} × {project.height} · {project.fps} fps · 拖动/缩放/旋转，双击文字编辑，空格播放</p>
      <div className="studio-stage" style={{ aspectRatio: `${project.width}/${project.height}` }}>
        <Player ref={playerRef} component={template.component} inputProps={props} compositionWidth={project.width} compositionHeight={project.height} fps={project.fps} durationInFrames={project.durationInFrames} controls clickToPlay={false} doubleClickToFullscreen={false} style={{ width: '100%', height: '100%' }} errorFallback={({ error }: { error: Error }) => <p role="alert">预览失败：{error.message}</p>} />
        <StageOverlay layers={scene.layers} frame={frame - start} width={project.width} selectedId={layer ? layer.id : null} onSelect={setSelectedId} onChange={patchLayer} onDelete={removeLayer} />
      </div>
    </section>
    <aside className="editor-props studio-inspector" aria-label="属性面板">
      <h2>{layer ? `图层：${layer.name}` : `场景：${scene.name}`}</h2>
      {layer ? <LayerInspector layer={layer} onChange={inspect(layer.id)} />
        : <SceneInspector project={project} scene={scene} canDelete={scenes.length > 1} onScene={(patch) => editScene(patch, `scene-${scene.id}-${Object.keys(patch).join(',')}`)} onProject={(patch) => edit((old) => ({ ...old, ...patch }), `project-${Object.keys(patch).join(',')}`)} onDelete={() => removeScene(index)} />}
    </aside>
    <SceneStrip scenes={scenes} activeIndex={index} fps={project.fps} totalFrames={project.durationInFrames} onSelect={selectScene} onAdd={addScene}
      onDuplicate={duplicateScene} onDelete={removeScene} onRename={(id, name) => setScenes((all) => all.map((item) => item.id === id ? { ...item, name } : item))} onReorder={reorderScenes} />
  </div>;
}
