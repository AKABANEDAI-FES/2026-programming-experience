/** 開いているページと同じホストの WebSocket URL を作る。https のページなら wss:// を使う */
export const toWebSocketUrl = (path: string, pageUrl: string): string => {
  const url = new URL(path, pageUrl);

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  return url.toString();
};
