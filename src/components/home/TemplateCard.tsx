import { lazy, Suspense, useState } from 'react';
import type { TemplateDef } from '../../templates/registry';

const PreviewPlayer = lazy(() => import('@remotion/player').then(({ Player }) => ({ default: Player })));

export default function TemplateCard({ template, busy, onCreate, onPrompt }: {
  template: TemplateDef;
  busy: boolean;
  onCreate: () => void;
  onPrompt: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const { meta, defaultConfig } = template;
  const active = (hovered || focused) && !previewFailed;

  return (
    <article className="home-template-card" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button className="home-card-open" disabled={busy} onClick={onCreate}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        aria-label={`使用${meta.name}创建项目`}>
        <div className="home-preview">
          {meta.thumbnail ? <img src={meta.thumbnail} alt="" loading="lazy" /> : (
            <div className="home-preview-art" aria-hidden="true"><span>{meta.name.slice(0, 2)}</span><i /><i /><i /></div>
          )}
          {active && <div className="home-player"><Suspense fallback={null}><PreviewPlayer component={template.component} inputProps={template.defaultProps}
            compositionWidth={defaultConfig.width} compositionHeight={defaultConfig.height}
            fps={defaultConfig.fps} durationInFrames={defaultConfig.durationInFrames}
            autoPlay loop controls={false} clickToPlay={false} acknowledgeRemotionLicense
            errorFallback={() => <span className="home-preview-error">预览暂不可用，仍可创建项目</span>}
            onError={() => setPreviewFailed(true)} style={{ width: '100%', height: '100%' }} /></Suspense></div>}
          {previewFailed && <span className="home-preview-error">预览暂不可用，仍可创建项目</span>}
          <span className="home-preview-duration">{Math.round(defaultConfig.durationInFrames / defaultConfig.fps)} 秒 · {defaultConfig.width} × {defaultConfig.height}</span>
          <span className="home-preview-action">{busy ? '正在创建…' : '使用模板 ↗'}</span>
        </div>
        <div className="home-card-copy"><h3>{meta.name}<span aria-hidden="true">↗</span></h3><p>{meta.description}</p></div>
      </button>
      <div className="home-card-footer"><div className="home-tags">{meta.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <button className="home-prompt-button" onClick={onPrompt}>Prompt <span aria-hidden="true">↗</span></button>
      </div>
    </article>
  );
}
