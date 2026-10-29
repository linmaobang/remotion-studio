import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { templates } from '../templates';
import type { TemplateDef } from '../templates/registry';
import type { TemplateMeta } from '../shared/types';
import { categoryNames, createProject, filterTemplates } from '../components/home/library';
import TemplateCard from '../components/home/TemplateCard';
import PromptDialog from '../components/home/PromptDialog';
import { presetDuration, studioPresets, type StudioPreset } from '../templates/studio-canvas/presets';
import ProjectList from './ProjectList';
import '../styles/home.css';

export default function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [prompt, setPrompt] = useState<TemplateMeta | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState('');
  const searched = filterTemplates(templates, query, 'all');
  const visible = filterTemplates(templates, query, category);
  const categories = Object.entries(categoryNames);

  const canvas = templates.find((template) => template.meta.id === 'studio-canvas');

  async function start(template: TemplateDef, preset?: StudioPreset) {
    if (creating) return;
    setCreating(preset ? preset.id : template.meta.id);
    setError('');
    try {
      const result = await createProject(template, preset ? { name: preset.name, props: preset.props, width: preset.width, height: preset.height, durationInFrames: presetDuration(preset) } : {});
      navigate(`/editor/${encodeURIComponent(result.project.id)}`, { state: { local: result.local } });
    } catch (error) {
      setError(error instanceof Error ? error.message : '创建失败，请重试');
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="home">
      <nav className="home-nav" aria-label="首页导航"><a href="#template-library">模板探索 <span>{templates.length}</span></a><a href="#my-projects">我的项目 ↗</a><span className="home-nav-note">本地创作，自由表达</span></nav>
      <section className="home-hero">
        <div><span className="home-eyebrow">REMOTION STUDIO / 灵感实验室</span><h1>让一个想法，<br />成为<span>会动的作品。</span></h1><p>从一个模板出发。预览动效、拾取灵感，<br className="home-desktop-break" />再把画面变成你的表达。</p><div className="home-cta"><Link className="home-primary" to="/create">✨ 文字生成视频</Link>{canvas && <button className="home-primary" disabled={creating !== null} onClick={() => start(canvas)}>开始创作 <span aria-hidden="true">→</span></button>}<a className="home-secondary" href="#template-library">探索模板 <span aria-hidden="true">↓</span></a></div></div>
        <div className="home-hero-art" aria-hidden="true"><div className="home-art-grid" /><span className="home-art-label">IDEA → MOTION</span><div className="home-art-orbit" /><div className="home-art-square" /><div className="home-art-dot" /><span className="home-art-caption">每一帧，都有新的可能。<b>01 / 无限灵感</b></span></div>
      </section>
      {canvas && <section className="home-canvas" aria-labelledby="canvas-title">
        <div className="home-canvas-main"><span className="home-eyebrow">自由创作 · 置顶</span><h2 id="canvas-title">空白创作画布</h2><p>多场景、多图层：添加文字、形状、图片、视频与音频，拖动缩放旋转，设置动画与转场，一键导出 MP4。</p>
          <button className="home-primary" disabled={creating !== null} onClick={() => start(canvas)}>{creating === 'studio-canvas' ? '正在创建…' : '新建空白画布'}</button></div>
        <div className="home-presets" role="group" aria-label="创作画布起手预设"><span>或从预设开始</span>{studioPresets.map((preset) => <button key={preset.id} disabled={creating !== null} onClick={() => start(canvas, preset)}><b>{preset.name}</b><small>{preset.width}×{preset.height} · {preset.description}</small></button>)}</div>
      </section>}
      <section id="template-library" className="home-library" aria-labelledby="library-title">
        <div className="home-section-heading"><div><span className="home-eyebrow">找到你的创作起点</span><h2 id="library-title">模板探索 <small>{templates.length}</small></h2></div><label className="home-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、标签、描述" aria-label="搜索模板名称、标签或描述" /></label></div>
        <div className="home-chips" role="group" aria-label="按分类筛选">
          <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>全部 <span>{searched.length}</span></button>
          {categories.map(([key, name]) => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{name} <span>{searched.filter((template) => template.meta.category === key).length}</span></button>)}
        </div>
        {error && <p className="home-notice" role="alert">{error}</p>}
        {visible.length === 0 ? <div className="home-empty"><span className="home-empty-symbol" aria-hidden="true">✳</span><h3>{templates.length === 0 ? '灵感正在准备中' : '没有找到匹配的模板'}</h3><p>{templates.length === 0 ? '模板接入后会自动出现在这里。先想好你的第一个故事吧。' : '试试其他关键词，或切换分类继续探索。'}</p>{templates.length > 0 && <button className="home-text-button" onClick={() => { setQuery(''); setCategory('all'); }}>清除筛选</button>}</div> : categories.map(([key, name]) => {
          const items = visible.filter((template) => template.meta.category === key);
          return items.length > 0 && <section className="home-category" key={key} aria-label={name}><div className="home-category-heading"><h3>{name} <span>{items.length}</span></h3><span>悬停预览 · 点击开始创作</span></div><div className="home-template-grid">{items.map((template) => <TemplateCard key={template.meta.id} template={template} busy={creating !== null} onCreate={() => start(template)} onPrompt={() => setPrompt(template.meta)} />)}</div></section>;
        })}
      </section>
      <ProjectList />
      <footer className="home-footer"><span>REMOTION STUDIO</span><span>把灵感交给时间，把表达留给自己。</span></footer>
      {prompt && <PromptDialog template={prompt} onClose={() => setPrompt(null)} />}
    </div>
  );
}
