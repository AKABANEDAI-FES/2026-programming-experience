import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRecentCreatures } from '../../src/lib/display/recentCreatures.ts';

const creature = {
  id: '12345678-1234-4234-8234-123456789abc',
  imageUrl: 'creatures/1789452946224-12345678-1234-4234-8234-123456789abc.png',
  commands: [{ type: 'move', motion: 'jump' }],
  createdAt: 1789452946224,
};

test('作品一覧APIから直近の作品を取得する', async () => {
  const requested: string[] = [];
  const creatures = await fetchRecentCreatures(async (input) => {
    requested.push(String(input));
    return Response.json([creature]);
  });

  assert.deepEqual(requested, ['/api/creatures']);
  assert.deepEqual(creatures, [creature]);
});

test('作品一覧APIが失敗した場合はエラーにする', async () => {
  await assert.rejects(
    fetchRecentCreatures(async () =>
      Response.json({ message: '作品の一覧を取得できませんでした' }, { status: 500 }),
    ),
  );
});

test('配列以外が返ってきた場合はエラーにする', async () => {
  await assert.rejects(fetchRecentCreatures(async () => Response.json({ creatures: [] })));
});
