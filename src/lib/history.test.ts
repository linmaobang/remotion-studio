import assert from 'node:assert/strict';
import test from 'node:test';
import { canRedo, canUndo, createHistory, moveItem, push, redo, undo } from './history';

test('push / undo / redo 往返', () => {
  let h = createHistory(1);
  assert.ok(!canUndo(h) && !canRedo(h));
  h = push(push(h, 2), 3);
  assert.deepEqual([h.past, h.present], [[1, 2], 3]);
  h = undo(undo(h));
  assert.deepEqual([h.past, h.present, h.future], [[], 1, [2, 3]]);
  assert.equal(undo(h), h);
  h = redo(h);
  assert.equal(h.present, 2);
  assert.equal(redo(redo(h)).present, 3);
  assert.equal(redo(redo(redo(h))).present, 3);
});

test('新的修改会清空重做栈，相同状态不入栈', () => {
  let h = push(push(createHistory(1), 2), 3);
  h = push(undo(h), 9);
  assert.deepEqual([h.past, h.present, h.future], [[1, 2], 9, []]);
  assert.equal(push(h, 9), h);
});

test('相同 group 的连续修改合并为一条历史（拖动合并）', () => {
  let h = createHistory(0);
  for (const value of [1, 2, 3, 4]) h = push(h, value, 'drag-1');
  assert.deepEqual([h.past, h.present], [[0], 4]);
  h = push(h, 5, 'drag-2');
  assert.deepEqual(h.past, [0, 4]);
  h = push(push(h, 6), 7); // 无 group 不合并
  assert.deepEqual(h.past, [0, 4, 5, 6]);
  assert.equal(undo(push(createHistory(0), 1, 'g')).present, 0);
});

test('undo 之后同一 group 的新修改不会并入旧记录', () => {
  let h = push(createHistory(0), 1, 'g');
  h = undo(h);
  h = push(h, 2, 'g');
  assert.deepEqual([h.past, h.present], [[0], 2]);
});

test('超过上限时丢弃最旧记录', () => {
  let h = createHistory(0);
  for (let i = 1; i <= 5; i++) h = push(h, i, undefined, 3);
  assert.deepEqual(h.past, [2, 3, 4]);
});

test('moveItem 重排且不修改原数组', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(items, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(items, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(items, 1, 9), items);
  assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});
