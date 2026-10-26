import assert from 'node:assert/strict';
import test from 'node:test';
import { expandCommands, type BasicCommand, type Command } from 'shared/release';
import {
  commandAt,
  nextCursor,
  startCursor,
  type ProgramCursor,
} from '../../src/lib/display/programCursor.ts';

const jump: Command = { type: 'move', motion: 'jump' };
const spin: Command = { type: 'move', motion: 'spin' };
const say = (text: string): Command => ({ type: 'say', text });

/** たどりながら、再生される動き・セリフを count 個集める */
const play = (program: Command[], count: number): BasicCommand[] => {
  const played: BasicCommand[] = [];
  let cursor: ProgramCursor | null = startCursor(program);

  for (let i = 0; i < count && cursor !== null; i += 1) {
    const command = commandAt(program, cursor);
    assert.ok(command !== null);
    played.push(command);
    cursor = nextCursor(program, cursor);
  }

  return played;
};

/** くりかえしを先に全部ほどいた並びを、count 個になるまで最初から続けたもの */
const expectedLoop = (program: Command[], count: number): BasicCommand[] => {
  const once = expandCommands(program);
  return Array.from({ length: count }, (_, i) => once[i % once.length]);
};

test('くりかえしのないコマンドを順に再生し、最後まで来たら最初に戻る', () => {
  const program = [jump, say('やあ'), spin];

  assert.deepEqual(play(program, 7), expectedLoop(program, 7));
});

test('くりかえしは、中身を回数分だけ再生してから次へ進む', () => {
  const program = [
    say('はじめ'),
    { type: 'repeat', times: 3, commands: [jump, spin] } as Command,
    say('おわり'),
  ];

  assert.deepEqual(play(program, 20), expectedLoop(program, 20));
});

test('くりかえしの中のくりかえし（2 段）も、ほどいたときと同じ順に再生する', () => {
  const program: Command[] = [
    {
      type: 'repeat',
      times: 2,
      commands: [say('そと'), { type: 'repeat', times: 3, commands: [jump] }],
    },
    spin,
  ];

  assert.deepEqual(play(program, 30), expectedLoop(program, 30));
});

test('空のくりかえしは飛ばす', () => {
  const program: Command[] = [{ type: 'repeat', times: 3, commands: [] }, jump];

  assert.deepEqual(play(program, 3), [jump, jump, jump]);
});

test('再生するものがないときは、位置が null になる', () => {
  assert.equal(startCursor([]), null);
  assert.equal(startCursor([{ type: 'repeat', times: 2, commands: [] }]), null);
});

test('位置がブロックと合わないときは、コマンドなし（null）になる', () => {
  assert.equal(commandAt([jump], [{ index: 5, iteration: 0 }]), null);
  assert.equal(commandAt([jump], []), null);
});
