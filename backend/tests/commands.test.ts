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

const ifNearFriend: Command = {
  type: 'if',
  condition: 'near_friend',
  thenCommands: [jump],
  elseCommands: [hello, { type: 'repeat', times: 2, commands: [jump] }],
};

test('「もし」は、「もし」自体と両方の中身を合わせて数える', () => {
  // もし 1 ＋ jump 1 ＋ hello 1 ＋ くりかえし 1 ＋ jump 1 ＝ 5
  assert.equal(countCommands([ifNearFriend]), 5);
});

test('「もし」もくりかえしと合わせて段の数に入れる', () => {
  assert.equal(nestingDepth([ifNearFriend]), 2);
  assert.equal(
    nestingDepth([{ type: 'if', condition: 'at_edge', thenCommands: [], elseCommands: [] }]),
    1,
  );
});

test('「もし」は、条件に合えば合ったときの中身を、合わなければそうでなければの中身を並べる', () => {
  assert.deepEqual(
    expandCommands([ifNearFriend], () => true),
    [jump],
  );
  assert.deepEqual(
    expandCommands([ifNearFriend], () => false),
    [hello, jump, jump],
  );
  assert.deepEqual(expandCommands([ifNearFriend]), [hello, jump, jump]);
});
