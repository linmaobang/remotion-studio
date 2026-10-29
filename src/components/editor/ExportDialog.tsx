import { useEffect, useRef, useState } from 'react';
import type { ProjectData, RenderJob } from '../../shared/types';
import { inputProps, jsonBody, request } from '../../lib/editor';
import { getTemplate } from '../../templates/registry';

export default function ExportDialog({ project, onClose }: { project: ProjectData; onClose: () => void }) {
  const [job, setJob] = useState<RenderJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    closeRef.current?.focus();
    return () => { controller.current?.abort(); previousFocus.current?.focus(); };
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await request<RenderJob>(`/api/render/${encodeURIComponent(jobId!)}`, { signal: abort.signal });
        if (abort.signal.aborted) return;
        if (!['queued', 'rendering', 'done', 'error'].includes(result.status)) throw new Error('渲染状态无效');
        setError('');
        setJob(result);
        if (result.status === 'error') setError(result.error || '渲染失败');
        if (result.status !== 'done' && result.status !== 'error') timer = setTimeout(poll, 1000);
      } catch (reason) {
        if (!abort.signal.aborted) { setError(`进度读取失败，将重试：${reason instanceof Error ? reason.message : '网络错误'}`); timer = setTimeout(poll, 3000); }
      }
    }
    void poll();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [jobId]);

  async function start() {
    const validation = getTemplate(project.templateId)?.schema.safeParse(inputProps(project));
    if (!validation?.success) { setError('模板参数无效，请修正参数后导出'); return; }
    setStarting(true);
    setError('');
    setJob(null);
    setJobId(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await request<{ jobId: string }>('/api/render', { ...jsonBody('POST', { project }), signal: abort.signal });
      if (!result.jobId) throw new Error('未收到渲染任务编号');
      setJobId(result.jobId);
      setJob({ status: 'queued', progress: 0 });
    } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : '无法启动渲染'); }
    finally { if (!abort.signal.aborted) setStarting(false); }
  }
  const progress = Math.max(0, Math.min(1, Number.isFinite(job?.progress) ? job!.progress : 0));
  const output = job?.outputUrl && /^(\/files\/|https?:\/\/)/i.test(job.outputUrl) ? job.outputUrl : null;
  const active = starting || job?.status === 'queued' || job?.status === 'rendering';
  return <div className="editor-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onKeyDown={(event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const nodes = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="editor-section-title"><h2 id="export-title">导出 MP4</h2><button ref={closeRef} onClick={onClose} aria-label="关闭导出">×</button></div>
      <p>{project.name} · {project.width} × {project.height} · {project.fps} fps · {(project.durationInFrames / project.fps).toFixed(2)} 秒</p>
      <p>使用当前画面的参数与时间线导出。关闭窗口后服务端任务仍会继续。</p>
      {job && <div role="status"><p>{job.status === 'queued' ? '排队中' : job.status === 'rendering' ? '正在渲染' : job.status === 'done' ? '导出完成' : '导出失败'} · {Math.round(progress * 100)}%</p><progress aria-label="渲染进度" value={job.status === 'done' ? 1 : progress} max="1" /></div>}
      {error && <p className="editor-error" role="alert">{error}</p>}
      {job?.status === 'done' && output && <div className="editor-toolbar"><a href={output} download>下载 MP4</a><a href={output} target="_blank" rel="noreferrer">打开视频 ↗</a></div>}
      {job?.status === 'done' && !output && <p role="alert">服务未提供有效的下载地址</p>}
      <button disabled={active} onClick={() => void start()}>{active ? '请等待渲染…' : job ? '重新导出' : '开始导出'}</button>
    </section>
  </div>;
}
