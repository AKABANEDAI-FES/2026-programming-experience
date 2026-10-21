import type { BasicCommand } from 'shared';
import { stepMotion, toVisual, type CreatureMotion } from './creatureMotion.ts';

/** プレビューの枠は大画面より小さいので、ジャンプやふわふわの上下の動きはこの割合に縮める */
const PREVIEW_VERTICAL_SCALE = 0.3;
/** はやく およぐ：その場で泳ぐ代わりに、進む向きへこの距離（px）だけ勢いよく出て戻る */
const PREVIEW_DASH_SHIFT = 40;
/** 左右に泳がないよう、端にぶつからない広さで計算する */
const PREVIEW_BOUNDS = { width: 10_000, height: 10_000 };

export type PreviewVisual = {
  /** もとの位置からのずれ（px） */
  offsetX: number;
  offsetY: number;
  rotation: number;
  scale: number;
  sayText: string | null;
};

const STILL: PreviewVisual = { offsetX: 0, offsetY: 0, rotation: 0, scale: 1, sayText: null };

/** その場で動かすための動き。右向きに、まっすぐ泳いでいる状態から始める */
export const createPreviewMotion = (): CreatureMotion => ({
  x: PREVIEW_BOUNDS.width / 2,
  y: PREVIEW_BOUNDS.height / 2,
  vx: 60,
  vy: 0,
  targetVx: 60,
  targetVy: 0,
  wanderRemaining: Number.POSITIVE_INFINITY,
  facing: 1,
  bobPhase: 0,
  commandIndex: 0,
  commandElapsed: 0,
  enterRemaining: 0,
  enterFromY: 0,
  leaveDirection: 0,
});

/** 並び・動き・セリフがすべて同じか。同じなら、プレビューを最初からやり直さない */
export const isSameCommands = (a: readonly BasicCommand[], b: readonly BasicCommand[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** コマンドの進み具合とふわふわだけを進め、位置と泳ぐ向きはそのままにする */
export const stepPreviewMotion = (
  motion: CreatureMotion,
  commands: BasicCommand[],
  deltaMs: number,
): CreatureMotion => {
  const next = stepMotion(motion, commands, deltaMs, PREVIEW_BOUNDS);

  return {
    ...next,
    x: motion.x,
    y: motion.y,
    vx: motion.vx,
    vy: motion.vy,
    targetVx: motion.targetVx,
    targetVy: motion.targetVy,
    wanderRemaining: motion.wanderRemaining,
  };
};

/** 大画面と同じ計算で見た目を出し、プレビューの枠に合わせて動きの大きさを縮める */
export const toPreviewVisual = (
  motion: CreatureMotion,
  commands: BasicCommand[],
): PreviewVisual => {
  // ブロックがないときは、絵をそのまま見せる
  if (commands.length === 0) {
    return STILL;
  }

  const visual = toVisual(motion, commands);

  return {
    offsetX: visual.x - motion.x + visual.dashIntensity * PREVIEW_DASH_SHIFT,
    offsetY: (visual.y - motion.y) * PREVIEW_VERTICAL_SCALE,
    rotation: visual.rotation,
    scale: visual.scale,
    sayText: visual.sayText,
  };
};
