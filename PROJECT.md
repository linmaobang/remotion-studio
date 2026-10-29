# remotion-studio

## 项目简介
基于 Remotion 官方包搭建的本机可视化视频创作网站：在网页中浏览模板、实时预览、修改参数、做简单剪辑并导出 MP4，无需手写代码。除内置模板外，提供自由创作画布 `studio-canvas`：多场景、图层、动画、撤销重做与快捷键。同一仓库内包含 Vite + React + TypeScript 前端与 Express 渲染服务，代码位于 `~/ClaudeCode/projects/remotion-studio/`。仅本地个人学习/自用，服务只监听 `127.0.0.1`，本期不做线上部署。首页版式借鉴 awesome-opus5-5-videos 的「分类 + 卡片 + 标签 + Prompt」信息架构，视觉与内容自行设计。

## 如何运行与验证
- 安装与启动：`npm install` 后 `npm run dev`。前端 Vite `http://127.0.0.1:5173`（已设 `strictPort`），后端 Express `http://127.0.0.1:3217`，Vite 将 `/api` 与 `/files` 代理到后端；`PORT=3218 npm run dev` 可同步覆盖后端与代理端口。
- 其他脚本：`npm run typecheck`、`npm run build`；测试用 `node --import tsx --test` 运行，除 `src/components/home/library.test.ts`、`src/templates/templates.test.tsx`、`server/index.test.ts` 外，新增 `src/templates/studio-canvas/model.test.ts`、`src/lib/studioGeometry.test.ts`、`src/lib/history.test.ts`。
- 已通过：tsc、构建、33 个测试 0 失败；后端在 3217 端口 curl 全流程自测（创建项目→上传→渲染，进度 0→0.09→0.7→done，输出 h264 MP4，奇数宽高钳为偶数）；首页、编辑器与 7 个模板页浏览器控制台无报错；studio 工作台实测创建项目、加图层、两场景、导出 MP4 成功，两场景样例真实渲染并抽帧确认文字、形状、转场正常。
- 首次导出需联网下载 Chrome Headless Shell（Remotion 自动完成，缓存于 `node_modules/.remotion`）。
- 服务端 bundle 按进程缓存，修改模板后需重启后端才生效。
- 端口被占用时先确认占用进程，不要强行终止无关进程。

## 关键决策
- Remotion 系列固定 `4.0.539`，zod 固定 `3.22.3`，升级时需同步。
- Vite 启用 `strictPort`，开发端口固定 5173，端口被占时直接失败而非自动换端口。
- 后端默认端口 3217，支持 `PORT` 环境变量覆盖，Vite 代理同步使用该端口；服务仍只监听 `127.0.0.1`。
- 新增模板必须在 `src/templates/index.ts` 中显式 import 并追加，不做目录自动扫描；Composition id 即模板 id，预览、首页与 Node 渲染端共用注册表。当前共 8 个模板（含 `studio-canvas`，id 唯一）。
- 渲染限制：编码 h264，横屏最高 1920×1080、竖屏最高 1080×1920（高大于宽时上限对调），宽高自动钳为偶数，帧率 1–60；素材地址以 `/` 开头时渲染前改写为 `http://127.0.0.1:${PORT||3217}` 前缀。
- `studio-canvas` 项目由多个场景首尾相接组成，每场景有背景（纯色/线性渐变）、时长和入场转场，场景内叠放图层；总时长为各场景帧数之和，编辑场景一律经 `withStudioDuration` 同步时长。
- studio 工作台所有修改必须经 `StudioWorkbench` 的 `edit(change, group)` 才进入撤销栈；同一 group 的连续修改合并为一条，撤销栈存整个项目快照、上限 100，仅在当前编辑会话内有效，刷新后清空。
- 首页「开始创作」/「新建空白画布」直接创建 `studio-canvas` 项目；另提供「标题开场」「图文介绍」「社交竖屏 720×1280」三个起手预设，定义在 `src/templates/studio-canvas/presets.ts`。
- 前后端同仓库：Vite + React + TS 前端，Express 渲染服务；数据落在 `data/projects/*.json`、`data/uploads/`（单文件上限 2GB）、`data/renders/*.mp4`，该目录已被 git 忽略，通过 `/files/uploads/...`、`/files/renders/...` 访问。`createProject` 新增可选 `overrides` 参数。
- 首页「我的项目」使用本地缓存键 `remotion-studio.projects`，编辑器读取同一缓存。
- 仅本地自用，不做线上部署；首页沿用「分类 + 卡片 + 标签 + Prompt」信息架构。Remotion 商用需按其许可购买 Company License。

## 当前状态
模板库与创作画布功能均已完成并通过验收：项目脚手架与共享契约、7 个内置示例模板、`studio-canvas` 模板（创作模型与合成组件、画布舞台与属性面板、场景条/图层列表/撤销重做、首页创作入口与预设）、首页模板库、后端项目存取/上传/渲染、创作页（预览、参数表单、时间线、导出）、集成联调与 README 端到端验证。typecheck 通过，33 个测试 0 失败，实测创建、加图层、两场景、导出 MP4 成功。API 约定见 `docs/api.md`。

## 遗留问题
- 首页与创作页未做人工视觉走查或截图检查，仅验证控制台无报错与流程可跑通。
- 「标题开场」「图文介绍」预设未单独渲染导出验证，定义在 `src/templates/studio-canvas/presets.ts`。
- 上传素材、锁定/隐藏、图层上下移的界面点击未实测，实现在 `src/components/studio/`。
- 真实鼠标的 `setPointerCapture`、场景条拖动排序、真实键盘快捷键未在浏览器实测。
- 素材 `src` 前缀改写、超 1920×1080 宽高钳制与 `fps>60` 钳制尚未实测，实现在 `server/render.ts`。
- 运行中的 3217 后端为旧进程且 bundle 已缓存，需重启后新模板与竖屏尺寸上限才生效。
- 后端返工自测时的清理命令被拒，可能仍有其启动的 API 进程与 `data/` 下测试文件残留，需确认并清理。
- `src/components/editor/PreviewPane.tsx` 的 `errorFallback` 参数类型标注属未提交的工作区改动，需确认后提交。
- 首页构建存在打包体积过大告警，尚未优化。
- 早期自测 `pkill` 误杀了 SalesWell 的 Vite 服务（已恢复至 5174），其当前运行状态仍未确认。

## 负责人
负责人：claude；复核人：codex

## 更新记录
- 2026-10-29：新增首页「开始创作」入口、3 个起手预设与 README 创作画布章节，渲染尺寸上限改为横屏 1920×1080/竖屏 1080×1920，端到端导出验证通过（claude）
- 2026-10-29：studio 工作台补全场景条、图层列表与撤销重做（含拖动合并）及快捷键，25 个相关测试 0 失败（claude）
- 2026-10-29：studio 编辑页实现三栏工作台，支持添加/选中/拖动/八向缩放/旋转/微调/删除/双击改字与属性面板（claude）
- 2026-10-29：新增 studio-canvas 创作模型与合成组件并注册为第 8 个模板，typecheck 与 12 个测试通过，两场景样例渲染成功（claude）
- 2026-10-29：更新项目记忆 PROJECT.md（linmaobang）
- 2026-10-29：完成集成联调、README 与端到端验证，首页/编辑器/7 个模板页控制台无报错（claude）
- 2026-10-29：创作页返工，补 `PreviewPane.tsx` 类型标注使 tsc 退出码 0，原 TS7031 阻断问题解决（claude）
- 2026-10-29：后端项目存取/上传/渲染返工通过，3217 端口 curl 全流程与 MP4 导出验证成功（claude）
- 2026-10-29：完成首页模板库，数据驱动分类搜索、悬停预览、Prompt 复制与项目创建（codex）
- 2026-10-29：完成 7 个内置示例模板及可复用时间线组件与测试（codex）
- 2026-10-29：服务默认端口由 3001 改为 3217 并支持 PORT 覆盖，原 3001 端口占用遗留问题随之解决（codex）
- 2026-10-29：完成项目脚手架与共享契约，返工修复启动失败误报，验收通过（codex）
- 2026-10-29：搭建脚手架与共享契约，tsc 通过但 dev 联调因端口占用未完成（claude）
- 2026-10-29：开始「项目脚手架与共享契约」前的仓库快照（linmaobang）
