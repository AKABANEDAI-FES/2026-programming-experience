import assert from 'node:assert/strict';
import test from 'node:test';
import { countCommands, expandCommands, nestingDepth, type Command } from 'shared/release';

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

test('くりかえしの中のくりかえしも、中まで合わせて数える', () => {
  const nested: Command = {
    type: 'repeat',
    times: 2,
    commands: [hello, { type: 'repeat', times: 3, commands: [jump, jump] }],
  };

  // そとのくりかえし 1 ＋ hello 1 ＋ なかのくりかえし 1 ＋ jump 2 ＝ 5
  assert.equal(countCommands([nested]), 5);
});

test('くりかえしの中のくりかえしは、中身を掛け合わせた回数だけ並べる', () => {
  const nested: Command = {
    type: 'repeat',
    times: 2,
    commands: [hello, { type: 'repeat', times: 2, commands: [jump] }],
  };

  assert.deepEqual(expandCommands([nested]), [hello, jump, jump, hello, jump, jump]);
});

test('くりかえしが何段重なっているかを数える', () => {
  assert.equal(nestingDepth([jump]), 0);
  assert.equal(nestingDepth([{ type: 'repeat', times: 2, commands: [jump] }]), 1);
  assert.equal(
    nestingDepth([
      jump,
      { type: 'repeat', times: 2, commands: [{ type: 'repeat', times: 2, commands: [jump] }] },
    ]),
    2,
  );
});
