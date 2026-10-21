import type { ReleaseResponse } from 'shared';
import type { SavedImage } from './storage';

export const IDEMPOTENCY_RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
/** 応答を受け取れなかった処理を、再送で安全に引き継げるまでの猶予時間。 */
export const PROCESSING_LEASE_MS = 60 * 1000;
export const RELEASE_RECORD_PREFIX = 'release:';

export type ReleaseRecord = {
  fingerprint: string;
  state: 'processing' | 'failed' | 'succeeded';
  attemptToken: string;
  leaseExpiresAt: number;
  expiresAt: number;
  saved: SavedImage;
  response?: ReleaseResponse;
};

export type ReleaseClaimResult =
  | { status: 'claimed'; attemptToken: string; saved: SavedImage }
  | { status: 'in_progress' }
  | { status: 'key_reused' }
  | { status: 'succeeded'; response: ReleaseResponse };

export type CompleteReleaseResult =
  | { status: 'completed'; saved: SavedImage; shouldNotify: true }
  | { status: 'succeeded'; response: ReleaseResponse; shouldNotify: false }
  | { status: 'in_progress' };

type LedgerStorage = {
  transactionSync<T>(callback: () => T): T;
  kv: {
    get<T>(key: string): T | undefined;
    put<T>(key: string, value: T): void;
    delete(key: string): void;
    list<T>(options: { prefix: string }): Iterable<[string, T]>;
  };
};

export class ReleaseLedger {
  private readonly storage: LedgerStorage;

  constructor(storage: LedgerStorage) {
    this.storage = storage;
  }

  claimRelease(idempotencyKey: string, fingerprint: string, now: number): ReleaseClaimResult {
    return this.storage.transactionSync(() => {
      const recordKey = `${RELEASE_RECORD_PREFIX}${idempotencyKey}`;
      let record = this.storage.kv.get<ReleaseRecord>(recordKey);

      if (record !== undefined && record.state !== 'processing' && record.expiresAt <= now) {
        this.storage.kv.delete(recordKey);
        record = undefined;
      }

      if (record !== undefined && record.fingerprint !== fingerprint) {
        return { status: 'key_reused' };
      }

      if (record?.state === 'succeeded' && record.expiresAt > now) {
        return { status: 'succeeded', response: record.response! };
      }

      const recordExpired = record !== undefined && record.expiresAt <= now;
      const processingLeaseExpired = record?.state === 'processing' && record.leaseExpiresAt <= now;

      if (record?.state === 'processing' && !processingLeaseExpired) {
        return { status: 'in_progress' };
      }

      const attemptToken = crypto.randomUUID();
      const saved =
        record !== undefined && !recordExpired
          ? record.saved
          : {
              id: crypto.randomUUID(),
              createdAt: now,
              key: `creatures/${now}-${crypto.randomUUID()}.png`,
            };

      this.storage.kv.put(recordKey, {
        fingerprint,
        state: 'processing',
        attemptToken,
        leaseExpiresAt: now + PROCESSING_LEASE_MS,
        expiresAt: now + IDEMPOTENCY_RECORD_RETENTION_MS,
        saved,
      } satisfies ReleaseRecord);

      return { status: 'claimed', attemptToken, saved };
    });
  }

  markReleaseFailed(
    idempotencyKey: string,
    fingerprint: string,
    attemptToken: string,
    now: number,
  ): void {
    this.storage.transactionSync(() => {
      const recordKey = `${RELEASE_RECORD_PREFIX}${idempotencyKey}`;
      const record = this.storage.kv.get<ReleaseRecord>(recordKey);

      if (
        record?.state !== 'processing' ||
        record.fingerprint !== fingerprint ||
        record.attemptToken !== attemptToken
      ) {
        return;
      }

      this.storage.kv.put(recordKey, {
        ...record,
        state: 'failed',
        leaseExpiresAt: 0,
        expiresAt: now + IDEMPOTENCY_RECORD_RETENTION_MS,
      } satisfies ReleaseRecord);
    });
  }

  completeRelease(
    idempotencyKey: string,
    fingerprint: string,
    attemptToken: string,
    response: ReleaseResponse,
    now: number,
  ): CompleteReleaseResult {
    return this.storage.transactionSync(() => {
      const recordKey = `${RELEASE_RECORD_PREFIX}${idempotencyKey}`;
      const record = this.storage.kv.get<ReleaseRecord>(recordKey);

      if (record?.state === 'succeeded' && record.fingerprint === fingerprint) {
        return { status: 'succeeded', response: record.response!, shouldNotify: false };
      }

      if (
        record?.state !== 'processing' ||
        record.fingerprint !== fingerprint ||
        record.attemptToken !== attemptToken
      ) {
        return { status: 'in_progress' };
      }

      this.storage.kv.put(recordKey, {
        ...record,
        state: 'succeeded',
        leaseExpiresAt: 0,
        expiresAt: now + IDEMPOTENCY_RECORD_RETENTION_MS,
        response,
      } satisfies ReleaseRecord);

      return { status: 'completed', saved: record.saved, shouldNotify: true };
    });
  }

  cleanupExpired(now: number): number | null {
    let nextCleanupAt: number | null = null;

    for (const [key, record] of this.storage.kv.list<ReleaseRecord>({
      prefix: RELEASE_RECORD_PREFIX,
    })) {
      if (record.expiresAt <= now) {
        this.storage.kv.delete(key);
        continue;
      }

      nextCleanupAt =
        nextCleanupAt === null ? record.expiresAt : Math.min(nextCleanupAt, record.expiresAt);
    }

    return nextCleanupAt;
  }
}
