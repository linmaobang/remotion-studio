# remotion-studio

## 项目简介
基于 Remotion 官方包搭建的本机可视化视频创作网站：可浏览模板、实时预览、修改参数、做简单剪辑并导出 MP4，也可从空白画布自由创作多场景视频。新增「文字需求 → 视频」闭环：输入需求（可附图片/音乐/配音）→ 后端调用 Anthropic API 或本机 Claude Code/Codex CLI 优化为 VideoPlan 分镜方案（AI 引擎自动探测：API Key → 本机 claude → codex；不可用或失败时明确报错，不再静默套用固定模板；仅 `PLAN_ALLOW_HEURISTIC=1` 时允许显式降级）→ 在方案编辑器中预览、拖拽调整 → 导出带音轨的 MP4。同一仓库包含 Vite + React + TypeScript 前端与 Express 渲染服务，代码位于 `~/ClaudeCode/projects/remotion-studio/`。仅本地个人学习/自用，服务只监听 `127.0.0.1`，本期不做线上部署。首页版式借鉴 awesome-opus5-5-videos 的「分类 + 卡片 + 标签 + Prompt」信息架构，视觉与内容自行设计。

## 如何运行与验证
- 安装与启动：`npm install` 后 `npm run dev`。前端 Vite `http://127.0.0.1:5173`（已设 `strictPort`），后端 Express `http://127.0.0.1:3217`，Vite 将 `/api` 与 `/files` 代理到后端；`PORT=3218 npm run dev` 可同步覆盖后端与代理端口。
- 可选 LLM：`ANTHROPIC_API_KEY` 配置后 `/api/plan/*` 可调用 Claude；`LLM_PROVIDER` 可选 `api`/`claude-cli`/`codex-cli`，未设置时按 API Key → PATH 中的 `claude` → `codex` 自动探测（不读凭据文件）；页面「AI 引擎」选择和请求体 `provider` 优先于 `LLM_PROVIDER`。`LLM_MODEL` 默认 `claude-sonnet-5-5`，每次请求时读取；密钥只从环境变量读取，不落盘。
- 降级策略：默认不静默降级，无可用引擎返回 503，AI 调用失败返回 502 并带原因，页面显示错误可重试；仅 `PLAN_ALLOW_HEURISTIC=1` 时允许退回本地固定模板，响应明确标注且页面红字提示。
- CLI 模式：`LLM_PROVIDER=claude-cli` 或 `codex-cli` 调用本机已登录 CLI；使用 Claude 订阅时需取消 `ANTHROPIC_API_KEY`，避免改走 API 计费。可选 `LOCAL_AGENT_MODEL`、`LOCAL_AGENT_TIMEOUT_MS`（默认 180000 毫秒）、`LOCAL_AGENT_CONCURRENCY`（默认 1，最大 2）；`npm run ask -- --provider both "问题"` 可测两者，任一失败退出码为 1；plan 调用失败返回 502 和原因。完整命令见 `docs/local-agent.md`。
- 2026-10-31 复测真实 CLI：`npm run ask -- --provider both` 中 codex 返回 OK（约 20.5 秒）、claude 超过 180 秒报 `[TIMEOUT]`；curl `/api/plan/optimize` 时 codex 约 1 秒返回 502（初始化权限被拒）、claude 约 174 秒返回 502（连接被拒），响应无 `plan`/`usedLLM` 字段，尚无真实 `usedLLM:true`，勿将降级响应当作成功。该次仍是在 agent 受限环境执行，未核对 curl 原始响应体。
- 需在本人普通终端（非 agent 沙箱）且 `claude`、`codex` 已登录时，分别以 `LLM_PROVIDER=claude-cli` / `codex-cli` 启动并对 `/api/plan/optimize` 发 curl，检查 `usedLLM` 与场景标题。
- 改过模板或后端代码后需重启后端：服务端 bundle 按进程缓存，旧进程会继续使用旧渲染包。
- 其他脚本：`npm run typecheck`、`npm run build`；项目无 `npm test` 脚本，测试用 `node --import tsx --test $(find src server -name '*.test.ts' -o -name '*.test.tsx')`。
- 已通过（2026-10-30）：build、81 个测试；端到端「上传 → 优化 → 建项目 → 渲染」曾跑通（当时无 key、走本地规则兜底），导出 10 秒 1080p h264+aac MP4，时长与方案一致。
- 2026-11-01 上传 mime 修复验证：`node --import tsx --test` 跑 `src` 与 `server` 全部测试，81 个通过；`npm run typecheck` 通过，未跑 `npm run build`。
- ai-video 用 samplePlan 真实渲染 1920×1080、30fps、900 帧 h264 MP4，5 个场景抽帧目视正常；studio-canvas 两场景样例真实渲染成功；首页创建、加图层、两场景、导出 MP4 成功。
- 首页、编辑器与模板页浏览器控制台曾无报错；首次导出需联网下载 Chrome Headless Shell（Remotion 自动完成，缓存于 `node_modules/.remotion`）。
- 端口被占用时先用 `lsof -nP -iTCP:端口 -sTCP:LISTEN` 确认占用进程，不要按名字批量杀进程。

## 关键决策
- Remotion 系列固定 `4.0.539`，zod 固定 `3.22.3`，升级时需同步。
- Vite 启用 `strictPort`，开发端口固定 5173，端口被占时直接失败而非自动换端口。
- 后端默认端口 3217，支持 `PORT` 环境变量覆盖，Vite 代理同步使用该端口；服务仍只监听 `127.0.0.1`。
- 新增模板必须在 `src/templates/index.ts` 中显式 import 并追加，不做目录自动扫描；Composition id 即模板 id，预览、首页与 Node 渲染端共用注册表。
- 创作画布模板 id 为 `studio-canvas`，项目由多个场景首尾相接组成，总时长 = 各场景帧数之和；编辑场景一律经 `src/lib/editor.ts` 的 `withStudioDuration` 同步时长。
- 画布所有修改必须经 `StudioWorkbench` 的 `edit(change, group)` 才进撤销栈；同一 group 连续修改合并为一条，`Inspector` 同字段连续输入合并为一次撤销；撤销栈存整个项目快照，上限 100，仅当前编辑会话有效，刷新清空。
- 画布图层类型为文字、矩形/椭圆/线条、图片、视频、音频；场景背景支持纯色/线性渐变，场景与图层支持入场、出场、循环动画；预设定义在 `src/templates/studio-canvas/presets.ts`。
- 编辑器预览暂停并停在场景起点（0:00 或转场起点）时，用 `src/templates/shared.tsx` 的 `HoldStartContext` + `StableStart` 把显示时间前移到入场/转场结束后的首个稳定帧；开关默认关闭，只由两个 Workbench 在 Player 外层打开，导出渲染与时间轴、总时长不受影响；新模板需要同样效果时用 `StableStart` 包住场景。
- VideoPlan schema 定义在 `src/plan/schema.ts`（zod），`parsePlan` 是宽松解析：补默认值、钳制数值、丢弃未知字段和无法识别的场景，永不抛异常；没有任何可用场景时返回失败；成功时多返回 `warnings`，前端应展示。
- `ai-video` 为方案驱动模板，props 形如 `{plan: VideoPlan}`；创建项目时必须用 `configOf(plan)`（`src/templates/ai-video/index.tsx` 导出）设置 width/height/fps/durationInFrames，因为 Root 的 `calculateMetadata` 不从 plan 推导。
- 方案编辑器所有修改走 Workbench 的 `edit()`，经 `parsePlan` 修复后用 `withPlan` 同步 width/height/fps/durationInFrames；撤销栈存整个项目快照，上限 100，仅本次会话有效。
- 画幅限制：横屏 ≤1920×1080，竖屏（高 > 宽）≤1080×1920，宽高取偶数，fps 1–60；`list`/`stat` 场景可能得到空数组，渲染端需兜底；图片字段名为 `imageSrc`。
- LLM 响应为 `PlanResponse{plan,usedLLM,warnings}`；`/api/plan/*` 对 LLM 输出先过 `parsePlan`；请求体无效返回 400。页面「AI 引擎」选择和请求体 `provider` 优先于 `LLM_PROVIDER`；默认不静默降级，无可用引擎返回 503、AI 失败返回 502，refine 失败同样返回 502 而非原样返回方案；仅 `PLAN_ALLOW_HEURISTIC=1` 时允许退回本地固定模板，响应明确标注且页面红字提示。
- 本地 CLI AI 适配层支持 `LLM_PROVIDER=api|claude-cli|codex-cli`；未设置时按 `ANTHROPIC_API_KEY` → PATH 中的 `claude` → `codex` 自动探测（`detectProviders`/`resolveProvider`），不读取凭据文件。`createPlanRouter(env, resolve)`。`LOCAL_AGENT_TIMEOUT_MS` 默认 180000 毫秒，`LOCAL_AGENT_CONCURRENCY` 默认 1、最大 2；`both` 依次调用两者，任一失败退出码为 1；plan 调用失败返回 502 和原因，不再返回降级方案。
- 文字生成视频支持两种自动化模式：一键全自动（默认）与分步确认，开关保存在 localStorage（键 `remotion-studio.create-mode`），向导进行中也能切换。
- `/api/upload` 的 mime 解析：当 `mimetype` 为 `application/octet-stream` 或空时，按扩展名（mp3/wav/m4a/aac/ogg/flac，大小写不敏感）补全为 `audio/*`，其他保持原样；实现在 `server/upload.ts` 的 `resolveMime`。
- 渲染限制：编码 h264（带音轨时为 h264/aac），横屏最高 1920×1080、竖屏最高 1080×1920，宽高自动钳为偶数，帧率 1–60；素材地址以 `/` 开头时渲染前改写为 `http://127.0.0.1:${PORT||3217}` 前缀；`server/render.ts` 额外改写 `imageSrc` 与 `backgroundSrc`。
- 前后端同仓库：Vite + React + TS 前端，Express 渲染服务；数据落在 `data/projects/*.json`、`data/uploads/`（单文件上限 2GB）、`data/renders/*.mp4`，该目录已被 git 忽略，通过 `/files/uploads/...`、`/files/renders/...` 访问。
- 首页「我的项目」使用本地缓存键 `remotion-studio.projects`，编辑器读取同一缓存；`createProject` 支持可选 `overrides` 参数。
- 仅本地自用，不做线上部署；首页沿用「分类 + 卡片 + 标签 + Prompt」信息架构。Remotion 商用需按其许可购买 Company License。

## 当前状态
项目主体功能已完成：脚手架与共享契约、内置模板（含 `studio-canvas` 创作画布）、首页模板库与创作入口、后端项目存取/上传/渲染、创作页、创作画布工作台、集成联调；文字需求 → 视频闭环（VideoPlan schema、`ai-video` 模板、`/api/plan/optimize|refine`、`/create` 两种自动化模式、方案编辑器）。2026-10-30 取消 AI 静默降级：无可用引擎返回 503、AI 失败返回 502；页面可选引擎并显示状态，引擎自动探测（API Key → 本机 claude → codex）、提示词与场景表达力增强；build 与 81 个测试通过。2026-10-31 在受限环境复测真实 LLM：providers 探测可用，但 codex optimize 约 1 秒返回 502（初始化权限被拒），claude optimize 约 174 秒返回 502（连接被拒），仍未得到 `usedLLM:true`。2026-11-01 修复 `/api/upload` 对 mp3 等音频在 `application/octet-stream` 或空 mime 下未识别的问题，按扩展名补全 `audio/*`；81 个测试与 typecheck 通过，未跑 build。生成内容是否贴合需求仍未验证；未新增 quote 场景类型。经理反馈「文字需求 → 视频」仍直接产出预设模板，期望先设置 Remotion 基础参数生成视频再让用户调整，该方向待落实。API 约定见 `docs/api.md`，CLI 验证见 `docs/local-agent.md`。

## 遗留问题
- 经理反馈「文字需求 → 视频」仍直接产出预设模板，未按期望先设置 Remotion 基础参数生成视频再让用户调整，涉及 `src/pages/Create.tsx`、`server/plan.ts`、`src/templates/ai-video/`。
- 真实 `usedLLM:true` 未验证：2026-10-31 复测 codex 初始化权限被拒、claude 连接被拒/超时，两者 optimize 均返回 502；需在本人普通终端且 CLI 已登录时用 `provider:claude` 与 `codex` 各跑一次 optimize 并检查场景标题，涉及 `server/localAgent.ts`、`server/plan.ts`。
- 生成内容是否贴合用户需求未验证，涉及 `server/plan.ts` 与 `src/templates/ai-video/`。
- 未新增 quote 场景类型，涉及 `src/plan/schema.ts` 与 `src/templates/ai-video/`。
- 真实 `ANTHROPIC_API_KEY` 下的 Claude optimize/refine 未实测，refine 路由仅有单测、未 curl 实测；实现在 `server/llm.ts`、`server/plan.ts`。
- 编辑器预览起始帧修复（`StableStart`）只做了代码核对，未在真实浏览器目视确认 0:00 与转场起点画面，也未重新渲染导出核验，实现在 `src/templates/shared.tsx`、`src/lib/editor.ts`。
- 带位移入场动画的图层，暂停在场景起点时叠加层框与画面会短暂对不上，涉及 `src/templates/shared.tsx` 与画布/方案编辑器舞台。
- 2026-10-31 页面检查仍有 1 个 404 控制台报错与 1 个 `ERR_ABORTED` 请求，未追查来源，涉及首页与 `/create`、`/editor` 页面检查。
- ai-video 的竖屏、BGM 与配音未真实渲染或播放，只有单测确认不抛错；实现在 `src/templates/ai-video/` 与 `server/render.ts`。
- 方案编辑器与 studio-canvas 的上传素材、素材库按钮、空格播放、场景条拖动排序、图层上下移/锁定、真实鼠标拖拽/`setPointerCapture` 未在真实鼠标键盘下实测，分别在 `src/components/planEditor/` 与 `src/components/studio/`。
- studio-canvas 的视频/音频图层及打字机、漂浮、旋转动画未真实渲染验证，实现在 `src/templates/studio-canvas/StudioComposition.tsx` 与 `src/templates/studio-canvas/model.ts`。
- 「标题开场」「图文介绍」两个预设未单独渲染导出，定义在 `src/templates/studio-canvas/presets.ts`。
- 素材 `src` 前缀改写、尺寸上限与 `fps>60` 钳制的边界情况尚未专门实测，实现在 `server/render.ts`。
- 首页、`/create`、方案编辑器与创作画布未做完整人工视觉走查，仅验证控制台无报错与流程可用。
- 首页构建存在打包体积过大告警，尚未优化。
- 5173 端口曾存在本项目旧 Vite 进程（PID 31081），非本次启动、未处理，需确认是否清理。
- `data/` 下保留端到端测试渲染产物（已被 git 忽略），未清理。
- 早期 `pkill` 误杀 SalesWell 的 Vite 服务（已恢复至 5174），其当前运行状态仍未确认。
- 2026-11-01 上传 mime 修复后未跑 `npm run build`，仅 `npm run typecheck` 与 81 个测试通过，涉及 `server/upload.ts`、`server/api.test.ts`。

## 负责人
负责人：claude；复核人：codex

## 更新记录
- 2026-11-01：`/api/upload` 在 mime 为 `application/octet-stream` 或空时按扩展名补全 `audio/*`（mp3/wav/m4a/aac/ogg/flac，不区分大小写），其他保持原样；新增 `server/upload.ts` 的 `resolveMime` 与 `server/api.test.ts` 集成断言，81 项测试与 typecheck 通过，未跑 build（claude）
- 2026-10-31：复测真实 LLM：`ask --provider both` 中 codex 返回 OK、claude 超时，两 provider optimize 均 502，未得到 `usedLLM:true`；只修改 `PROJECT.md` 并补验证记录，测试后端已关闭（codex）
- 2026-10-30：更新项目记忆 PROJECT.md（linmaobang）
- 2026-10-30：取消 AI 静默降级，无可用引擎返回 503、AI 失败返回 502；新增引擎自动探测与页面引擎选择、提示词与场景表达力增强，81 项测试与构建通过；真实 `usedLLM:true` 仍未验证，该轮状态部分完成（claude）
- 2026-10-30：本地 CLI AI 适配层返工验收通过，修复进程回收、并发队列、临时目录及脚本退出码，74 项测试与构建通过；真实 CLI 有效响应与 `usedLLM:true` 未验证（codex）
- 2026-10-30：修复编辑器预览在场景起点（0:00/转场起点）黑屏，改用 `StableStart` 显示首个稳定帧，typecheck 与 57 个测试通过（claude）
- 2026-10-30：完成端到端集成验证、README 与 docs/api.md 更新；无 key 下导出 10 秒 1080p h264+aac MP4。
