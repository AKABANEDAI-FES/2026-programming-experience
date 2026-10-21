import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_CREATURES } from 'shared/release';
import { addCreature, restoreCreatures } from '../../src/lib/display/creatureQueue.ts';

const creature = (id: string) => ({ id });

const saved = (id: string, createdAt: number) => ({ id, createdAt });

const fill = (count: number) => Array.from({ length: count }, (_, index) => creature(`c${index}`));

test('上限に達するまではそのまま末尾に追加する', () => {
  const result = addCreature([creature('a')], creature('b'), 3);

  assert.deepEqual(result, { creatures: [creature('a'), creature('b')], removed: [] });
});

test('上限を超えたら最も古い作品を取り除く', () => {
  const result = addCreature([creature('a'), creature('b'), creature('c')], creature('d'), 3);

  assert.deepEqual(result, {
    creatures: [creature('b'), creature('c'), creature('d')],
    removed: [creature('a')],
  });
});

test('31匹目が届くと1匹目が取り除かれ、30匹のままになる', () => {
  const current = fill(MAX_CREATURES);
  const result = addCreature(current, creature('new'), MAX_CREATURES);

  assert.equal(result.creatures.length, MAX_CREATURES);
  assert.deepEqual(result.removed, [creature('c0')]);
  assert.deepEqual(result.creatures.at(-1), creature('new'));
});

test('同じ作品が二重に届いた場合は何もしない', () => {
  const current = [creature('a'), creature('b')];
  const result = addCreature(current, creature('a'), 3);

  assert.equal(result.creatures, current);
  assert.deepEqual(result.removed, []);
});

test('表示中の作品がなければ、読み込んだ作品をそのまま表示する', () => {
  const restored = [saved('a', 1), saved('b', 2)];

  assert.deepEqual(restoreCreatures([], restored, 3), { creatures: restored, removed: [] });
});

test('読み込んだ作品がすべて表示中なら何もしない', () => {
  const current = [saved('a', 1), saved('b', 2)];
  const result = restoreCreatures(current, [saved('a', 1), saved('b', 2)], 3);

  assert.equal(result.creatures, current);
  assert.deepEqual(result.removed, []);
});

test('表示中の作品は二重に表示せず、まだない作品だけを加える', () => {
  const result = restoreCreatures([saved('a', 1)], [saved('a', 1), saved('b', 2)], 3);

  assert.deepEqual(result, { creatures: [saved('a', 1), saved('b', 2)], removed: [] });
});

test('読み込み中に通知で届いた作品より古い作品は、作成時刻の順に前へ並べる', () => {
  const result = restoreCreatures([saved('new', 10)], [saved('a', 1), saved('b', 2)], 3);

  assert.deepEqual(result.creatures, [saved('a', 1), saved('b', 2), saved('new', 10)]);
});

test('上限を超えた場合は作成時刻の古い作品から取り除く', () => {
  const result = restoreCreatures(
    [saved('a', 1), saved('new', 10)],
    [saved('b', 2), saved('c', 3)],
    3,
  );

  assert.deepEqual(result, {
    creatures: [saved('b', 2), saved('c', 3), saved('new', 10)],
    removed: [saved('a', 1)],
  });
});

test('上限に入らない古い作品は表示せず、取り除く作品にも含めない', () => {
  const current = [saved('b', 2), saved('c', 3), saved('d', 4)];
  const result = restoreCreatures(current, [saved('a', 1)], 3);

  assert.deepEqual(result, { creatures: current, removed: [] });
});
