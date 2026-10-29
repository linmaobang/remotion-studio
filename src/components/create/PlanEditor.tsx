import { useState } from 'react';
import { createId, planDuration, type Scene, type VideoPlan } from '../../plan/schema';

const kindNames: Record<Scene['kind'], string> = { title: '标题', 'image-text': '图文', list: '要点', stat: '数据', cta: '行动号召' };
const colorKeys = [['primary', '主色'], ['secondary', '辅色'], ['background', '背景'], ['text', '文字']] as const;

/** 每种场景的「正文」字段统一成一个多行文本。 */
function bodyOf(scene: Scene): { label: string; value: string } {
  switch (scene.kind) {
    case 'title': return { label: '副标题', value: scene.subtitle ?? '' };
    case 'image-text': return { label: '正文', value: scene.body };
    case 'list': return { label: '要点（每行一条）', value: scene.items.join('\n') };
    case 'stat': return { label: '数据（每行「数值 | 说明」）', value: scene.stats.map((s) => `${s.value} | ${s.label}`).join('\n') };
    case 'cta': return { label: '按钮文字', value: scene.buttonText };
  }
}

function withBody(scene: Scene, value: string): Scene {
  switch (scene.kind) {
    case 'title': return { ...scene, subtitle: value };
    case 'image-text': return { ...scene, body: value };
    case 'list': return { ...scene, items: value.split('\n').filter((l) => l.trim()).slice(0, 8) };
    case 'stat': return { ...scene, stats: value.split('\n').filter((l) => l.trim()).slice(0, 4).map((l) => { const [v, ...rest] = l.split('|'); return { value: v.trim() || '—', label: rest.join('|').trim() }; }) };
    case 'cta': return { ...scene, buttonText: value };
  }
}

interface Props {
  plan: VideoPlan;
  disabled: boolean;
  onChange: (plan: VideoPlan) => void;
  onRefine: (instruction: string) => void;
}

export default function PlanEditor({ plan, disabled, onChange, onRefine }: Props) {
  const [instruction, setInstruction] = useState('');
  const fps = plan.format.fps;
  const setScenes = (scenes: Scene[]) => onChange({ ...plan, scenes });
  const patch = (i: number, scene: Scene) => setScenes(plan.scenes.map((s, j) => (j === i ? scene : s)));
  const move = (i: number, d: number) => {
    const scenes = [...plan.scenes];
    [scenes[i], scenes[i + d]] = [scenes[i + d], scenes[i]];
    setScenes(scenes);
  };
  const add = () => setScenes([...plan.scenes, { id: createId('scene'), kind: 'title', title: '新场景', subtitle: '', durationFrames: fps * 3, transition: { type: 'fade', frames: 15 } }]);

  return (
    <fieldset className="create-plan" disabled={disabled}>
      <legend className="create-label">确认方案 · 共 {plan.scenes.length} 个场景 · {(planDuration(plan) / fps).toFixed(1)} 秒</legend>
      <label className="create-field">标题<input value={plan.title} maxLength={80} onChange={(e) => onChange({ ...plan, title: e.target.value })} /></label>
      <label className="create-field">风格 / 氛围<input value={plan.style.mood ?? ''} maxLength={80} onChange={(e) => onChange({ ...plan, style: { ...plan.style, mood: e.target.value } })} /></label>
      <div className="create-colors">
        {colorKeys.map(([key, name]) => (
          <label key={key}>{name}<input type="color" value={plan.style.theme[key]} onChange={(e) => onChange({ ...plan, style: { ...plan.style, theme: { ...plan.style.theme, [key]: e.target.value } } })} /></label>
        ))}
      </div>
      <ol className="create-scenes">
        {plan.scenes.map((scene, i) => {
          const body = bodyOf(scene);
          return (
            <li key={scene.id} className="create-scene">
              <div className="create-scene-head">
                <b>{i + 1}. {kindNames[scene.kind]}</b>
                <label>时长(秒)<input type="number" min={1} max={30} step={0.5} value={+(scene.durationFrames / fps).toFixed(1)} onChange={(e) => { const sec = Number(e.target.value); if (sec > 0) patch(i, { ...scene, durationFrames: Math.max(1, Math.round(sec * fps)) }); }} /></label>
                <span className="create-scene-tools">
                  <button type="button" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" aria-label="下移" disabled={i === plan.scenes.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" aria-label="删除场景" disabled={plan.scenes.length <= 1} onClick={() => setScenes(plan.scenes.filter((_, j) => j !== i))}>删除</button>
                </span>
              </div>
              <label className="create-field">文案标题<input value={scene.title} onChange={(e) => patch(i, { ...scene, title: e.target.value })} /></label>
              <label className="create-field">{body.label}{scene.kind === 'title' || scene.kind === 'cta' ? <input value={body.value} onChange={(e) => patch(i, withBody(scene, e.target.value))} /> : <textarea rows={3} value={body.value} onChange={(e) => patch(i, withBody(scene, e.target.value))} />}</label>
            </li>
          );
        })}
      </ol>
      <button type="button" className="create-ghost" onClick={add}>+ 添加场景</button>
      <div className="create-refine">
        <label className="create-field">用自然语言让 AI 修改方案<textarea rows={2} value={instruction} placeholder="例如：把第二个场景改成数据对比，整体更活泼" onChange={(e) => setInstruction(e.target.value)} /></label>
        <button type="button" className="create-ghost" disabled={!instruction.trim()} onClick={() => { onRefine(instruction.trim()); setInstruction(''); }}>让 AI 修改</button>
      </div>
    </fieldset>
  );
}
