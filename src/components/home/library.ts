import type { ProjectData, TemplateCategory } from '../../shared/types';
import type { TemplateDef } from '../../templates/registry';

export const categoryNames: Record<TemplateCategory, string> = {
  'Motion graphics': '动态图形',
  Explainers: '知识解说',
  '3D 场景': '3D 场景',
  'Games & interactive': '游戏与交互',
  '剪辑': '视频剪辑',
};

export function filterTemplates(templates: TemplateDef[], query: string, category: string) {
  const keyword = query.trim().toLocaleLowerCase();
  return templates.filter(({ meta }) =>
    (category === 'all' || meta.category === category) &&
    [meta.name, meta.description, ...meta.tags].join(' ').toLocaleLowerCase().includes(keyword),
  );
}

export const PROJECT_STORAGE_KEY = 'remotion-studio.projects';

function isProject(value: unknown): value is ProjectData {
  if (!value || typeof value !== 'object') return false;
  const project = value as ProjectData;
  return typeof project.id === 'string' && typeof project.name === 'string' &&
    typeof project.templateId === 'string' && typeof project.updatedAt === 'string' &&
    !!project.props && typeof project.props === 'object' &&
    ['width', 'height', 'fps', 'durationInFrames'].every((key) =>
      typeof project[key as keyof ProjectData] === 'number');
}

export function readLocalProjects(): ProjectData[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(isProject) : [];
  } catch {
    return [];
  }
}

export function saveLocalProjects(projects: ProjectData[]) {
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
}

export async function loadProjects(): Promise<{ projects: ProjectData[]; local: boolean }> {
  const cached = readLocalProjects();
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('项目列表暂不可用');
    const value: unknown = await response.json();
    if (!Array.isArray(value) || !value.every(isProject)) throw new Error('项目列表格式错误');
    // 保留尚未同步到服务端的本地项目。
    const projects = [...value, ...cached.filter((item) => !value.some((remote) => remote.id === item.id))];
    try { saveLocalProjects(projects); } catch { /* API 可用时不依赖本地缓存。 */ }
    return { projects, local: cached.some((item) => !value.some((remote) => remote.id === item.id)) };
  } catch {
    return { projects: cached, local: true };
  }
}

export async function createProject(template: TemplateDef): Promise<{ project: ProjectData; local: boolean }> {
  const draft = {
    name: template.meta.name,
    templateId: template.meta.id,
    props: structuredClone(template.defaultProps),
    ...template.defaultConfig,
  };
  let project: ProjectData;
  let local = false;
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!response.ok) throw new Error('创建失败');
    const value: unknown = await response.json();
    if (!isProject(value)) throw new Error('项目格式错误');
    project = value;
  } catch {
    project = { ...draft, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    local = true;
  }
  const cached = readLocalProjects().filter((item) => item.id !== project.id);
  try { saveLocalProjects([project, ...cached]); } catch {
    if (local) throw new Error('服务不可用，且浏览器无法保存项目，请稍后重试。');
  }
  return { project, local };
}

export async function deleteProject(id: string): Promise<boolean> {
  let local = false;
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw new Error('删除失败');
  } catch {
    local = true;
  }
  try { saveLocalProjects(readLocalProjects().filter((project) => project.id !== id)); } catch {
    if (local) throw new Error('浏览器无法保存删除结果，请稍后重试。');
  }
  return local;
}
