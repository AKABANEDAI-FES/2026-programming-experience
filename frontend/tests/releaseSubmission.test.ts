import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getReleaseAuthorizationHeader,
  prepareSubmissionAttempt,
  RELEASE_TOKEN_STORAGE_KEY,
  shouldRecoverIdempotencyKey,
} from '../src/lib/release-submission.ts';

test('localStorageの共有トークンからAuthorizationヘッダーを作る', () => {
  const storage = {
    getItem: (key: string) => (key === RELEASE_TOKEN_STORAGE_KEY ? ' shared-secret ' : null),
  };

  assert.equal(getReleaseAuthorizationHeader(storage), 'Bearer shared-secret');
});

test('共有トークンがない、またはlocalStorageを読めない場合はnullを返す', () => {
  assert.equal(getReleaseAuthorizationHeader({ getItem: () => null }), null);
  assert.equal(getReleaseAuthorizationHeader({ getItem: () => '   ' }), null);
  assert.equal(
    getReleaseAuthorizationHeader({
      getItem: () => {
        throw new Error('storage unavailable');
      },
    }),
    null,
  );
});

test('トークンが保存されていない場合は開発用のトークンを使う', () => {
  assert.equal(
    getReleaseAuthorizationHeader({ getItem: () => null }, 'dev-token'),
    'Bearer dev-token',
  );
  assert.equal(
    getReleaseAuthorizationHeader(
      {
        getItem: () => {
          throw new Error('storage unavailable');
        },
      },
      'dev-token',
    ),
    'Bearer dev-token',
  );
});

test('トークンが保存されている場合は開発用のトークンより優先する', () => {
  const storage = {
    getItem: (key: string) => (key === RELEASE_TOKEN_STORAGE_KEY ? 'shared-secret' : null),
  };

  assert.equal(getReleaseAuthorizationHeader(storage, 'dev-token'), 'Bearer shared-secret');
});

test('同じ本文の再送では同じキーを再利用する', () => {
  const original = { key: 'first-key', body: '{"commands":[]}' };
  const retry = prepareSubmissionAttempt(original.body, original, () => 'unexpected-key');

  assert.equal(retry, original);
});

test('本文を編集した再送では新しいキーを生成する', () => {
  const original = { key: 'first-key', body: '{"commands":[]}' };
  const edited = prepareSubmissionAttempt(
    '{"commands":[{"type":"move"}]}',
    original,
    () => 'second-key',
  );

  assert.deepEqual(edited, {
    key: 'second-key',
    body: '{"commands":[{"type":"move"}]}',
  });
});

test('キー再利用エラーだけを1回に限り自動回復する', () => {
  assert.equal(
    shouldRecoverIdempotencyKey(
      { success: false, code: 'IDEMPOTENCY_KEY_REUSED', message: 'conflict' },
      0,
    ),
    true,
  );
  assert.equal(
    shouldRecoverIdempotencyKey(
      { success: false, code: 'IDEMPOTENCY_KEY_REUSED', message: 'conflict' },
      1,
    ),
    false,
  );
  assert.equal(
    shouldRecoverIdempotencyKey(
      { success: false, code: 'REQUEST_IN_PROGRESS', message: 'pending' },
      0,
    ),
    false,
  );
});
