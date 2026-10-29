import { z } from 'zod';
import type { ProjectData } from '../../shared/types';
import { MAX_HEIGHT, MAX_WIDTH } from '../../shared/types';
import type { TemplateDef } from '../../templates/registry';
import { fieldInfo, inputProps } from '../../lib/editor';

function SchemaField({ name, schema, value, onChange }: { name: string; schema: z.ZodTypeAny; value: unknown; onChange: (value: unknown) => void }) {
  const info = fieldInfo(schema);
  const type = info.schema;
  const title = schema.description && schema.description !== '__remotion-color' ? schema.description : name;
  if (type instanceof z.ZodObject) return <fieldset><legend>{title}</legend>{Object.entries(type.shape as Record<string, z.ZodTypeAny>).map(([key, child]) => <SchemaField key={key} name={key} schema={child} value={(value as Record<string, unknown> | undefined)?.[key]} onChange={(next) => onChange({ ...(value as object ?? {}), [key]: next })} />)}</fieldset>;
  const invalid = !schema.safeParse(value).success;
  let control;
  if (info.color) control = <div className="editor-color"><input aria-label={`${title}拾色器`} type="color" value={typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(event) => onChange(event.target.value)} /><input aria-label={title} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} /></div>;
  else if (type instanceof z.ZodEnum) control = <select aria-label={title} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>{type.options.map((option: string) => <option key={option}>{option}</option>)}</select>;
  else if (type instanceof z.ZodBoolean) control = <input aria-label={title} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />;
  else if (type instanceof z.ZodNumber) control = <input aria-label={title} type="number" min={type.minValue ?? undefined} max={type.maxValue ?? undefined} step={type.isInt ? 1 : 'any'} value={typeof value === 'number' ? value : ''} onChange={(event) => { if (event.target.value !== '') onChange(Number(event.target.value)); }} />;
  else if (type instanceof z.ZodString) control = <><input aria-label={title} type="text" list={/font|字体/i.test(name + title) ? 'editor-fonts' : undefined} value={String(value ?? '')} placeholder={/url|src|素材|地址/i.test(name + title) ? 'https://… 或 /files/uploads/…' : undefined} onChange={(event) => onChange(event.target.value)} /></>;
  else if (type instanceof z.ZodArray) {
    const values = Array.isArray(value) ? value : [];
    return <fieldset><legend>{title}</legend>{values.map((item, index) => <SchemaField key={index} name={`${name} ${index + 1}`} schema={type.element} value={item} onChange={(next) => onChange(values.map((old, i) => i === index ? next : old))} />)}<small>列表元素由模板定义</small></fieldset>;
  } else return null;
  return <label className="editor-field"><span>{title}</span>{control}{invalid && <small role="alert">请填写符合模板要求的值</small>}</label>;
}

export default function PropsForm({ project, template, onChange }: { project: ProjectData; template: TemplateDef; onChange: (change: (project: ProjectData) => ProjectData) => void }) {
  const shape = fieldInfo(template.schema).schema;
  const config = (key: 'width' | 'height' | 'fps' | 'durationInFrames', value: number, max = Number.MAX_SAFE_INTEGER) => {
    if (Number.isFinite(value)) onChange((old) => ({ ...old, [key]: Math.min(max, Math.max(1, Math.round(value))) }));
  };
  const validation = template.schema.safeParse(inputProps(project));
  return <aside className="editor-props" aria-label="参数面板"><h2>作品参数</h2>
    <label className="editor-field">项目名称<input value={project.name} onChange={(event) => onChange((old) => ({ ...old, name: event.target.value }))} /></label>
    {shape instanceof z.ZodObject && Object.entries(shape.shape as Record<string, z.ZodTypeAny>).filter(([key]) => key !== 'timeline').map(([key, schema]) => <SchemaField key={key} name={key} schema={schema} value={project.props[key]} onChange={(value) => onChange((old) => ({ ...old, props: { ...old.props, [key]: value } }))} />)}
    <datalist id="editor-fonts"><option value="PingFang SC" /><option value="Microsoft YaHei" /><option value="sans-serif" /><option value="serif" /><option value="monospace" /></datalist>
    <label className="editor-field">时长（秒）<input type="number" min={1 / project.fps} step={1 / project.fps} disabled={project.templateId === 'blank-timeline'} value={Number((project.durationInFrames / project.fps).toFixed(3))} onChange={(event) => config('durationInFrames', Number(event.target.value) * project.fps)} /></label>
    {project.templateId === 'blank-timeline' && <small>时长随时间线片段自动更新</small>}
    <label className="editor-field">帧率（fps）<input type="number" min="1" max="120" value={project.fps} onChange={(event) => config('fps', Number(event.target.value), 120)} /></label>
    <label className="editor-field">分辨率<select value={['1920x1080', '1280x720', '1080x1080', '720x1080'].includes(`${project.width}x${project.height}`) ? `${project.width}x${project.height}` : 'custom'} onChange={(event) => { if (event.target.value === 'custom') return; const [width, height] = event.target.value.split('x').map(Number); onChange((old) => ({ ...old, width, height })); }}><option value="1920x1080">横屏 · 1920 × 1080</option><option value="1280x720">横屏 · 1280 × 720</option><option value="1080x1080">方形 · 1080 × 1080</option><option value="720x1080">竖屏 · 720 × 1080</option><option value="custom">自定义（下方输入）</option></select></label>
    <div className="editor-row"><label className="editor-field">宽<input type="number" min="1" max={MAX_WIDTH} value={project.width} onChange={(event) => config('width', Number(event.target.value), MAX_WIDTH)} /></label><label className="editor-field">高<input type="number" min="1" max={MAX_HEIGHT} value={project.height} onChange={(event) => config('height', Number(event.target.value), MAX_HEIGHT)} /></label></div>
    {!validation.success && <p className="editor-error" role="alert">{validation.error.issues.map((issue) => issue.path.join('.')).join('、')}：参数无效，修正后可保存和导出。</p>}
  </aside>;
}
