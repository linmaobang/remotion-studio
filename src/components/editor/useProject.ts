import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectData } from '../../shared/types';
import { getTemplate } from '../../templates/registry';
import { readLocalProjects, saveLocalProjects } from '../home/library';
import { inputProps, jsonBody, request } from '../../lib/editor';

function cache(project: ProjectData) {
  saveLocalProjects([project, ...readLocalProjects().filter((item) => item.id !== project.id)]);
}

export function useProject(id: string | undefined) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const current = useRef(project);
  current.current = project;

  useEffect(() => {
    const controller = new AbortController();
    setProject(null);
    setLoading(true);
    setMessage('');
    setError('');
    const local = readLocalProjects().find((item) => item.id === id);
    request<ProjectData>(`/api/projects/${encodeURIComponent(id ?? '')}`, { signal: controller.signal }).then((remote) => {
      if (controller.signal.aborted) return;
      if (!remote || remote.id !== id || !remote.props || !getTemplate(remote.templateId)) throw new Error('项目数据或模板无效');
      const next = local && local.updatedAt > remote.updatedAt ? local : remote;
      setProject(next);
      if (next === local) setMessage('已恢复较新的本地草稿，请保存以同步服务端');
    }).catch((reason) => {
      if (controller.signal.aborted) return;
      if (local) { setProject(local); setMessage('已恢复本地缓存，服务暂不可用'); }
      else setError(`无法加载项目：${reason instanceof Error ? reason.message : '未知错误'}`);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  const update = useCallback((change: (value: ProjectData) => ProjectData) => {
    setProject((value) => value ? { ...change(value), updatedAt: new Date().toISOString() } : value);
    setMessage('有未同步的修改');
  }, []);

  useEffect(() => {
    if (!project) return;
    const timer = window.setTimeout(() => {
      try { cache(project); } catch { setError('浏览器缓存写入失败，请保存到服务端'); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [project]);

  const save = async () => {
    const snapshot = current.current;
    if (!snapshot || saving) return;
    const template = getTemplate(snapshot.templateId);
    const validation = template?.schema.safeParse(inputProps(snapshot));
    if (!validation?.success) { setError('参数无效，请检查参数面板后保存'); return; }
    setSaving(true);
    setError('');
    let cached = false;
    try { cache(snapshot); cached = true; } catch { /* 继续尝试服务端保存。 */ }
    try {
      const path = `/api/projects/${encodeURIComponent(snapshot.id)}`;
      const response = await fetch(path, jsonBody('PUT', snapshot));
      if (response.status === 404) await request<ProjectData>('/api/projects', jsonBody('POST', snapshot));
      else if (!response.ok) throw new Error(`请求失败（${response.status}）`);
      if (current.current === snapshot) setMessage('已保存到服务端');
      else setMessage('先前版本已保存，仍有新修改');
    } catch (reason) {
      setMessage(cached ? '已保存到本机，尚未同步服务端' : '保存失败');
      setError(reason instanceof Error ? reason.message : '保存失败');
    } finally { setSaving(false); }
  };

  return { project, loading, saving, message, error, update, save };
}
