// LLM 调用抽象：plan.ts 只依赖 LlmFn，测试可注入假实现。默认用 fetch 直连 Anthropic Messages API（不引入 SDK 依赖）。
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type LlmFn = (request: { system: string; messages: LlmMessage[] }) => Promise<string>;

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** 没有 ANTHROPIC_API_KEY 时返回 null，调用方应降级为本地生成。Key 只从环境变量读取。 */
export function createAnthropicLlm(env: NodeJS.ProcessEnv = process.env): LlmFn | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const model = env.LLM_MODEL?.trim() || DEFAULT_MODEL;
  return async ({ system, messages }) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 8000, system, messages }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Anthropic API 返回 ${response.status}`);
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('');
    if (!text) throw new Error('模型没有返回文本');
    return text;
  };
}
