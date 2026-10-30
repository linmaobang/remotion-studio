import type { AssetRef } from '../../plan/api';
import type { Scene } from '../../plan/schema';
import { AssetSelect, ColorField, Field, NumberField, SelectField, TextField } from './fields';
import { MIN_SCENE_FRAMES, SCENE_KIND_LABELS, TRANSITION_LABELS } from './logic';

type Patch = Record<string, unknown>;

export default function ScenePanel({ scene, fps, assets, onPatch, onUploaded, onDuplicate, onDelete, canDelete }: {
  scene: Scene;
  fps: number;
  assets: AssetRef[];
  /** group 相同的连续修改合并为一次撤销记录 */
  onPatch: (patch: Patch, group?: string) => void;
  onUploaded: (asset: AssetRef) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const text = (key: string, label: string, value: string | undefined, multiline = false) => (
    <TextField label={label} value={value ?? ''} multiline={multiline} onChange={(next) => onPatch({ [key]: next }, `${scene.id}-${key}`)} />
  );
  return <div className="pe-panel-body">
    <div className="pe-scene-actions"><button type="button" onClick={onDuplicate}>复制场景</button><button type="button" disabled={!canDelete} onClick={onDelete}>删除场景</button></div>
    <section className="pe-group"><h4>{SCENE_KIND_LABELS[scene.kind]}内容</h4>
      {text('title', '标题', scene.title)}
      {scene.kind === 'title' && text('subtitle', '副标题', scene.subtitle)}
      {scene.kind === 'image-text' && <>
        {text('body', '正文', scene.body, true)}
        <AssetSelect label="场景图片" kind="image" value={scene.imageSrc} assets={assets} onUploaded={onUploaded} onChange={(imageSrc) => onPatch({ imageSrc })} />
        <SelectField label="图片位置" value={scene.imagePosition} options={[['right', '图片在右'], ['left', '图片在左']]} onChange={(imagePosition) => onPatch({ imagePosition })} />
      </>}
      {scene.kind === 'list' && <Field label={`列表项（${scene.items.length}/8）`}>
        <div className="pe-list">
          {scene.items.map((item, i) => <div className="pe-list-row" key={i}>
            <input aria-label={`第 ${i + 1} 项`} value={item} onChange={(event) => onPatch({ items: scene.items.map((old, j) => (j === i ? event.target.value : old)) }, `${scene.id}-item-${i}`)} />
            <button type="button" aria-label={`删除第 ${i + 1} 项`} onClick={() => onPatch({ items: scene.items.filter((_, j) => j !== i) })}>×</button>
          </div>)}
          <button type="button" disabled={scene.items.length >= 8} onClick={() => onPatch({ items: [...scene.items, `要点 ${scene.items.length + 1}`] })}>＋ 添加一项</button>
        </div></Field>}
      {scene.kind === 'stat' && <Field label={`数据项（${scene.stats.length}/4）`}>
        <div className="pe-list">
          {scene.stats.map((stat, i) => <div className="pe-list-row" key={i}>
            <input aria-label={`第 ${i + 1} 项数值`} className="pe-stat-value" value={stat.value} onChange={(event) => onPatch({ stats: scene.stats.map((old, j) => (j === i ? { ...old, value: event.target.value } : old)) }, `${scene.id}-stat-v${i}`)} />
            <input aria-label={`第 ${i + 1} 项说明`} value={stat.label} onChange={(event) => onPatch({ stats: scene.stats.map((old, j) => (j === i ? { ...old, label: event.target.value } : old)) }, `${scene.id}-stat-l${i}`)} />
            <button type="button" aria-label={`删除第 ${i + 1} 项`} onClick={() => onPatch({ stats: scene.stats.filter((_, j) => j !== i) })}>×</button>
          </div>)}
          <button type="button" disabled={scene.stats.length >= 4} onClick={() => onPatch({ stats: [...scene.stats, { value: '100', label: '说明' }] })}>＋ 添加一项</button>
        </div></Field>}
      {scene.kind === 'cta' && <>{text('buttonText', '按钮文案', scene.buttonText)}{text('subtitle', '副文案', scene.subtitle)}</>}
    </section>
    <section className="pe-group"><h4>时长与转场</h4>
      <NumberField label="时长（秒）" min={MIN_SCENE_FRAMES / fps} step={0.5} value={scene.durationFrames / fps} hint={`${scene.durationFrames} 帧，最短 0.5 秒`}
        onChange={(sec) => onPatch({ durationFrames: Math.max(MIN_SCENE_FRAMES, Math.round(sec * fps)) }, `${scene.id}-duration`)} />
      <div className="pe-row">
        <SelectField label="转场" value={scene.transition.type} options={Object.entries(TRANSITION_LABELS)} onChange={(type) => onPatch({ transition: { type, frames: type === 'none' ? 0 : scene.transition.frames || 15 } })} />
        <NumberField label="转场帧数" min={0} max={Math.floor(scene.durationFrames / 2)} value={scene.transition.frames} onChange={(frames) => onPatch({ transition: { ...scene.transition, frames: Math.max(0, Math.round(frames)) } }, `${scene.id}-transition`)} />
      </div>
    </section>
    <section className="pe-group"><h4>背景</h4>
      <ColorField label="背景色" value={scene.backgroundColor ?? ''} onChange={(backgroundColor) => onPatch({ backgroundColor }, `${scene.id}-bg`)} onClear={() => onPatch({ backgroundColor: undefined })} />
      <AssetSelect label="背景图" kind="image" value={scene.backgroundSrc} assets={assets} onUploaded={onUploaded} onChange={(backgroundSrc) => onPatch({ backgroundSrc })} />
    </section>
    <section className="pe-group"><h4>风格</h4>
      <SelectField label="入场动画" value={scene.enter ?? 'rise'} options={[['rise', '上浮（默认）'], ['zoom', '缩放'], ['fade', '淡入'], ['none', '无']]} onChange={(enter) => onPatch({ enter })} />
      {text('emoji', '装饰 emoji', scene.emoji)}
      <ColorField label="强调色" value={scene.accentColor ?? ''} onChange={(accentColor) => onPatch({ accentColor }, `${scene.id}-accent`)} onClear={() => onPatch({ accentColor: undefined })} />
    </section>
    <section className="pe-group"><h4>备注</h4>{text('notes', '备注（不会出现在视频里）', scene.notes, true)}</section>
  </div>;
}
