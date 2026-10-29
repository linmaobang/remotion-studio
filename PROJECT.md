# remotion-studio

## 项目简介
基于 Remotion 官方包搭建的本机可视化视频创作网站：在网页中浏览模板、实时预览、修改参数、做简单剪辑并导出 MP4，无需手写代码。同一仓库内包含 Vite + React + TypeScript 前端与 Express 渲染服务，代码位于 `~/ClaudeCode/projects/remotion-studio/`。仅本地个人学习/自用，本期不做线上部署。首页版式借鉴 awesome-opus5-5-videos 的「分类 + 卡片 + 标签 + Prompt」信息架构，视觉与内容自行设计。

## 如何运行与验证
- 依赖已安装；类型检查（tsc）通过，`server/index.test.ts` 的构建与回归测试通过。
- 开发联调前必须先释放 5173（Vite，已设 `strictPort`）与 3001（Express 服务）端口，再启动 dev。
- 待验证项：`/api/health`、Vite 代理、`/editor/:id` 路由、主题点击流程。

## 关键决策
- Remotion 系列固定 `4.0.539`，zod 固定 `3.22.3`，升级时需同步。
- Vite 启用 `strictPort`，开发端口固定 5173，端口被占时直接失败而非自动换端口。
- 新增模板必须在 `src/templates/index.ts` 中显式 import 并追加，不做目录自动扫描。
- 前后端同仓库：Vite + React + TS 前端，Express 渲染服务。
- 仅本地自用，不做线上部署；首页沿用「分类 + 卡片 + 标签 + Prompt」信息架构，视觉自行设计。

## 当前状态
「项目脚手架与共享契约」已完成并通过验收（codex 返工修复了启动失败误报）。已产出：`package.json`、`src/shared/types.ts`、`src/templates/registry.ts` 与 `index.ts`、`src/remotion/Root.tsx`、`server/index.ts`、`server/index.test.ts`、`vite.config.ts`、`docs/api.md`。完整 dev 联调仍因 3001 端口被外部进程占用而未跑通。

## 遗留问题
- 3001 端口被外部 PID 80832 占用，需确认允许停止后再重启 dev 验证 API、静态代理与主题点击。
- `/api/health`、Vite 代理、`/editor/:id` 路由尚未实际验证（相关配置在 `vite.config.ts` 与 `server/index.ts`）。
- 自测时 `pkill` 误杀了 SalesWell 的 Vite 服务，已恢复至 5174，需确认其运行状态。
- 6+ 内置示例模板、首页模板库、后端项目存取/上传/渲染、创作页（预览、参数表单、时间线、导出）、集成联调与 README 端到端验证均未开始。

## 负责人
负责人：codex；复核人：claude

## 更新记录
- 2026-10-29：完成项目脚手架与共享契约，返工修复启动失败误报，验收通过（codex）
- 2026-10-29：搭建脚手架与共享契约，tsc 通过但 dev 联调因端口占用未完成（claude）
- 2026-10-29：开始「项目脚手架与共享契约」前的仓库快照（linmaobang）
