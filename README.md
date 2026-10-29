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

## 创作画布（自由创作）
首页顶部的「开始创作」/「新建空白画布」会直接创建一个 `studio-canvas` 项目并进入编辑页；也可以从三个预设起步：**标题开场**、**图文介绍**、**社交竖屏 720×1280**（预设只是不同的初始场景与尺寸，定义在 `src/templates/studio-canvas/presets.ts`）。
- **结构**：项目由多个场景首尾相接组成，每个场景有背景（纯色/线性渐变）、时长和入场转场；场景里叠放图层，靠后的在上层。总时长 = 各场景帧数之和，随场景增删自动更新。
- **图层**：文字、矩形/椭圆/线条、图片、视频、音频。左栏「添加」可新增，图片/视频/音频支持上传。
- **舞台操作**：点击选中，拖动移动，八个手柄缩放（Shift 等比），顶部圆点旋转（Shift 吸附 15°），方向键微调（Shift 大步），Delete 删除，双击文字就地编辑；锁定或隐藏的图层不可在舞台操作。
- **属性面板**：选中图层时修改位置、尺寸、旋转、透明度、文字/形状样式、素材、入场/出场/循环动画与起止帧；未选中时修改场景背景、时长、转场，以及项目名称与分辨率。
- **场景条与图层列表**：新增/复制/删除/重命名/拖动排序场景，点击切换（预览跳到该场景起点）；图层可显示/隐藏、锁定、上下移、复制、重命名。
- **快捷键**：⌘/Ctrl+Z 撤销，⇧⌘Z（或 Ctrl+Y）重做，⌘/Ctrl+D 复制图层，空格播放/暂停（在输入框、按钮上不触发）。一次拖动合并为一次撤销记录；撤销栈只在当前编辑会话内有效。
- 点「保存项目」写入服务端，点「导出 MP4」渲染当前项目。

## 导出说明
- 编码 h264，横屏最高 1920×1080、竖屏最高 1080×1920（高大于宽时上限对调），宽高自动钳制为偶数，帧率 1–60。
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
4. Composition id 即模板 id；宽高、帧率、时长取自项目，并在渲染端限制：横屏不超过 1920×1080，竖屏不超过 1080×1920。

## 版本约定
`remotion` 与全部 `@remotion/*` 固定为 4.0.539，`zod` 固定为 3.22.3，升级时需同步。

## Remotion 许可
Remotion 对个人和小型团队免费；公司规模超过其许可阈值时需购买 Company License。商用前请阅读 https://www.remotion.dev/license 。本项目仅作个人学习/自用。
