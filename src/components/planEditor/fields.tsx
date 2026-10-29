import { useRef, useState, type ReactNode } from 'react';
import type { AssetRef } from '../../plan/api';
import { uploadAsset } from '../../lib/planApi';
import { assetName } from './logic';

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="pe-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);

export const TextField = ({ label, value, onChange, multiline, placeholder }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string }) => (
  <Field label={label}>{multiline
    ? <textarea aria-label={label} rows={4} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    : <input aria-label={label} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</Field>
);

export const NumberField = ({ label, value, onChange, min, max, step = 1, hint }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; hint?: string }) => (
  <Field label={label} hint={hint}><input aria-label={label} type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ''} onChange={(event) => { if (event.target.value !== '') onChange(Number(event.target.value)); }} /></Field>
);

export const SelectField = ({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) => (
  <Field label={label}><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></Field>
);

export const RangeField = ({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) => (
  <Field label={`${label} · ${Math.round(value * 100)}%`}><input aria-label={label} type="range" min={0} max={1} step={0.05} value={value} onChange={(event) => onChange(Number(event.target.value))} /></Field>
);

export const ColorField = ({ label, value, onChange, onClear }: { label: string; value: string; onChange: (value: string) => void; onClear?: () => void }) => (
  <Field label={label}><div className="pe-color">
    <input aria-label={`${label}拾色器`} type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(event) => onChange(event.target.value)} />
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    {onClear && <button type="button" onClick={onClear}>用主题色</button>}
  </div></Field>
);

/** 从素材库选择，或上传新文件；kind 决定可选素材（图片 / 音频）与上传类型。 */
export function AssetSelect({ label, kind, value, assets, onChange, onUploaded }: {
  label: string;
  kind: 'image' | 'audio' | 'voiceover';
  value?: string;
  assets: AssetRef[];
  onChange: (url: string | undefined) => void;
  onUploaded: (asset: AssetRef) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const isImage = kind === 'image';
  const pool = assets.filter((asset) => (asset.kind === 'image') === isImage);
  const known = value && !pool.some((asset) => asset.url === value);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const asset = await uploadAsset(file, kind);
      onUploaded(asset);
      onChange(asset.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '上传失败，请重试'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <div className="pe-field">
    <span>{label}</span>
    <div className="pe-asset-row">
      <select aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">未设置</option>
        {known && <option value={value}>{assetName(value!)}</option>}
        {pool.map((asset) => <option key={asset.url} value={asset.url}>{asset.name}</option>)}
      </select>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? '上传中…' : '上传'}</button>
      <input ref={input} type="file" hidden accept={isImage ? 'image/*' : 'audio/*'} aria-label={`上传${label}`} onChange={(event) => void pick(event.target.files?.[0])} />
    </div>
    {isImage && value && <img className="pe-asset-thumb" src={value} alt="" />}
    {error && <small className="pe-error" role="alert">{error}</small>}
  </div>;
}
