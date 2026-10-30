import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssetRef, Orientation, PlanResponse, ProviderChoice, ProvidersResponse } from '../plan/api';
import type { VideoPlan } from '../plan/schema';
import { createPlanProject, fetchProviders, optimizePlan, readMode, refinePlan, saveMode, type CreateMode } from '../lib/planApi';
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
const providerOptions: [ProviderChoice, string][] = [['auto', '自动'], ['claude', 'Claude Code'], ['codex', 'Codex'], ['api', 'API Key']];

type Stage = 'input' | 'optimizing' | 'review' | 'refining' | 'creating';

function engineSuffix(id: ProviderChoice, info: ProvidersResponse | null): string {
  if (!info) return '';
  if (id === 'auto') return info.defaultProvider ? `（将用 ${info.providers.find((p) => p.id === info.defaultProvider)?.label}）` : '（无可用引擎）';
  const found = info.providers.find((p) => p.id === id);
  return found ? (found.available ? '（可用）' : '（不可用）') : '';
}

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
  const [notes, setNotes] = useState<{ usedLLM: boolean; label?: string; warnings: string[] }>({ usedLLM: true, warnings: [] });
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<ProviderChoice>('auto');
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  // StrictMode 开发模式会先卸载再重挂载，挂载时必须把标记复位。
  useEffect(() => { fetchProviders().then((value) => { if (alive.current) setProviders(value); }).catch(() => { /* 检测失败不影响生成，生成时会报具体错误 */ }); }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

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
    setNotes({ usedLLM: result.usedLLM, label: result.providerLabel, warnings: result.warnings });
  }

  const submit = () => run('optimizing', 'input', async () => {
    const result = await optimizePlan({ prompt: prompt.trim(), assets, durationSec, orientation, provider });
    if (!alive.current) return;
    receive(result);
    // 等待期间用户可能已切到全自动：直接继续。
    if (modeRef.current === 'auto') await finish(result.plan);
    else setStage('review');
  });

  const refine = (instruction: string) => plan && run('refining', 'review', async () => {
    const result = await refinePlan({ plan, instruction, ...(provider === 'heuristic' ? {} : { provider }) });
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

  const progress = ['优化需求', 'AI 设计分镜', '创建项目'];
  const progressIndex = stage === 'optimizing' ? 1 : stage === 'refining' ? 1 : stage === 'creating' ? 2 : -1;
  const reviewing = stage === 'review' || stage === 'refining' || (stage === 'creating' && mode === 'step');

  return (
    <div className="create">
      <h1>文字生成视频</h1>
      <p className="create-lead">描述你想要的视频，AI 会优化成分镜方案，再生成可编辑的项目。</p>
      <ModeSwitch mode={mode} onChange={changeMode} />
      {error && <p className="create-error" role="alert">{error} {stage === 'input' && prompt.trim() && <button type="button" onClick={submit}>重试</button>}</p>}
      {stage === 'optimizing' && <p className="create-warn" role="status">AI 正在设计分镜（可能需要 1-2 分钟），请不要关闭页面…</p>}
      {busy && <ol className="create-progress" aria-live="polite">{progress.map((p, i) => <li key={p} data-state={i < progressIndex ? 'done' : i === progressIndex ? 'active' : 'todo'}>{p}</li>)}</ol>}
      {reviewing && plan ? (
        <>
          {notes.usedLLM
            ? <p className="create-note" role="status">由 {notes.label ?? 'AI'} 生成</p>
            : <p className="create-error" role="alert"><strong>本地模板，未使用 AI。</strong>内容是固定占位文案，请自行修改或改用 AI 引擎重新生成。</p>}
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
            <label>AI 引擎<select value={provider} disabled={busy} onChange={(e) => setProvider(e.target.value as ProviderChoice)}>{(providers?.allowHeuristic ? [...providerOptions, ['heuristic', '本地模板（非 AI）'] as [ProviderChoice, string]] : providerOptions).map(([id, name]) => <option key={id} value={id}>{name}{engineSuffix(id, providers)}</option>)}</select></label>
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
