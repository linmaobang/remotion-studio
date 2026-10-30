# remotion-studio

## 项目简介
基于 Remotion 官方包搭建的本机可视化视频创作网站：可浏览模板、实时预览、修改参数、做简单剪辑并导出 MP4，也可从空白画布自由创作多场景视频。新增「文字需求 → 视频」闭环：输入需求（可附图片/音乐/配音）→ 后端调用 Anthropic API 或本机 Claude Code/Codex CLI 优化为 VideoPlan 分镜方案（无 key 且未选 CLI 时走本地规则兜底）→ 在方案编辑器中预览、拖拽调整 → 导出带音轨的 MP4。同一仓库包含 Vite + React + TypeScript 前端与 Express 渲染服务，代码位于 `~/ClaudeCode/projects/remotion-studio/`。仅本地个人学习/自用，服务只监听 `127.0.0.1`，本期不做线上部署。首页版式借鉴 awesome-opus5-5-videos 的「分类 + 卡片 + 标签 + Prompt」信息架构，视觉与内容自行设计。

## 如何运行与验证
- 安装与启动：`npm install` 后 `npm run dev`。前端 Vite `http://127.0.0.1:5173`（已设 `strictPort`），后端 Express `http://127.0.0.1:3217`，Vite 将 `/api` 与 `/files` 代理到后端；`PORT=3218 npm run dev` 可同步覆盖后端与代理端口。
- 可选 LLM：`ANTHROPIC_API_KEY` 配置后 `/api/plan/*` 调用 Claude；未配置且未选 CLI 时 optimize 用本地规则生成（`usedLLM:false`），refine 原样返回方案。`LLM_PROVIDER` 可选 `api`/`claude-cli`/`codex-cli`，未设置时有 key 用 API，否则本地规则。`LLM_MODEL` 默认 `claude-sonnet-5-5`，每次请求时读取；密钥只从环境变量读取，不落盘。
- CLI 模式：`LLM_PROVIDER=claude-cli` 或 `codex-cli` 调用本机已登录 CLI；使用 Claude 订阅时需取消 `ANTHROPIC_API_KEY`，避免改走 API 计费。可选 `LOCAL_AGENT_MODEL`、`LOCAL_AGENT_TIMEOUT_MS`（默认 180000 毫秒）、`LOCAL_AGENT_CONCURRENCY`（默认 1，最大 2）；`npm run ask -- --provider both "问题"` 可测两者，任一失败退出码为 1；plan 调用失败返回 `usedLLM:false` 和原因。完整命令见 `docs/local-agent.md`。
- 当前受限执行环境真实 CLI 调用仍失败：Claude 连接被拒绝/超时，Codex 初始化被拒绝，尚无真实 `usedLLM:true`；3299 测试后端已关闭，勿将降级响应当作成功。
- 改过模板或后端代码后需重启后端：服务端 bundle 按进程缓存，旧进程会继续使用旧渲染包。
- 其他脚本：`npm run typecheck`、`npm run build`；测试：`node --import tsx --test $(find src server -name '*.test.ts' -o -name '*.test.tsx')`。
- 已通过：build、74 个测试；无 key 端到端「上传 → 优化 → 建项目 → 渲染」跑通，导出 10 秒 1080p h264+aac MP4，时长与方案一致。
- ai-video 用 samplePlan 真实渲染 1920×1080、30fps、900 帧 h264 MP4，5 个场景抽帧目视正常；studio-canvas 两场景样例真实渲染成功；首页创建、加图层、两场景、导出 MP4 成功。
- 首页、编辑器与模板页浏览器控制台无报错；首次导出需联网下载 Chrome Headless Shell（Remotion 自动完成，缓存于 `node_modules/.remotion`）。
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
- LLM 响应为 `PlanResponse{plan,usedLLM,warnings}`；后端实现 `/api/plan/*` 时应对 LLM 输出先过 `parsePlan`；请求体无效返回 400，refine 降级时 `usedLLM` 为 false 且原样返回 plan。
- 本地 CLI AI 适配层支持 `LLM_PROVIDER=api|claude-cli|codex-cli`；未设置时有 `ANTHROPIC_API_KEY` 用 API，否则本地规则。适配层不读取凭据文件，继承终端环境；使用 Claude 订阅时需取消 `ANTHROPIC_API_KEY`。`LOCAL_AGENT_TIMEOUT_MS` 默认 180000 毫秒，`LOCAL_AGENT_CONCURRENCY` 默认 1、最大 2；`both` 依次调用两者，任一失败退出码为 1；plan 调用失败返回 `usedLLM:false` 和原因，不得将降级响应当作成功。返工修复了进程回收、并发队列、临时目录及脚本退出码，实现与验证见 `localAgent.ts`、`localAgent.test.ts`、`ask-local-agent.ts`、`docs/local-agent.md`。
- 文字生成视频支持两种自动化模式：一键全自动（默认）与分步确认，开关保存在 localStorage（键 `remotion-studio.create-mode`），向导进行中也能切换。
- 渲染限制：编码 h264（带音轨时为 h264/aac），横屏最高 1920×1080、竖屏最高 1080×1920，宽高自动钳为偶数，帧率 1–60；素材地址以 `/` 开头时渲染前改写为 `http://127.0.0.1:${PORT||3217}` 前缀；`server/render.ts` 额外改写 `imageSrc` 与 `backgroundSrc`。
- 前后端同仓库：Vite + React + TS 前端，Express 渲染服务；数据落在 `data/projects/*.json`、`data/uploads/`（单文件上限 2GB）、`data/renders/*.mp4`，该目录已被 git 忽略，通过 `/files/uploads/...`、`/files/renders/...` 访问。
- 首页「我的项目」使用本地缓存键 `remotion-studio.projects`，编辑器读取同一缓存；`createProject` 支持可选 `overrides` 参数。
- 仅本地自用，不做线上部署；首页沿用「分类 + 卡片 + 标签 + Prompt」信息架构。Remotion 商用需按其许可购买 Company License。

## 当前状态
本期范围已全部完成并通过验收：项目脚手架与共享契约、内置模板（含 `studio-canvas` 创作画布）、首页模板库与创作入口、后端项目存取/上传/渲染、创作页、创作画布工作台、集成联调与 README 端到端验证；文字需求 → 视频闭环，包括 VideoPlan schema 与 API 契约、`ai-video` 方案驱动模板、`/api/plan/optimize|refine`、`/create` 需求输入页与两种自动化模式、方案可视化编辑器（预览、时间轴拖拽排序与调时长、属性面板、AI 修改、撤销重做、防抖自动保存、导出）。新增本地 CLI AI 适配层（`claude-cli`/`codex-cli`）并完成返工：修复进程回收、并发队列、临时目录及脚本退出码，build 与 74 个测试通过；真实 CLI 调用仍受环境限制（Claude 连接失败、Codex 初始化权限被拒），未验证真实 `usedLLM:true`。无 key 端到端跑通并导出 10 秒 1080p h264+aac MP4；ai-video 用 samplePlan 真实渲染 1920×1080、30fps、900 帧 h264 MP4，5 个场景抽帧正常。API 约定见 `docs/api.md`，CLI 验证见 `docs/local-agent.md`。项目记忆 PROJECT.md 已同步更新。

## 遗留问题
- 编辑器预览起始帧修复（`StableStart`）只做了代码核对，未在真实浏览器目视确认 0:00 与转场起点画面，也未重新渲染导出核验，实现在 `src/templates/shared.tsx`、`src/lib/editor.ts`。
- 带位移入场动画的图层，暂停在场景起点时叠加层框与画面会短暂对不上，涉及 `src/templates/shared.tsx` 与画布/方案编辑器舞台。
- 自动视觉检查在首页记录 3 条控制台报错与 4 个请求失败（`/api/projects` 502 及一个 404），当时后端未启动、Vite 代理转发失败所致，该 404 资源来源仍待确认。
- 真实 `ANTHROPIC_API_KEY` 下的 Claude optimize/refine 未实测，refine 路由仅有单测、未 curl 实测；实现在 `server/llm.ts`、`server/plan.ts`。
- 本地 CLI（`claude-cli`/`codex-cli`）真实调用未验证：Claude 连接被拒绝/超时，Codex 初始化权限被拒，两个 provider 均无真实 `usedLLM:true`；实现在 `localAgent.ts`，验证记录见 `docs/local-agent.md`。
- ai-video 的竖屏、BGM 与配音未真实渲染或播放，只有单测确认不抛错；实现在 `src/templates/ai-video/` 与 `server/render.ts`。
- 方案编辑器与 studio-canvas 的上传素材、素材库按钮、空格播放、场景条拖动排序、图层上下移/锁定、真实鼠标拖拽/`setPointerCapture` 未在真实鼠标键盘下实测，分别在 `src/components/planEditor/` 与 `src/components/studio/`。
- studio-canvas 的视频/音频图层及打字机、漂浮、旋转动画未真实渲染验证，实现在 `src/templates/studio-canvas/StudioComposition.tsx` 与 `src/templates/studio-canvas/model.ts`。
- 「标题开场」「图文介绍」两个预设未单独渲染导出，定义在 `src/templates/studio-canvas/presets.ts`。
- 素材 `src` 前缀改写、尺寸上限与 `fps>60` 钳制的边界情况尚未专门实测，实现在 `server/render.ts`。
- 首页、`/create`、方案编辑器与创作画布未做完整人工视觉走查，仅验证控制台无报错与流程可用。
- 首页构建存在打包体积过大告警，尚未优化。
- 5173 端口存在本项目旧 Vite 进程（PID 31081），非本次启动、未处理，需确认是否清理。
- `data/` 下保留端到端测试渲染产物（已被 git 忽略），未清理。
- 早期 `pkill` 误杀 SalesWell 的 Vite 服务（已恢复至 5174），其当前运行状态仍未确认。

## 负责人
负责人：claude；复核人：codex

## 更新记录
- 2026-10-30：更新项目记忆 PROJECT.md（linmaobang）
- 2026-10-30：本地 CLI AI 适配层返工验收通过，修复进程回收、并发队列、临时目录及脚本退出码，74 项测试与构建通过；真实 CLI 有效响应与 `usedLLM:true` 未验证（codex）
- 2026-10-30：修复编辑器预览在场景起点（0:00/转场起点）黑屏，改用 `StableStart` 显示首个稳定帧，typecheck 与 57 个测试通过（claude）
- 2026-10-30：完成端到端集成验证、README 与 docs/api.md 更新；无 key 下导出 10 秒 1080p h264+aac MP4，修复 `/create` 在 StrictMode 下卡死（claude）
- 2026-10-30：完成方案可视化编辑器（预览、时间轴拖拽排序与调时长、属性面板、AI 修改、撤销重做、自动保存、导出），57 个测试通过（claude）
- 2026-10-30：完成 `/create` 需求输入页、两种自动化模式与分步确认向导（claude）
- 2026-10-30：完成后端 `/api/plan/optimize|refine` 与 LLM 调用，无 key 时本地规则兜底（claude）
- 2026-10-30：完成 `ai-video` 方案驱动模板并注册，samplePlan 真实渲染 900 帧 MP4（claude）
- 2026-10-30：完成 VideoPlan schema、`parsePlan`、API 契约与 7 个单测（claude）
- 2026-10-29：完成首页创作入口与端到端验证，新增 3 个预设与 README 创作画布章节，33 个测试通过（claude）
- 2026-10-29：完成场景条、图层列表与撤销重做，25 个相关测试 0 失败（claude）
- 2026-10-29：完成画布舞台与属性面板，支持拖动、八向缩放、旋转、内联改字与快捷键（claude）
- 2026-10-29：完成 studio-canvas 创作模型与合成组件，模板增至 8 个，12 个测试通过（claude）
- 2026-10-29：完成集成联调、README 与端到端验证，首页/编辑器/7 个模板页控制台无报错（claude）
- 2026-10-29：创作页返工，补 `PreviewPane.tsx` 类型标注使 tsc 退出码 0，原 TS7031 阻断问题解决（claude）
