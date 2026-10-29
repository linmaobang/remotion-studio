import type { AssetRef } from '../../plan/api';
import type { VideoPlan } from '../../plan/schema';
import { SCENE_KIND_LABELS, sceneIndexAtFrame, sceneStart } from './logic';

export default function LeftPanel({ plan, frame, selectedId, assets, onSelect, onSeek, onUseImage, onUseBackground, onUseAudio }: {
  plan: VideoPlan;
  frame: number;
  selectedId: string | null;
  assets: AssetRef[];
  onSelect: (id: string) => void;
  onSeek: (frame: number) => void;
  onUseImage: (url: string) => void;
  onUseBackground: (url: string) => void;
  onUseAudio: (url: string, kind: 'bgm' | 'voiceover') => void;
}) {
  const current = sceneIndexAtFrame(plan.scenes, frame);
  const target = plan.scenes.find((scene) => scene.id === selectedId);
  return <aside className="pe-left" aria-label="场景与素材">
    <section><h3>场景</h3>
      <ol className="pe-scene-list">{plan.scenes.map((scene, index) => (
        <li key={scene.id}><button type="button" className={`${scene.id === selectedId ? 'selected' : ''}${index === current ? ' playing' : ''}`}
          onClick={() => { onSelect(scene.id); onSeek(sceneStart(plan.scenes, index)); }}>
          <b>{index + 1}</b><span><strong>{scene.title}</strong><small>{SCENE_KIND_LABELS[scene.kind]} · {(scene.durationFrames / plan.format.fps).toFixed(1)}s</small></span>
        </button></li>
      ))}</ol>
    </section>
    <section><h3>素材库</h3>
      {assets.length === 0 ? <p className="pe-muted">还没有素材。在右侧选择图片或音频时可直接上传，上传后会出现在这里。</p> : <ul className="pe-assets">
        {assets.map((asset) => <li key={asset.url}>
          {asset.kind === 'image' ? <img src={asset.url} alt="" /> : <span className="pe-asset-icon" aria-hidden="true">♪</span>}
          <em title={asset.name}>{asset.name}</em>
          <div>
            {asset.kind === 'image'
              ? <>{target?.kind === 'image-text' && <button type="button" onClick={() => onUseImage(asset.url)}>设为图片</button>}<button type="button" disabled={!target} onClick={() => onUseBackground(asset.url)}>设为背景</button></>
              : <><button type="button" onClick={() => onUseAudio(asset.url, 'bgm')}>设为 BGM</button><button type="button" onClick={() => onUseAudio(asset.url, 'voiceover')}>设为配音</button></>}
          </div>
        </li>)}
      </ul>}
    </section>
  </aside>;
}
