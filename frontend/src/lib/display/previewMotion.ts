import type { Command, Condition } from 'shared';
import { conditionCheckFor, stepMotion, toVisual, type CreatureMotion } from './creatureMotion.ts';

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
  cursor: [],
  commandElapsed: 0,
  enterRemaining: 0,
  enterFromY: 0,
  leaveDirection: 0,
});

/** 組んだブロックの中で使っている「もし」の条件（なかまやはしの見立てを、使うときだけ見せるため） */
export const conditionsUsed = (commands: readonly Command[]): Set<Condition> => {
  const used = new Set<Condition>();

  const visit = (list: readonly Command[]) => {
    for (const command of list) {
      if (command.type === 'repeat') {
        visit(command.commands);
      } else if (command.type === 'if') {
        used.add(command.condition);
        visit(command.thenCommands);
        visit(command.elseCommands);
      }
    }
  };

  visit(commands);

  return used;
};

/** 並び・動き・セリフがすべて同じか。同じなら、プレビューを最初からやり直さない */
export const isSameCommands = (a: readonly Command[], b: readonly Command[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * プレビューの中の見立て。プレビューにはほかの作品がおらず、端にも行かないので、
 * 決まった間隔で「なかま」が通りかかり、そのあと「はし」にいることにして、「もし」の条件を試せるようにする
 */
export type PreviewWorld = {
  /** なかまが近くにいるか */
  friendNear: boolean;
  /** 通りかかっているなかまの位置（0 で右端、1 で左端）。通りかかっていなければ null */
  friendProgress: number | null;
  /** はしにいることにしているか */
  atEdge: boolean;
};

/** 見立てを 1 回りする時間と、なかま・はしの出る時間（ミリ秒） */
const PREVIEW_WORLD_CYCLE_MS = 10_000;
const FRIEND_FROM_MS = 2000;
const FRIEND_TO_MS = 5000;
const EDGE_FROM_MS = 6500;
const EDGE_TO_MS = 9000;

export const NO_PREVIEW_WORLD: PreviewWorld = {
  friendNear: false,
  friendProgress: null,
  atEdge: false,
};

/** 見立ての時計 timeMs のときの、なかまとはしのようす */
export const previewWorldAt = (timeMs: number): PreviewWorld => {
  const t = ((timeMs % PREVIEW_WORLD_CYCLE_MS) + PREVIEW_WORLD_CYCLE_MS) % PREVIEW_WORLD_CYCLE_MS;
  const friendNear = t >= FRIEND_FROM_MS && t < FRIEND_TO_MS;

  return {
    friendNear,
    friendProgress: friendNear ? (t - FRIEND_FROM_MS) / (FRIEND_TO_MS - FRIEND_FROM_MS) : null,
    atEdge: t >= EDGE_FROM_MS && t < EDGE_TO_MS,
  };
};

/** コマンドの進み具合とふわふわだけを進め、位置と泳ぐ向きはそのままにする */
export const stepPreviewMotion = (
  motion: CreatureMotion,
  commands: readonly Command[],
  deltaMs: number,
  world: PreviewWorld = NO_PREVIEW_WORLD,
): CreatureMotion => {
  // 確率の条件は大画面と同じ調べ方にし、なかまとはしは見立てで答える
  const sameAsDisplay = conditionCheckFor({ x: 0, y: 0 }, [], PREVIEW_BOUNDS);
  const next = stepMotion(
    motion,
    commands,
    deltaMs,
    PREVIEW_BOUNDS,
    Math.random,
    [],
    (condition) => {
      if (condition === 'near_friend') {
        return world.friendNear;
      }

      if (condition === 'at_edge') {
        return world.atEdge;
      }

      return sameAsDisplay(condition);
    },
  );

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
  commands: readonly Command[],
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
