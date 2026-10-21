import { DurableObject } from 'cloudflare:workers';
import type { DisplayMessage, ReleaseResponse } from 'shared';
import { normalizeCloseCode } from '../lib/display';
import { IDEMPOTENCY_RECORD_RETENTION_MS, ReleaseLedger } from '../lib/release-ledger';

export class DisplayRoom extends DurableObject<CloudflareBindings> {
  private get releaseLedger(): ReleaseLedger {
    return new ReleaseLedger(this.ctx.storage);
  }

  async claimRelease(idempotencyKey: string, fingerprint: string, now: number) {
    const result = this.releaseLedger.claimRelease(idempotencyKey, fingerprint, now);

    if (result.status === 'claimed') {
      const scheduledAlarm = await this.ctx.storage.getAlarm();
      const cleanupAt = now + IDEMPOTENCY_RECORD_RETENTION_MS;

      if (scheduledAlarm === null || scheduledAlarm > cleanupAt) {
        await this.ctx.storage.setAlarm(cleanupAt);
      }
    }

    return result;
  }

  markReleaseFailed(
    idempotencyKey: string,
    fingerprint: string,
    attemptToken: string,
    now: number,
  ): void {
    this.releaseLedger.markReleaseFailed(idempotencyKey, fingerprint, attemptToken, now);
  }

  completeRelease(
    idempotencyKey: string,
    fingerprint: string,
    attemptToken: string,
    response: ReleaseResponse,
    now: number,
  ) {
    return this.releaseLedger.completeRelease(
      idempotencyKey,
      fingerprint,
      attemptToken,
      response,
      now,
    );
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket接続が必要です', {
        status: 426,
      });
    }

    const [client, server] = Object.values(new WebSocketPair());

    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  broadcast(message: DisplayMessage): number {
    const serializedMessage = JSON.stringify(message);
    let sentCount = 0;

    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(serializedMessage);
        sentCount += 1;
      } catch {
        try {
          ws.close(1011, 'メッセージの送信に失敗しました');
        } catch (error) {
          console.error('WebSocketの切断に失敗しました', error);
        }
      }
    }

    return sentCount;
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(normalizeCloseCode(code), reason);
  }

  webSocketError(ws: WebSocket): void {
    ws.close(1011, 'WebSocketでエラーが発生しました');
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const nextCleanupAt = this.releaseLedger.cleanupExpired(now);

    if (nextCleanupAt !== null) {
      await this.ctx.storage.setAlarm(nextCleanupAt);
    }
  }
}
