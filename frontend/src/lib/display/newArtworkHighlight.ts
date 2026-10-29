export const HIGHLIGHT_DURATION_MS = 10_000;

/** 登場中は時間を減らさず、泳ぎ始めてから10秒かけて消す。 */
export const stepHighlight = (remaining: number, deltaMs: number, enterRemaining: number) =>
  Math.max(0, remaining - Math.max(0, deltaMs - enterRemaining));
