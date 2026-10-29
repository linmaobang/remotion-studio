import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import type { ProjectData } from '../../shared/types';
import type { TemplateDef } from '../../templates/registry';
import { createScene, schema, type Layer, type Scene } from '../../templates/studio-canvas/model';
import { inputProps, withStudioDuration } from '../../lib/editor';
import { sceneIndexAt, sceneStartFrame } from '../../lib/studioGeometry';
import AddToolbar from './AddToolbar';
import StageOverlay from './StageOverlay';
import { LayerInspector, LayerList, SceneInspector } from './Inspector';

type Change = (change: (project: ProjectData) => ProjectData) => void;

const readScenes = (project: ProjectData): Scene[] => {
  const parsed = schema.safeParse({ scenes: project.props.scenes });
  return parsed.success ? parsed.data.scenes : Array.isArray(project.props.scenes) ? project.props.scenes as Scene[] : [];
};

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
  const durations = scenes.map((scene) => scene.durationFrames);
  const index = sceneIndexAt(durations, frame);
  const scene = scenes[index];
  const start = sceneStartFrame(durations, index);
  const layer = scene?.layers.find((item) => item.id === selectedId);

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

  if (!scene) return <p role="alert">项目缺少场景数据</p>;

  const setScenes = (change: (scenes: Scene[]) => Scene[]) => onChange((old) => withStudioDuration({ ...old, props: { ...old.props, scenes: change(readScenes(old)) } }));
  const editScene = (patch: Record<string, unknown>) => setScenes((all) => all.map((item) => item.id === scene.id ? { ...item, ...patch } as Scene : item));
  const editLayers = (change: (layers: Layer[]) => Layer[]) => editScene({ layers: change(scene.layers) });
  const patchLayer = (id: string, patch: Record<string, unknown>) => editLayers((layers) => layers.map((item) => item.id === id ? { ...item, ...patch } as Layer : item));
  const removeLayer = (id: string) => { editLayers((layers) => layers.filter((item) => item.id !== id)); setSelectedId(null); };
  const moveLayer = (id: string, delta: -1 | 1) => editLayers((layers) => {
    const from = layers.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= layers.length) return layers;
    const next = [...layers];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
  const addLayer = (added: Layer) => { editLayers((layers) => [...layers, added]); setSelectedId(added.id); };
  const addScene = () => {
    const added = createScene();
    const target = sceneStartFrame([...durations, 0], scenes.length);
    setScenes((all) => [...all, added]);
    setSelectedId(null);
    window.setTimeout(() => seek(target), 80);
  };
  const removeScene = () => {
    const target = sceneStartFrame(durations, Math.max(0, index - 1));
    setScenes((all) => all.filter((item) => item.id !== scene.id));
    setSelectedId(null);
    window.setTimeout(() => seek(target), 80);
  };

  return <div className="studio-workbench">
    <div className="studio-left">
      <AddToolbar canvas={project} sceneFrames={scene.durationFrames} onAdd={addLayer} />
      <section aria-label="场景列表"><h2>场景</h2>
        <ol className="studio-scenes">{scenes.map((item, i) => <li key={item.id}><button className={i === index ? 'active' : ''} onClick={() => { setSelectedId(null); seek(sceneStartFrame(durations, i)); }}>{i + 1}. {item.name}</button></li>)}</ol>
        <button onClick={addScene}>＋ 新场景</button>
      </section>
      <section aria-label="图层"><h2>图层</h2>
        <LayerList layers={scene.layers} selectedId={selectedId} onSelect={setSelectedId} onDelete={removeLayer} onMove={moveLayer}
          onToggle={(id, key) => patchLayer(id, { [key]: !scene.layers.find((item) => item.id === id)![key] })} />
      </section>
    </div>
    <section className="editor-preview studio-center" aria-label="实时预览">
      <div className="editor-section-title"><h2>{scene.name}</h2><span>{project.width} × {project.height} · {project.fps} fps · 拖动/缩放/旋转，双击文字编辑</span></div>
      <div className="studio-stage" style={{ aspectRatio: `${project.width}/${project.height}` }}>
        <Player ref={playerRef} component={template.component} inputProps={props} compositionWidth={project.width} compositionHeight={project.height} fps={project.fps} durationInFrames={project.durationInFrames} controls clickToPlay={false} doubleClickToFullscreen={false} style={{ width: '100%', height: '100%' }} errorFallback={({ error }: { error: Error }) => <p role="alert">预览失败：{error.message}</p>} />
        <StageOverlay layers={scene.layers} frame={frame - start} width={project.width} selectedId={layer ? layer.id : null} onSelect={setSelectedId} onChange={patchLayer} onDelete={removeLayer} />
      </div>
    </section>
    <aside className="editor-props studio-inspector" aria-label="属性面板">
      <h2>{layer ? `图层：${layer.name}` : `场景：${scene.name}`}</h2>
      {layer ? <LayerInspector layer={layer} onChange={(patch) => patchLayer(layer.id, patch)} />
        : <SceneInspector project={project} scene={scene} canDelete={scenes.length > 1} onScene={editScene} onProject={(patch) => onChange((old) => ({ ...old, ...patch }))} onDelete={removeScene} />}
    </aside>
  </div>;
}
