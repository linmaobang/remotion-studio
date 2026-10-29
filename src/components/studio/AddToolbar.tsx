import { useState } from 'react';
import type { UploadResult } from '../../shared/types';
import { request } from '../../lib/editor';
import { createDefaultLayer, type Layer, type LayerType, type ShapeLayer } from '../../templates/studio-canvas/model';

export async function uploadFile(file: File): Promise<UploadResult> {
  const data = new FormData();
  data.append('file', file);
  const result = await request<UploadResult>('/api/upload', { method: 'POST', body: data });
  if (!result.url) throw new Error('上传返回数据无效');
  return result;
}

const mediaAccept: Record<'image' | 'video' | 'audio', string> = { image: 'image/*', video: 'video/*', audio: 'audio/*' };
const mediaLabel = { image: '图片', video: '视频', audio: '音频' };

export default function AddToolbar({ canvas, sceneFrames, onAdd }: {
  canvas: { width: number; height: number };
  /** 当前场景帧数，新图层默认铺满场景时间 */
  sceneFrames: number;
  onAdd: (layer: Layer) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const place = (layer: Layer): Layer => ({
    ...layer, x: Math.round((canvas.width - layer.width) / 2), y: Math.round((canvas.height - layer.height) / 2), durationFrames: sceneFrames,
  });
  const add = (type: LayerType, shape?: ShapeLayer['shape']) => onAdd(place(createDefaultLayer(type, shape)));

  async function upload(kind: 'image' | 'video' | 'audio', file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await uploadFile(file);
      const layer = createDefaultLayer(kind);
      if (layer.type === 'image' || layer.type === 'video' || layer.type === 'audio') layer.src = result.url;
      if (layer.type === 'image' || layer.type === 'video') layer.fit = 'contain';
      layer.name = result.name;
      onAdd(place(layer));
    } catch (error) { setMessage(error instanceof Error ? error.message : '上传失败'); }
    finally { setBusy(false); }
  }

  return <section className="studio-add" aria-label="添加图层">
    <h2>添加</h2>
    <div className="studio-add-grid">
      <button onClick={() => add('text')}>文字</button>
      <button onClick={() => add('shape', 'rect')}>矩形</button>
      <button onClick={() => add('shape', 'ellipse')}>椭圆</button>
      <button onClick={() => add('shape', 'line')}>线条</button>
      {(['image', 'video', 'audio'] as const).map((kind) => <label key={kind} className="editor-upload">{busy ? '上传中…' : `${mediaLabel[kind]}…`}
        <input type="file" accept={mediaAccept[kind]} disabled={busy} aria-label={`上传${mediaLabel[kind]}`} onChange={(event) => { void upload(kind, event.target.files?.[0]); event.target.value = ''; }} />
      </label>)}
    </div>
    {message && <p className="editor-error" role="alert">{message}</p>}
  </section>;
}
