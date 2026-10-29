import { useRef, useState } from 'react';
import type { AssetKind, AssetRef } from '../../plan/api';
import { uploadAsset } from '../../lib/planApi';

const slots: { kind: AssetKind; label: string; accept: string; multiple: boolean }[] = [
  { kind: 'image', label: '图片（可多张）', accept: 'image/*', multiple: true },
  { kind: 'audio', label: '背景音乐', accept: 'audio/*', multiple: false },
  { kind: 'voiceover', label: '配音', accept: 'audio/*', multiple: false },
];

export default function AssetUploader({ assets, onChange }: { assets: AssetRef[]; onChange: (assets: AssetRef[]) => void }) {
  const [busy, setBusy] = useState<AssetKind | null>(null);
  const [error, setError] = useState('');
  const inputs = useRef<Partial<Record<AssetKind, HTMLInputElement | null>>>({});

  async function pick(kind: AssetKind, multiple: boolean, files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setBusy(kind);
    setError('');
    const added: AssetRef[] = [];
    try {
      for (const file of list) added.push(await uploadAsset(file, kind));
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败，请重试');
    } finally {
      if (added.length > 0) onChange([...assets.filter((a) => multiple || a.kind !== kind), ...added]);
      setBusy(null);
      const input = inputs.current[kind];
      if (input) input.value = '';
    }
  }

  return (
    <div className="create-assets">
      {slots.map((slot) => {
        const items = assets.filter((a) => a.kind === slot.kind);
        return (
          <div className="create-asset-slot" key={slot.kind}>
            <div className="create-asset-head">
              <span className="create-label">{slot.label}</span>
              <button type="button" disabled={busy !== null} onClick={() => inputs.current[slot.kind]?.click()}>{busy === slot.kind ? '上传中…' : items.length && !slot.multiple ? '替换' : '+ 上传'}</button>
              <input ref={(el) => { inputs.current[slot.kind] = el; }} type="file" hidden accept={slot.accept} multiple={slot.multiple} onChange={(e) => pick(slot.kind, slot.multiple, e.target.files)} />
            </div>
            <ul>
              {items.map((a) => (
                <li key={a.url}>
                  {a.kind === 'image' ? <img src={a.url} alt="" /> : <span aria-hidden="true">♪</span>}
                  <em title={a.name}>{a.name}</em>
                  <button type="button" aria-label={`移除 ${a.name}`} onClick={() => onChange(assets.filter((x) => x !== a))}>×</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {error && <p className="create-error" role="alert">{error}</p>}
    </div>
  );
}
