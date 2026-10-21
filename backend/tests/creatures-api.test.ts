import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/index.ts';

const KEY = 'creatures/1789452946224-12345678-1234-4234-8234-123456789abc.png';

const createEnv = (list: () => Promise<unknown>) => ({
  ALLOWED_ORIGINS: undefined,
  IMAGES: { list },
});

test('直近の作品一覧をJSONで返し、キャッシュさせない', async () => {
  const env = createEnv(async () => ({
    objects: [
      {
        key: KEY,
        customMetadata: {
          id: 'creature-1',
          commands: JSON.stringify([{ type: 'move', motion: 'jump' }]),
          requestFingerprint: 'fp',
        },
      },
    ],
    delimitedPrefixes: [],
    truncated: false,
  }));

  const response = await app.request('/api/creatures', undefined, env);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /application\/json/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), [
    {
      id: 'creature-1',
      imageUrl: KEY,
      commands: [{ type: 'move', motion: 'jump' }],
      createdAt: 1789452946224,
    },
  ]);
});

test('R2から一覧を取得できない場合は500を返す', async () => {
  const env = createEnv(async () => {
    throw new Error('R2 unavailable');
  });

  const response = await app.request('/api/creatures', undefined, env);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: '作品の一覧を取得できませんでした' });
});
