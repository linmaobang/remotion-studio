// 每个模板位于 src/templates/<id>/index.tsx 并 default 导出 TemplateDef。
// 新增模板：在此 import 并追加到数组（显式列表，便于并行追加与 Node 端打包）。
import type { TemplateDef } from './registry';
import kineticType from './kinetic-type';
import orbitalGrid from './orbital-grid';
import processFlow from './process-flow';
import growthChart from './growth-chart';
import crystalOrbit from './crystal-orbit';
import signalGame from './signal-game';
import blankTimeline from './blank-timeline';
import studioCanvas from './studio-canvas';

export const templates: TemplateDef[] = [kineticType, orbitalGrid, processFlow, growthChart, crystalOrbit, signalGame, blankTimeline, studioCanvas];
