import type { BasicCommand, Command, Motion } from 'shared';
import { commandAt, nextCursor, startCursor, type ProgramCursor } from './programCursor.ts';

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
/** 登場：水面（画面の上の外）から、泳ぐ高さまで沈んでくる時間 */
export const ENTER_DURATION_MS = 2500;
/** 登場：沈み始める位置を、画面の上端からどれだけ上にするか */
const ENTER_START_ABOVE = 40;
/** 退場：近いほうの左右の端へ、この速さ（px/秒）まで上げて画面の外へ泳いでいく */
const LEAVE_SPEED = 320;
/** 退場：泳いでいくときの後ろの泡の量（はやく およぐ の強さと同じ 0〜1） */
const LEAVE_BUBBLE_INTENSITY = 0.6;

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
/**
 * 上の端だけは浅くする。上はジャンプや吹き出しのための余白（TOP_MARGIN）をもうあけているので、
 * 左右と同じだけ手前で引き返すと、画面の上のほうに作品が来なくなる
 */
const TOP_EDGE_MARGIN = 40;
/** ほかの作品がこの範囲（作品 1 つ分）に入ったら、少しずつ離れる */
const SEPARATION_RANGE_X = CREATURE_WIDTH;
const SEPARATION_RANGE_Y = CREATURE_HEIGHT;
/** 離れる速さ（px/秒）。泳ぐ向きは変えず、位置だけを少しずらす */
const SEPARATION_SPEED = 45;
/** 新しい作品を出すとき、いくつ場所の候補を出して、いちばん空いているところを選ぶか */
const SPAWN_CANDIDATES = 12;
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
  /** 組んだブロックの、いま再生しているところ（まだ始めていなければ空） */
  cursor: ProgramCursor;
  /** いまの動き・セリフを始めてからの時間（ミリ秒） */
  commandElapsed: number;
  /** 登場して沈んでくる残り時間（ミリ秒）。0 なら登場は終わっている */
  enterRemaining: number;
  /** 登場で沈み始める高さ（画面の上の外） */
  enterFromY: number;
  /** 退場して泳いでいく向き。0 ならまだ退場していない */
  leaveDirection: -1 | 0 | 1;
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
  /** 登場して沈んできている途中か（泡を出すのに使う） */
  entering: boolean;
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
const commandActionMs = (command: BasicCommand): number =>
  command.type === 'say' ? SAY_DURATION_MS : MOTION_DURATION_MS[command.motion];

/** いまの位置。まだ始めていない（空）ときは、最初の動き・セリフの位置 */
const resolveCursor = (program: readonly Command[], cursor: ProgramCursor): ProgramCursor =>
  cursor.length > 0 ? cursor : (startCursor(program) ?? []);

/** 今やっている動き（休み時間なら null）と、その進み具合（0〜1） */
const currentAction = (
  motion: Pick<CreatureMotion, 'cursor' | 'commandElapsed'>,
  program: readonly Command[],
): { command: BasicCommand; progress: number } | null => {
  const command = commandAt(program, resolveCursor(program, motion.cursor));

  if (command === null) {
    return null;
  }

  const progress = motion.commandElapsed / commandActionMs(command);

  // 動き終わった後の休み時間は、普通に泳ぐだけにする
  return progress < 1 ? { command, progress } : null;
};

const currentMotion = (action: ReturnType<typeof currentAction>): Motion | null =>
  action !== null && action.command.type === 'move' ? action.command.motion : null;

const getDashIntensity = (action: ReturnType<typeof currentAction>): number =>
  currentMotion(action) === 'dash' && action !== null ? Math.sin(action.progress * Math.PI) : 0;

/** 次のコマンドへ進むまでの時間（動き + 休み） */
export const commandDurationMs = (command: BasicCommand): number =>
  commandActionMs(command) + COMMAND_REST_MS;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** 始めと終わりをゆっくりにする */
const easeInOut = (progress: number): number => (1 - Math.cos(progress * Math.PI)) / 2;

/** 終わりだけをゆっくりにする（勢いよく沈んできて、ふわっと止まる） */
const easeOut = (progress: number): number => 1 - (1 - progress) ** 3;

const randomBetween = (min: number, max: number, random: () => number): number =>
  min + random() * (max - min);

const randomVerticalSpeed = (random: () => number): number =>
  (random() - 0.5) * 2 * MAX_VERTICAL_SPEED;

const verticalRange = (bounds: Bounds): { minY: number; maxY: number } => {
  const maxY = Math.max(0, bounds.height - CREATURE_HEIGHT);

  return { minY: Math.min(TOP_MARGIN, maxY), maxY };
};

export type Point = {
  x: number;
  y: number;
};

/** 作品の大きさを 1 としたときの、2 つの位置の近さ（重なりやすさ）。小さいほど近い */
const scaledDistance = (a: Point, b: Point): number =>
  Math.hypot((a.x - b.x) / CREATURE_WIDTH, (a.y - b.y) / CREATURE_HEIGHT);

/** 場所の候補をいくつか出し、ほかの作品からいちばん離れているところを選ぶ */
const pickSpawnPoint = (
  bounds: Bounds,
  random: () => number,
  occupied: readonly Point[],
): Point => {
  const { minY, maxY } = verticalRange(bounds);
  const randomPoint = (): Point => ({
    x: random() * Math.max(0, bounds.width - CREATURE_WIDTH),
    y: minY + random() * (maxY - minY),
  });

  if (occupied.length === 0) {
    return randomPoint();
  }

  let best = randomPoint();
  let bestDistance = Math.min(...occupied.map((point) => scaledDistance(best, point)));

  for (let i = 1; i < SPAWN_CANDIDATES; i += 1) {
    const candidate = randomPoint();
    const distance = Math.min(...occupied.map((point) => scaledDistance(candidate, point)));

    if (distance > bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
};

/**
 * 近くにいる作品から離れる向き（-1〜1）。作品 1 つ分より近い相手ほど強く押し返す。
 * 向きは泳ぐ速度ではなく位置のずれとして使うので、作品の向きがぶれない
 */
export const separationFrom = (self: Point, neighbors: readonly Point[]): Point => {
  let pushX = 0;
  let pushY = 0;

  for (const [index, other] of neighbors.entries()) {
    const dx = self.x - other.x;
    const dy = self.y - other.y;
    const overlapX = 1 - Math.abs(dx) / SEPARATION_RANGE_X;
    const overlapY = 1 - Math.abs(dy) / SEPARATION_RANGE_Y;

    if (overlapX <= 0 || overlapY <= 0) {
      continue;
    }

    const strength = overlapX * overlapY;
    // ぴったり同じ位置のときは、相手ごとに決まった向きへずらす
    pushX += (dx === 0 ? (index % 2 === 0 ? 1 : -1) : Math.sign(dx)) * strength;
    pushY += (dy === 0 ? (index % 2 === 0 ? -1 : 1) : Math.sign(dy)) * strength;
  }

  return { x: clamp(pushX, -1, 1), y: clamp(pushY, -1, 1) };
};

/**
 * 新しい作品の動きを作る。entering が true なら、水面（画面の上）から沈んできて登場する。
 * 大画面を開き直したときに戻ってきた作品は、最初から泳いでいるように entering を false にする。
 * occupied にほかの作品の位置を渡すと、なるべく空いているところに出す。
 */
export const createMotion = (
  bounds: Bounds,
  random: () => number = Math.random,
  { entering = false, occupied = [] }: { entering?: boolean; occupied?: readonly Point[] } = {},
): CreatureMotion => {
  // 描いたままの向きで登場させたいので、最初は必ず右へ泳ぎ出す
  const direction = 1;
  const vx = direction * randomBetween(MIN_SPEED, MAX_SPEED, random);
  const vy = randomVerticalSpeed(random);
  const spawn = pickSpawnPoint(bounds, random, occupied);

  return {
    x: spawn.x,
    y: spawn.y,
    vx,
    vy,
    targetVx: vx,
    targetVy: vy,
    wanderRemaining: randomBetween(MIN_WANDER_MS, MAX_WANDER_MS, random),
    facing: direction,
    bobPhase: random() * Math.PI * 2,
    cursor: [],
    commandElapsed: 0,
    enterRemaining: entering ? ENTER_DURATION_MS : 0,
    enterFromY: -CREATURE_HEIGHT - ENTER_START_ABOVE,
    leaveDirection: 0,
  };
};

/** 退場を始める。画面の真ん中より左にいれば左へ、右にいれば右へ、画面の外まで泳いでいく */
export const startLeaving = (motion: CreatureMotion, bounds: Bounds): CreatureMotion => {
  const leaveDirection = motion.x + CREATURE_WIDTH / 2 < bounds.width / 2 ? -1 : 1;

  return {
    ...motion,
    enterRemaining: 0,
    leaveDirection,
    targetVx: leaveDirection * LEAVE_SPEED,
    targetVy: 0,
  };
};

/** 退場して、絵が画面の外まで出きったか（傾きやふわふわの分も見込んで、少し余分に出す） */
export const hasLeftScreen = (motion: CreatureMotion, bounds: Bounds): boolean =>
  (motion.leaveDirection < 0 && motion.x < -CREATURE_WIDTH - EDGE_MARGIN / 2) ||
  (motion.leaveDirection > 0 && motion.x > bounds.width + EDGE_MARGIN / 2);

export const stepMotion = (
  motion: CreatureMotion,
  commands: readonly Command[],
  deltaMs: number,
  bounds: Bounds,
  random: () => number = Math.random,
  /** ほかの作品の位置。近すぎたら少し離れる */
  neighbors: readonly Point[] = [],
): CreatureMotion => {
  const seconds = deltaMs / 1000;
  const maxX = Math.max(0, bounds.width - CREATURE_WIDTH);
  const { minY, maxY } = verticalRange(bounds);

  let { x, y, vx, vy, targetVx, targetVy, wanderRemaining, facing, bobPhase } = motion;
  let { cursor, commandElapsed } = motion;
  // 登場して沈んでくる間は、泳ぐ高さ（y）を決めたままにし、コマンドもまだ始めない
  const entering = motion.enterRemaining > 0;
  const enterRemaining = Math.max(0, motion.enterRemaining - deltaMs);
  // 退場している間は、向きを決め直したり端で引き返したりせず、画面の外までまっすぐ泳ぐ
  const leaving = motion.leaveDirection !== 0;

  if (!leaving) {
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

    if (y < minY + TOP_EDGE_MARGIN) {
      targetVy = Math.abs(targetVy);
    } else if (y > maxY - EDGE_MARGIN) {
      targetVy = -Math.abs(targetVy);
    }
  }

  // 退場するときは、ぐっと速度を上げて泳ぎ去る
  const steer = Math.min(1, seconds * STEER_RATE * (leaving ? 2 : 1));

  vx += (targetVx - vx) * steer;
  vy += (targetVy - vy) * steer;

  // はやく およぐ：進む向きはそのままで、進む速さだけをなめらかに上げ下げする
  const action = entering || leaving ? null : currentAction(motion, commands);
  const dashIntensity = getDashIntensity(action);
  const speedRate = 1 + (DASH_MAX_SPEED_RATE - 1) * dashIntensity;

  // 近くの作品から少し離れる（退場中は画面の外へ急ぐので離れない）
  const separation = leaving ? { x: 0, y: 0 } : separationFrom({ x, y }, neighbors);

  x = leaving
    ? x + vx * seconds
    : clamp(x + (vx * speedRate + separation.x * SEPARATION_SPEED) * seconds, 0, maxX);

  if (!entering) {
    y = clamp(y + (vy * speedRate + separation.y * SEPARATION_SPEED) * seconds, minY, maxY);
  }

  const targetFacing = vx < 0 ? -1 : 1;

  facing += (targetFacing - facing) * Math.min(1, seconds * TURN_RATE);
  bobPhase = (bobPhase + seconds * BOB_SPEED) % (Math.PI * 2);

  let current = commandAt(commands, cursor);

  // 位置がまだ決まっていない、またはブロックと合わなくなっていたら、最初から再生する
  if (current === null) {
    cursor = startCursor(commands) ?? [];
    commandElapsed = 0;
    current = commandAt(commands, cursor);
  }

  if (current === null) {
    // 再生するものがない
    cursor = [];
    commandElapsed = 0;
  } else if (!entering && !leaving) {
    commandElapsed += deltaMs;

    // 動きと休みが終わったら、ブロックをたどって次の動き・セリフへ進む
    while (current !== null && commandElapsed >= commandDurationMs(current)) {
      commandElapsed -= commandDurationMs(current);
      cursor = nextCursor(commands, cursor) ?? [];
      current = commandAt(commands, cursor);
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
    cursor,
    commandElapsed,
    enterRemaining,
    enterFromY: motion.enterFromY,
    leaveDirection: motion.leaveDirection,
  };
};

export const toVisual = (motion: CreatureMotion, commands: readonly Command[]): CreatureVisual => {
  const entering = motion.enterRemaining > 0;
  const leaving = motion.leaveDirection !== 0;
  const action = entering || leaving ? null : currentAction(motion, commands);
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

  // 登場中は、水面（画面の上の外）から泳ぐ高さまで沈んでくる
  const enterProgress = 1 - motion.enterRemaining / ENTER_DURATION_MS;
  const baseY = entering
    ? motion.enterFromY + (motion.y - motion.enterFromY) * easeOut(enterProgress)
    : motion.y;

  return {
    x: motion.x + shakeWave * SHAKE_AMPLITUDE,
    y: baseY + Math.sin(motion.bobPhase) * BOB_AMPLITUDE - jumpOffset,
    rotation: tilt + spinAngle + shakeWave * SHAKE_TILT_DEG,
    scale,
    // 退場して泳いでいく間も、後ろに泡を出す
    dashIntensity: leaving ? LEAVE_BUBBLE_INTENSITY : getDashIntensity(action),
    facing: motion.facing < 0 ? 'left' : 'right',
    entering,
    sayText: action !== null && action.command.type === 'say' ? action.command.text : null,
  };
};
