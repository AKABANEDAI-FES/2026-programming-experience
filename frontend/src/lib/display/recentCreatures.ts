import type { Creature } from 'shared';

/** 作品一覧APIから、直近の作品を古い順に取得する */
export const fetchRecentCreatures = async (fetcher: typeof fetch = fetch): Promise<Creature[]> => {
  const response = await fetcher('/api/creatures');

  if (!response.ok) {
    throw new Error(`作品の一覧を取得できませんでした（${response.status}）`);
  }

  const body: unknown = await response.json();

  if (!Array.isArray(body)) {
    throw new Error('作品の一覧の形式が正しくありません');
  }

  return body as Creature[];
};
