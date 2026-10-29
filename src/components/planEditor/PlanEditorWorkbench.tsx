import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { Player, type PlayerRef } from '@remotion/player';
import type { AssetRef } from '../../plan/api';
import { parsePlan, samplePlan, type Scene, type SceneKind, type VideoPlan } from '../../plan/schema';
import type { ProjectData } from '../../shared/types';
import type { TemplateDef } from '../../templates/registry';
import { canRedo, canUndo, createHistory, push, redo, undo } from '../../lib/history';
import ExportDialog from '../editor/ExportDialog';
import AiRefine from './AiRefine';
import GlobalPanel from './GlobalPanel';
import LeftPanel from './LeftPanel';
import PlanTimeline from './PlanTimeline';
import ScenePanel from './ScenePanel';
import { collectAssets, createSceneOfKind, duplicateSceneCopy, isTypingTarget, moveScene, resizeScene, sceneStart, withPlan } from './logic';

type Change = (change: (project: ProjectData) => ProjectData) => void;

export default function PlanEditorWorkbench({ project, template, playerRef, frame, onFrame, seek, onChange, save, saving, message, error }: {
  project: ProjectData;
  template: TemplateDef;
  playerRef: RefObject<PlayerRef | null>;
  frame: number;
  onFrame: (frame: number) => void;
  seek: (frame: number) => void;
  onChange: Change;
  save: () => Promise<void>;
  saving: boolean;
  message: string;
  error: string;
}) {
  const parsed = useMemo(() => parsePlan(project.props.plan), [project.props.plan]);
  const plan = parsed.ok ? parsed.plan : null;
  // 撤销栈保存整个项目快照；latest / planRef 保证同一帧内多次修改基于最新状态。
  const latest = useRef(project);
  const planRef = useRef<VideoPlan | null>(plan);
  const lastProp = useRef(project.props.plan);
  if (lastProp.current !== project.props.plan) { lastProp.current = project.props.plan; planRef.current = plan; }
  const history = useRef(createHistory(project));
  const dirty = useRef(false);
  const [, rerender] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(plan?.scenes[0]?.id ?? null);
  const [assets, setAssets] = useState<AssetRef[]>(() => (plan ? collectAssets(plan) : []));
  const [exporting, setExporting] = useState(false);
  const inputProps = useMemo(() => ({ plan }), [plan]);
  const selectedIndex = plan ? plan.scenes.findIndex((scene) => scene.id === selectedId) : -1;
  const scene = selectedIndex >= 0 ? plan!.scenes[selectedIndex] : undefined;

  const commit = (nextProject: ProjectData, group?: string) => {
    latest.current = nextProject;
    history.current = push(history.current, nextProject, group);
    dirty.current = true;
    rerender((n) => n + 1);
    onChange(() => nextProject);
  };
  /** 所有方案修改的统一入口：先经 parsePlan 修复钳制，再同步画幅与总时长并记入撤销栈。 */
  const edit = (change: (plan: VideoPlan) => VideoPlan, group?: string) => {
    const base = planRef.current ?? samplePlan();
    const checked = parsePlan(change(base));
    if (!checked.ok) return;
    planRef.current = checked.plan;
    commit(withPlan(latest.current, checked.plan), group);
  };
  const jump = (snapshot: ProjectData) => {
    latest.current = snapshot;
    const reparsed = parsePlan(snapshot.props.plan);
    planRef.current = reparsed.ok ? reparsed.plan : null;
    dirty.current = true;
    rerender((n) => n + 1);
    onChange(() => snapshot);
  };
  const doUndo = () => { history.current = undo(history.current); jump(history.current.present); };
  const doRedo = () => { history.current = redo(history.current); jump(history.current.present); };

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const update = ({ detail }: { detail: { frame: number } }) => onFrame(detail.frame);
    player.addEventListener('frameupdate', update);
    return () => player.removeEventListener('frameupdate', update);
  }, [playerRef, onFrame, parsed.ok]);
  useEffect(() => {
    const player = playerRef.current;
    if (player && player.getCurrentFrame() >= project.durationInFrames) player.seekTo(Math.max(0, project.durationInFrames - 1));
  }, [project.durationInFrames, playerRef]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) doRedo(); else doUndo(); }
      else if (mod && key === 'y') { event.preventDefault(); doRedo(); }
      else if (!mod && event.key === ' ' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); playerRef.current?.toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 防抖自动保存：编辑后 1.5 秒保存；保存进行中不重复触发，结束后若仍有修改会再次保存。
  useEffect(() => {
    if (!dirty.current || saving) return;
    const timer = window.setTimeout(() => { dirty.current = false; void save(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [project, saving]);

  // 场景结构变化后，等预览拿到新时长再跳到目标位置。
  const goto = (target: number) => window.setTimeout(() => seek(target), 80);

  const editScene = (id: string, patch: Record<string, unknown>, group?: string) =>
    edit((p) => ({ ...p, scenes: p.scenes.map((item) => (item.id === id ? ({ ...item, ...patch } as Scene) : item)) }), group);
  const addScene = (kind: SceneKind) => {
    if (!plan) return;
    const added = createSceneOfKind(kind);
    const at = selectedIndex >= 0 ? selectedIndex + 1 : plan.scenes.length;
    edit((p) => ({ ...p, scenes: [...p.scenes.slice(0, at), added, ...p.scenes.slice(at)] }));
    setSelectedId(added.id);
    goto(sceneStart([...plan.scenes.slice(0, at), added], at));
  };
  const duplicate = () => {
    if (!plan || !scene) return;
    const copy = duplicateSceneCopy(scene);
    edit((p) => ({ ...p, scenes: [...p.scenes.slice(0, selectedIndex + 1), copy, ...p.scenes.slice(selectedIndex + 1)] }));
    setSelectedId(copy.id);
    goto(sceneStart(plan.scenes, selectedIndex + 1));
  };
  const remove = () => {
    if (!plan || !scene || plan.scenes.length < 2) return;
    const nextSelected = plan.scenes[selectedIndex + 1] ?? plan.scenes[selectedIndex - 1];
    edit((p) => ({ ...p, scenes: p.scenes.filter((item) => item.id !== scene.id) }));
    setSelectedId(nextSelected.id);
    goto(sceneStart(plan.scenes.filter((item) => item.id !== scene.id), Math.max(0, plan.scenes.indexOf(nextSelected) - (plan.scenes.indexOf(nextSelected) > selectedIndex ? 1 : 0))));
  };
  const reorder = (from: number, gap: number) => {
    if (!plan) return;
    edit((p) => ({ ...p, scenes: moveScene(p.scenes, from, gap) }));
    goto(sceneStart(moveScene(plan.scenes, from, gap), moveScene(plan.scenes.map((_, i) => i), from, gap).indexOf(from)));
  };
  const resize = (index: number, frames: number, group: string) => edit((p) => ({ ...p, scenes: resizeScene(p.scenes, index, frames, p.format.fps) }), group);
  const uploaded = (asset: AssetRef) => setAssets((old) => (old.some((item) => item.url === asset.url) ? old : [...old, asset]));
  const useAudio = (url: string, kind: 'bgm' | 'voiceover') => edit((p) => ({ ...p, audio: { ...p.audio, [kind]: kind === 'bgm' ? { volume: 0.3, loop: true, ...p.audio.bgm, src: url } : { volume: 1, startFrame: 0, ...p.audio.voiceover, src: url } } }));

  const status = saving ? '保存中…' : dirty.current ? '有未保存的修改，将自动保存' : error ? `保存失败：${error}` : message || '已保存';
  const ratio = project.width / project.height;

  return <div className="pe">
    <header className="pe-top">
      <div className="pe-title"><Link to="/">← 返回首页</Link><input aria-label="项目名称" value={project.name} onChange={(event) => { const name = event.target.value; commit({ ...latest.current, name }, 'project-name'); }} /></div>
      <div className="pe-top-actions">
        <span className={`pe-status${error ? ' bad' : ''}`} role="status">{status}</span>
        <button type="button" onClick={doUndo} disabled={!canUndo(history.current)} title="撤销（⌘Z）">↶ 撤销</button>
        <button type="button" onClick={doRedo} disabled={!canRedo(history.current)} title="重做（⇧⌘Z）">↷ 重做</button>
        <button type="button" disabled={saving} onClick={() => { dirty.current = false; void save(); }}>保存</button>
        <button type="button" className="pe-primary" disabled={!plan} onClick={() => setExporting(true)}>导出 MP4 ↗</button>
      </div>
    </header>
    {!plan ? <div className="pe-broken" role="alert">
      <h2>视频方案无法解析</h2>
      <p>{parsed.ok ? '' : parsed.errors.join('；')}</p>
      <button type="button" className="pe-primary" onClick={() => edit(() => samplePlan())}>重置为示例</button>
    </div> : <>
      <div className="pe-main">
        <LeftPanel plan={plan} frame={frame} selectedId={selectedId} assets={assets} onSelect={setSelectedId} onSeek={seek}
          onUseImage={(url) => scene && editScene(scene.id, { imageSrc: url })} onUseBackground={(url) => scene && editScene(scene.id, { backgroundSrc: url })} onUseAudio={useAudio} />
        <section className="pe-center" aria-label="实时预览">
          <div className="pe-stage">
            <div className="pe-player" style={{ width: `min(100%, ${52 * ratio}vh)`, aspectRatio: `${project.width}/${project.height}` }}>
              <Player ref={playerRef} component={template.component} inputProps={inputProps} compositionWidth={project.width} compositionHeight={project.height} fps={project.fps}
                durationInFrames={project.durationInFrames} controls acknowledgeRemotionLicense style={{ width: '100%', height: '100%' }}
                errorFallback={({ error: failure }: { error: Error }) => <p role="alert">预览失败：{failure.message}</p>} />
            </div>
          </div>
          <p className="pe-hint">{project.width} × {project.height} · {project.fps} fps · 总时长 {(project.durationInFrames / project.fps).toFixed(1)}s · 空格播放/暂停</p>
        </section>
        <aside className="pe-right" aria-label="属性面板">
          <AiRefine plan={plan} onApply={(next) => { edit(() => next); setSelectedId(next.scenes[0]?.id ?? null); }} />
          <div className="pe-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!scene} onClick={() => setSelectedId(null)}>全局</button>
            <button type="button" role="tab" aria-selected={!!scene} disabled={!scene && plan.scenes.length === 0} onClick={() => !scene && setSelectedId(plan.scenes[0]?.id ?? null)}>场景{scene ? ` ${selectedIndex + 1}` : ''}</button>
          </div>
          {scene
            ? <ScenePanel scene={scene} fps={plan.format.fps} assets={assets} canDelete={plan.scenes.length > 1} onUploaded={uploaded} onDuplicate={duplicate} onDelete={remove} onPatch={(patch, group) => editScene(scene.id, patch, group)} />
            : <GlobalPanel plan={plan} assets={assets} onEdit={edit} onUploaded={uploaded} />}
        </aside>
      </div>
      <PlanTimeline plan={plan} frame={frame} selectedId={scene?.id ?? null} onSelect={setSelectedId} onSeek={seek} onReorder={reorder} onResize={resize}
        onAdd={addScene} onDuplicate={duplicate} onDelete={remove} onOpenGlobal={() => setSelectedId(null)} />
    </>}
    {exporting && <ExportDialog project={project} onClose={() => setExporting(false)} />}
  </div>;
}
