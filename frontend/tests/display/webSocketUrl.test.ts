import assert from 'node:assert/strict';
import test from 'node:test';
import { toWebSocketUrl } from '../../src/lib/display/webSocketUrl.ts';

test('https のページでは wss:// で同じホストへ接続する', () => {
  assert.equal(
    toWebSocketUrl(
      '/ws/display',
      'https://2026-programming-experience.akabanedai.workers.dev/display',
    ),
    'wss://2026-programming-experience.akabanedai.workers.dev/ws/display',
  );
});

test('開発環境の http のページでは ws:// で接続する', () => {
  assert.equal(
    toWebSocketUrl('/ws/display', 'http://localhost:5173/display'),
    'ws://localhost:5173/ws/display',
  );
});
