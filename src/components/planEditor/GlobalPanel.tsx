import type { AssetRef } from '../../plan/api';
import type { VideoPlan } from '../../plan/schema';
import { FONT_FAMILIES } from '../../templates/studio-canvas/model';
import { AssetSelect, ColorField, NumberField, RangeField, SelectField, TextField } from './fields';
import { orientationOf, setOrientation, type Orientation } from './logic';

const fontLabels: Record<string, string> = { system: '系统黑体', serif: '衬线', songti: '宋体', kaiti: '楷体', mono: '等宽', rounded: '圆体' };
const themeFields = [['primary', '主色'], ['secondary', '辅色'], ['background', '背景色'], ['text', '文字色']] as const;

export default function GlobalPanel({ plan, assets, onEdit, onUploaded }: {
  plan: VideoPlan;
  assets: AssetRef[];
  onEdit: (change: (plan: VideoPlan) => VideoPlan, group?: string) => void;
  onUploaded: (asset: AssetRef) => void;
}) {
  const fonts = Object.keys(FONT_FAMILIES).map((key) => [key, fontLabels[key] ?? key] as const);
  if (!(plan.style.fontFamily in FONT_FAMILIES)) fonts.push([plan.style.fontFamily, plan.style.fontFamily]);
  const { bgm, voiceover } = plan.audio;
  const audio = (patch: Partial<VideoPlan['audio']>) => (p: VideoPlan): VideoPlan => ({ ...p, audio: { ...p.audio, ...patch } });
  const orientation = orientationOf(plan);
  return <div className="pe-panel-body">
    <TextField label="视频标题" value={plan.title} onChange={(title) => onEdit((p) => ({ ...p, title }), 'title')} />
    <section className="pe-group"><h4>画幅</h4>
      <div className="pe-segment" role="group" aria-label="横竖屏">
        {([['landscape', '横屏 1920×1080'], ['portrait', '竖屏 1080×1920']] as [Orientation, string][]).map(([key, text]) => (
          <button key={key} type="button" aria-pressed={orientation === key} onClick={() => onEdit((p) => setOrientation(p, key))}>{text}</button>
        ))}
      </div>
    </section>
    <section className="pe-group"><h4>主题与字体</h4>
      {themeFields.map(([key, label]) => <ColorField key={key} label={label} value={plan.style.theme[key]} onChange={(value) => onEdit((p) => ({ ...p, style: { ...p.style, theme: { ...p.style.theme, [key]: value } } }), `theme-${key}`)} />)}
      <SelectField label="字体" value={plan.style.fontFamily} options={fonts} onChange={(fontFamily) => onEdit((p) => ({ ...p, style: { ...p.style, fontFamily } }))} />
    </section>
    <section className="pe-group"><h4>背景音乐</h4>
      <AssetSelect label="BGM" kind="audio" value={bgm?.src} assets={assets} onUploaded={onUploaded}
        onChange={(src) => onEdit(src ? audio({ bgm: { volume: 0.3, loop: true, ...bgm, src } }) : (p) => { const { bgm: _drop, ...rest } = p.audio; return { ...p, audio: rest }; })} />
      {bgm && <>
        <RangeField label="BGM 音量" value={bgm.volume} onChange={(volume) => onEdit(audio({ bgm: { ...bgm, volume } }), 'bgm-volume')} />
        <label className="pe-check"><input type="checkbox" checked={bgm.loop} onChange={(event) => onEdit(audio({ bgm: { ...bgm, loop: event.target.checked } }))} />循环播放</label>
      </>}
    </section>
    <section className="pe-group"><h4>配音</h4>
      <AssetSelect label="配音" kind="voiceover" value={voiceover?.src} assets={assets} onUploaded={onUploaded}
        onChange={(src) => onEdit(src ? audio({ voiceover: { volume: 1, startFrame: 0, ...voiceover, src } }) : (p) => { const { voiceover: _drop, ...rest } = p.audio; return { ...p, audio: rest }; })} />
      {voiceover && <>
        <RangeField label="配音音量" value={voiceover.volume} onChange={(volume) => onEdit(audio({ voiceover: { ...voiceover, volume } }), 'voice-volume')} />
        <NumberField label="配音起始（秒）" min={0} step={0.5} value={voiceover.startFrame / plan.format.fps} onChange={(sec) => onEdit(audio({ voiceover: { ...voiceover, startFrame: Math.max(0, Math.round(sec * plan.format.fps)) } }), 'voice-start')} />
      </>}
    </section>
  </div>;
}
