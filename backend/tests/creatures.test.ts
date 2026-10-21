import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_CREATURES } from 'shared/release';
import { listRecentCreatures } from '../src/lib/creatures.ts';

type StoredObject = { key: string; customMetadata?: Record<string, string> };
type ListOptions = { prefix?: string; cursor?: string; include?: string[] };

const BASE_TIME = 1789452946000;

const keyIdOf = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const createObject = (index: number): StoredObject => {
  const createdAt = BASE_TIME + index * 1000;

  return {
    key: `creatures/${createdAt}-${keyIdOf(index)}.png`,
    customMetadata: { id: `creature-${index}`, commands: '[]', requestFingerprint: `fp-${index}` },
  };
};

const createBucket = (objects: StoredObject[], pageSize = 1000) => {
  const calls: ListOptions[] = [];
  const sorted = [...objects].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    calls,
    list: async (options: ListOptions) => {
      calls.push(options);

      const matched = sorted.filter(({ key }) => key.startsWith(options.prefix ?? ''));
      const start = options.cursor === undefined ? 0 : Number(options.cursor);
      const end = start + pageSize;
      const page = { objects: matched.slice(start, end), delimitedPrefixes: [] };

      return end < matched.length
        ? { ...page, truncated: true, cursor: String(end) }
        : { ...page, truncated: false };
    },
  };
};

test('直近の作品を上限の件数まで古い順に返す', async () => {
  const objects = Array.from({ length: MAX_CREATURES + 5 }, (_, index) => createObject(index));
  const bucket = createBucket(objects.reverse());

  const creatures = await listRecentCreatures(bucket);

  assert.equal(creatures.length, MAX_CREATURES);
  assert.deepEqual(
    creatures.map(({ id }) => id),
    Array.from({ length: MAX_CREATURES }, (_, index) => `creature-${index + 5}`),
  );
});

test('一覧が複数ページに分かれていても最後まで読み込む', async () => {
  const bucket = createBucket(
    Array.from({ length: 20 }, (_, index) => createObject(index)),
    7,
  );

  const creatures = await listRecentCreatures(bucket);

  assert.equal(creatures.length, 20);
  assert.deepEqual(
    bucket.calls.map(({ cursor }) => cursor),
    [undefined, '7', '14'],
  );

  for (const call of bucket.calls) {
    assert.equal(call.prefix, 'creatures/');
    assert.deepEqual(call.include, ['customMetadata']);
  }
});

test('customMetadata の id・commands とキーの作成時刻から作品を組み立てる', async () => {
  const commands = [
    { type: 'move', motion: 'jump' },
    { type: 'say', text: 'こんにちは' },
  ];
  const key = `creatures/${BASE_TIME}-${keyIdOf(1)}.png`;
  const bucket = createBucket([
    {
      key,
      customMetadata: {
        id: 'creature-1',
        commands: JSON.stringify(commands),
        requestFingerprint: 'fp',
      },
    },
  ]);

  const creatures = await listRecentCreatures(bucket);

  assert.deepEqual(creatures, [
    { id: 'creature-1', imageUrl: key, commands, createdAt: BASE_TIME },
  ]);
});

test('作品IDや commands のメタデータがない作品も表示できる形で返す', async () => {
  const withoutMetadata = `creatures/${BASE_TIME}-${keyIdOf(1)}.png`;
  const brokenCommands = `creatures/${BASE_TIME + 1}-${keyIdOf(2)}.png`;
  const notArrayCommands = `creatures/${BASE_TIME + 2}-${keyIdOf(3)}.png`;
  const bucket = createBucket([
    { key: withoutMetadata },
    { key: brokenCommands, customMetadata: { id: 'creature-2', commands: 'not-json' } },
    { key: notArrayCommands, customMetadata: { id: 'creature-3', commands: '{"type":"say"}' } },
  ]);

  const creatures = await listRecentCreatures(bucket);

  assert.deepEqual(creatures, [
    { id: keyIdOf(1), imageUrl: withoutMetadata, commands: [], createdAt: BASE_TIME },
    { id: 'creature-2', imageUrl: brokenCommands, commands: [], createdAt: BASE_TIME + 1 },
    { id: 'creature-3', imageUrl: notArrayCommands, commands: [], createdAt: BASE_TIME + 2 },
  ]);
});

test('作品の形式ではないキーは件数に含めずに除外する', async () => {
  const objects = Array.from({ length: MAX_CREATURES }, (_, index) => createObject(index));
  const bucket = createBucket([
    ...objects,
    { key: 'creatures/readme.txt' },
    { key: 'creatures/latest.png' },
    { key: `creatures/${BASE_TIME}-${keyIdOf(99)}.jpg` },
  ]);

  const creatures = await listRecentCreatures(bucket);

  assert.equal(creatures.length, MAX_CREATURES);
  assert.ok(creatures.every(({ imageUrl }) => imageUrl.endsWith('.png')));
  assert.equal(creatures[0].id, 'creature-0');
});

test('作品がなければ空配列を返す', async () => {
  assert.deepEqual(await listRecentCreatures(createBucket([])), []);
});
