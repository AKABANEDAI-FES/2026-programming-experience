import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SAY_TEXT_LENGTH } from 'shared/release';
import { limitSayText } from '../../src/lib/blockly/commandSchema.ts';

test('上限以内のセリフはそのまま返す', () => {
  const text = 'あ'.repeat(MAX_SAY_TEXT_LENGTH);

  assert.equal(limitSayText(text), text);
});

test('上限を超えるセリフは上限の文字数で切る', () => {
  assert.equal(
    limitSayText('あ'.repeat(MAX_SAY_TEXT_LENGTH + 1)),
    'あ'.repeat(MAX_SAY_TEXT_LENGTH),
  );
});

test('絵文字も1文字として数える', () => {
  const text = '🐟'.repeat(MAX_SAY_TEXT_LENGTH + 1);

  assert.equal(limitSayText(text), '🐟'.repeat(MAX_SAY_TEXT_LENGTH));
});
