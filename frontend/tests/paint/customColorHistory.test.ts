import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_CUSTOM_COLORS, rememberCustomColor } from '../../src/lib/paint/customColorHistory.ts';

const presetColors = new Set(['#ef4444', '#1f2937']);

test('選んだ色を新しい順に最大5色まで残す', () => {
  const selected = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'];
  const history = selected.reduce<string[]>(
    (colors, color) => rememberCustomColor(colors, color, presetColors),
    [],
  );

  assert.equal(history.length, MAX_CUSTOM_COLORS);
  assert.deepEqual(history, selected.slice(1).reverse());
});

test('同じ色を選び直すと重複を作らず先頭へ移す', () => {
  const history = rememberCustomColor(['#333333', '#222222', '#111111'], '#222222', presetColors);

  assert.deepEqual(history, ['#222222', '#333333', '#111111']);
});

test('既存パレットの色は保存しない', () => {
  const history = rememberCustomColor(['#333333'], '#ef4444', presetColors);

  assert.deepEqual(history, ['#333333']);
});
