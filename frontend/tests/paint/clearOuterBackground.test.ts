import assert from 'node:assert/strict';
import test from 'node:test';
import { clearOuterBackground } from '../../src/lib/paint/clearOuterBackground.ts';

type Color = readonly [number, number, number, number];

const WHITE: Color = [255, 255, 255, 255];
const BLACK: Color = [0, 0, 0, 255];
const TRANSPARENT: Color = [0, 0, 0, 0];

const createRaster = (width: number, height: number, color: Color = WHITE) => {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let offset = 0; offset < data.length; offset += 4) {
    data.set(color, offset);
  }

  return data;
};

const setPixel = (data: Uint8ClampedArray, width: number, x: number, y: number, color: Color) => {
  data.set(color, (y * width + x) * 4);
};

const getPixel = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));

/** 5x5 の中央に、黒い線で囲んだ 1 画素の白い内側を作る */
const createEnclosedShape = () => {
  const width = 5;
  const data = createRaster(width, 5);

  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      if (x !== 2 || y !== 2) {
        setPixel(data, width, x, y, BLACK);
      }
    }
  }

  return { data, width };
};

test('四辺からつながる白い背景を透明にする', () => {
  const { data, width } = createEnclosedShape();

  const cleared = clearOuterBackground(data, width, 5);

  assert.equal(cleared, 16);
  assert.deepEqual(getPixel(data, width, 0, 0), TRANSPARENT);
  assert.deepEqual(getPixel(data, width, 4, 2), TRANSPARENT);
});

test('線に囲まれた内側の白と線そのものは残す', () => {
  const { data, width } = createEnclosedShape();

  clearOuterBackground(data, width, 5);

  assert.deepEqual(getPixel(data, width, 2, 2), WHITE);
  assert.deepEqual(getPixel(data, width, 1, 1), BLACK);
});

test('白に近い色だけを背景とみなす', () => {
  const width = 3;
  const data = createRaster(width, 1);
  setPixel(data, width, 0, 0, [250, 250, 250, 255]);
  setPixel(data, width, 2, 0, [255, 230, 0, 255]);

  clearOuterBackground(data, width, 1);

  assert.deepEqual(getPixel(data, width, 0, 0), TRANSPARENT);
  assert.deepEqual(getPixel(data, width, 1, 0), TRANSPARENT);
  assert.deepEqual(getPixel(data, width, 2, 0), [255, 230, 0, 255]);
});

test('寸法が不正な場合は何もしない', () => {
  const data = createRaster(2, 2);

  assert.equal(clearOuterBackground(data, 3, 2), 0);
  assert.deepEqual(getPixel(data, 2, 0, 0), WHITE);
});
