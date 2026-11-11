# remotion-studio

## 项目简介
基于 Remotion 官方包搭建的本机可视化视频创作网站：可浏览模板、实时预览、修改参数、做简单剪辑并导出 MP4，也可从空白画布自由创作多场景视频。同时提供「文字需求 → 视频」闭环：输入需求（可附图片/音乐/配音）→ 后端调用 Anthropic API 或本机 Claude Code/Codex CLI 优化为 VideoPlan 分镜方案（AI 引擎自动探测：API Key → 本机 claude → codex；不可用或失败时明确报错，不再静默套用固定模板；仅 `PLAN_ALLOW_HEURISTIC=1` 时允许显式降级）→ 在方案编辑器中预览、拖拽调整 → 导出带音轨的 MP4。同一仓库包含 Vite + React + TypeScript 前端与 Express 渲染服务，代码位于 `~/ClaudeCode/projects/remotion-studio/`。仅本地个人学习/自用，服务只监听 `127.0.0.1`，本期不做线上部署。首页版式借鉴「分类 + 卡片 + 标签 + Prompt」信息架构，视觉与内容自行设计。

## 如何运行与验证
- 安装与启动：`npm install` 后 `npm run dev`。前端 Vite `http://127.0.0.1:5173`（已设 `strictPort`），后端 Express `http://127.0.0.1:3217`，Vite 将 `/api` 与 `/files` 代理到后端；`PORT=3218 npm run dev` 可同步覆盖后端与代理端口。
- 可选 LLM：`ANTHROPIC_API_KEY` 配置后 `/api/plan/*` 可调用 Claude；`LLM_PROVIDER` 可选 `api`/`claude-cli`/`codex-cli`，未设置时按 API Key → PATH 中的 `claude` → `codex` 自动探测（不读凭据文件）；页面「AI 引擎」选择和请求体 `provider` 优先于 `LLM_PROVIDER`。`LLM_MODEL` 默认 `claude-sonnet-5-5`，每次请求时读取。
- 降级策略：默认不静默降级，无可用引擎返回 503，AI 调用失败返回 502 并带原因，页面显示错误可重试；仅 `PLAN_ALLOW_HEURISTIC=1` 时允许退回本地固定模板，响应明确标注且页面红字提示。
- CLI 模式：`LLM_PROVIDER=claude-cli` 或 `codex-cli` 调用本机已登录 CLI；使用 Claude 订阅时需 `env -u ANTHROPIC_API_KEY`，避免改走 API 计费。可选 `LOCAL_AGENT_MODEL`、`LOCAL_AGENT_TIMEOUT_MS`（默认 180000 毫秒）、`LOCAL_AGENT_CONCURRENCY`（默认 1，最大 2）。`npm run ask -- --provider both "问题"` 可测两者，任一失败退出码为 1；完整命令见 `docs/local-agent.md`。
- 真实 AI 验证现状：2026-10-31 至 11-08 在 agent 沙箱复测 claude/codex optimize 均返回 502，始终未见 `usedLLM:true`；2026-11-08 用 PORT=3299、`LOCAL_AGENT_TIMEOUT_MS=150000` 请求「30秒咖啡店宣传片」：claude-cli 约 151 秒超时终止，codex-cli 立即 502（`could not create PATH aliases` / in-process app-server 初始化被拒），api 引擎因环境无 `ANTHROPIC_API_KEY` 未测。需在本人普通终端重跑，命令见 `docs/local-agent.md`；记录见 `docs/real-ai-test-2026-11-03.md` 与 `/tmp/remotion-real-ai-20261106-is7wgnd5/`、`/tmp/remotion-real-ai-20261108-3exa1een/`。
- 上传 mime 验证：`npm run dev` 后执行 `curl -F "file=@x.mp3;type=application/octet-stream" http://127.0.0.1:5173/api/upload`，返回的 `mime` 应为 `audio/mpeg`。
- 改过模板或后端代码后需重启后端：服务端 bundle 按进程缓存，旧进程会继续使用旧渲染包。
- 目录效果检查：`npm run dev` 后打开首页 `/`、`/create`、`/editor/<id>`，看控制台与网络面板；首页应有标签页图标且无 404，编辑器页在开发模式下会有一条预期的 `GET /api/projects/<id>` 的 `net::ERR_ABORTED`（见关键决策）。
- 其他脚本：`npm run typecheck`、`npm run build`；项目没有 `npm test` 脚本，测试用 `node --import tsx --test $(find src server -name '*.test.ts' -o -name '*.test.tsx')`。
- 已通过：2026-10-30 build 与 81 个测试；2026-11-01 上传 mime 修复后 src 与 server 81 个测试、typecheck；2026-11-10 favicon 修复后 build 与 81 个测试；2026-11-11 音频边界验证后 typecheck、build 与 82 个测试。端到端「上传 → 优化 → 建项目 → 渲染」已跑通（当时无 key、走本地规则兜底），导出 10 秒 1080p h264+aac MP4。
- 2026-11-05 ai-video 竖屏 + BGM + 配音真实渲染：`samplePlan()` 改 1080×1920/30fps，BGM 为 330Hz 正弦 mp3（音量 0.5、loop），配音为 880Hz 正弦 wav（startFrame 30）；经 upload → projects（`ai-video`）→ render 轮询到 done，产物 h264 1080×1920、30fps、900 帧、30.0 秒，aac 音轨 30.016 秒；330Hz 全程存在，880Hz 仅在约 1–7 秒窗口；抽 3 帧目视正常。渲染时项目的 width/height/fps/durationInFrames 需与 plan 一致。
- ai-video 用 samplePlan 真实渲染 1920×1080、30fps、900 帧 h264 MP4，5 个场景抽帧目视正常；studio-canvas 两场景样例真实渲染成功；首页创建、加图层、两场景、导出 MP4 成功。首次导出需联网下载 Chrome Headless Shell（Remotion 自动完成，缓存于 `node_modules/.remotion`）。
- 2026-11-11 ai-video 音频边界验证：浏览器内 BGM 与配音 `<audio>` 均正常播放、无 error 与控制台报错；`loop:false` 的 4 秒 BGM 在 10 秒视频中只响一遍（330Hz 在 0.5–3.5 秒约 -24.5 dB，5–9.5 秒约 -49.7 dB）；20 秒配音放入 10 秒视频被截断（视频 10.000 秒、音轨 10.005 秒，不崩溃）；40 秒项目中 35 秒配音约 35 秒处正常结束、40 秒 BGM 持续到结尾。方法与未覆盖项见 `docs/ai-video-audio-verification.md`。
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

2026-11-10 修复首页 `/favicon.ico` 404：`index.html` 加内联 SVG 图标，首页与 `/create` 控制台报错为 0；编辑器页 `GET /api/projects/<id>` 的 `net::ERR_ABORTED` 确认为 StrictMode 正常取消，不改代码，仅补文档。build 通过、81 个测试通过。

2026-11-11 完成 ai-video 音频四项边界验证并全部通过：浏览器内播放、`loop:false`、配音长于视频、长音频渲染；未发现 bug、未改源码。仅新增 `src/templates/templates.test.tsx` 音频边界测试（`loop:false` 保留、音量钳到 1、配音 `startFrame` 远超视频时长不抛错），typecheck、build 通过，82 个测试全过。验证记录见 `docs/ai-video-audio-verification.md`。

2026-11-03、11-04、11-06、11-07、11-08 在 agent 沙箱实测真实 AI 生成仍受阻：claude 超时/连接被拒，codex 初始化权限被拒（11-08 报 PATH aliases 与 in-process app-server 初始化被拒），均返回 502，无 `usedLLM:true`、无场景标题。2026-11-08 复测结束后测试后端已停，3299 端口无监听；2026-11-11 验证用前后端也已停，5173 与 3217 无监听。

生成内容是否贴合需求仍未验证；未新增 quote 场景类型。经理反馈「文字需求 → 视频」仍直接产出预设模板，期望先设置 Remotion 基础参数生成视频再让用户调整，该方向待落实。API 约定见 `docs/api.md`，CLI 验证见 `docs/local-agent.md`，音频边界验证见 `docs/ai-video-audio-verification.md`。

## 遗留问题
- 真实 `usedLLM:true` 未验证：2026-10-31 至 11-08 沙箱复测 claude/codex 均返回 502，api 引擎因无 `ANTHROPIC_API_KEY` 未测，需在本人普通终端按 `docs/local-agent.md` 重跑。
- 生成内容是否贴合需求未验证。
- 未新增 quote 场景类型。
- 经理反馈「文字需求 → 视频」仍直接产出预设模板，期望先设置 Remotion 基础参数再让用户调整，方向待落实。
- 真实人声/真实音乐文件与人耳听感、音画同步未验证，见 `docs/ai-video-audio-verification.md`。
- 浏览器里 BGM 播完后是否静音未验证。
- 配音 `startFrame` 晚于视频结束只有单测，无真实渲染验证。
- 渲染测试脚本只在 `/tmp`（case.ts、render_case.sh、band.sh、play.cjs），未入库。
- 2026-11-11 验证产生的 uploads、renders、projects 数据文件仍留在 `data/` 下。

## 负责人
负责人：claude；复核人：codex

## 更新记录
- 2026-11-11：验证 ai-video 浏览器播放、`loop:false`、配音长于视频、长音频四项边界均通过，新增音频边界单测并补 `docs/ai-video-audio-verification.md`，typecheck、build 通过、82 个测试通过（claude）
- 2026-11-10：修复首页 `/favicon.ico` 404，确认编辑器 `net::ERR_ABORTED` 为 StrictMode 正常取消，build 通过、81 个测试通过（claude）
- 2026-11-05：完成 ai-video 竖屏 + BGM + 配音真实渲染验证（claude）
- 2026-11-01：完成上传 mime 补全并增加测试断言，81 个测试与 typecheck 通过（claude）
- 2026-10-30：取消 AI 静默降级，无可用引擎 503、AI 失败 502，build 与 81 个测试通过（claude）
- 2026-10-31 至 11-08：多次在沙箱复测真实 AI 调用均返回 502，仍未见 `usedLLM:true`（claude）
