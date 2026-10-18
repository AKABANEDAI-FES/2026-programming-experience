import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReleaseRequest } from 'shared';
import { MOTIONS } from 'shared/release';
import app from '../src/index.ts';
import {
  RELEASE_RECORD_PREFIX,
  ReleaseLedger,
  type ReleaseRecord,
} from '../src/lib/release-ledger.ts';

const IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const KEY = '123e4567-e89b-42d3-a456-426614174000';
const RELEASE_TOKEN = 'test-release-token';

type HarnessOptions = {
  putFailure?: 'before-write' | 'after-write';
  failHead?: boolean;
  failClaim?: boolean;
  failCompleteOnce?: boolean;
  failBroadcast?: boolean;
};

const createHarness = (options: HarnessOptions = {}) => {
  const records = new Map<string, unknown>();
  const ledger = new ReleaseLedger({
    transactionSync: (callback) => callback(),
    kv: {
      get: <T>(key: string) => records.get(key) as T | undefined,
      put: <T>(key: string, value: T) => void records.set(key, value),
      delete: (key: string) => void records.delete(key),
      list: <T>(options: { prefix: string }) =>
        [...records.entries()]
          .filter(([key]) => key.startsWith(options.prefix))
          .map(([key, value]) => [key, value as T] as [string, T]),
    },
  });
  const objects = new Map<string, { customMetadata?: Record<string, string> }>();
  const puts: string[] = [];
  const notifications: unknown[] = [];
  let failPut = options.putFailure;
  let failComplete = options.failCompleteOnce;

  const room = {
    claimRelease: async (key: string, fingerprint: string, now: number) => {
      if (options.failClaim) throw new Error('Durable Object unavailable');
      return ledger.claimRelease(key, fingerprint, now);
    },
    markReleaseFailed: (key: string, fingerprint: string, token: string, now: number) =>
      ledger.markReleaseFailed(key, fingerprint, token, now),
    completeRelease: async (
      key: string,
      fingerprint: string,
      token: string,
      response: Parameters<ReleaseLedger['completeRelease']>[3],
      now: number,
    ) => {
      if (failComplete) {
        failComplete = false;
        throw new Error('Durable Object unavailable');
      }
      return ledger.completeRelease(key, fingerprint, token, response, now);
    },
    broadcast: (message: unknown) => {
      notifications.push(message);
      if (options.failBroadcast) throw new Error('WebSocket unavailable');
      return 1;
    },
  };

  const env = {
    ALLOWED_ORIGINS: undefined,
    RELEASE_TOKEN,
    DISPLAY_ROOM: { idFromName: () => 'main', get: () => room },
    IMAGES: {
      head: async (key: string) => {
        if (options.failHead) throw new Error('R2 head unavailable');
        return objects.get(key) ?? null;
      },
      put: async (
        key: string,
        _value: unknown,
        options: { customMetadata?: Record<string, string> },
      ) => {
        puts.push(key);
        if (failPut === 'before-write') {
          failPut = undefined;
          throw new Error('R2 put failed');
        }
        objects.set(key, { customMetadata: options.customMetadata });
        if (failPut === 'after-write') {
          failPut = undefined;
          throw new Error('R2 response lost after write');
        }
      },
    },
  };

  return { env, objects, puts, notifications, records, room };
};

const requestRelease = (body: unknown, key: string, env: object) =>
  app.request(
    '/api/release',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RELEASE_TOKEN}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify(body),
    },
    env,
  );

const createBody = (commands: ReleaseRequest['commands'] = []): ReleaseRequest => ({
  image_base64: IMAGE,
  commands,
});

test('空コマンドを受け付け、R2保存後にmodeなしの通知を送る', async () => {
  const harness = createHarness();
  const response = await requestRelease(createBody(), KEY, harness.env);
  const body = (await response.json()) as { success: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(harness.puts.length, 1);
  assert.equal(harness.notifications.length, 1);
  const message = harness.notifications[0] as { creature: Record<string, unknown> };
  assert.deepEqual(message.creature.commands, []);
  assert.equal('mode' in message.creature, false);
});

test('認証ヘッダーがない、またはトークンが異なる場合は401を返す', async () => {
  const harness = createHarness();
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': KEY },
    body: JSON.stringify(createBody()),
  };

  const missing = await app.request('/api/release', request, harness.env);
  const invalid = await app.request(
    '/api/release',
    { ...request, headers: { ...request.headers, Authorization: 'Bearer wrong-token' } },
    harness.env,
  );

  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).code, 'UNAUTHORIZED');
  assert.equal(missing.headers.get('WWW-Authenticate'), 'Bearer');
  assert.equal(invalid.status, 401);
  assert.equal(harness.puts.length, 0);
  assert.equal(harness.records.size, 0);
});

test('サーバーに共有トークンが未設定の場合は503を返す', async () => {
  const harness = createHarness();
  const env = { ...harness.env, RELEASE_TOKEN: undefined };

  const response = await requestRelease(createBody(), KEY, env);

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'RELEASE_AUTH_UNAVAILABLE');
  assert.equal(harness.puts.length, 0);
  assert.equal(harness.records.size, 0);
});

test('成功済みの同じ内容を再送してもR2保存・通知を重複しない', async () => {
  const harness = createHarness();
  const body = createBody();
  await requestRelease(body, KEY, harness.env);
  const replay = await requestRelease(body, KEY, harness.env);

  assert.equal(replay.status, 200);
  assert.equal(harness.puts.length, 1);
  assert.equal(harness.notifications.length, 1);
});

test('同じキーを異なる内容で使うと409を返す', async () => {
  const harness = createHarness();
  await requestRelease(createBody(), KEY, harness.env);
  const response = await requestRelease(
    createBody([{ type: 'move', motion: 'jump' }]),
    KEY,
    harness.env,
  );

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(harness.puts.length, 1);
});

test('キーがない、またはUUID v4でない場合は400を返す', async () => {
  const harness = createHarness();
  const body = createBody();
  const missing = await app.request(
    '/api/release',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${RELEASE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    harness.env,
  );
  const malformed = await requestRelease(body, 'not-a-uuid', harness.env);

  assert.equal(missing.status, 400);
  assert.equal(malformed.status, 400);
  assert.equal(harness.puts.length, 0);
});

test('Durable Objectが同じキーを処理中としている場合は409を返す', async () => {
  const harness = createHarness();
  const request = createBody();
  harness.room.claimRelease = async () => ({ status: 'in_progress' });

  const response = await requestRelease(request, KEY, harness.env);

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'REQUEST_IN_PROGRESS');
  assert.equal(harness.puts.length, 0);
});

test('R2への確定した保存失敗後、同じキーで再試行できる', async () => {
  const harness = createHarness({ putFailure: 'before-write' });
  const body = createBody();
  const failed = await requestRelease(body, KEY, harness.env);
  const retried = await requestRelease(body, KEY, harness.env);

  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).code, 'IMAGE_SAVE_FAILED');
  assert.equal(retried.status, 200);
  assert.equal(harness.puts.length, 2);
});

test('R2書き込み応答が失われてもheadで保存済みを確認する', async () => {
  const harness = createHarness({ putFailure: 'after-write' });
  const response = await requestRelease(createBody(), KEY, harness.env);

  assert.equal(response.status, 200);
  assert.equal(harness.puts.length, 1);
  assert.equal(harness.notifications.length, 1);
});

test('Durable Objectのclaimに失敗した場合は503を返す', async () => {
  const harness = createHarness({ failClaim: true });
  const response = await requestRelease(createBody(), KEY, harness.env);

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'RELEASE_STATUS_UNKNOWN');
});

test('R2の状態を確認できない場合は503を返す', async () => {
  const harness = createHarness({ failHead: true });
  const response = await requestRelease(createBody(), KEY, harness.env);

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'RELEASE_STATUS_UNKNOWN');
});

test('成功記録に失敗した後の同一キー再送で既存R2画像から回復する', async () => {
  const harness = createHarness({ failCompleteOnce: true });
  const body = createBody();
  const first = await requestRelease(body, KEY, harness.env);
  const earlyRetry = await requestRelease(body, KEY, harness.env);
  const recordKey = `${RELEASE_RECORD_PREFIX}${KEY}`;
  const record = harness.records.get(recordKey) as ReleaseRecord;
  harness.records.set(recordKey, { ...record, leaseExpiresAt: 0 });
  const expiredLeaseRetry = await requestRelease(body, KEY, harness.env);

  assert.equal(first.status, 503);
  assert.equal(earlyRetry.status, 409);
  assert.equal(expiredLeaseRetry.status, 200);
  assert.equal(harness.puts.length, 1);
});

test('WebSocket通知が失敗してもR2保存成功ならAPIは成功する', async () => {
  const harness = createHarness({ failBroadcast: true });
  const response = await requestRelease(createBody(), KEY, harness.env);

  assert.equal(response.status, 200);
  assert.equal(harness.puts.length, 1);
});

test('不正JSONと画像・コマンド不正を保存前に拒否する', async () => {
  const harness = createHarness();
  const malformedJson = await app.request(
    '/api/release',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RELEASE_TOKEN}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': KEY,
      },
      body: '{',
    },
    harness.env,
  );
  const invalidImage = await requestRelease(
    { image_base64: 'not-image', commands: [] },
    KEY,
    harness.env,
  );
  const tooManyCommands = await requestRelease(
    createBody(Array.from({ length: 6 }, () => ({ type: 'move', motion: 'jump' }))),
    KEY,
    harness.env,
  );

  assert.equal(malformedJson.status, 400);
  assert.equal(invalidImage.status, 400);
  assert.equal(tooManyCommands.status, 400);
  assert.equal(harness.puts.length, 0);
});

test('定義されていない動きは400で拒否し、定義済みの動きは受け付ける', async () => {
  const harness = createHarness();
  const invalid = await requestRelease(
    { image_base64: IMAGE, commands: [{ type: 'move', motion: 'fly' }] },
    KEY,
    harness.env,
  );

  assert.equal(invalid.status, 400);
  // 動きを増やしてもこのテストを直さなくて済むよう、許可する動きの一覧は MOTIONS から作る
  assert.equal(
    (await invalid.json()).message,
    `commands[0].motion は ${MOTIONS.map((motion) => `"${motion}"`).join(' または ')} を指定してください`,
  );
  assert.equal(harness.puts.length, 0);
  assert.equal(harness.notifications.length, 0);
  assert.equal(harness.records.size, 0);

  const valid = await requestRelease(
    createBody([{ type: 'move', motion: 'spin' }]),
    KEY,
    harness.env,
  );

  assert.equal(valid.status, 200);
  assert.equal(harness.puts.length, 1);
});
