import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectData } from '../shared/types';
import { deleteProject, loadProjects } from '../components/home/library';

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState(false);
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadProjects().then((result) => {
      if (cancelled) return;
      setProjects(result.projects);
      setLocal(result.local);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function remove(id: string) {
    setDeleting(id);
    try {
      const localOnly = await deleteProject(id);
      setProjects((current) => current.filter((project) => project.id !== id));
      setMessage(localOnly ? '已从本机列表删除；服务恢复后，服务器副本可能重新出现。' : '项目已删除');
      setConfirmId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败，请重试');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section id="my-projects" className="home-projects" aria-labelledby="projects-title">
      <div className="home-section-heading"><div><span className="home-eyebrow">继续上次的灵感</span><h2 id="projects-title">我的项目 <small>{projects.length}</small></h2></div><a className="home-text-link" href="#template-library">新建作品 ↑</a></div>
      {local && <p className="home-notice">列表包含本地缓存。仅在浏览器保存的项目尚未同步到服务端。</p>}
      <p className="home-status" role="status">{message}</p>
      {loading ? <p className="home-empty">正在读取项目…</p> : projects.length === 0 ? <div className="home-empty"><h3>你的下一部作品，从这里开始</h3><p>选择上方的模板，创建第一个项目。</p></div> : (
        <div className="home-project-grid">{[...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((project) => (
          <article className="home-project" key={project.id}>
            <span className="home-project-symbol" aria-hidden="true">▤</span>
            <div className="home-project-info"><Link to={`/editor/${encodeURIComponent(project.id)}`}>{project.name}</Link><p>{project.width} × {project.height} · {project.fps} fps</p><time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleString('zh-CN')}</time></div>
            {confirmId === project.id ? <div className="home-delete-confirm"><span>确认删除？</span><button disabled={deleting !== null} onClick={() => remove(project.id)}>{deleting === project.id ? '删除中…' : '确认'}</button><button onClick={() => setConfirmId(null)}>取消</button></div> : <button className="home-delete" onClick={() => setConfirmId(project.id)} aria-label={`删除${project.name}`}>删除</button>}
          </article>
        ))}</div>
      )}
    </section>
  );
}
