# Remotion 视频工坊

基于 Remotion 官方包的本机可视化视频创作工具。除了浏览模板、改参数、导出 MP4，还能**用一句话生成视频**：输入需求（可附图片/音乐/配音）→ AI 优化成分镜方案（VideoPlan）→ 在可视化编辑器里预览、拖拽调整 → 导出带音轨的 MP4。仅供本地个人使用，服务只监听 `127.0.0.1`。

## 架构（文字图）
```
浏览器 (Vite + React, :5173)
 ├─ /            首页：模板库、我的项目
 ├─ /create      文字生成视频：需求输入 → 方案 → 项目
 ├─ /editor/:id  编辑器（ai-video 项目用方案编辑器，其余用模板/画布编辑器）
 │      │ 预览：@remotion/player，与渲染共用同一组件
 │      ▼ /api、/files 经 Vite 代理
Express 后端 (127.0.0.1:3217, server/)
 ├─ /api/plan/optimize|refine   server/plan.ts → server/llm.ts → Anthropic API（AI 引擎：API Key / 本机 Claude Code / Codex，自动探测；不可用时明确报错，不再套固定模板）
 ├─ /api/projects               项目存取 → data/projects/*.json
 ├─ /api/upload                 素材上传 → data/uploads/
 └─ /api/render                 @remotion/bundler + renderer（h264/aac）→ data/renders/*.mp4
共享：src/plan/（VideoPlan schema、API 契约）；src/templates/ai-video（方案驱动的 Remotion 模板）
```

## 环境要求
- Node.js 20+、npm
- 首次导出需联网下载 Chrome Headless Shell（Remotion 自动完成，缓存于 `node_modules/.remotion`）
- 可选：`ffmpeg`/`ffprobe`，用于准备测试素材与核验导出文件

## 安装与启动
```bash
npm install
npm run dev
```
- 前端（Vite）：http://127.0.0.1:5173（`strictPort`，被占用会直接失败）
- 后端（Express）：http://127.0.0.1:3217，Vite 将 `/api` 与 `/files` 代理到它
- 改过模板或后端代码后需重启后端：服务端 bundle 按进程缓存。
- 其他脚本：`npm run typecheck`、`npm run build`
- 测试：`node --import tsx --test $(find src server -name '*.test.ts' -o -name '*.test.tsx')`
- 端口被占用时先用 `lsof -nP -iTCP:端口 -sTCP:LISTEN` 确认占用进程，不要按名字批量杀进程。

## 环境变量
| 变量 | 默认 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 无 | 自动探测的第一优先引擎（API Key → 本机 claude → 本机 codex）。只从环境变量读取，不落盘。 |
| `LLM_PROVIDER` | 自动 | `api` / `claude-cli` / `codex-cli`；未设置时按 API Key → claude → codex 自动探测（在 PATH 里找可执行文件，不读凭据）。页面「AI 引擎」选择和请求体 `provider` 优先于它。 |
| `LLM_MODEL` | `claude-sonnet-5-5` | 使用的模型 ID，每次请求时读取。 |
| `PLAN_ALLOW_HEURISTIC` | 未设置 | 设为 `1` 时，AI 失败后允许退回本地固定模板（响应明确标注，页面红字提示）；也让页面出现「本地模板」选项。 |
| `PORT` | `3217` | 后端端口；Vite 代理同步使用（`PORT=3218 npm run dev`）。 |

示例：`ANTHROPIC_API_KEY=sk-... npm run dev`。

### 用本机 Claude Code / Codex CLI 代替 API Key
设置 `LLM_PROVIDER=claude-cli` 或 `codex-cli`，让 `/api/plan/*` 调用本机已登录的 CLI。Claude 使用 `claude auth login` 订阅登录，Codex 使用 `codex login` 的 ChatGPT 登录；使用订阅登录时额度计入各自订阅，须遵守各自服务条款，仅限个人本机自用。适配层不读取凭据文件。CLI 继承终端环境，使用 Claude 订阅时需取消 `ANTHROPIC_API_KEY`，避免 CLI 改走 API 计费（[官方说明](https://support.claude.com/en/articles/12304248-manage-api-key-environment-variables-in-claude-code)）。

```bash
env -u ANTHROPIC_API_KEY LLM_PROVIDER=claude-cli npm run dev
# 或 LLM_PROVIDER=codex-cli
env -u ANTHROPIC_API_KEY npm run ask -- --provider both "问题"
```

可选 `LOCAL_AGENT_MODEL`、`LOCAL_AGENT_TIMEOUT_MS`（默认 180000 毫秒）、`LOCAL_AGENT_CONCURRENCY`（默认 1，最大 2）。`both` 依次调用两者，任一失败退出码为 1。AI 不可用或失败时 `/api/plan/*` 返回 502/503 和原因，页面显示错误并可重试，**不会**再悄悄生成固定模板。当前受限执行环境的真实调用仍失败：Claude 连接被拒绝/超时，Codex 初始化被拒绝；尚未验证两者的真实 `usedLLM:true`。完整命令与验证记录见 [docs/local-agent.md](docs/local-agent.md)。

## 文字生成视频（/create）
1. 输入需求，可点「示例」填充；选择时长（秒）与横/竖屏；可上传图片、背景音乐、配音。
2. 点「一键生成视频」：调用 `/api/plan/optimize` 得到方案，创建 `ai-video` 项目并进入 `/editor/<id>`。
3. 后端不可用或返回异常时页面显示中文错误并可重试；后端不可用创建项目时会退回浏览器本地缓存。

### 两种自动化模式
页面顶部开关，选择保存在 localStorage（键 `remotion-studio.create-mode`），向导进行中也能切换：
- **一键全自动**（默认）：生成方案后直接创建项目并跳转编辑器。
- **分步确认**：依次「优化需求 → 生成方案 → 创建项目」，方案出来后停下，可手动编辑、用自然语言 refine（调用 `/api/plan/refine`），确认后才创建项目。

### 素材上传
- 图片、背景音乐、配音在需求页或编辑器左栏「素材库」上传，走 `POST /api/upload`，存 `data/uploads/`，得到 `/files/uploads/...` 地址（单文件上限 2GB）。
- 优化时素材清单随请求传给后端：图片优先填入 image-text 场景的 `imageSrc`，多余的作为场景背景；音乐填 `audio.bgm.src`，配音填 `audio.voiceover.src`。
- 渲染时以 `/` 开头的素材地址会被改写为 `http://127.0.0.1:<PORT>` 前缀。

## VideoPlan JSON schema
定义在 `src/plan/schema.ts`（zod）。`parsePlan` 是宽松解析：补默认值、钳制数值、丢弃未知字段和无法识别的场景，永不抛异常；没有任何可用场景时返回失败。

顶层字段：
| 字段 | 说明 |
|---|---|
| `version` | 固定 1 |
| `title` | 方案标题（≤100 字，默认「未命名方案」） |
| `brief` | 可选，原始需求摘要 |
| `style` | `theme{primary,secondary,background,text}` 颜色（hex/rgb/hsl/颜色名），`fontFamily`，`mood?` |
| `format` | `width`/`height`/`fps`：横屏 ≤1920×1080，竖屏（高>宽）≤1080×1920，宽高取偶数，fps 1–60（默认 30） |
| `scenes` | 场景数组，1–30 个，首尾相接，总帧数 = 各场景 `durationFrames` 之和 |
| `audio` | `bgm?{src,volume 0–1(默认0.3),loop}`，`voiceover?{src,volume 0–1(默认1),startFrame}` |

场景公共字段：`id`、`kind`、`durationFrames`（整数帧，15–3600）、`transition{type:"fade"|"slide-left"|"slide-up"|"none",frames 0–120}`（不超过场景时长的一半）、可选 `backgroundColor`、`backgroundSrc`、`notes`。

| kind | 专有字段 |
|---|---|
| `title` | `title`，`subtitle?` |
| `image-text` | `title`，`body`（≤600 字），`imageSrc?`，`imagePosition`（left/right） |
| `list` | `title`，`items`（字符串数组，最多 8 条） |
| `stat` | `title`，`stats`（最多 4 个 `{value,label}`） |
| `cta` | `title`，`buttonText`，`subtitle?` |

示例（完整示例见 `samplePlan()`）：
```json
{
  "version": 1,
  "title": "暖阳咖啡 · 开业啦",
  "style": { "theme": { "primary": "#d97706", "secondary": "#92400e", "background": "#1c1917", "text": "#fef3c7" }, "fontFamily": "rounded" },
  "format": { "width": 1920, "height": 1080, "fps": 30 },
  "scenes": [
    { "id": "s1", "kind": "title", "durationFrames": 150, "transition": { "type": "fade", "frames": 15 }, "title": "暖阳咖啡 盛大开业", "subtitle": "一杯咖啡，一段好时光" },
    { "id": "s2", "kind": "image-text", "durationFrames": 180, "transition": { "type": "slide-left", "frames": 15 }, "title": "温暖的小空间", "body": "原木与绿植，窗边的阳光", "imageSrc": "/files/uploads/xxx.png", "imagePosition": "right" },
    { "id": "s3", "kind": "cta", "durationFrames": 120, "transition": { "type": "fade", "frames": 15 }, "title": "开业首周，第二杯半价", "buttonText": "到店领取" }
  ],
  "audio": { "bgm": { "src": "/files/uploads/yyy.mp3", "volume": 0.3, "loop": true } }
}
```

## 方案编辑器（/editor/<id>，ai-video 项目）
- **左栏**：场景列表（点击选中并跳转预览）、素材库（上传，图片「设为图片/设为背景」，音频「设为 BGM/设为配音」）。
- **中间**：Remotion Player 实时预览，播放/暂停/进度/全屏；空格键播放暂停（焦点在输入框或按钮上不触发）。预览暂停并停在场景起点（0:00 或转场起点）时，显示该场景入场/转场结束后的首个稳定帧；仅影响预览显示，导出不受影响。
- **底部时间轴**：拖动场景块排序，拖右边缘改时长，缩放滑块；「添加场景/复制/删除」。
- **右栏属性面板**：「全局」（标题、配色、画幅、音频）与「场景」（按 kind 的文案/列表/数据、时长、转场、背景、图片）；顶部「用 AI 修改」输入自然语言指令（调用 refine，AI 不可用或失败时显示错误，不会假装成功）。
- **撤销/重做**：所有修改走同一入口，撤销栈存整项目快照，上限 100，仅当前会话有效；改动防抖约 1.5 秒自动保存，也可点「保存」。

## 导出说明
- 点「导出 MP4」创建渲染任务（`POST /api/render`），页面轮询进度，完成后可下载；文件在 `data/renders/*.mp4`。
- 编码 h264，有音频时混入 aac 音轨；横屏最高 1920×1080、竖屏最高 1080×1920，宽高自动钳为偶数，帧率 1–60。
- 首次导出会打包 Remotion 入口并下载 Chrome Headless Shell，需联网、较慢；之后有缓存。
- 实测：3 场景、10 秒的方案（含上传图片与 mp3）渲染出 1920×1080、30fps、10.0 秒、h264 + aac 的 MP4。

## 数据目录（已被 git 忽略）
- `data/projects/*.json` 项目；`data/uploads/` 上传素材；`data/renders/*.mp4` 导出结果
- 通过 `/files/uploads/...`、`/files/renders/...` 访问。API 约定见 [docs/api.md](docs/api.md)。

## 已知限制
- 未用真实 ANTHROPIC_API_KEY 验证过 Claude 调用；LLM 非法输出的重试只有单测覆盖（最多 3 次，仍不合法则返回 502）。
- 本地固定模板（`heuristicPlan`，非 AI）默认关闭，仅在 `PLAN_ALLOW_HEURISTIC=1` 或请求 `provider:"heuristic"` 时使用，页面会醒目标注「本地模板，未使用 AI」。
- AI 生成一次可能需要 1-2 分钟（本机 CLI 启动 + 推理）；`durationSec` 以需求页的时长选择为准。
- 竖屏、配音（voiceover）的真实渲染未实测；BGM 已实测。
- 方案编辑器预览在场景起点可能显示转场起始状态（见上）；未做人工视觉走查，未用真实鼠标测试时间轴拖拽。
- 上传的 mp3 在 `/api/upload` 返回的 `mime` 为 `application/octet-stream`（由浏览器/multer 判定，不影响使用）。
- 撤销栈刷新即清空；仅本机单用户，无鉴权。
- 首页构建存在打包体积过大告警；开发时 `/favicon.ico` 返回 404（无图标）。

## 创作画布（自由创作）
首页顶部的「开始创作」/「新建空白画布」会直接创建一个 `studio-canvas` 项目并进入编辑页；也可以从三个预设起步：**标题开场**、**图文介绍**、**社交竖屏 720×1280**（预设只是不同的初始场景与尺寸，定义在 `src/templates/studio-canvas/presets.ts`）。
- **结构**：项目由多个场景首尾相接组成，每个场景有背景（纯色/线性渐变）、时长和入场转场；场景里叠放图层，靠后的在上层。总时长 = 各场景帧数之和，随场景增删自动更新。
- **图层**：文字、矩形/椭圆/线条、图片、视频、音频。左栏「添加」可新增，图片/视频/音频支持上传。
- **舞台操作**：点击选中，拖动移动，八个手柄缩放（Shift 等比），顶部圆点旋转（Shift 吸附 15°），方向键微调（Shift 大步），Delete 删除，双击文字就地编辑；锁定或隐藏的图层不可在舞台操作。
- **属性面板**：选中图层时修改位置、尺寸、旋转、透明度、文字/形状样式、素材、入场/出场/循环动画与起止帧；未选中时修改场景背景、时长、转场，以及项目名称与分辨率。
- **场景条与图层列表**：新增/复制/删除/重命名/拖动排序场景，点击切换（预览跳到该场景起点）；图层可显示/隐藏、锁定、上下移、复制、重命名。
- **快捷键**：⌘/Ctrl+Z 撤销，⇧⌘Z（或 Ctrl+Y）重做，⌘/Ctrl+D 复制图层，空格播放/暂停（在输入框、按钮上不触发）。一次拖动合并为一次撤销记录；撤销栈只在当前编辑会话内有效。
- 点「保存项目」写入服务端，点「导出 MP4」渲染当前项目。

## 新增模板
1. 新建 `src/templates/<id>/index.tsx`，default 导出 `TemplateDef`：
```tsx
import { z } from 'zod';
import type { TemplateDef } from '../registry';
import { defaultConfig } from '../shared'; // { width, height, fps, durationInFrames }

const schema = z.object({ title: z.string().describe('标题') }).describe('我的模板');
const MyTemplate = ({ title }: z.infer<typeof schema>) => <div>{title}</div>;

export default {
  meta: { id: 'my-template', name: '我的模板', category: 'Motion graphics', tags: ['示例'], prompt: '给 AI 的描述', description: '一句话介绍' },
  component: MyTemplate,
  schema,
  defaultProps: { title: '你好' },
  defaultConfig,
} satisfies TemplateDef;
```
2. 在 `src/templates/index.ts` 显式 import 并追加到 `templates` 数组（预览、首页与 Node 渲染端共用，不做目录自动扫描）。
3. `category` 取值：`Motion graphics`、`Explainers`、`3D 场景`、`Games & interactive`、`剪辑`。
4. Composition id 即模板 id；宽高、帧率、时长取自项目，并在渲染端限制：横屏不超过 1920×1080，竖屏不超过 1080×1920。

## 版本约定
`remotion` 与全部 `@remotion/*` 固定为 4.0.539，`zod` 固定为 3.22.3，升级时需同步。

## Remotion 许可
Remotion 对个人和小型团队免费；公司规模超过其许可阈值时需购买 Company License。商用前请阅读 https://www.remotion.dev/license 。本项目仅作个人学习/自用。
