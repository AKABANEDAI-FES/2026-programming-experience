import assert from 'node:assert/strict';
import test from 'node:test';
import type { Command } from 'shared';
import { saveImage, type SavedImage } from '../src/lib/storage.ts';

const createImage = () => ({
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  contentType: 'image/png',
  extension: 'png',
});

const createIdentity = (id: string): SavedImage => ({
  id,
  createdAt: 1789452946224,
  key: `creatures/1789452946224-${id}.png`,
});

const createBucket = () => {
  const calls: { key: string; value: unknown; options: unknown }[] = [];

  return {
    calls,
    put: async (key: string, value: unknown, options: unknown) => {
      calls.push({ key, value, options });
    },
  };
};

test('指定された作品キーで画像を保存する', async () => {
  const bucket = createBucket();
  const image = createImage();
  const identity = createIdentity('12345678-1234-4234-8234-123456789abc');

  const saved = await saveImage(bucket, image, [], identity, 'fingerprint');

  assert.equal(bucket.calls.length, 1);
  assert.equal(bucket.calls[0].key, identity.key);
  assert.equal(saved.key, bucket.calls[0].key);
  assert.equal(bucket.calls[0].value, image.bytes);
});

test('Content-Type と作品ID・commands を付けて保存する', async () => {
  const bucket = createBucket();
  const commands: Command[] = [
    { type: 'move', motion: 'jump' },
    { type: 'say', text: 'こんにちは' },
  ];

  await saveImage(
    bucket,
    createImage(),
    commands,
    createIdentity('12345678-1234-4234-8234-123456789abc'),
    'fingerprint',
  );

  assert.deepEqual(bucket.calls[0].options, {
    httpMetadata: { contentType: 'image/png' },
    customMetadata: {
      id: '12345678-1234-4234-8234-123456789abc',
      commands: JSON.stringify(commands),
      requestFingerprint: 'fingerprint',
    },
  });
});

test('呼び出し元の異なる作品キーをそれぞれ保存する', async () => {
  const bucket = createBucket();

  const first = createIdentity('12345678-1234-4234-8234-123456789abc');
  const second = createIdentity('22345678-1234-4234-8234-123456789abc');
  await saveImage(bucket, createImage(), [], first, 'first');
  await saveImage(bucket, createImage(), [], second, 'second');

  assert.notEqual(first.id, second.id);
  assert.notEqual(first.key, second.key);
});

test('R2への保存に失敗した場合はエラーをそのまま投げる', async () => {
  const bucket = {
    put: async () => {
      throw new Error('R2 unavailable');
    },
  };

  await assert.rejects(
    saveImage(
      bucket,
      createImage(),
      [],
      createIdentity('12345678-1234-4234-8234-123456789abc'),
      'fingerprint',
    ),
    /R2 unavailable/,
  );
});
