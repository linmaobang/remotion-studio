import { useState } from 'react';
import type { PointerEvent } from 'react';
import type { Clip, ProjectData, TimelineState, Track, TransitionType, UploadResult } from '../../shared/types';
import { request, resizeClip, splitClip, timelineOf, withTimeline } from '../../lib/editor';

const labels = { video: '画面', audio: '音频', text: '文字' };
const compatible = (track: Track, clip: Clip) => track.type === (clip.type === 'image' ? 'video' : clip.type);
const newId = () => crypto.randomUUID();
type Asset = { type: Clip['type']; src: string; name: string };

export default function Timeline({ project, frame, onSeek, onChange }: {
  project: ProjectData;
  frame: number;
  onSeek: (frame: number) => void;
  onChange: (change: (project: ProjectData) => ProjectData) => void;
}) {
  const timeline = timelineOf(project);
  const [selected, setSelected] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'video' | 'image' | 'audio'>('video');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [zoom, setZoom] = useState(60);
  const [dragTrack, setDragTrack] = useState<string | null>(null);
  const [gesture, setGesture] = useState<{ x: number; clip: Clip; trackId: string; mode: 'move' | 'left' | 'right'; timeline: TimelineState } | null>(null);
  const scale = zoom / project.fps;
  const total = Math.max(project.durationInFrames + project.fps * 2, project.fps * 10);
  const clip = timeline.tracks.flatMap((track) => track.clips).find((item) => item.id === selected);
  const commit = (next: TimelineState) => onChange((old) => withTimeline(old, next));
  const changeClip = (change: (clip: Clip) => Clip) => commit({ tracks: timeline.tracks.map((track) => ({ ...track, clips: track.clips.map((item) => item.id === selected ? change(item) : item) })) });

  function addTrack(type: Track['type']) {
    const id = newId();
    commit({ tracks: [...timeline.tracks, { id, type, clips: [] }] });
    setTarget(id);
  }

  function addClip(asset?: Asset) {
    const item: Clip = { id: newId(), type: asset?.type ?? 'text', src: asset?.src, text: asset ? undefined : '输入你的文字', startFrame: frame, durationFrames: project.fps * 5, trimStartFrame: 0, volume: 1 };
    const tracks = timeline.tracks.map((track) => ({ ...track, clips: [...track.clips] }));
    let track = tracks.find((entry) => entry.id === target && compatible(entry, item));
    if (!track) {
      track = { id: newId(), type: item.type === 'image' ? 'video' : item.type, clips: [] };
      tracks.push(track);
      setTarget(track.id);
    }
    track.clips.push(item);
    commit({ tracks });
    setSelected(item.id);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage('');
    const data = new FormData();
    data.append('file', file);
    try {
      const result = await request<UploadResult>('/api/upload', { method: 'POST', body: data });
      if (!result.url || !result.mime) throw new Error('上传返回数据无效');
      const type = result.mime.startsWith('audio/') ? 'audio' : result.mime.startsWith('image/') ? 'image' : result.mime.startsWith('video/') ? 'video' : null;
      if (!type) throw new Error('仅支持图片、视频和音频');
      setAssets((old) => [...old, { type, src: result.url, name: result.name }]);
      setMessage('上传成功，点击素材加入轨道');
    } catch (error) { setMessage(error instanceof Error ? error.message : '上传失败'); }
    finally { setBusy(false); }
  }

  function begin(event: PointerEvent<HTMLDivElement>, item: Clip, trackId: string, mode: 'move' | 'left' | 'right') {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(item.id);
    setGesture({ x: event.clientX, clip: item, trackId, mode, timeline });
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!gesture) return;
    const delta = Math.round((event.clientX - gesture.x) / scale);
    const item = gesture.mode === 'move' ? { ...gesture.clip, startFrame: Math.max(0, gesture.clip.startFrame + delta) } : resizeClip(gesture.clip, gesture.mode, delta);
    const overId = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-track]')?.getAttribute('data-track');
    const over = gesture.timeline.tracks.find((track) => track.id === overId && compatible(track, item));
    const destination = gesture.mode === 'move' && over ? over.id : gesture.trackId;
    commit({ tracks: gesture.timeline.tracks.map((track) => ({ ...track, clips: [...track.clips.filter((entry) => entry.id !== item.id), ...(track.id === destination ? [item] : [])].sort((a, b) => a.startFrame - b.startFrame) })) });
  }

  function reorder(from: string, to: string) {
    const tracks = [...timeline.tracks];
    const source = tracks.findIndex((track) => track.id === from);
    const destination = tracks.findIndex((track) => track.id === to);
    if (source < 0 || destination < 0) return;
    tracks.splice(destination, 0, tracks.splice(source, 1)[0]);
    commit({ tracks });
  }

  function numeric(key: 'startFrame' | 'durationFrames' | 'trimStartFrame', value: number) {
    if (!Number.isFinite(value)) return;
    changeClip((item) => ({ ...item, [key]: Math.max(key === 'durationFrames' ? 1 : 0, Math.round(value)) }));
  }

  return <section className="editor-timeline" aria-label="多轨时间线">
    <div className="editor-section-title"><h2>多轨时间线</h2><span>{frame} 帧 / {(frame / project.fps).toFixed(2)} 秒</span></div>
    <div className="editor-toolbar">
      <label className="editor-upload">{busy ? '上传中…' : '上传素材'}<input type="file" accept="video/*,audio/*,image/*" disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <input aria-label="素材 URL" placeholder="https://… 或 /files/uploads/…" value={url} onChange={(event) => setUrl(event.target.value)} />
      <select aria-label="导入素材类型" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="video">视频</option><option value="image">图片</option><option value="audio">音频</option></select>
      <button onClick={() => { if (!/^(https?:\/\/|\/files\/)/i.test(url.trim())) { setMessage('请输入 http(s) 地址或 /files/ 素材路径'); return; } setAssets((old) => [...old, { src: url.trim(), type: kind, name: url.trim().split('/').pop() || 'URL 素材' }]); setUrl(''); setMessage('已导入，点击素材加入轨道'); }}>URL 导入</button>
      <button onClick={() => addClip()}>＋文字层</button>
    </div>
    <div className="editor-toolbar"><span>加入轨道</span><select aria-label="目标轨道" value={target} onChange={(event) => setTarget(event.target.value)}><option value="">自动新建兼容轨道</option>{timeline.tracks.map((track, index) => <option key={track.id} value={track.id}>{index + 1} · {labels[track.type]}</option>)}</select>{(['video', 'audio', 'text'] as const).map((type) => <button key={type} onClick={() => addTrack(type)}>＋{labels[type]}轨</button>)}<label>缩放 <input aria-label="时间线缩放" type="range" min="20" max="160" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label></div>
    {message && <p role="status">{message}</p>}
    {assets.length > 0 && <div className="editor-assets">{assets.map((asset, index) => <button key={index} title={asset.src} onClick={() => addClip(asset)}>＋ {asset.name} · {asset.type === 'image' ? '图片' : labels[asset.type as 'video' | 'audio']}</button>)}</div>}
    <label className="editor-seek">播放头<input aria-label="播放头" type="range" min="0" max={project.durationInFrames - 1} value={Math.min(frame, project.durationInFrames - 1)} onChange={(event) => onSeek(Number(event.target.value))} /></label>
    <p className="editor-help">拖动片段移动时间与兼容轨道；拖动两端裁剪。拖动轨道标题调整层级，后面的轨道在上层。素材默认 5 秒，可调整时长。</p>
    <div className="editor-timeline-scroll"><div style={{ width: total * scale + 150, minWidth: '100%' }}>
      <div className="editor-ruler" style={{ marginLeft: 140, width: total * scale }} onClick={(event) => onSeek(Math.min(project.durationInFrames - 1, Math.max(0, Math.round((event.clientX - event.currentTarget.getBoundingClientRect().left) / scale))))}>{Array.from({ length: Math.ceil(total / project.fps) }, (_, second) => <span key={second} style={{ left: second * zoom }}>{second}s</span>)}</div>
      {timeline.tracks.length === 0 && <p className="editor-help">上传或导入素材，点击“加入”开始剪辑，也可直接添加文字层。</p>}
      {timeline.tracks.map((track, index) => <div className="editor-track" key={track.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragTrack) reorder(dragTrack, track.id); setDragTrack(null); }}>
        <div className="editor-track-label" draggable onDragStart={(event) => { event.dataTransfer.setData('text/plain', track.id); setDragTrack(track.id); }} onDragEnd={() => setDragTrack(null)}><span>{index + 1} · {labels[track.type]}</span><div><button aria-label={`上移轨道 ${index + 1}`} disabled={index === 0} onClick={() => reorder(track.id, timeline.tracks[index - 1].id)}>↑</button><button aria-label={`下移轨道 ${index + 1}`} disabled={index === timeline.tracks.length - 1} onClick={() => reorder(track.id, timeline.tracks[index + 1].id)}>↓</button><button aria-label={`删除轨道 ${index + 1}`} onClick={() => { if (track.clips.length && !window.confirm('删除轨道及其中所有片段？')) return; commit({ tracks: timeline.tracks.filter((item) => item.id !== track.id) }); }}>×</button></div></div>
        <div className="editor-track-lane" data-track={track.id} style={{ width: total * scale }}>
          <div className="editor-playhead" style={{ left: frame * scale }} />
          {track.clips.map((item) => <div key={item.id} className={`editor-clip editor-clip-${item.type}${selected === item.id ? ' selected' : ''}`} style={{ left: item.startFrame * scale, width: Math.max(12, item.durationFrames * scale) }} onPointerDown={(event) => begin(event, item, track.id, 'move')} onPointerMove={move} onPointerUp={() => setGesture(null)} onPointerCancel={() => setGesture(null)} onLostPointerCapture={() => setGesture(null)} tabIndex={0} role="button" aria-label={`选择片段 ${item.text ?? item.src ?? item.type}`} onFocus={() => setSelected(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelected(item.id); }}>
            <div className="editor-trim left" role="button" aria-label="拖动裁剪起点" onPointerDown={(event) => begin(event, item, track.id, 'left')} onPointerMove={move} onPointerUp={() => setGesture(null)} onPointerCancel={() => setGesture(null)} />
            <span>{item.text ?? item.src?.split('/').pop() ?? '素材'}</span>
            <div className="editor-trim right" role="button" aria-label="拖动调整终点" onPointerDown={(event) => begin(event, item, track.id, 'right')} onPointerMove={move} onPointerUp={() => setGesture(null)} onPointerCancel={() => setGesture(null)} />
          </div>)}
        </div>
      </div>)}
    </div></div>
    {clip && <fieldset className="editor-clip-settings"><legend>所选片段</legend>
      <div className="editor-toolbar"><button disabled={frame <= clip.startFrame || frame >= clip.startFrame + clip.durationFrames} onClick={() => commit({ tracks: timeline.tracks.map((track) => ({ ...track, clips: track.clips.flatMap((item) => item.id === clip.id ? splitClip(item, frame, newId()) : [item]) })) })}>在播放头拆分</button><button onClick={() => { commit({ tracks: timeline.tracks.map((track) => ({ ...track, clips: track.clips.filter((item) => item.id !== clip.id) })) }); setSelected(null); }}>删除片段</button></div>
      <div className="editor-settings-grid">{([['startFrame', '开始帧'], ['durationFrames', '时长（帧）'], ['trimStartFrame', '素材裁剪起点（帧）']] as const).map(([key, label]) => <label className="editor-field" key={key}>{label}<input type="number" min={key === 'durationFrames' ? 1 : 0} value={clip[key]} onChange={(event) => numeric(key, Number(event.target.value))} /></label>)}
        {clip.type !== 'text' && <label className="editor-field">素材地址<input value={clip.src ?? ''} onChange={(event) => changeClip((item) => ({ ...item, src: event.target.value }))} /></label>}
        <label className="editor-field">音量 {Math.round(clip.volume * 100)}%<input type="range" min="0" max="1" step="0.01" value={clip.volume} onChange={(event) => changeClip((item) => ({ ...item, volume: Number(event.target.value) }))} /></label>
        {clip.type === 'text' && <>
          <label className="editor-field">文字内容<textarea value={clip.text ?? ''} onChange={(event) => changeClip((item) => ({ ...item, text: event.target.value }))} /></label>
          <label className="editor-field">文字颜色<input type="color" value={String(clip.style?.color ?? '#ffffff')} onChange={(event) => changeClip((item) => ({ ...item, style: { ...item.style, color: event.target.value } }))} /></label>
          {(['fontSize', 'left', 'top'] as const).map((key) => <label className="editor-field" key={key}>{key === 'fontSize' ? '字号（像素）' : key === 'left' ? '横向位置（像素）' : '纵向位置（像素）'}<input type="number" min={key === 'fontSize' ? 1 : undefined} value={Number(clip.style?.[key] ?? (key === 'fontSize' ? project.width * 0.05 : 0))} onChange={(event) => changeClip((item) => ({ ...item, style: { ...item.style, position: 'relative', [key]: key === 'fontSize' ? Math.max(1, Number(event.target.value)) : Number(event.target.value) } }))} /></label>)}
          <label className="editor-field">字体<input list="editor-fonts" value={String(clip.style?.fontFamily ?? 'sans-serif')} onChange={(event) => changeClip((item) => ({ ...item, style: { ...item.style, fontFamily: event.target.value } }))} /></label>
        </>}
        {(['transitionIn', 'transitionOut'] as const).map((key) => <div key={key}><label className="editor-field">{key === 'transitionIn' ? '入场转场' : '出场转场'}<select value={clip[key]?.type ?? 'none'} onChange={(event) => changeClip((item) => ({ ...item, [key]: { type: event.target.value as TransitionType, frames: item[key]?.frames ?? Math.round(project.fps / 2) } }))}><option value="none">无</option><option value="fade">淡入淡出</option><option value="slide-left">水平滑动</option><option value="slide-up">向上滑动</option></select></label><label className="editor-field">转场时长（秒）<input type="number" min="0" step={1 / project.fps} value={Number(((clip[key]?.frames ?? 0) / project.fps).toFixed(3))} onChange={(event) => changeClip((item) => ({ ...item, [key]: { type: item[key]?.type ?? 'fade', frames: Math.max(0, Math.round(Number(event.target.value) * project.fps)) } }))} /></label></div>)}
      </div>
    </fieldset>}
  </section>;
}
