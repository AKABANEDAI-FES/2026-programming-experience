import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReleaseResponse } from 'shared';
import {
  IDEMPOTENCY_RECORD_RETENTION_MS,
  PROCESSING_LEASE_MS,
  RELEASE_RECORD_PREFIX,
  ReleaseLedger,
  type ReleaseRecord,
} from '../src/lib/release-ledger.ts';

const createStorage = () => {
  const records = new Map<string, unknown>();
  const storage = {
    transactionSync<T>(callback: () => T): T {
      return callback();
    },
    kv: {
      get<T>(key: string): T | undefined {
        return records.get(key) as T | undefined;
      },
      put<T>(key: string, value: T): void {
        records.set(key, value);
      },
      delete(key: string): void {
        records.delete(key);
      },
      list<T>(options: { prefix: string }): Iterable<[string, T]> {
        return [...records.entries()]
          .filter(([key]) => key.startsWith(options.prefix))
          .map(([key, value]) => [key, value as T]);
      },
    },
  };

  return { records, ledger: new ReleaseLedger(storage) };
};

const KEY = '123e4567-e89b-42d3-a456-426614174000';
const FINGERPRINT = 'same-request';
const SUCCESS: ReleaseResponse = { success: true, message: '作品を保存しました！' };

test('同じキー・同じ内容の同時請求は1件だけclaimされる', () => {
  const { ledger } = createStorage();
  const first = ledger.claimRelease(KEY, FINGERPRINT, 1_000);
  const second = ledger.claimRelease(KEY, FINGERPRINT, 1_000);

  assert.equal(first.status, 'claimed');
  assert.equal(second.status, 'in_progress');
});

test('同じキーを異なる内容で使うと拒否する', () => {
  const { ledger } = createStorage();
  ledger.claimRelease(KEY, FINGERPRINT, 1_000);

  assert.deepEqual(ledger.claimRelease(KEY, 'different-request', 1_001), {
    status: 'key_reused',
  });
});

test('成功結果を記録し、再送時に保存と通知を繰り返さない', () => {
  const { ledger } = createStorage();
  const claim = ledger.claimRelease(KEY, FINGERPRINT, 1_000);
  assert.equal(claim.status, 'claimed');
  if (claim.status !== 'claimed') return;

  assert.deepEqual(ledger.completeRelease(KEY, FINGERPRINT, claim.attemptToken, SUCCESS, 1_100), {
    status: 'completed',
    saved: claim.saved,
    shouldNotify: true,
  });
  assert.deepEqual(ledger.claimRelease(KEY, FINGERPRINT, 1_200), {
    status: 'succeeded',
    response: SUCCESS,
  });
  assert.deepEqual(ledger.completeRelease(KEY, FINGERPRINT, claim.attemptToken, SUCCESS, 1_300), {
    status: 'succeeded',
    response: SUCCESS,
    shouldNotify: false,
  });
});

test('確定した保存失敗後は同じキー・同じ作品IDで再試行できる', () => {
  const { ledger } = createStorage();
  const first = ledger.claimRelease(KEY, FINGERPRINT, 1_000);
  assert.equal(first.status, 'claimed');
  if (first.status !== 'claimed') return;

  ledger.markReleaseFailed(KEY, FINGERPRINT, first.attemptToken, 1_100);
  const retry = ledger.claimRelease(KEY, FINGERPRINT, 1_200);

  assert.equal(retry.status, 'claimed');
  if (retry.status === 'claimed') {
    assert.deepEqual(retry.saved, first.saved);
    assert.notEqual(retry.attemptToken, first.attemptToken);
  }
});

test('処理リース期限後の再請求は作品IDを維持し、古い試行の完了を無効にする', () => {
  const { ledger } = createStorage();
  const first = ledger.claimRelease(KEY, FINGERPRINT, 1_000);
  assert.equal(first.status, 'claimed');
  if (first.status !== 'claimed') return;

  const retry = ledger.claimRelease(KEY, FINGERPRINT, 1_000 + PROCESSING_LEASE_MS);
  assert.equal(retry.status, 'claimed');
  if (retry.status !== 'claimed') return;

  assert.deepEqual(retry.saved, first.saved);
  assert.deepEqual(ledger.completeRelease(KEY, FINGERPRINT, first.attemptToken, SUCCESS, 62_000), {
    status: 'in_progress',
  });
  assert.equal(
    ledger.completeRelease(KEY, FINGERPRINT, retry.attemptToken, SUCCESS, 62_100).status,
    'completed',
  );
});

test('成功結果は24時間保持され、期限後に古いキー記録を破棄する', () => {
  const { ledger, records } = createStorage();
  const claim = ledger.claimRelease(KEY, FINGERPRINT, 1_000);
  assert.equal(claim.status, 'claimed');
  if (claim.status !== 'claimed') return;

  ledger.completeRelease(KEY, FINGERPRINT, claim.attemptToken, SUCCESS, 2_000);
  assert.equal(
    (records.get(`${RELEASE_RECORD_PREFIX}${KEY}`) as ReleaseRecord).expiresAt,
    2_000 + IDEMPOTENCY_RECORD_RETENTION_MS,
  );

  const expiredRetry = ledger.claimRelease(
    KEY,
    'new-request-after-expiry',
    2_000 + IDEMPOTENCY_RECORD_RETENTION_MS,
  );
  assert.equal(expiredRetry.status, 'claimed');
  if (expiredRetry.status === 'claimed') {
    assert.notDeepEqual(expiredRetry.saved, claim.saved);
  }
});

test('古い試行の失敗記録で引き継ぎ後の処理状態を上書きしない', () => {
  const { ledger, records } = createStorage();
  const first = ledger.claimRelease(KEY, FINGERPRINT, 1_000);
  assert.equal(first.status, 'claimed');
  if (first.status !== 'claimed') return;

  const retry = ledger.claimRelease(KEY, FINGERPRINT, 1_000 + PROCESSING_LEASE_MS);
  assert.equal(retry.status, 'claimed');
  if (retry.status !== 'claimed') return;

  ledger.markReleaseFailed(KEY, FINGERPRINT, first.attemptToken, 62_000);
  assert.equal(
    (records.get(`${RELEASE_RECORD_PREFIX}${KEY}`) as ReleaseRecord).state,
    'processing',
  );
});

test('期限切れ記録を削除し、次の掃除時刻を返す', () => {
  const { ledger, records } = createStorage();
  const expired = ledger.claimRelease(KEY, FINGERPRINT, 1_000);
  const retained = ledger.claimRelease(
    '223e4567-e89b-42d3-a456-426614174000',
    'other-request',
    2_000,
  );
  assert.equal(expired.status, 'claimed');
  assert.equal(retained.status, 'claimed');
  if (expired.status !== 'claimed' || retained.status !== 'claimed') return;

  ledger.completeRelease(KEY, FINGERPRINT, expired.attemptToken, SUCCESS, 1_500);
  ledger.completeRelease(
    '223e4567-e89b-42d3-a456-426614174000',
    'other-request',
    retained.attemptToken,
    SUCCESS,
    2_500,
  );
  const nextCleanupAt = ledger.cleanupExpired(1_500 + IDEMPOTENCY_RECORD_RETENTION_MS);

  assert.equal(records.has(`${RELEASE_RECORD_PREFIX}${KEY}`), false);
  assert.equal(records.size, 1);
  assert.equal(nextCleanupAt, 2_500 + IDEMPOTENCY_RECORD_RETENTION_MS);
});
