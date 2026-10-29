# API 约定

服务默认仅监听 `127.0.0.1:3217`；Vite(5173) 代理 `/api` 与 `/files`。数据存于 `data/`（已被 git 忽略）。
可用 `PORT=3218 npm run dev` 覆盖服务端口，Vite 的两项代理会同步使用该端口；监听地址仍为 `127.0.0.1`。

## 本地启动与检查

运行 `npm install`、`npm run typecheck`、`npm run build`，然后用 `npm run dev` 同时启动前后端。
首页为 `http://127.0.0.1:5173/`，编辑器占位为 `/editor/<id>`。
`curl -f http://127.0.0.1:3217/api/health` 与 `curl -f http://127.0.0.1:5173/api/health` 均应返回 `{"ok":true}`。覆盖端口后，相应调整直连 API 的检查地址。
若日志出现 `EADDRINUSE`，先用 `lsof -nP -iTCP:3217 -iTCP:5173 -sTCP:LISTEN` 确认占用进程及所属项目；API 端口被占用时可通过 `PORT` 改用空闲端口。不要停止无关进程或批量终止 Node/Vite 进程。
启动失败回归测试：`node --import tsx --test server/index.test.ts`。

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
| POST | `/api/plan/optimize` | 需求 → 完整 VideoPlan，见下节 |
| POST | `/api/plan/refine` | 按自然语言指令修改方案，见下节 |
| GET | `/api/render/:jobId` | → `{status:'queued'|'rendering'|'done'|'error',progress:0..1,outputUrl?,error?}` |

渲染输出 `data/renders/*.mp4`，由 `/files/renders/...` 提供。

## 视频方案接口 /api/plan/*
类型定义见 `src/plan/api.ts`，方案结构见 `src/plan/schema.ts` 与 README「VideoPlan JSON schema」。两个接口共用响应 `PlanResponse`：
```ts
{ plan: VideoPlan, usedLLM: boolean, warnings: string[] }
```
`plan` 一定已通过 `parsePlan` 修复（数值钳制、默认值补全）；`usedLLM:false` 表示走了本地兜底；`warnings` 应展示给用户。

环境变量：`ANTHROPIC_API_KEY`（未设置则不调用 LLM）、`LLM_MODEL`（默认 `claude-sonnet-5-5`），均在每次请求时读取。LLM 输出不是合法 JSON/方案时，带错误信息最多重试到共 3 次调用，仍失败则降级；LLM 抛错同样降级，不会返回 5xx。

### POST /api/plan/optimize
请求 `OptimizeRequest`：
```json
{ "prompt": "为咖啡店做开业宣传", "durationSec": 30, "orientation": "landscape",
  "assets": [{ "url": "/files/uploads/x.png", "name": "x.png", "kind": "image" }] }
```
- `prompt` 必填（去空白后非空）；`durationSec`、`orientation`（`landscape|portrait`）可选；`assets[].kind` 为 `image|audio|voiceover`，url 取自 `/api/upload`。
- 200：`PlanResponse`。无 key 时 `usedLLM:false`，`warnings` 含「未配置 ANTHROPIC_API_KEY…」，素材已按规则放入方案（图片 → imageSrc/背景，audio → `audio.bgm`）。
- 400：`{ "error": "prompt 不能为空" }`。其余内部错误 500 `{ "error": "服务内部错误" }`。

### POST /api/plan/refine
请求 `RefineRequest`：`{ "plan": VideoPlan, "instruction": "把第二个场景改成列表" }`。
- 200：`PlanResponse`；无 key 或修改失败时 `usedLLM:false` 并原样返回（经修复的）plan，`warnings` 说明原因。
- 400：`plan` 无法解析（如 `scenes` 为空）或 `instruction` 为空，`{ "error": "需要有效的 plan 与非空的 instruction" }`。

### 用方案生成视频（curl 流程）
```bash
B=http://127.0.0.1:3217
curl -F file=@a.png $B/api/upload                      # → {url,name,mime}
curl -X POST $B/api/plan/optimize -H 'content-type: application/json' -d '{"prompt":"…","assets":[…]}'
curl -X POST $B/api/projects -H 'content-type: application/json' \
  -d '{"name":"x","templateId":"ai-video","props":{"plan":<plan>},"width":1920,"height":1080,"fps":30,"durationInFrames":<各场景帧数之和>}'
curl -X POST $B/api/render -H 'content-type: application/json' -d '{"projectId":"<id>"}'   # → {jobId}，轮询 GET /api/render/<jobId> 至 done
```
`ai-video` 项目的 `props` 为 `{ plan }`；项目的 width/height/fps/durationInFrames 必须与 plan 一致（编辑器用 `withPlan` 同步）。

## 模板约定
- 每个模板 `src/templates/<id>/index.tsx` default 导出 `TemplateDef`，并在 `src/templates/index.ts` 显式 import 追加。
- Remotion 入口 `src/remotion/index.ts`；Composition id = 模板 id；`calculateMetadata` 从 inputProps 读取 `width/height/fps/durationInFrames`（横屏 ≤1920x1080，竖屏即高>宽时 ≤1080x1920）。预览(@remotion/player)与渲染共用同一组件。
- 类型定义见 `src/shared/types.ts`。

## 创作画布（studio-canvas）
- `templateId` 为 `studio-canvas`，`props = { scenes: Scene[] }`（见 `src/templates/studio-canvas/model.ts`），项目 `durationInFrames` 必须等于各场景 `durationFrames` 之和（编辑器用 `withStudioDuration` 维护）。
- 起手预设见 `src/templates/studio-canvas/presets.ts`；创建项目即 `POST /api/projects`，body 带预设的 `props/width/height/durationInFrames`。
- 渲染端不应用 schema 默认值，合成组件内部自行解析；素材 `src` 以 `/` 开头时渲染前由服务端改写为 `http://127.0.0.1:<PORT>` 前缀。
