import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/index.ts';

const IMAGE_KEY = 'creatures/1789452946224-12345678-1234-4234-8234-123456789abc.png';
const IMAGE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

type StoredImage = {
  body: Uint8Array;
  contentType: string;
  httpEtag: string;
};

const createHarness = (images: Map<string, StoredImage> = new Map()) => {
  const requestedKeys: string[] = [];

  return {
    requestedKeys,
    env: {
      ALLOWED_ORIGINS: undefined,
      IMAGES: {
        get: async (key: string) => {
          requestedKeys.push(key);
          const image = images.get(key);

          if (image === undefined) {
            return null;
          }

          return {
            body: image.body,
            httpEtag: image.httpEtag,
            writeHttpMetadata: (headers: Headers) => {
              headers.set('Content-Type', image.contentType);
            },
          };
        },
      },
    },
  };
};

test('スラッシュを含むキーの画像をR2から取得し、保存時のContent-Typeで返す', async () => {
  const images = new Map<string, StoredImage>([
    [IMAGE_KEY, { body: IMAGE_BYTES, contentType: 'image/png', httpEtag: '"image-etag"' }],
  ]);
  const harness = createHarness(images);

  const response = await app.request(`/api/images/${IMAGE_KEY}`, undefined, harness.env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('ETag'), '"image-etag"');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), IMAGE_BYTES);
  assert.deepEqual(harness.requestedKeys, [IMAGE_KEY]);
});

test('存在しない画像には404を返す', async () => {
  const harness = createHarness();

  const response = await app.request(`/api/images/${IMAGE_KEY}`, undefined, harness.env);

  assert.equal(response.status, 404);
  assert.deepEqual(harness.requestedKeys, [IMAGE_KEY]);
});

test('creatures配下ではないキーにはアクセスせず404を返す', async () => {
  const harness = createHarness(
    new Map([
      ['private/secret.png', { body: IMAGE_BYTES, contentType: 'image/png', httpEtag: '"secret"' }],
    ]),
  );

  const response = await app.request('/api/images/private/secret.png', undefined, harness.env);

  assert.equal(response.status, 404);
  assert.deepEqual(harness.requestedKeys, []);
});

test('画像取得APIのCORSでGETを許可する', async () => {
  const harness = createHarness();

  const response = await app.request(
    `/api/images/${IMAGE_KEY}`,
    {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    },
    harness.env,
  );

  assert.equal(response.status, 204);
  assert.match(response.headers.get('Access-Control-Allow-Methods') ?? '', /GET/);
  assert.match(response.headers.get('Access-Control-Allow-Headers') ?? '', /Authorization/);
});

const ASSET_KEY = 'assets/ocean-background.jpg';
const ASSET = { body: IMAGE_BYTES, contentType: 'image/jpeg', httpEtag: '"asset-etag"' };

test('許可された画面用の画像をR2のassets配下から返し、キャッシュさせる', async () => {
  const harness = createHarness(new Map([[ASSET_KEY, ASSET]]));

  const response = await app.request('/api/assets/ocean-background.jpg', undefined, harness.env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(response.headers.get('ETag'), '"asset-etag"');
  assert.match(response.headers.get('Cache-Control') ?? '', /max-age=\d+/);
  assert.deepEqual(harness.requestedKeys, [ASSET_KEY]);
});

test('画面用の画像がR2にない場合は404を返す', async () => {
  const harness = createHarness();

  const response = await app.request('/api/assets/ocean-background.jpg', undefined, harness.env);

  assert.equal(response.status, 404);
});

test('許可されていない名前の画像はR2を読まずに404を返す', async () => {
  const harness = createHarness(new Map([['assets/other.jpg', { ...ASSET, httpEtag: '"other"' }]]));

  const response = await app.request('/api/assets/other.jpg', undefined, harness.env);

  assert.equal(response.status, 404);
  assert.deepEqual(harness.requestedKeys, []);
});
