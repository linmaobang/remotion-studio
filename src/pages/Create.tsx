import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssetRef, Orientation, PlanResponse } from '../plan/api';
import type { VideoPlan } from '../plan/schema';
import { createPlanProject, optimizePlan, readMode, refinePlan, saveMode, type CreateMode } from '../lib/planApi';
import ModeSwitch from '../components/create/ModeSwitch';
import AssetUploader from '../components/create/AssetUploader';
import PlanEditor from '../components/create/PlanEditor';
import '../styles/create.css';

const examples = [
  '为一款手冲咖啡新品做 30 秒竖屏宣传短片，温暖、有质感，结尾引导到店品尝',
  '用 5 个场景介绍「番茄工作法」：是什么、四步流程、收益数据、行动号召',
  '公司年度总结视频：关键数据（营收、用户、团队规模）与明年展望，专业简洁',
];
const durations = [15, 30, 45, 60];

type Stage = 'input' | 'optimizing' | 'review' | 'refining' | 'creating';

export default function Create() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState(30);
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [assets, setAssets] = useState<AssetRef[]>([]);
  const [mode, setModeState] = useState<CreateMode>(readMode);
  const modeRef = useRef(mode);
  const [stage, setStage] = useState<Stage>('input');
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [notes, setNotes] = useState<{ usedLLM: boolean; warnings: string[] }>({ usedLLM: true, warnings: [] });
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const busy = stage === 'optimizing' || stage === 'refining' || stage === 'creating';

  async function finish(target: VideoPlan) {
    setStage('creating');
    const { project, local } = await createPlanProject(target);
    if (alive.current) navigate(`/editor/${encodeURIComponent(project.id)}`, { state: { local } });
  }

  /** 统一执行一步异步操作；失败时回到可重试状态并显示错误。 */
  async function run(start: Stage, fallback: Stage, task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    setStage(start);
    try {
      await task();
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : '操作失败，请重试'); setStage(fallback); }
    } finally {
      busyRef.current = false;
    }
  }

  function receive(result: PlanResponse) {
    setPlan(result.plan);
    setNotes({ usedLLM: result.usedLLM, warnings: result.warnings });
  }

  const submit = () => run('optimizing', 'input', async () => {
    const result = await optimizePlan({ prompt: prompt.trim(), assets, durationSec, orientation });
    if (!alive.current) return;
    receive(result);
    // 等待期间用户可能已切到全自动：直接继续。
    if (modeRef.current === 'auto') await finish(result.plan);
    else setStage('review');
  });

  const refine = (instruction: string) => plan && run('refining', 'review', async () => {
    const result = await refinePlan({ plan, instruction });
    if (!alive.current) return;
    receive(result);
    if (modeRef.current === 'auto') await finish(result.plan);
    else setStage('review');
  });

  const confirm = () => plan && run('creating', 'review', () => finish(plan));

  function changeMode(next: CreateMode) {
    modeRef.current = next;
    setModeState(next);
    saveMode(next);
    // 分步确认的方案已在眼前，切到全自动则直接完成剩余流程。
    if (next === 'auto' && stage === 'review' && plan) void confirm();
  }

  const progress = ['优化需求', '生成方案', '创建项目'];
  const progressIndex = stage === 'optimizing' ? 1 : stage === 'refining' ? 1 : stage === 'creating' ? 2 : -1;
  const reviewing = stage === 'review' || stage === 'refining' || (stage === 'creating' && mode === 'step');

  return (
    <div className="create">
      <h1>文字生成视频</h1>
      <p className="create-lead">描述你想要的视频，AI 会优化成分镜方案，再生成可编辑的项目。</p>
      <ModeSwitch mode={mode} onChange={changeMode} />
      {error && <p className="create-error" role="alert">{error} {stage === 'input' && prompt.trim() && <button type="button" onClick={submit}>重试</button>}</p>}
      {busy && <ol className="create-progress" aria-live="polite">{progress.map((p, i) => <li key={p} data-state={i < progressIndex ? 'done' : i === progressIndex ? 'active' : 'todo'}>{p}</li>)}</ol>}
      {reviewing && plan ? (
        <>
          {!notes.usedLLM && <p className="create-warn" role="status">未使用大模型（可能未配置 API Key），已用本地兜底方案生成，质量有限。</p>}
          {notes.warnings.map((w) => <p className="create-warn" role="status" key={w}>{w}</p>)}
          <PlanEditor plan={plan} disabled={busy} onChange={setPlan} onRefine={refine} />
          <div className="create-actions">
            <button type="button" className="create-ghost" disabled={busy} onClick={() => { setStage('input'); setError(''); }}>← 返回修改需求</button>
            <button type="button" className="create-primary" disabled={busy} onClick={confirm}>{stage === 'creating' ? '正在创建…' : '确认并生成'}</button>
          </div>
        </>
      ) : (
        <form className="create-form" onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) void submit(); }}>
          <label className="create-field"><span className="create-label">视频需求</span>
            <textarea rows={7} value={prompt} maxLength={4000} disabled={busy} placeholder="例如：为我的咖啡店做一条 30 秒的新品宣传片…" onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <div className="create-examples"><span>试试：</span>{examples.map((ex, i) => <button type="button" key={ex} disabled={busy} onClick={() => setPrompt(ex)}>示例 {i + 1}</button>)}</div>
          <div className="create-options">
            <label>时长<select value={durationSec} disabled={busy} onChange={(e) => setDurationSec(Number(e.target.value))}>{durations.map((d) => <option key={d} value={d}>{d} 秒</option>)}</select></label>
            <div className="create-segment" role="group" aria-label="画幅">
              <button type="button" aria-pressed={orientation === 'landscape'} disabled={busy} onClick={() => setOrientation('landscape')}>横屏 16:9</button>
              <button type="button" aria-pressed={orientation === 'portrait'} disabled={busy} onClick={() => setOrientation('portrait')}>竖屏 9:16</button>
            </div>
          </div>
          <AssetUploader assets={assets} onChange={setAssets} />
          <div className="create-actions"><button type="submit" className="create-primary" disabled={busy || !prompt.trim()}>{busy ? '处理中…' : mode === 'auto' ? '一键生成视频' : '生成方案'}</button></div>
        </form>
      )}
    </div>
  );
}
