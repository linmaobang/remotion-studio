# 本机 Agent 适配层（Claude Code CLI / Codex CLI）

用本机已登录的 `claude` / `codex` 命令行代替 `ANTHROPIC_API_KEY`，为 `/api/plan/optimize`、`/api/plan/refine` 提供 LLM。代码：`server/localAgent.ts`。

## 可行性结论
- **可行**：两个 CLI 都有非交互模式（`claude -p`、`codex exec`），可经 stdin 传 prompt、用 JSON/输出文件取结果。
- 认证由 CLI 自己管理：claude 用订阅登录、codex 用 ChatGPT 登录；额度计入各自订阅，而不是 API 计费。本项目**不读取、不抓取、不保存任何凭据**，只是启动子进程。
- 延迟为数秒到数十秒/次（启动 CLI + 模型推理），plan 接口一次最多 3 次调用（含 JSON 修复重试）。**不适合高并发**，内置队列默认并发 1（`LOCAL_AGENT_CONCURRENCY`，最大 2）。
- 使用订阅须遵守 Anthropic / OpenAI 各自的服务条款：仅限个人在本机自用，不要把本服务暴露给他人或做成多用户代理（本服务本来只监听 `127.0.0.1`）。

## 切换方式
环境变量 `LLM_PROVIDER`：

| 值 | 行为 |
|---|---|
| `api` | 用 `ANTHROPIC_API_KEY` 直连 Anthropic API（无 key 则降级本地规则） |
| `claude-cli` | 调本机 `claude` |
| `codex-cli` | 调本机 `codex` |
| 未设置 | 有 `ANTHROPIC_API_KEY` → api；否则无 LLM，plan 接口走本地规则（原行为） |

其他变量：`LOCAL_AGENT_MODEL`（透传给 CLI 的 `--model`）、`LOCAL_AGENT_TIMEOUT_MS`（默认 180000）、`LOCAL_AGENT_CONCURRENCY`（默认 1，最大 2）、`LOCAL_AGENT_CLAUDE_BIN` / `LOCAL_AGENT_CODEX_BIN`（指定可执行文件，测试用）。

```bash
LLM_PROVIDER=claude-cli npm run dev      # 或 codex-cli
```

## 命令行示例
```bash
npm run ask -- --provider claude "一句话介绍 Remotion"
npx tsx scripts/ask-local-agent.ts --provider both "只用一句中文回答：1+1等于几？"
```
`both` 依次调用两者并各自打印；未安装/未登录/超时只打印中文提示，不崩溃（两者都失败时退出码 1）。

## 实际调用的命令
- claude：`claude -p --output-format json --no-session-persistence [--system-prompt <system>] [--model m] --tools ""`；prompt 走 stdin；取 JSON 的 `result`，`is_error:true` 视为失败。`allowTools:true` 时不加 `--tools ""`。
- codex：`codex exec --sandbox read-only --skip-git-repo-check --ephemeral --color never -o <临时文件> [--model m] -`；prompt（system 拼在前面）走 stdin；读 `-o` 文件的最后一条消息，随后删除临时目录。`allowTools:true` 才放宽为 `workspace-write`。
- 都是 `spawn(参数数组, shell:false)`；默认 cwd 为 `os.tmpdir()/local-agent-cwd`（空目录）；超时先 SIGTERM，3 秒后 SIGKILL。

## 各 provider 限制
- claude：没有 system 以外的结构化多轮接口，多轮被拼成 `[用户]/[助手]` 标记的单个 prompt；`--tools ""` 禁用全部工具；子进程继承当前环境（需要 PATH/HOME 才能找到登录态）。
- codex：没有独立的 system 参数，system 拼在 prompt 前；只读沙箱；输出依赖 `-o` 文件。
- 两者都可能在回复里带 ```json 围栏或前后说明，`plan.ts` 的 `extractJson` 已能容忍（实测见下）。

## 与 plan 接口的对接
`createPlanRouter` 默认 `getLlm = () => resolveLlm()`（每次请求读取环境变量）。`LlmFn` 返回 CLI 的文本，plan.ts 照常 `extractJson → parsePlan`，不合法最多修复 2 次；CLI 调用抛错则降级本地规则，响应 `usedLLM:false`，错误原因进 `warnings`。

## 异常
`LocalAgentError.code`：
- `NOT_INSTALLED`：找不到命令（ENOENT）→「请先安装 … 并运行 claude login / codex login」
- `NOT_LOGGED_IN`：输出里出现未登录/认证失败特征 →「请先在终端运行 claude login / codex login」
- `TIMEOUT`：超时，已终止子进程
- `EXIT_NONZERO`：非零退出，或 claude 返回 `is_error`；信息含 stderr 前 400 字
- `BAD_OUTPUT`：claude 不是预期 JSON / codex 没写最后一条消息

## 验证记录（2026-10-30）
**自动测试**：`server/localAgent.test.ts` 用临时目录里的假 CLI 脚本覆盖：成功解析与参数（`--tools ""`、`--system-prompt`、codex 只读沙箱与 `workspace-write`、临时文件清理）、`is_error`、NOT_LOGGED_IN、BAD_OUTPUT、CLI 缺失、非零退出、超时并杀死忽略 SIGTERM 的进程、含 `$(…)`/反引号的 prompt 不被 shell 解释、并发上限 1/2/封顶 2、多轮拼接、`resolveLlm` 选择。

**真实 CLI 调用——未成功（环境限制，非伪造结论）**：在本次开发环境（带网络与文件沙箱的 Claude Code 会话内）：
- `claude -p`：`claude auth status` 显示已登录，但调用 176 秒后返回 `is_error`：`API Error: Connection refused … (ECONNREFUSED)`（沙箱禁止外网）。示例脚本里则表现为 180 秒 `TIMEOUT`（这同时真实验证了超时路径）。
- `codex exec`：`Error loading config.toml: Failed to read config file ~/.codex/config.toml: Operation not permitted`（沙箱禁止读取），示例脚本表现为 `EXIT_NONZERO` 并带该原因。
- 因此 `--provider both` 的真实成功响应、以及 `LLM_PROVIDER=claude-cli|codex-cli` 的真实 `usedLLM:true` **没有拿到**，需要在普通终端（非沙箱）重跑上面的命令验证。

**后端对接（PORT=3299，验证后已关闭进程，均未设置 ANTHROPIC_API_KEY）**：
- `LLM_PROVIDER=claude-cli` + `LOCAL_AGENT_CLAUDE_BIN` 指向假 CLI（返回带 ```json 围栏与说明文字的方案）：`POST /api/plan/optimize` → `usedLLM:true`，围栏被正确解析。仅证明接线与解析，不是真实 Claude。
- `LLM_PROVIDER=codex-cli`（真实 codex，受沙箱限制失败）：返回 200、`usedLLM:false`，`warnings` 含「LLM 调用失败：codex 执行失败…已降级为本地规则生成」，服务不崩。

**三种异常**：NOT_INSTALLED / 非零退出 / TIMEOUT 均有自动测试；真实环境另见上面的 TIMEOUT 与 EXIT_NONZERO 实例。
