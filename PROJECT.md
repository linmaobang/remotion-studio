# remotion-studio

## 项目简介
基于 Remotion 官方包搭建的本机可视化视频创作网站，代码位于 `~/ClaudeCode/projects/remotion-studio/`。支持两条主线：①浏览模板、改参数、简单剪辑并导出 MP4，也可从空白画布自由创作多场景视频；②「文字需求 → 视频」：输入需求（可附图片/音乐/配音），AI 优化成分镜方案（VideoPlan），在可视化编辑器里预览、拖拽调整、用自然语言修改，导出带音轨 MP4，支持一键全自动与分步确认两种模式。同一仓库含 Vite + React + TypeScript 前端与 Express 渲染服务，仅本地个人学习/自用，只监听 `127.0.0.1`，不做线上部署。首页版式借鉴 awesome-opus5-5-videos 的「分类 + 卡片 + 标签 + Prompt」信息架构，视觉与内容自行设计。

## 如何运行与验证
- 安装启动：`npm install` 后 `npm run dev`。前端 Vite `http://127.0.0.1:5173`（已设 `strictPort`），后端 Express `http://127.0.0.1:3217`，Vite 将 `/api` 与 `/files` 代理到后端；`PORT=3218 npm run dev` 可同步覆盖后端与代理端口。
- 改过模板或后端代码后需重启后端：服务端 bundle 按进程缓存，旧进程会继续使用旧渲染包。
- 环境变量（只从环境读取，不落盘）：`ANTHROPIC_API_KEY` 配置后 `/api/plan/*` 调用 Claude，未配置时 optimize 走本地规则、refine 原样返回；`LLM_MODEL` 默认 `claude-sonnet-5-5`，每次请求时读取；`PORT` 默认 3217。
- 脚本与测试：`npm run typecheck`、`npm run build`；`node --import tsx --test $(find src server -name '*.test.ts' -o -name '*.test.tsx')`，当前 57 个测试通过。
- 已通过：typecheck、build 与 57 个测试；ai-video 用 samplePlan 真实渲染 1920×1080/30fps/900 帧 h264 MP4，5 个场景抽帧目视正常；无 key 全链路跑通并导出 10 秒 1080p h264+aac MP4，时长与方案一致；3217 端口 curl 全流程；首页、编辑器与模板页控制台无报错；studio-canvas 两场景真实渲染成功；首页创建→加图层→两场景→导出 MP4 成功。
- 首次导出需联网下载 Chrome Headless Shell（Remotion 自动完成，缓存于 `node_modules/.remotion`）。
- 端口被占用时先用 `lsof -nP -iTCP:端口 -sTCP:LISTEN` 确认占用进程，不要按名字批量杀进程。

## 关键决策
- Remotion 系列固定 `4.0.539`，zod 固定 `3.22.3`，升级时需同步。
- Vite 启用 `strictPort` 固定 5173；后端默认 3217，支持 `PORT` 覆盖且 Vite 代理同步使用，服务只监听 `127.0.0.1`。
- 新增模板必须在 `src/templates/index.ts` 中显式 import 并追加，不做目录自动扫描；Composition id 即模板 id，预览、首页与 Node 渲染端共用注册表。现有 9 个模板（含 `studio-canvas`、`ai-video`）。
- 创作画布模板 id 为 `studio-canvas`，项目由多个场景首尾相接组成，总时长 = 各场景帧数之和；编辑场景一律经 `src/lib/editor.ts` 的 `withStudioDuration` 同步时长。
- 画布所有修改必须经 `StudioWorkbench` 的 `edit(change, group)` 才进撤销栈；同一 group 连续修改合并为一条，`Inspector` 同字段连续输入合并；撤销栈存整个项目快照，上限 100，仅当前会话有效，刷新清空。
- 画布图层类型为文字、矩形/椭圆/线条、图片、视频、音频；场景背景支持纯色/线性渐变；场景与图层支持入场、出场、循环动画；预设定义在 `src/templates/studio-canvas/presets.ts`。
- 渲染限制：编码 h264，横屏最高 1920×1080、竖屏最高 1080×1920（高大于宽时上限对调），宽高自动钳为偶数，帧率 1–60；素材地址以 `/` 开头时渲染前改写为 `http://127.0.0.1:${PORT||3217}` 前缀（含 ai-video 的 `imageSrc`、`backgroundSrc`）。
- VideoPlan schema 与 API 契约在 `src/plan/`（zod）；`parsePlan` 宽松解析：补默认值、钳制数值、丢弃未知字段与无法识别的场景，永不抛异常，无可用场景时返回失败，成功时返回 warnings。
- VideoPlan 约束：场景 1–30，`durationFrames` 15–3600，总帧数 = 各场景 `durationFrames` 之和；转场 frames 0–120 且不超过场景时长一半；横屏 ≤1920×1080、竖屏 ≤1080×1920，fps 1–60（默认 30）。
- `ai-video` 项目创建必须用 `configOf(plan)`（`src/templates/ai-video/index.tsx` 导出）设置 width/height/fps/durationInFrames，因为 Root 的 `calculateMetadata` 不从 plan 推导；props 形如 `{plan: VideoPlan}`。
- 方案所有修改走方案编辑 Workbench 的 `edit()`，经 `parsePlan` 修复后用 `withPlan` 同步宽高、帧率与时长；撤销栈存整项目快照，上限 100，仅本次会话有效。
- LLM 接入用 `fetch` 直连 Anthropic，无新增依赖；LLM 输出必须先过 `parsePlan`；响应为 `PlanResponse{plan,usedLLM,warnings}`，前端展示 warnings；请求体无效返回 400。
- 无 key 时 optimize 用本地规则生成（`usedLLM:false`），refine 降级为原样返回方案；`ANTHROPIC_API_KEY` 只从环境变量读取，不落盘。
- 创建页自动化模式存 localStorage 键 `remotion-studio.create-mode`，向导进行中可切换；分步确认流程为优化需求 → 生成方案 → 手动编辑/refine → 创建项目。
- 素材上传走 `POST /api/upload`，存 `data/uploads/`（单文件上限 2GB），返回 `/files/uploads/...`；优化时图片优先填 image-text 场景的 `imageSrc`、多余作场景背景，音乐填 `audio.bgm.src`，配音填 `audio.voiceover.src`。
- 数据落在 `data/projects/*.json`、`data/uploads/`、`data/renders/*.mp4`，目录已被 git 忽略，通过 `/files/uploads/...`、`/files/renders/...` 访问。
- 首页「我的项目」使用本地缓存键 `remotion-studio.projects`，编辑器读取同一缓存；`createProject` 支持可选 `overrides` 参数。
- 仅本地自用，不做线上部署；Remotion 商用需按其许可购买 Company License。

## 当前状态
本期「文字需求 → 视频」已全部完成：VideoPlan schema 与共享契约、ai-video 方案驱动模板、后端 LLM 需求优化（optimize/refine）、`/create` 需求输入页与两种自动化模式、方案可视化编辑器（预览、时间轴拖拽排序与调时长、属性面板、AI 修改、撤销重做、防抖自动保存、导出）、端到端集成与 README/docs 更新。typecheck、build 与 57 个测试通过；ai-video 900 帧真实渲染成功；无 key 全链路导出 10 秒 1080p h264+aac MP4。原有模板库、创作画布与后端渲染能力继续保留。API 约定见 `docs/api.md`。

## 遗留问题
- 未用真实 `ANTHROPIC_API_KEY` 测过 Claude 调用，实现在 `server/llm.ts`。
- `/api/plan/refine` 只有单测，未 curl 实测，实现在 `server/plan.ts`。
- 竖屏渲染、`bgm` 与 `voiceover` 未真实渲染或播放，仅单测确认不抛错，实现在 `src/templates/ai-video/`。
- 方案编辑器的上传素材、素材库按钮、空格播放与真实鼠标拖拽未实测，实现在 `src/components/planEditor/`、`src/components/create/`。
- 创建页与方案编辑器布局未做人工视觉走查。
- 编辑器在 0:00 或转场起点预览是黑的，播放后正常，已写进 README，涉及 `src/components/planEditor/`。
- 素材 `src` 前缀改写、尺寸上限与 `fps>60` 钳制仍未实测，实现在 `server/render.ts`。
- 视频/音频图层及打字机、漂浮、旋转动画未真实渲染验证，实现在 `src/templates/studio-canvas/`。
- 场景条拖动排序、图层上下移/锁定按钮、真实鼠标的 `setPointerCapture` 未实测，实现在 `src/components/studio/`。
- 首页构建存在打包体积过大告警，尚未优化。
- 首页自动检查曾出现 `/api/projects` 502 与一个未查明资源的 404，来源未确认。
- 5173 端口有一个非本次启动的本项目旧 Vite 进程（PID 31081），未处理；本次启动的后端已停，`data/` 下留有测试产物。

## 负责人
负责人：claude；复核人：codex

## 更新记录
- 2026-10-30：完成端到端集成验证与 README/docs 重写，无 key 全链路导出 10 秒 1080p MP4，修复 /create 在 StrictMode 下卡死（claude）
- 2026-10-30：完成方案可视化编辑器（预览、时间轴拖拽与调时长、属性面板、AI 修改、撤销重做、自动保存、导出），57 个测试通过（claude）
- 2026-10-30：完成 /create 需求输入页、两种自动化模式与分步确认向导、素材上传与方案编辑 refine（claude）
- 2026-10-30：完成后端 /api/plan/optimize|refine 与 LLM 接入，无 key 时本地规则兜底（claude）
- 2026-10-30：完成 ai-video 方案驱动模板并真实渲染 900 帧 5 场景 MP4，模板数增至 9（claude）
- 2026-10-30：完成 VideoPlan schema、API 契约类型与单测，parsePlan 永不抛异常（claude）
- 2026-10-29：完成首页创作入口与端到端验证，新增 3 个预设与 README 创作画布章节，33 个测试通过（claude）
- 2026-10-29：完成场景条、图层列表与撤销重做，25 个相关测试 0 失败（claude）
- 2026-10-29：完成画布舞台与属性面板，支持拖动、八向缩放、旋转、内联改字与快捷键（claude）
- 2026-10-29：完成 studio-canvas 创作模型与合成组件，模板增至 8 个，12 个测试通过（claude）
- 2026-10-29：更新项目记忆 PROJECT.md（linmaobang）
- 2026-10-29：完成集成联调、README 与端到端验证，首页/编辑器/7 个模板页控制台无报错（claude）
- 2026-10-29：创作页返工，补 `PreviewPane.tsx` 类型标注使 tsc 退出码 0，原 TS7031 阻断问题解决（claude）
- 2026-10-29：后端项目存取/上传/渲染返工通过，3217 端口 curl 全流程与 MP4 导出验证成功（claude）
- 2026-10-29：完成首页模板库，数据驱动分类搜索、悬停预览、Prompt 复制与项目创建（codex）
