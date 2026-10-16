import assert from 'node:assert/strict';
import test from 'node:test';
import { getStageScale } from '../../src/lib/ui/stageScale.ts';

test('1920×1080 の画面ではそのままの大きさで表示する', () => {
  assert.equal(getStageScale(1920, 1080), 1);
});

test('小さい画面では、はみ出さないように比率を保って縮める', () => {
  assert.equal(getStageScale(1366, 768), Math.min(1366 / 1920, 768 / 1080));
  assert.equal(getStageScale(1536, 864), 0.8);
});

test('縦長・横長の画面では、短いほうに合わせる', () => {
  assert.equal(getStageScale(1920, 540), 0.5);
  assert.equal(getStageScale(960, 1080), 0.5);
});

test('大きさが取れない場合は等倍にする', () => {
  assert.equal(getStageScale(0, 0), 1);
});
