import type { CreateMode } from '../../lib/planApi';

const options: { value: CreateMode; label: string; hint: string }[] = [
  { value: 'auto', label: '一键全自动', hint: '生成方案后直接创建项目并进入编辑器' },
  { value: 'step', label: '分步确认', hint: '先查看并修改方案，再确认生成' },
];

export default function ModeSwitch({ mode, onChange }: { mode: CreateMode; onChange: (mode: CreateMode) => void }) {
  return (
    <div className="create-mode" role="group" aria-label="自动化程度">
      <span className="create-label">自动化程度</span>
      <div className="create-segment">
        {options.map((o) => <button key={o.value} type="button" aria-pressed={mode === o.value} title={o.hint} onClick={() => onChange(o.value)}>{o.label}</button>)}
      </div>
      <small>{options.find((o) => o.value === mode)?.hint}</small>
    </div>
  );
}
