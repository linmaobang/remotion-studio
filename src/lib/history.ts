export type History<T> = { past: T[]; present: T; future: T[]; group?: string };

export const HISTORY_LIMIT = 100;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/**
 * 记录一次新状态。相邻两次 push 的 group 相同（且非空）时合并为一条历史，
 * 用于把一次拖动或同一字段的连续输入合并成一次撤销。
 */
export function push<T>(history: History<T>, next: T, group?: string, limit = HISTORY_LIMIT): History<T> {
  if (Object.is(next, history.present)) return history;
  if (group && group === history.group) return { ...history, present: next, future: [] };
  return { past: [...history.past, history.present].slice(-limit), present: next, future: [], group };
}

export const canUndo = (history: History<unknown>) => history.past.length > 0;
export const canRedo = (history: History<unknown>) => history.future.length > 0;

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}

/** 把数组中 from 位置的元素移到 to 位置（场景拖动排序用），越界时原样返回。 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
