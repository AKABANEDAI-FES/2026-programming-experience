import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedOrigin } from '../src/lib/origin.ts';

const PRODUCTION_URL = 'https://2026-programming-experience.akabanedai.workers.dev/ws/display';

test('画面と同じオリジンからの接続は許可する', () => {
  assert.equal(
    isAllowedOrigin('https://2026-programming-experience.akabanedai.workers.dev', PRODUCTION_URL),
    true,
  );
});

test('開発環境のオリジンは許可する', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173', 'http://localhost:8787/ws/display'), true);
});

test('許可されていないオリジンや Origin がない接続は拒否する', () => {
  assert.equal(isAllowedOrigin('https://example.com', PRODUCTION_URL), false);
  assert.equal(isAllowedOrigin(undefined, PRODUCTION_URL), false);
});

test('ALLOWED_ORIGINS を設定した場合はその値を使う', () => {
  assert.equal(
    isAllowedOrigin('https://example.com', PRODUCTION_URL, 'https://example.com, https://foo.test'),
    true,
  );
  assert.equal(
    isAllowedOrigin('http://localhost:5173', PRODUCTION_URL, 'https://example.com'),
    false,
  );
});
