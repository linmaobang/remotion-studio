import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PlayerRef } from '@remotion/player';
import { getTemplate } from '../templates/registry';
import PreviewPane from '../components/editor/PreviewPane';
import PropsForm from '../components/editor/PropsForm';
import Timeline from '../components/editor/Timeline';
import ExportDialog from '../components/editor/ExportDialog';
import { useProject } from '../components/editor/useProject';
import '../styles/editor.css';

function ProjectEditor({ id }: { id: string | undefined }) {
  const { project, loading, saving, message, error, update, save } = useProject(id);
  const playerRef = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [exporting, setExporting] = useState(false);
  const onFrame = useCallback((next: number) => setFrame(next), []);
  const seek = (next: number) => { playerRef.current?.seekTo(next); setFrame(next); };
  const template = project ? getTemplate(project.templateId) : undefined;
  if (loading) return <div className="editor" role="status">正在加载作品…</div>;
  if (!project || !template) return <div className="editor"><p role="alert">{error || '项目使用的模板不存在'}</p><Link to="/">返回首页</Link></div>;
  return <div className="editor">
    <header className="editor-header"><div><Link to="/">← 返回首页</Link><h1>{project.name}</h1><span>{template.meta.name}</span></div><div className="editor-toolbar"><button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存项目'}</button><button className="editor-primary" onClick={() => setExporting(true)}>导出 MP4 ↗</button></div></header>
    <p className="editor-status" role="status">{message}</p>{error && <p className="editor-error" role="alert">{error}</p>}
    <div className="editor-workspace"><PreviewPane project={project} template={template} playerRef={playerRef} onFrame={onFrame} /><PropsForm project={project} template={template} onChange={update} /></div>
    {project.templateId === 'blank-timeline' && <Timeline project={project} frame={Math.min(frame, project.durationInFrames - 1)} onSeek={seek} onChange={update} />}
    {exporting && <ExportDialog project={project} onClose={() => setExporting(false)} />}
  </div>;
}

export default function Editor() {
  const { id } = useParams();
  return <ProjectEditor key={id} id={id} />;
}
