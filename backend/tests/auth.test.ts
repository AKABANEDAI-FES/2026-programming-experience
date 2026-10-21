import assert from 'node:assert/strict';
import test from 'node:test';
import { isReleaseAuthorized } from '../src/lib/auth.ts';

test('設定されたBearerトークンを受け付ける', () => {
  assert.equal(isReleaseAuthorized('Bearer shared-secret', 'shared-secret'), true);
  assert.equal(isReleaseAuthorized('bearer shared-secret', 'shared-secret'), true);
});

test('認証ヘッダーがない、または形式が不正な場合は拒否する', () => {
  assert.equal(isReleaseAuthorized(undefined, 'shared-secret'), false);
  assert.equal(isReleaseAuthorized('shared-secret', 'shared-secret'), false);
  assert.equal(isReleaseAuthorized('Basic shared-secret', 'shared-secret'), false);
  assert.equal(isReleaseAuthorized('Bearer ', 'shared-secret'), false);
});

test('異なるトークンを拒否する', () => {
  assert.equal(isReleaseAuthorized('Bearer wrong-secret', 'shared-secret'), false);
  assert.equal(isReleaseAuthorized('Bearer shared-secret-extra', 'shared-secret'), false);
});
