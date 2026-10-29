# Remotion 视频工坊

基于 Remotion 官方包的本机可视化视频创作工具：浏览模板、实时预览、修改参数、做简单剪辑并导出 MP4。仅供本地个人使用，服务只监听 `127.0.0.1`。

## 环境要求
- Node.js 20+（已在 Node 22 下验证）、npm
- 首次导出需联网下载 Chrome Headless Shell（Remotion 自动完成，缓存于 `node_modules/.remotion`）
- 可选：`ffmpeg`/`ffprobe`，用于准备测试素材与核验导出文件

## 安装与启动
```bash
npm install
npm run dev
```
- 前端（Vite）：http://127.0.0.1:5173
- 后端（Express）：http://127.0.0.1:3217，Vite 将 `/api` 与 `/files` 代理到它
- 换后端端口：`PORT=3218 npm run dev`（代理同步使用该端口）
- 其他脚本：`npm run typecheck`、`npm run build`；测试：`node --import tsx --test src/components/home/library.test.ts src/templates/templates.test.tsx server/index.test.ts`
- 端口被占用时请先确认占用进程，不要强行终止无关进程。

## 使用
1. 首页按分类浏览模板，可搜索、悬停预览、复制 Prompt，点击卡片创建项目。
2. 创作页：右侧修改参数并实时预览；「空白剪辑」模板额外提供时间线（上传素材、加文字层、在播放头拆分、拖动/裁剪、转场、音量）。
3. 「保存项目」写入服务端；刷新后可从首页「我的项目」重新打开。
4. 「导出 MP4」创建渲染任务并轮询进度，完成后可下载。

## 导出说明
- 编码 h264，最高 1920×1080，宽高自动钳制为偶数，帧率 1–60。
- 首次导出会打包 Remotion 入口并下载 Chrome Headless Shell，需要联网，耗时较长；之后有缓存。
- 素材地址以 `/` 开头时，渲染前会改写为 `http://127.0.0.1:3217` 前缀。

## 数据目录（已被 git 忽略）
- `data/projects/*.json` 项目；`data/uploads/` 上传素材（单文件上限 2GB）；`data/renders/*.mp4` 导出结果
- 通过 `/files/uploads/...`、`/files/renders/...` 访问。API 约定见 [docs/api.md](docs/api.md)。

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
4. Composition id 即模板 id；宽高、帧率、时长取自项目，并在渲染端限制不超过 1920×1080。

## 版本约定
`remotion` 与全部 `@remotion/*` 固定为 4.0.539，`zod` 固定为 3.22.3，升级时需同步。

## Remotion 许可
Remotion 对个人和小型团队免费；公司规模超过其许可阈值时需购买 Company License。商用前请阅读 https://www.remotion.dev/license 。本项目仅作个人学习/自用。
