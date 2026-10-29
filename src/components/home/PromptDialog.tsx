import { useEffect, useRef, useState } from 'react';
import type { TemplateMeta } from '../../shared/types';

export default function PromptDialog({ template, onClose }: { template: TemplateMeta; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(template.prompt);
      setFeedback('已复制到剪贴板');
    } catch {
      prompt.current?.focus();
      prompt.current?.select();
      setFeedback('自动复制失败，已选中文本，请手动复制。');
    }
  }

  return (
    <dialog ref={dialog} className="home-prompt" aria-labelledby="prompt-title" onCancel={onClose} onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="home-dialog-body">
        <div className="home-section-heading">
          <div><span className="home-eyebrow">创作起点 / PROMPT</span><h2 id="prompt-title">{template.name}</h2></div>
          <button className="home-icon-button" onClick={onClose} aria-label="关闭 Prompt">×</button>
        </div>
        <p>留住这个灵感，也可以把它改成自己的故事。</p>
        <textarea ref={prompt} readOnly value={template.prompt} aria-label="模板 Prompt" />
        <div className="home-dialog-footer"><span role="status">{feedback}</span><button className="home-primary" onClick={copy}>复制 Prompt</button></div>
      </div>
    </dialog>
  );
}
