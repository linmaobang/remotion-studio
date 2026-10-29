# API 约定

服务默认仅监听 `127.0.0.1:3217`；Vite(5173) 代理 `/api` 与 `/files`。数据存于 `data/`（已被 git 忽略）。
可用 `PORT=3218 npm run dev` 覆盖服务端口，Vite 的两项代理会同步使用该端口；监听地址仍为 `127.0.0.1`。

## 本地启动与检查

运行 `npm install`、`npm run typecheck`、`npm run build`，然后用 `npm run dev` 同时启动前后端。
首页为 `http://127.0.0.1:5173/`，编辑器占位为 `/editor/<id>`。
`curl -f http://127.0.0.1:3217/api/health` 与 `curl -f http://127.0.0.1:5173/api/health` 均应返回 `{"ok":true}`。覆盖端口后，相应调整直连 API 的检查地址。
若日志出现 `EADDRINUSE`，先用 `lsof -nP -iTCP:3217 -iTCP:5173 -sTCP:LISTEN` 确认占用进程及所属项目；API 端口被占用时可通过 `PORT` 改用空闲端口。不要停止无关进程或批量终止 Node/Vite 进程。
启动失败回归测试：`node --import tsx --test server/index.test.ts`。

当前仅实现健康检查与静态文件服务；下表中项目、上传和渲染接口为后续步骤的契约，对应 Router 暂为空。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 `{ok:true}` |
| GET | `/api/projects` | 项目列表 `ProjectData[]` |
| POST | `/api/projects` | 创建项目（body 为部分 ProjectData，服务端补 id/updatedAt），存 `data/projects/<id>.json` |
| GET | `/api/projects/:id` | 读取项目 |
| PUT | `/api/projects/:id` | 整体更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |
| POST | `/api/upload` | multipart（字段 `file`，multer），存 `data/uploads`，返回 `{url:'/files/uploads/xxx',name,mime}` |
| GET | `/files/*` | 静态服务 `data/`（`/files/uploads`、`/files/renders`） |
| POST | `/api/render` | body `{projectId}` 或 `{project: ProjectData}` → `{jobId}` |
| GET | `/api/render/:jobId` | → `{status:'queued'|'rendering'|'done'|'error',progress:0..1,outputUrl?,error?}` |

渲染输出 `data/renders/*.mp4`，由 `/files/renders/...` 提供。

## 模板约定
- 每个模板 `src/templates/<id>/index.tsx` default 导出 `TemplateDef`，并在 `src/templates/index.ts` 显式 import 追加。
- Remotion 入口 `src/remotion/index.ts`；Composition id = 模板 id；`calculateMetadata` 从 inputProps 读取 `width/height/fps/durationInFrames`（横屏 ≤1920x1080，竖屏即高>宽时 ≤1080x1920）。预览(@remotion/player)与渲染共用同一组件。
- 类型定义见 `src/shared/types.ts`。

## 创作画布（studio-canvas）
- `templateId` 为 `studio-canvas`，`props = { scenes: Scene[] }`（见 `src/templates/studio-canvas/model.ts`），项目 `durationInFrames` 必须等于各场景 `durationFrames` 之和（编辑器用 `withStudioDuration` 维护）。
- 起手预设见 `src/templates/studio-canvas/presets.ts`；创建项目即 `POST /api/projects`，body 带预设的 `props/width/height/durationInFrames`。
- 渲染端不应用 schema 默认值，合成组件内部自行解析；素材 `src` 以 `/` 开头时渲染前由服务端改写为 `http://127.0.0.1:<PORT>` 前缀。
