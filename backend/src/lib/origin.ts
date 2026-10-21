export const DEVELOPMENT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export const getAllowedOrigins = (configuredOrigins?: string): string[] => {
  return (configuredOrigins?.split(',') ?? DEVELOPMENT_ORIGINS)
    .map((allowedOrigin) => allowedOrigin.trim())
    .filter(Boolean);
};

/**
 * 接続元を許可するか判定する。
 * 本番では画面と API を同じ Worker から配信するため、同じオリジンからの接続は常に許可する。
 */
export const isAllowedOrigin = (
  origin: string | undefined,
  requestUrl: string,
  configuredOrigins?: string,
): boolean => {
  if (!origin) {
    return false;
  }

  return (
    origin === new URL(requestUrl).origin || getAllowedOrigins(configuredOrigins).includes(origin)
  );
};
