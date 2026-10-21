import type { ReleaseRequest } from 'shared';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidIdempotencyKey = (value: string | undefined): value is string =>
  value !== undefined && UUID_V4_PATTERN.test(value);

export const fingerprintReleaseRequest = async (request: ReleaseRequest): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(request));
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
