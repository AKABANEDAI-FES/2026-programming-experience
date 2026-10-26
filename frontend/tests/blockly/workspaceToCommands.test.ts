import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SAY_TEXT_LENGTH } from 'shared/release';
import { workspaceToCommands } from '../../src/lib/blockly/workspaceToCommands.ts';

const moveBlock = (motion: string, rest: Record<string, unknown> = {}) => ({
  type: 'move_command',
  fields: { MOTION: motion },
  ...rest,
});

const sayBlock = (text: string, rest: Record<string, unknown> = {}) => ({
  type: 'say_command',
  fields: { TEXT: text },
  ...rest,
});

const workspace = (...blocks: unknown[]) => ({ blocks: { languageVersion: 0, blocks } });

test('つながったブロックを上から順にCommand[]へ変換する', () => {
  const json = workspace(
    moveBlock('spin', {
      x: 20,
      y: 20,
      next: { block: sayBlock('こんにちは', { next: { block: moveBlock('jump') } }) },
    }),
  );

  assert.deepEqual(workspaceToCommands(json), [
    { type: 'move', motion: 'spin' },
    { type: 'say', text: 'こんにちは' },
    { type: 'move', motion: 'jump' },
  ]);
});

test('離れて置かれたブロックは上にあるものから順に変換する', () => {
  const json = workspace(moveBlock('spin', { x: 10, y: 200 }), sayBlock('やあ', { x: 10, y: 20 }));

  assert.deepEqual(workspaceToCommands(json), [
    { type: 'say', text: 'やあ' },
    { type: 'move', motion: 'spin' },
  ]);
});

test('ブロックがない場合は空の配列を返す', () => {
  assert.deepEqual(workspaceToCommands(workspace()), []);
  assert.deepEqual(workspaceToCommands({}), []);
});

test('コマンド以外のブロックは無視する', () => {
  const json = workspace({
    type: 'controls_if',
    next: { block: sayBlock('ここは のこる') },
  });

  assert.deepEqual(workspaceToCommands(json), [{ type: 'say', text: 'ここは のこる' }]);
});

test('無効化されたブロックは変換しない', () => {
  const json = workspace(
    moveBlock('jump', {
      disabledReasons: ['MANUALLY_DISABLED'],
      next: { block: sayBlock('やあ', { next: { block: moveBlock('spin', { enabled: false }) } }) },
    }),
  );

  assert.deepEqual(workspaceToCommands(json), [{ type: 'say', text: 'やあ' }]);
});

test('上限を超えるセリフは上限の文字数で切る', () => {
  const json = workspace(sayBlock('あ'.repeat(MAX_SAY_TEXT_LENGTH + 5)));

  assert.deepEqual(workspaceToCommands(json), [
    { type: 'say', text: 'あ'.repeat(MAX_SAY_TEXT_LENGTH) },
  ]);
});

const repeatBlock = (times: string, inner: unknown, rest: Record<string, unknown> = {}) => ({
  type: 'repeat_command',
  fields: { TIMES: times },
  inputs: inner === undefined ? {} : { DO: { block: inner } },
  ...rest,
});

test('くりかえしブロックを、中のブロックごと変換する', () => {
  const json = workspace(
    sayBlock('はじめ', {
      next: { block: repeatBlock('3', moveBlock('jump', { next: { block: sayBlock('やあ') } })) },
    }),
  );

  assert.deepEqual(workspaceToCommands(json), [
    { type: 'say', text: 'はじめ' },
    {
      type: 'repeat',
      times: 3,
      commands: [
        { type: 'move', motion: 'jump' },
        { type: 'say', text: 'やあ' },
      ],
    },
  ]);
});

test('中が空のくりかえしは、中身なしで変換する', () => {
  assert.deepEqual(workspaceToCommands(workspace(repeatBlock('2', undefined))), [
    { type: 'repeat', times: 2, commands: [] },
  ]);
});

test('くりかえしの中のくりかえし（2 段）はそのまま変換し、無効化されたブロックは含めない', () => {
  const json = workspace(
    repeatBlock(
      '2',
      repeatBlock('3', moveBlock('spin'), {
        next: { block: moveBlock('jump', { disabledReasons: ['MANUALLY_DISABLED'] }) },
      }),
    ),
  );

  assert.deepEqual(workspaceToCommands(json), [
    {
      type: 'repeat',
      times: 2,
      commands: [{ type: 'repeat', times: 3, commands: [{ type: 'move', motion: 'spin' }] }],
    },
  ]);
});

test('3 段目のくりかえしは、中身ごと含めない', () => {
  const json = workspace(repeatBlock('2', repeatBlock('3', repeatBlock('2', moveBlock('jump')))));

  assert.deepEqual(workspaceToCommands(json), [
    { type: 'repeat', times: 2, commands: [{ type: 'repeat', times: 3, commands: [] }] },
  ]);
});

test('回数が範囲外のくりかえしは、標準の回数にする', () => {
  assert.deepEqual(workspaceToCommands(workspace(repeatBlock('9', moveBlock('jump')))), [
    { type: 'repeat', times: 3, commands: [{ type: 'move', motion: 'jump' }] },
  ]);
});

const sayWith = (fields: Record<string, string>) => ({
  blocks: { blocks: [{ type: 'say_command', x: 0, y: 0, fields }] },
});

test('用意したセリフを選んでいるときは、そのセリフにする（打った文字は使わない）', () => {
  assert.deepEqual(workspaceToCommands(sayWith({ PRESET: 'やっほー', TEXT: 'ないしょ' })), [
    { type: 'say', text: 'やっほー' },
  ]);
});

test('「じぶんで かく…」を選んでいるときは、打った文字にする', () => {
  assert.deepEqual(workspaceToCommands(sayWith({ PRESET: '__custom__', TEXT: 'すいかがすき' })), [
    { type: 'say', text: 'すいかがすき' },
  ]);
});

test('選ぶところがない古い形のセリフは、打った文字にする', () => {
  assert.deepEqual(workspaceToCommands(sayWith({ TEXT: 'こんばんは' })), [
    { type: 'say', text: 'こんばんは' },
  ]);
});
