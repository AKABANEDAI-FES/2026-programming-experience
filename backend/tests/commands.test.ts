import assert from 'node:assert/strict';
import test from 'node:test';
import { countCommands, expandCommands, type Command } from 'shared/release';

const jump: Command = { type: 'move', motion: 'jump' };
const hello: Command = { type: 'say', text: 'やあ' };

test('くりかえしは、くりかえし自体と中のコマンドを合わせて数える', () => {
  assert.equal(countCommands([]), 0);
  assert.equal(countCommands([jump, hello]), 2);
  assert.equal(countCommands([{ type: 'repeat', times: 3, commands: [jump, hello] }, hello]), 4);
});

test('くりかえしは、中身を回数分だけ並べて再生する', () => {
  assert.deepEqual(expandCommands([hello, { type: 'repeat', times: 2, commands: [jump] }]), [
    hello,
    jump,
    jump,
  ]);
});

test('中身が空のくりかえしは何も再生しない', () => {
  assert.deepEqual(expandCommands([{ type: 'repeat', times: 3, commands: [] }]), []);
});
