import assert from 'node:assert/strict';
import test from 'node:test';
import { HIGHLIGHT_DURATION_MS, stepHighlight } from '../../src/lib/display/newArtworkHighlight.ts';

test('登場中は10秒を維持し、泳ぎ始めた分だけ減らす', () => {
  assert.equal(stepHighlight(HIGHLIGHT_DURATION_MS, 100, 200), HIGHLIGHT_DURATION_MS);
  assert.equal(stepHighlight(HIGHLIGHT_DURATION_MS, 100, 40), 9940);
});

test('泳ぎ始めて10秒で消え、それ以降も0を保つ', () => {
  assert.equal(stepHighlight(HIGHLIGHT_DURATION_MS, 5000, 0), 5000);
  assert.equal(stepHighlight(5000, 5000, 0), 0);
  assert.equal(stepHighlight(0, 100, 0), 0);
});
