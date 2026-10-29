// 每个模板位于 src/templates/<id>/index.tsx 并 default 导出 TemplateDef。
// 新增模板：在此 import 并追加到数组（显式列表，便于并行追加与 Node 端打包）。
import type { TemplateDef } from './registry';

export const templates: TemplateDef[] = [];
