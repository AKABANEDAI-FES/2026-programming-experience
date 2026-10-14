import type { Command } from 'shared';

export const CREATURE_WIDTH = 220;
export const CREATURE_HEIGHT = 132;

const JUMP_HEIGHT = 140;
const JUMP_DURATION_MS = 1000;
const SPIN_DURATION_MS = 2000;
const SAY_DURATION_MS = 2500;
/** コマンドの後、次のコマンドまで普通に泳ぐ時間 */
const COMMAND_REST_MS = 1500;

const MIN_SPEED = 40;
const MAX_SPEED = 80;
const MAX_VERTICAL_SPEED = 18;
/** 次に泳ぐ向きを決め直すまでの時間（ミリ秒） */
const MIN_WANDER_MS = 2000;
const MAX_WANDER_MS = 5000;
/** 向きを決め直したときに左右を切り替える確率 */
const TURN_CHANCE = 0.25;
/** 端からこの距離に入ったら内側へ向きを変え始める */
const EDGE_MARGIN = 120;
/** 速度が目標へ近づく速さ。大きいほど素早く曲がる */
const STEER_RATE = 1.2;
/** 左右の向きが切り替わる速さ。4 だと約 0.4 秒で向き直る */
const TURN_RATE = 4;
const BOB_AMPLITUDE = 8;
const BOB_SPEED = 1.8;
const MAX_TILT_DEG = 18;

export type Bounds = {
  width: number;
  height: number;
};

export type CreatureMotion = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 今向かおうとしている速度。vx, vy はここへ少しずつ近づく */
  targetVx: number;
  targetVy: number;
  /** 次に向きを決め直すまでの残り時間（ミリ秒） */
  wanderRemaining: number;
  /** 進んでいる左右の向き。-1（左）〜 1（右）をなめらかに行き来し、傾きの向きに使う */
  facing: number;
  /** 上下のふわふわの位相（ラジアン） */
  bobPhase: number;
  commandIndex: number;
  commandElapsed: number;
};

export type CreatureVisual = {
  x: number;
  y: number;
  rotation: number;
  sayText: string | null;
};

/** コマンドの動きそのものにかかる時間 */
const commandActionMs = (command: Command): number => {
  if (command.type === 'say') {
    return SAY_DURATION_MS;
  }

  return command.motion === 'spin' ? SPIN_DURATION_MS : JUMP_DURATION_MS;
};

/** 次のコマンドへ進むまでの時間（動き + 休み） */
export const commandDurationMs = (command: Command): number =>
  commandActionMs(command) + COMMAND_REST_MS;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** 始めと終わりをゆっくりにする */
const easeInOut = (progress: number): number => (1 - Math.cos(progress * Math.PI)) / 2;

const randomBetween = (min: number, max: number, random: () => number): number =>
  min + random() * (max - min);

const randomVerticalSpeed = (random: () => number): number =>
  (random() - 0.5) * 2 * MAX_VERTICAL_SPEED;

export const createMotion = (
  bounds: Bounds,
  random: () => number = Math.random,
): CreatureMotion => {
  // 描いたままの向きで登場させたいので、最初は必ず右へ泳ぎ出す
  const direction = 1;
  const vx = direction * randomBetween(MIN_SPEED, MAX_SPEED, random);
  const vy = randomVerticalSpeed(random);

  return {
    x: random() * Math.max(0, bounds.width - CREATURE_WIDTH),
    y: random() * Math.max(0, bounds.height - CREATURE_HEIGHT),
    vx,
    vy,
    targetVx: vx,
    targetVy: vy,
    wanderRemaining: randomBetween(MIN_WANDER_MS, MAX_WANDER_MS, random),
    facing: direction,
    bobPhase: random() * Math.PI * 2,
    commandIndex: 0,
    commandElapsed: 0,
  };
};

export const stepMotion = (
  motion: CreatureMotion,
  commands: Command[],
  deltaMs: number,
  bounds: Bounds,
  random: () => number = Math.random,
): CreatureMotion => {
  const seconds = deltaMs / 1000;
  const maxX = Math.max(0, bounds.width - CREATURE_WIDTH);
  const maxY = Math.max(0, bounds.height - CREATURE_HEIGHT);

  let { x, y, vx, vy, targetVx, targetVy, wanderRemaining, facing, bobPhase } = motion;
  let { commandIndex, commandElapsed } = motion;

  // ときどき泳ぐ向きと速さを決め直して、ゆるく蛇行させる
  wanderRemaining -= deltaMs;

  if (wanderRemaining <= 0) {
    const direction = random() < TURN_CHANCE ? -Math.sign(targetVx) : Math.sign(targetVx);

    targetVx = (direction || 1) * randomBetween(MIN_SPEED, MAX_SPEED, random);
    targetVy = randomVerticalSpeed(random);
    wanderRemaining = randomBetween(MIN_WANDER_MS, MAX_WANDER_MS, random);
  }

  // 端に近づいたら、ぶつかる前に内側へ向きを変える
  if (x < EDGE_MARGIN) {
    targetVx = Math.abs(targetVx);
  } else if (x > maxX - EDGE_MARGIN) {
    targetVx = -Math.abs(targetVx);
  }

  if (y < EDGE_MARGIN) {
    targetVy = Math.abs(targetVy);
  } else if (y > maxY - EDGE_MARGIN) {
    targetVy = -Math.abs(targetVy);
  }

  const steer = Math.min(1, seconds * STEER_RATE);

  vx += (targetVx - vx) * steer;
  vy += (targetVy - vy) * steer;

  x = clamp(x + vx * seconds, 0, maxX);
  y = clamp(y + vy * seconds, 0, maxY);

  const targetFacing = vx < 0 ? -1 : 1;

  facing += (targetFacing - facing) * Math.min(1, seconds * TURN_RATE);
  bobPhase = (bobPhase + seconds * BOB_SPEED) % (Math.PI * 2);

  if (commands.length === 0) {
    commandIndex = 0;
    commandElapsed = 0;
  } else {
    commandIndex %= commands.length;
    commandElapsed += deltaMs;

    while (commandElapsed >= commandDurationMs(commands[commandIndex])) {
      commandElapsed -= commandDurationMs(commands[commandIndex]);
      commandIndex = (commandIndex + 1) % commands.length;
    }
  }

  return {
    x,
    y,
    vx,
    vy,
    targetVx,
    targetVy,
    wanderRemaining,
    facing,
    bobPhase,
    commandIndex,
    commandElapsed,
  };
};

export const toVisual = (motion: CreatureMotion, commands: Command[]): CreatureVisual => {
  const command = commands.length > 0 ? commands[motion.commandIndex % commands.length] : undefined;
  const progress = command === undefined ? 0 : motion.commandElapsed / commandActionMs(command);
  // 動き終わった後の休み時間は、普通に泳ぐだけにする
  const isActing = command !== undefined && progress < 1;
  const motionType = isActing && command.type === 'move' ? command.motion : null;

  const jumpOffset =
    motionType === 'jump' ? Math.sin(easeInOut(progress) * Math.PI) * JUMP_HEIGHT : 0;
  const spinAngle = motionType === 'spin' ? easeInOut(progress) * 360 : 0;

  // 上下に進むときは、進んでいる側を少し上げ下げする。
  // 描いた文字が鏡文字にならないよう絵は左右反転させず、左へ進むときは傾きの向きだけを逆にする
  const heading = (Math.atan2(motion.vy, Math.abs(motion.vx)) * 180) / Math.PI;
  const tilt = clamp(heading, -MAX_TILT_DEG, MAX_TILT_DEG) * motion.facing;

  return {
    x: motion.x,
    y: motion.y + Math.sin(motion.bobPhase) * BOB_AMPLITUDE - jumpOffset,
    rotation: tilt + spinAngle,
    sayText: isActing && command.type === 'say' ? command.text : null,
  };
};
