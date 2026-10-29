# API 约定

服务仅监听 `127.0.0.1:3001`；Vite(5173) 代理 `/api` 与 `/files`。数据存于 `data/`（已被 git 忽略）。

## 本地启动与检查

运行 `npm install`、`npm run typecheck`、`npm run build`，然后用 `npm run dev` 同时启动前后端。
首页为 `http://127.0.0.1:5173/`，编辑器占位为 `/editor/<id>`。
`curl -f http://127.0.0.1:3001/api/health` 与 `curl -f http://127.0.0.1:5173/api/health` 均应返回 `{"ok":true}`。
若日志出现 `EADDRINUSE`，先用 `lsof -nP -iTCP:3001 -iTCP:5173 -sTCP:LISTEN` 确认占用进程及所属项目；释放端口后重启 `npm run dev`，不要批量终止 Node/Vite 进程。
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
- Remotion 入口 `src/remotion/index.ts`；Composition id = 模板 id；`calculateMetadata` 从 inputProps 读取 `width/height/fps/durationInFrames`（≤1920x1080）。预览(@remotion/player)与渲染共用同一组件。
- 类型定义见 `src/shared/types.ts`。
