import type { Command, Motion } from 'shared';

export const CREATURE_WIDTH = 220;
export const CREATURE_HEIGHT = 132;

const JUMP_HEIGHT = 140;
const JUMP_DURATION_MS = 1000;
const SPIN_DURATION_MS = 2000;
const SAY_DURATION_MS = 2500;
/** はやく およぐ：泳ぐ速さを、なめらかに最大でこの倍率まで上げてから戻す */
const DASH_DURATION_MS = 1200;
const DASH_MAX_SPEED_RATE = 3;
/** ふくらむ：この倍率まで大きくなってから戻る（大きいままにはしない） */
const GROW_DURATION_MS = 1500;
const GROW_MAX_SCALE = 1.3;
/** ぶるぶる ふるえる：左右に小刻みに震える */
const SHAKE_DURATION_MS = 1000;
const SHAKE_TIMES = 6;
const SHAKE_AMPLITUDE = 6;
const SHAKE_TILT_DEG = 3;
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
/** ジャンプやセリフの吹き出しが上端で見切れないよう、作品の上にあけておく高さ */
const TOP_MARGIN = JUMP_HEIGHT + BOB_AMPLITUDE;

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
  /** 絵の大きさの倍率（ふだんは 1） */
  scale: number;
  /** はやく およぐ の強さ（0〜1）。泡の出る量に使う */
  dashIntensity: number;
  /** 泡を出す向き（進んでいる向き） */
  facing: 'left' | 'right';
  sayText: string | null;
};

const MOTION_DURATION_MS: Record<Motion, number> = {
  jump: JUMP_DURATION_MS,
  spin: SPIN_DURATION_MS,
  dash: DASH_DURATION_MS,
  grow: GROW_DURATION_MS,
  shake: SHAKE_DURATION_MS,
};

/** コマンドの動きそのものにかかる時間 */
const commandActionMs = (command: Command): number =>
  command.type === 'say' ? SAY_DURATION_MS : MOTION_DURATION_MS[command.motion];

/** 今やっている動き（休み時間なら null）と、その進み具合（0〜1） */
const currentAction = (
  motion: Pick<CreatureMotion, 'commandIndex' | 'commandElapsed'>,
  commands: Command[],
): { command: Command; progress: number } | null => {
  if (commands.length === 0) {
    return null;
  }

  const command = commands[motion.commandIndex % commands.length];
  const progress = motion.commandElapsed / commandActionMs(command);

  // 動き終わった後の休み時間は、普通に泳ぐだけにする
  return progress < 1 ? { command, progress } : null;
};

const currentMotion = (action: ReturnType<typeof currentAction>): Motion | null =>
  action !== null && action.command.type === 'move' ? action.command.motion : null;

const getDashIntensity = (action: ReturnType<typeof currentAction>): number =>
  currentMotion(action) === 'dash' && action !== null ? Math.sin(action.progress * Math.PI) : 0;

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

const verticalRange = (bounds: Bounds): { minY: number; maxY: number } => {
  const maxY = Math.max(0, bounds.height - CREATURE_HEIGHT);

  return { minY: Math.min(TOP_MARGIN, maxY), maxY };
};

export const createMotion = (
  bounds: Bounds,
  random: () => number = Math.random,
): CreatureMotion => {
  // 描いたままの向きで登場させたいので、最初は必ず右へ泳ぎ出す
  const direction = 1;
  const vx = direction * randomBetween(MIN_SPEED, MAX_SPEED, random);
  const vy = randomVerticalSpeed(random);
  const { minY, maxY } = verticalRange(bounds);

  return {
    x: random() * Math.max(0, bounds.width - CREATURE_WIDTH),
    y: minY + random() * (maxY - minY),
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
  const { minY, maxY } = verticalRange(bounds);

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

  if (y < minY + EDGE_MARGIN) {
    targetVy = Math.abs(targetVy);
  } else if (y > maxY - EDGE_MARGIN) {
    targetVy = -Math.abs(targetVy);
  }

  const steer = Math.min(1, seconds * STEER_RATE);

  vx += (targetVx - vx) * steer;
  vy += (targetVy - vy) * steer;

  // はやく およぐ：進む向きはそのままで、進む速さだけをなめらかに上げ下げする
  const action = currentAction(motion, commands);
  const dashIntensity = getDashIntensity(action);
  const speedRate = 1 + (DASH_MAX_SPEED_RATE - 1) * dashIntensity;

  x = clamp(x + vx * speedRate * seconds, 0, maxX);
  y = clamp(y + vy * speedRate * seconds, minY, maxY);

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
  const action = currentAction(motion, commands);
  const motionType = currentMotion(action);
  const progress = action?.progress ?? 0;
  // 0 → 1 → 0 と山なりに変わる値（ジャンプの高さや大きくなる量に使う）
  const swell = Math.sin(easeInOut(progress) * Math.PI);

  const jumpOffset = motionType === 'jump' ? swell * JUMP_HEIGHT : 0;
  const spinAngle = motionType === 'spin' ? easeInOut(progress) * 360 : 0;
  const scale = motionType === 'grow' ? 1 + (GROW_MAX_SCALE - 1) * swell : 1;
  const shakeWave = motionType === 'shake' ? Math.sin(progress * SHAKE_TIMES * 2 * Math.PI) : 0;

  // 上下に進むときは、進んでいる側を少し上げ下げする。
  // 描いた文字が鏡文字にならないよう絵は左右反転させず、左へ進むときは傾きの向きだけを逆にする
  const heading = (Math.atan2(motion.vy, Math.abs(motion.vx)) * 180) / Math.PI;
  const tilt = clamp(heading, -MAX_TILT_DEG, MAX_TILT_DEG) * motion.facing;

  return {
    x: motion.x + shakeWave * SHAKE_AMPLITUDE,
    y: motion.y + Math.sin(motion.bobPhase) * BOB_AMPLITUDE - jumpOffset,
    rotation: tilt + spinAngle + shakeWave * SHAKE_TILT_DEG,
    scale,
    dashIntensity: getDashIntensity(action),
    facing: motion.facing < 0 ? 'left' : 'right',
    sayText: action !== null && action.command.type === 'say' ? action.command.text : null,
  };
};
