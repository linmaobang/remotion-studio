import { useState } from 'react';
import { refinePlan } from '../../lib/planApi';
import type { VideoPlan } from '../../plan/schema';

export default function AiRefine({ plan, onApply }: { plan: VideoPlan; onApply: (plan: VideoPlan) => void }) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await refinePlan({ plan, instruction: text });
      onApply(response.plan);
      setInstruction('');
      const extra = [!response.usedLLM ? '后端未使用大模型，仅做了本地调整' : '', ...response.warnings].filter(Boolean);
      setNote({ ok: true, text: `已应用修改，可用撤销还原。${extra.length ? `（${extra.join('；')}）` : ''}` });
    } catch (reason) {
      setNote({ ok: false, text: reason instanceof Error && reason.message ? reason.message : '修改失败，请稍后重试。' });
    } finally { setBusy(false); }
  }
  return <section className="pe-ai" aria-label="用 AI 修改">
    <h3>✨ 用 AI 修改</h3>
    <textarea aria-label="修改指令" rows={2} value={instruction} disabled={busy} placeholder="例如：把第二个场景改成列表，整体色调换成蓝色" onChange={(event) => setInstruction(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void run(); } }} />
    <button type="button" className="pe-primary" disabled={busy || !instruction.trim()} onClick={() => void run()}>{busy ? 'AI 修改中…' : '用 AI 修改'}</button>
    {note && <p className={note.ok ? 'pe-note' : 'pe-error'} role={note.ok ? 'status' : 'alert'}>{note.text}</p>}
  </section>;
}
