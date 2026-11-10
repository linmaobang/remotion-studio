# remotion-studio

## 项目简介
基于 Remotion 官方包搭建的本机可视化视频创作网站：可浏览模板、实时预览、修改参数、做简单剪辑并导出 MP4，也可从空白画布自由创作多场景视频。同时提供「文字需求 → 视频」闭环：输入需求（可附图片/音乐/配音）→ 后端调用 Anthropic API 或本机 Claude Code/Codex CLI 优化为 VideoPlan 分镜方案（AI 引擎自动探测：API Key → 本机 claude → codex；不可用或失败时明确报错，不再静默套用固定模板；仅 `PLAN_ALLOW_HEURISTIC=1` 时允许显式降级）→ 在方案编辑器中预览、拖拽调整 → 导出带音轨的 MP4。同一仓库包含 Vite + React + TypeScript 前端与 Express 渲染服务，代码位于 `~/ClaudeCode/projects/remotion-studio/`。仅本地个人学习/自用，服务只监听 `127.0.0.1`，本期不做线上部署。首页版式借鉴「分类 + 卡片 + 标签 + Prompt」信息架构，视觉与内容自行设计。

## 如何运行与验证
- 安装与启动：`npm install` 后 `npm run dev`。前端 Vite `http://127.0.0.1:5173`（已设 `strictPort`），后端 Express `http://127.0.0.1:3217`，Vite 将 `/api` 与 `/files` 代理到后端；`PORT=3218 npm run dev` 可同步覆盖后端与代理端口。
- 可选 LLM：`ANTHROPIC_API_KEY` 配置后 `/api/plan/*` 可调用 Claude；`LLM_PROVIDER` 可选 `api`/`claude-cli`/`codex-cli`，未设置时按 API Key → PATH 中的 `claude` → `codex` 自动探测（不读凭据文件）；页面「AI 引擎」选择和请求体 `provider` 优先于 `LLM_PROVIDER`。`LLM_MODEL` 默认 `claude-sonnet-5-5`，每次请求时读取；密钥只从环境变量读取，不落盘。
- 降级策略：默认不静默降级，无可用引擎返回 503，AI 调用失败返回 502 并带原因，页面显示错误可重试；仅 `PLAN_ALLOW_HEURISTIC=1` 时允许退回本地固定模板，响应明确标注且页面红字提示。
- CLI 模式：`LLM_PROVIDER=claude-cli` 或 `codex-cli` 调用本机已登录 CLI；使用 Claude 订阅时需 `env -u ANTHROPIC_API_KEY`，避免改走 API 计费。可选 `LOCAL_AGENT_MODEL`、`LOCAL_AGENT_TIMEOUT_MS`（默认 180000 毫秒）、`LOCAL_AGENT_CONCURRENCY`（默认 1，最大 2）。`npm run ask -- --provider both "问题"` 可测两者，任一失败退出码为 1；完整命令见 `docs/local-agent.md`。
- 真实 AI 验证现状：2026-10-31、11-03、11-04、11-06、11-07、11-08 在 agent 沙箱复测 claude/codex optimize 均返回 502，始终未见 `usedLLM:true`。2026-11-08 用 PORT=3299、`LOCAL_AGENT_TIMEOUT_MS=150000` 请求 `{"prompt":"30秒咖啡店宣传片"}`：claude-cli 耗时约 151 秒返回 502（超时终止），codex-cli 立即 502（`could not create PATH aliases` / `failed to initialize in-process app-server client: Operation not permitted`）；api 引擎因环境无 `ANTHROPIC_API_KEY` 未测。需在本人普通终端重跑：`env -u ANTHROPIC_API_KEY PORT=3299 LLM_PROVIDER=claude-cli npx tsx server/index.ts`，另开终端 `curl -s -m 180 -X POST localhost:3299/api/plan/optimize -H 'content-type: application/json' -d '{"prompt":"30秒咖啡店宣传片"}'`，再把 `LLM_PROVIDER` 换成 `codex-cli` 重复，记录耗时、`usedLLM` 与场景标题。2026-11-03 记录见 `docs/real-ai-test-2026-11-03.md`，11-06 响应与日志在 `/tmp/remotion-real-ai-20261106-is7wgnd5/`，11-08 完整响应、HTTP 头、耗时与后端日志在 `/tmp/remotion-real-ai-20261108-3exa1een/`。
- 上传 mime 验证：`npm run dev` 后执行 `curl -F "file=@x.mp3;type=application/octet-stream" http://127.0.0.1:5173/api/upload`，返回的 `mime` 应为 `audio/mpeg`。
- 改过模板或后端代码后需重启后端：服务端 bundle 按进程缓存，旧进程会继续使用旧渲染包。
- 目录效果检查：`npm run dev` 后打开首页 `/`、`/create`、`/editor/<id>`，看控制台与网络面板；首页应有标签页图标且无 404，编辑器页在开发模式下会有一条预期的 `GET /api/projects/<id>` 的 `net::ERR_ABORTED`（见关键决策）。
- 其他脚本：`npm run typecheck`、`npm run build`；项目没有 `npm test` 脚本，测试用 `node --import tsx --test $(find src server -name '*.test.ts' -o -name '*.test.tsx')`。
- 已通过：2026-10-30 build 与 81 个测试；端到端「上传 → 优化 → 建项目 → 渲染」跑通（当时无 key、走本地规则兜底），导出 10 秒 1080p h264+aac MP4。2026-11-01 上传 mime 修复后 src 与 server 全部测试 81 个通过、typecheck 通过，未跑 build。2026-11-10 favicon 修复后 `npm run build` 通过、81 个测试通过。
- 2026-11-05 ai-video 竖屏 + BGM + 配音真实渲染验证：`samplePlan()` 改 1080×1920/30fps，BGM 为 330Hz 正弦 mp3（音量 0.5、loop），配音为 880Hz 正弦 wav（startFrame 30）；经 `POST /api/upload` → `POST /api/projects`（templateId `ai-video`）→ `POST /api/render` 轮询到 done（PORT=3217，约 1 分钟）。产物 `data/renders/3ce9df0c-3fe8-45b1-a897-c38864dfe2e7.mp4`；ffprobe：h264 1080×1920、30fps、900 帧、30.0 秒，另有 aac 音轨 30.016 秒；volumedetect mean -27.8 dB、max -17.6 dB；带通分析 330Hz 全程存在，880Hz 仅在约 1–7 秒窗口出现；抽 3 帧，目视 8 秒与 20 秒两帧布局正常。渲染时项目的 width/height/fps/durationInFrames 需与 plan 一致。
- ai-video 用 samplePlan 真实渲染 1920×1080、30fps、900 帧 h264 MP4，5 个场景抽帧目视正常；studio-canvas 两场景样例真实渲染成功；首页创建、加图层、两场景、导出 MP4 成功。首次导出需联网下载 Chrome Headless Shell（Remotion 自动完成，缓存于 `node_modules/.remotion`）。
- 端口被占用时先用 `lsof -nP -iTCP:端口 -sTCP:LISTEN` 确认占用进程，不要按名字批量杀进程（早期按名字 `pkill` 曾误杀其他项目进程）。

## 关键决策
- 控制台 404 的来源是浏览器自动请求 `/favicon.ico`（项目无该文件），已在 `index.html` 用内联 SVG `data:` 图标消除。编辑器页 `GET /api/projects/<id>` 的 `net::ERR_ABORTED` 是正常取消：开发模式 React StrictMode 双挂载时，`useProject`（`src/components/editor/useProject.ts`）的 `AbortController` 清理会中止第一次请求并忽略其结果，第二次请求正常完成；生产构建无此现象，无需修改。
- Remotion 系列固定 `4.0.539`，zod 固定 `3.22.3`，升级时需同步。
- Vite 启用 `strictPort`，开发端口固定 5173，端口被占时直接失败而非自动换端口；后端默认端口 3217，支持 `PORT` 环境变量覆盖，Vite 代理同步使用该端口，服务仍只监听 `127.0.0.1`。
- 新增模板必须在 `src/templates/index.ts` 中显式 import 并追加，不做目录自动扫描；Composition id 即模板 id，预览、首页与 Node 渲染端共用注册表。
- 创作画布模板 id 为 `studio-canvas`，项目由多个场景首尾相接组成，总时长 = 各场景帧数之和；编辑场景一律经 `src/lib/editor.ts` 的 `withStudioDuration` 同步时长。
- 画布所有修改必须经 `StudioWorkbench` 的 `edit(change, group)` 才进撤销栈；同一 group 连续修改合并为一条，`Inspector` 同字段连续输入合并为一次撤销；撤销栈存整个项目快照，上限 100，仅当前编辑会话有效，刷新清空。
- 画布图层类型为文字、矩形/椭圆/线条、图片、视频、音频；场景背景支持纯色/线性渐变，场景与图层支持入场、出场、循环动画；预设定义在 `src/templates/studio-canvas/presets.ts`。
- 编辑器预览暂停并停在场景起点（0:00 或转场起点）时，用 `src/templates/shared.tsx` 的 `HoldStartContext` + `StableStart` 把显示时间前移到入场/转场结束后的首个稳定帧；开关默认关闭，只由两个 Workbench 在 Player 外层打开，导出渲染与时间轴、总时长不受影响；新模板需要同样效果时用 `StableStart` 包住场景。
- VideoPlan schema 定义在 `src/plan/schema.ts`（zod），`parsePlan` 是宽松解析：补默认值、钳制数值、丢弃未知字段和无法识别的场景，永不抛异常；没有任何可用场景时返回失败；成功时多返回 `warnings`，前端应展示。
- `ai-video` 为方案驱动模板，props 形如 `{plan: VideoPlan}`；创建项目时必须用 `configOf(plan)`（`src/templates/ai-video/index.tsx` 导出）设置 width/height/fps/durationInFrames，因为 Root 的 `calculateMetadata` 不从 plan 推导。
- 方案编辑器所有修改走 Workbench 的 `edit()`，经 `parsePlan` 修复后用 `withPlan` 同步 width/height/fps/durationInFrames；撤销栈存整个项目快照，上限 100，仅本次会话有效。
- 画幅限制：横屏 ≤1920×1080，竖屏（高 > 宽）≤1080×1920，宽高取偶数，fps 1–60；`list`/`stat` 场景可能得到空数组，渲染端需兜底；图片字段名为 `imageSrc`。
- LLM 响应为 `PlanResponse{plan,usedLLM,warnings}`；`/api/plan/*` 对 LLM 输出先过 `parsePlan`；请求体无效返回 400。默认不静默降级，无可用引擎返回 503、AI 失败返回 502，refine 失败同样返回 502 而非原样返回方案；仅 `PLAN_ALLOW_HEURISTIC=1` 时允许退回本地固定模板，响应明确标注且页面红字提示。
- 本地 CLI AI 适配层支持 `LLM_PROVIDER=api|claude-cli|codex-cli`；未设置时按 `ANTHROPIC_API_KEY` → PATH 中的 `claude` → `codex` 自动探测（`detectProviders`/`resolveProvider`），不读取凭据文件。`createPlanRouter(env, resolve)`。`LOCAL_AGENT_TIMEOUT_MS` 默认 180000 毫秒，`LOCAL_AGENT_CONCURRENCY` 默认 1、最大 2；`both` 依次调用两者，任一失败退出码为 1。
- 文字生成视频支持两种自动化模式：一键全自动（默认）与分步确认，开关保存在 localStorage（键 `remotion-studio.create-mode`），向导进行中也能切换。
- 渲染限制：编码 h264（带音轨时为 h264/aac），横屏最高 1920×1080、竖屏最高 1080×1920，宽高自动钳为偶数，帧率 1–60；素材地址以 `/` 开头时渲染前改写为 `http://127.0.0.1:${PORT||3217}` 前缀；`server/render.ts` 额外改写 `imageSrc` 与 `backgroundSrc`。
- `/api/upload` 在 mime 为 `application/octet-stream` 或空时按扩展名（不区分大小写）补全音频类型：mp3→`audio/mpeg`、wav→`audio/wav`、m4a→`audio/mp4`、aac→`audio/aac`、ogg→`audio/ogg`、flac→`audio/flac`；其他 mime 与未知扩展名保持原样，实现在 `server/upload.ts` 的 `resolveMime`。
- 前后端同仓库：Vite + React + TS 前端，Express 渲染服务；数据落在 `data/projects/*.json`、`data/uploads/`（单文件上限 2GB）、`data/renders/*.mp4`，该目录已被 git 忽略，通过 `/files/uploads/...`、`/files/renders/...` 访问。
- 首页「我的项目」使用本地缓存键 `remotion-studio.projects`，编辑器读取同一缓存；`createProject` 支持可选 `overrides` 参数。
- 仅本地自用，不做线上部署；首页沿用「分类 + 卡片 + 标签 + Prompt」信息架构。Remotion 商用需按其许可购买 Company License。

## 当前状态
项目主体功能已完成：脚手架与共享契约、内置模板（含 `studio-canvas` 创作画布）、首页模板库与创作入口、后端项目存取/上传/渲染、创作页、创作画布工作台、集成联调；文字需求 → 视频闭环（VideoPlan schema、`ai-video` 模板、`/api/plan/optimize|refine`、`/create` 两种自动化模式、方案编辑器）。

2026-10-30 取消 AI 静默降级：无可用引擎返回 503、AI 失败返回 502；页面可选引擎并显示状态，引擎自动探测（API Key → 本机 claude → codex）、提示词与场景表达力增强；build 与 81 个测试通过。2026-11-01 完成上传 mime 补全并在 `server/api.test.ts` 增加断言；81 个测试与 typecheck 通过，未跑 build。2026-11-05 完成 ai-video 竖屏 + BGM + 配音真实渲染验证，未改源码。

2026-11-10 修复首页 `/favicon.ico` 404：`index.html` 加内联 SVG 图标，首页与 `/create` 控制台报错为 0；编辑器页 `GET /api/projects/<id>` 的 `net::ERR_ABORTED` 确认为 StrictMode 正常取消，不改代码，仅补文档。仅改动 `index.html` 与 PROJECT.md，build 通过、81 个测试通过。

2026-11-03、11-04、11-06、11-07、11-08 在 agent 沙箱实测真实 AI 生成仍受阻：claude 超时/连接被拒，codex 初始化权限被拒（11-08 报 PATH aliases 与 in-process app-server 初始化被拒），均返回 502，无 `usedLLM:true`、无场景标题。2026-11-08 复测结束后测试后端已停，3299 端口无监听。

浏览器内播放、`loop:false`、配音长于视频、真实人声/长音频仍未测；生成内容是否贴合需求仍未验证；未新增 quote 场景类型。经理反馈「文字需求 → 视频」仍直接产出预设模板，期望先设置 Remotion 基础参数生成视频再让用户调整，该方向待落实。API 约定见 `docs/api.md`，CLI 验证见 `docs/local-agent.md`。

## 遗留问题
- 真实 `usedLLM:true` 未验证：2026-10-31 至 11-08 多次在沙箱复测 claude/codex optimize 均返回 502，api 引擎因无 `ANTHROPIC_API_KEY` 未测，需在本人普通终端按「如何运行与验证」命令重跑并记录耗时、`usedLLM` 与场景标题。
- 沙箱内 CLI 调用受限：codex 报 `could not create PATH aliases` / `failed to initialize in-process app-server client: Operation not permitted`（`/tmp/remotion-real-ai-20261108-3exa1een/`），claude 仅确认超过 150 秒超时，无法据此断定网络原因，需在普通终端复测区分。
- 「文字需求 → 视频」生成内容与需求贴合度未验证，且当前仍直接产出预设模板，经理期望的「先设基础参数生成再调整」方向未落实。
- 播放侧与音频边界未测：浏览器内播放、`loop:false`、配音长于视频、真实人声/长音频均无验证记录。
- 首页曾出现一次 `@remotion_three.js` 依赖相关的 `ERR_ABORTED`（判断为 Vite 依赖重优化的一次性现象），之后两轮未复现，未单独验证。

## 负责人
- 负责人：claude
- 复核人：codex

## 更新记录
- 2026-11-10：在 `index.html` 加内联 SVG 图标修复首页 `/favicon.ico` 404，并确认编辑器页 `GET /api/projects/<id>` 的 `net::ERR_ABORTED` 为 StrictMode 下正常取消、写入关键决策；build 与 81 个测试通过（claude）。
- 2026-11-08：复测 claude/codex optimize 仍返回 502（codex 报 PATH aliases 与 in-process app-server 初始化被拒），记录响应与日志；同日更新项目记忆 PROJECT.md（claude / linmaobang）。
- 2026-11-05：完成 ai-video 竖屏 + BGM + 配音真实渲染验证（1080×1920、30fps、900 帧 h264+aac，330Hz/880Hz 音频核验通过），未改源码（claude）。
- 2026-11-03：记录真实 AI 测试结果于 `docs/real-ai-test-2026-11-03.md`，仍未获得 `usedLLM:true`（claude）。
- 2026-11-01：修复 `/api/upload` 在 `application/octet-stream` 时按扩展名补全音频 mime，并在 `server/api.test.ts` 增加断言；81 个测试与 typecheck 通过（claude）。
- 2026-10-30：取消 AI 静默降级（无引擎 503、失败 502），增加引擎选择与自动探测、增强提示词与场景表达力；build 与 81 个测试通过（claude）。
