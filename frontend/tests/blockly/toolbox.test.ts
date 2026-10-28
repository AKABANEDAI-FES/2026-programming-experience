import assert from 'node:assert/strict';
import test from 'node:test';
import * as Blockly from 'blockly';
import { defineCommandBlocks } from '../../src/lib/blockly/blocks.ts';
import {
  MOTION_FIELD_NAME,
  MOTION_OPTIONS,
  MOVE_BLOCK_TYPE,
} from '../../src/lib/blockly/commandSchema.ts';
import { TOOLBOX } from '../../src/lib/blockly/toolbox.ts';

defineCommandBlocks();

test('動きブロックは一覧にジャンプする1つだけ表示する', () => {
  const motionBlocks = TOOLBOX.contents.filter(
    (item) => item.kind === 'block' && item.type === MOVE_BLOCK_TYPE,
  );

  assert.equal(motionBlocks.length, 1);
  assert.equal(motionBlocks[0].fields?.[MOTION_FIELD_NAME], 'jump');
});

test('動きブロックは「動きように うごく」と表示し、5種類から選べる', () => {
  const block = new Blockly.Workspace().newBlock(MOVE_BLOCK_TYPE);
  const displayedText = block.inputList[0].fieldRow.map((field) => field.getText()).join('');

  assert.equal(displayedText, 'ジャンプするように うごく');
  assert.deepEqual(block.getField(MOTION_FIELD_NAME)?.getOptions(false), MOTION_OPTIONS);
  assert.equal(MOTION_OPTIONS.length, 5);
});
