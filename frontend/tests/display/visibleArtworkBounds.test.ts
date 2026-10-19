import assert from 'node:assert/strict';
import test from 'node:test';
import { findVisibleArtworkBounds, getTrailAnchor } from '../../src/lib/display/visibleArtworkBounds.ts';

const setAlpha = (rgba: Uint8ClampedArray, width: number, x: number, y: number, alpha: number) => {
  rgba[(y * width + x) * 4 + 3] = alpha;
};

test('透明画素と薄い縁を除き、描画内容の範囲を返す', () => {
  const width = 4;
  const height = 3;
  const rgba = new Uint8ClampedArray(width * height * 4);
  setAlpha(rgba, width, 0, 2, 15);
  setAlpha(rgba, width, 1, 0, 255);
  setAlpha(rgba, width, 3, 2, 16);

  assert.deepEqual(findVisibleArtworkBounds(rgba, width, height), {
    minX: 1,
    minY: 0,
    maxX: 3,
    maxY: 2,
  });
});

test('表示画素がない場合や画像データの寸法が合わない場合はnullを返す', () => {
  assert.equal(findVisibleArtworkBounds(new Uint8ClampedArray(16), 2, 2), null);
  assert.equal(findVisibleArtworkBounds(new Uint8ClampedArray(15), 2, 2), null);
});

test('左右の進行方向に応じて描画範囲の後端を表示座標へ変換する', () => {
  const bounds = { minX: 20, minY: 10, maxX: 79, maxY: 39 };
  const right = getTrailAnchor(bounds, 100, 50, 200, 100, 'right', 0, 1);
  const left = getTrailAnchor(bounds, 100, 50, 200, 100, 'left', 0, 1);

  assert.deepEqual(right, { x: 40, y: 50 });
  assert.deepEqual(left, { x: 160, y: 50 });
});
