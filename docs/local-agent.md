# 本机 Agent 适配层（Claude Code CLI / Codex CLI）

用本机已登录的 `claude` / `codex` 命令行代替 `ANTHROPIC_API_KEY`，为 `/api/plan/optimize`、`/api/plan/refine` 提供 LLM。代码：`server/localAgent.ts`。

## 可行性结论
- **适配方式可行，当前环境的真实成功验收未通过**：两个 CLI 都有非交互模式（`claude -p`、`codex exec`），可经 stdin 传 prompt、用 JSON/输出文件取结果。Codex 的方式与[官方非交互文档](https://learn.chatgpt.com/docs/non-interactive-mode)一致。
- 认证由 CLI 自己管理：Claude 用 `claude auth login` 订阅登录，Codex 用 `codex login` 的 ChatGPT 登录；在这两种登录方式下额度计入各自订阅（[Codex 官方认证说明](https://learn.chatgpt.com/docs/auth)）。CLI 也支持 API 认证，适配层继承当前终端环境，不会改变登录方式；Claude 订阅用户应取消 `ANTHROPIC_API_KEY`，否则 CLI 可能按 API 计费（[Claude 官方说明](https://support.claude.com/en/articles/12304248-manage-api-key-environment-variables-in-claude-code)）。本项目**不读取、不抓取、不保存任何凭据文件**，只是启动子进程；本轮也未检查或修改登录状态。
- 延迟为数秒到数十秒/次（启动 CLI + 模型推理），plan 接口一次最多 3 次调用（含 JSON 修复重试）。**不适合高并发**，内置队列默认并发 1（`LOCAL_AGENT_CONCURRENCY`，最大 2）。
- 使用订阅须遵守 Anthropic / OpenAI 各自的服务条款：仅限个人在本机自用，不要把本服务暴露给他人或做成多用户代理（本服务本来只监听 `127.0.0.1`）。

## 切换方式
环境变量 `LLM_PROVIDER`：

| 值 | 行为 |
|---|---|
| `api` | 用 `ANTHROPIC_API_KEY` 直连 Anthropic API（无 key 则 503 报错） |
| `claude-cli` | 调本机 `claude` |
| `codex-cli` | 调本机 `codex` |
| 未设置 | 自动探测：`ANTHROPIC_API_KEY` → PATH 里的 `claude` → PATH 里的 `codex`；都没有则 503，不再走本地规则 |

页面「AI 引擎」选择与请求体 `provider` 优先于 `LLM_PROVIDER`；指定引擎不可用时报错，不会悄悄换别的。

其他变量：`LOCAL_AGENT_MODEL`（透传给 CLI 的 `--model`）、`LOCAL_AGENT_TIMEOUT_MS`（默认 180000）、`LOCAL_AGENT_CONCURRENCY`（默认 1，最大 2）、`LOCAL_AGENT_CLAUDE_BIN` / `LOCAL_AGENT_CODEX_BIN`（指定可执行文件，测试用）。

```bash
env -u ANTHROPIC_API_KEY LLM_PROVIDER=claude-cli npm run dev  # 或 codex-cli
```

## 命令行示例
```bash
env -u ANTHROPIC_API_KEY npm run ask -- --provider claude "一句话介绍 Remotion"
env -u ANTHROPIC_API_KEY npx tsx scripts/ask-local-agent.ts --provider both "只用一句中文回答：1+1等于几？"
```
`both` 依次调用两者并各自打印；未安装/未登录/超时打印中文提示，仍继续尝试另一 provider。全部成功退出码 0，任一失败退出码 1，用法错误退出码 2。

## 实际调用的命令
- claude：`claude -p --output-format json --no-session-persistence [--system-prompt <system>] [--model m] --tools ""`；prompt 走 stdin；取 JSON 的 `result`，`is_error:true` 视为失败。`allowTools:true` 时不加 `--tools ""`。
- codex：`codex exec --sandbox read-only --skip-git-repo-check --ephemeral --color never -o <临时文件> [--model m] -`；prompt（system 拼在前面）走 stdin；读 `-o` 文件的最后一条消息，随后删除临时目录。`allowTools:true` 才放宽为 `workspace-write`。
- 都是 `spawn(参数数组, shell:false)`；默认 cwd 用 `mkdtemp` 在 `os.tmpdir()` 下为每次调用创建独立空目录，成功或失败后删除；显式指定的 cwd 不删除。超时先 SIGTERM，3 秒后 SIGKILL，收到 `close` 后才报错并释放并发名额，所以超时返回可能比配置值多约 3 秒。超时从进程启动时算，不包含排队。

## 各 provider 限制
- claude：没有 system 以外的结构化多轮接口，多轮被拼成 `[用户]/[助手]` 标记的单个 prompt；`--tools ""` 禁用全部工具；子进程继承当前环境（需要 PATH/HOME 才能找到登录态）。
- codex：没有独立的 system 参数，system 拼在 prompt 前；只读沙箱；输出依赖 `-o` 文件。
- 两者都可能在回复里带 ```json 围栏或前后说明，`plan.ts` 的 `extractJson` 已能容忍（实测见下）。

## 与 plan 接口的对接
`createPlanRouter(env, resolve)` 默认 `resolve = (choice) => resolveProvider(env, choice)`（每次请求读取环境变量）。`LlmFn` 返回 CLI 的文本，plan.ts 照常 `extractJson → parsePlan`，不合法最多修复 2 次；CLI 调用抛错或始终不合法则 `/api/plan/*` 返回 502 和原因（不再降级为本地模板），没有可用引擎返回 503。

## 异常
`LocalAgentError.code`：
- `NOT_INSTALLED`：找不到命令（ENOENT）→「请先安装 … 并运行 claude auth login / codex login」
- `NOT_LOGGED_IN`：输出里出现未登录/认证失败特征 →「请先在终端运行 claude auth login / codex login」
- `TIMEOUT`：超时，已终止子进程
- `EXIT_NONZERO`：非零退出，或 claude 返回 `is_error`；信息含 stderr 前 400 字
- `BAD_OUTPUT`：claude 不是预期 JSON / codex 没写最后一条消息

## 验证记录（2026-10-30，本轮返工）

根因：真实 CLI 尚未进入可用推理链路——Claude 的网络连接被拒绝，Codex 的 app-server 初始化被权限拒绝；不是缺少交付文件或 TypeScript 错误。仅凭这些报错不能断言具体是哪条代理或系统策略所致，本轮没有读取配置或凭据来绕过限制。

### 修复前复现

- `npm run typecheck && ls server/localAgent.ts scripts/ask-local-agent.ts docs/local-agent.md`：退出码 0，三个文件均存在；`server/localAgent.test.ts` 也实际存在。
- `claude --version` 为 `2.1.309`，`codex --version` 为 `codex-cli 0.164.0`；两者 `--help` / `codex exec --help` 确认原命令参数可用。`claude auth --help` 确认登录命令应为 `claude auth login`。
- `env -u ANTHROPIC_API_KEY npx tsx scripts/ask-local-agent.ts --provider both '只用一句中文回答：1+1等于几？'`：退出码 1。Claude 原始关键报错：`API Error: Connection refused — a firewall or proxy may be blocking it (ECONNREFUSED)`；Codex：`Error: failed to initialize in-process app-server client: Operation not permitted (os error 1)`。
- 单独第一次运行 `node --import tsx --test server/localAgent.test.ts`：11/12 通过，超时测试尚未创建 `stubborn.pid` 就到达 1.5 秒限时，报 ENOENT；原测试重跑可通过，属于启动时序问题。保留测试并使用当前 Node 的绝对路径启动假 CLI，给予 5 秒启动预算，仍验证 TIMEOUT 和真实进程死亡。
- 新增回归测试（实现修改前运行）：0/2 通过；两次默认 cwd 相同，且超时后下一请求读到 `previous-alive`。实现确有临时目录复用和过早释放并发名额的问题。

### 本轮修复及自动验收

只修改 `server/localAgent.ts`、`server/localAgent.test.ts`、`scripts/ask-local-agent.ts` 和本文件、README；没有修改 plan 路由、渲染逻辑、依赖或 PROJECT.md。

修复：超时等待 SIGTERM/SIGKILL 回收完成后再释放队列；每次调用独立临时 cwd 并在 finally 清理；直接调用和示例脚本也读取 `LOCAL_AGENT_TIMEOUT_MS` / `LOCAL_AGENT_MODEL`；both 任一失败返回非零，避免部分成功被误判为验收通过；纠正 Claude 登录提示。

```bash
npm run typecheck && ls server/localAgent.ts scripts/ask-local-agent.ts docs/local-agent.md
node --import tsx --test $(rg --files src server -g '*.test.ts' -g '*.test.tsx')
```

结果：验收命令退出码 0；全部 **74 项测试通过，0 失败、0 跳过**（修复前完整测试为 69/69，本轮新增 5 项）。适配层 17 项测试覆盖成功解析、工具/沙箱参数、未登录、BAD_OUTPUT、CLI 缺失、非零退出、超时与 SIGKILL、特殊字符不经 shell、并发 1/2 与封顶、临时目录清理、多轮、环境选项、两 provider 的围栏方案解析、示例脚本部分失败退出码。这些测试用假 CLI，不算真实模型成功证据。

### 修复后真实调用与后端

快速复测命令：

```bash
env -u ANTHROPIC_API_KEY LOCAL_AGENT_TIMEOUT_MS=15000 \
  npx tsx scripts/ask-local-agent.ts --provider both '只用一句中文回答：1+1等于几？'
```

退出码 1，仍没有有效模型响应：

```text
=== claude ===
[TIMEOUT] claude 调用超过 15 秒未返回，已终止。
=== codex ===
[EXIT_NONZERO] codex 执行失败（退出码 1）
Error: failed to initialize in-process app-server client: Operation not permitted (os error 1)
```

分别用以下配置启动后端，健康检查返回 200 后用 curl 请求；两次调用都确实删除了子进程环境中的 `ANTHROPIC_API_KEY`，没有设置假 CLI 路径：

```bash
env -u ANTHROPIC_API_KEY PORT=3299 LLM_PROVIDER=claude-cli \
  LOCAL_AGENT_TIMEOUT_MS=15000 node --import tsx server/index.ts
# 第二次换为 LLM_PROVIDER=codex-cli；先关闭自己启动的前一个后端。
curl --fail-with-body --max-time 40 -sS -X POST \
  http://127.0.0.1:3299/api/plan/optimize \
  -H 'Content-Type: application/json' \
  --data '{"prompt":"制作咖啡店开业宣传视频","durationSec":10,"orientation":"landscape","assets":[]}'
```

| provider | curl 结果 | 用时 | 实际响应 |
|---|---|---|---|
| claude-cli | 退出码 0、HTTP 200 | 15721ms | `usedLLM:false`；warnings 含 `调用超过 15 秒未返回` 和 `已降级为本地规则生成` |
| codex-cli | 退出码 0、HTTP 200 | 4448ms | `usedLLM:false`；warnings 含上述 app-server 权限错误和降级原因 |

两者都返回 3 场景、合计 300 帧、1920×1080/30fps 的本地方案。**HTTP 200 和本地方案不代表 LLM 验收通过。** 两个本次启动的后端均已 SIGTERM 并等待 close，3299 无监听；未占用默认端口或终止外部进程，未创建项目、上传或渲染数据。

三类异常均已验证：NOT_INSTALLED（假 CLI 缺失）、EXIT_NONZERO（假 CLI 退出 3，以及真实 Codex 权限错误）、TIMEOUT（假 CLI 忽略 SIGTERM 后被 SIGKILL，以及真实 Claude 15 秒超时）。

尚未完成：`--provider both` 两个真实成功响应，以及无 API key 下两个 provider 各一次真实 `usedLLM:true`。需在允许 CLI 正常初始化、访问模型服务的本机终端重跑，不能用假 CLI 或降级结果替代；没有生成/保存 API key，没有修改或抓取凭据。

### 补充：取消静默降级后的实测（PORT=3218，沙箱内）
上表是取消降级之前的记录；现在 AI 失败返回错误而不是本地方案。同样在沙箱内（外网被拒、codex 不能读 `~/.codex/config.toml`）重测：`GET /api/plan/providers` 显示 claude、codex 在 PATH 中可用、api 不可用；`provider:"claude"` 的 optimize 等满 180 秒后 **502**（`claude 调用超过 180 秒未返回…`）；`provider:"codex"` 立即 **502**（config.toml 权限错误）；`provider:"api"` **503**（未设置 ANTHROPIC_API_KEY）。均没有返回本地模板。真实的 `usedLLM:true` 仍需在普通终端验证。
