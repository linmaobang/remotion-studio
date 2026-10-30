// 用法：npx tsx scripts/ask-local-agent.ts --provider claude|codex|both "问题"
import { LocalAgentError, runLocalAgent, type LocalProvider } from '../server/localAgent';

const args = process.argv.slice(2);
const flag = args.indexOf('--provider');
const choice = flag >= 0 ? args.splice(flag, 2)[1] : 'both';
const question = args.join(' ').trim();
if (!question || !['claude', 'codex', 'both'].includes(choice)) {
  console.error('用法：npx tsx scripts/ask-local-agent.ts --provider claude|codex|both "问题"');
  process.exit(2);
}

const providers: LocalProvider[] = choice === 'both' ? ['claude', 'codex'] : [choice as LocalProvider];
let failed = 0;
for (const provider of providers) {
  console.log(`\n=== ${provider} ===`);
  try {
    const result = await runLocalAgent({ provider, prompt: question });
    console.log(result.text);
    console.log(`（耗时 ${(result.durationMs / 1000).toFixed(1)} 秒）`);
  } catch (error) {
    failed++;
    if (error instanceof LocalAgentError) console.error(`[${error.code}] ${error.message}`);
    else console.error(error instanceof Error ? error.message : String(error));
  }
}
process.exit(failed === providers.length ? 1 : 0);
