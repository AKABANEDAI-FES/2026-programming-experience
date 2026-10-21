const BEARER_TOKEN_PATTERN = /^Bearer ([^\s]+)$/i;

const constantTimeEqual = (actual: string, expected: string): boolean => {
  const encoder = new TextEncoder();
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);
  const length = Math.max(actualBytes.length, expectedBytes.length);
  let difference = actualBytes.length ^ expectedBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return difference === 0;
};

export const isReleaseAuthorized = (
  authorizationHeader: string | undefined,
  configuredToken: string,
): boolean => {
  const suppliedToken = authorizationHeader?.match(BEARER_TOKEN_PATTERN)?.[1];

  return suppliedToken !== undefined && constantTimeEqual(suppliedToken, configuredToken);
};
