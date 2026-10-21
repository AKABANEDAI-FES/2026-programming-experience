import type { ReleaseResponse } from 'shared';

export const RELEASE_TOKEN_STORAGE_KEY = 'programming-experience-release-token';

/** 開発環境（npm run dev）だけで使う放流トークン。backend/.dev.vars.example と同じ値にする */
export const DEV_RELEASE_TOKEN = 'local-dev-release-token';

type StorageReader = Pick<Storage, 'getItem'>;

/**
 * 放流 API に付ける Authorization ヘッダーを作る。
 * ブラウザに保存されたトークンを優先し、なければ fallbackToken（開発環境のみ渡す）を使う。
 */
export const getReleaseAuthorizationHeader = (
  storage: StorageReader,
  fallbackToken: string | null = null,
): string | null => {
  let token: string | undefined;

  try {
    token = storage.getItem(RELEASE_TOKEN_STORAGE_KEY)?.trim();
  } catch {
    token = undefined;
  }

  token ||= fallbackToken ?? undefined;

  return token ? `Bearer ${token}` : null;
};

export type SubmissionAttempt = {
  key: string;
  body: string;
};

export const prepareSubmissionAttempt = (
  body: string,
  previousAttempt: SubmissionAttempt | null,
  createKey: () => string = () => crypto.randomUUID(),
): SubmissionAttempt =>
  previousAttempt?.body === body ? previousAttempt : { key: createKey(), body };

export const shouldRecoverIdempotencyKey = (
  result: ReleaseResponse,
  recoveryCount: number,
): boolean => !result.success && result.code === 'IDEMPOTENCY_KEY_REUSED' && recoveryCount === 0;
