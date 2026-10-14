import assert from 'node:assert/strict';
import test from 'node:test';
import type { Command } from 'shared';
import {
  CREATURE_HEIGHT,
  CREATURE_WIDTH,
  createMotion,
  stepMotion,
  toVisual,
  type CreatureMotion,
} from '../../src/lib/display/creatureMotion.ts';

const BOUNDS = { width: 1000, height: 600 };
const FRAME_MS = 16;

const motionAt = (overrides: Partial<CreatureMotion> = {}): CreatureMotion => ({
  x: 300,
  y: 200,
  vx: 60,
  vy: 0,
  targetVx: 60,
  targetVy: 0,
  wanderRemaining: 10_000,
  facing: 1,
  bobPhase: 0,
  commandIndex: 0,
  commandElapsed: 0,
  ...overrides,
});

const runFrames = (motion: CreatureMotion, frames: number, commands: Command[] = []) => {
  let current = motion;

  for (let i = 0; i < frames; i += 1) {
    current = stepMotion(current, commands, FRAME_MS, BOUNDS, () => 0.5);
  }

  return current;
};

test('速度に応じて位置が進む', () => {
  const next = stepMotion(motionAt(), [], 1000, BOUNDS);

  assert.equal(next.x, 360);
});

test('右端に近づくと、ぶつかる前になめらかに左へ向きを変える', () => {
  const nearRight = motionAt({ x: BOUNDS.width - CREATURE_WIDTH - 100 });

  // 1フレームでは急に反転しない
  assert.ok(stepMotion(nearRight, [], FRAME_MS, BOUNDS).vx > 0);

  const later = runFrames(nearRight, 300);

  assert.ok(later.vx < 0);
  assert.ok(later.x <= BOUNDS.width - CREATURE_WIDTH);
});

test('左端に近づくと右へ向きを変える', () => {
  const later = runFrames(motionAt({ x: 50, vx: -60, targetVx: -60, facing: -1 }), 300);

  assert.ok(later.vx > 0);
  assert.ok(later.x >= 0);
});

test('長く泳いでも画面の外に出ない', () => {
  let motion = createMotion(BOUNDS, () => 0.3);

  for (let i = 0; i < 5000; i += 1) {
    motion = stepMotion(motion, [], FRAME_MS, BOUNDS);

    assert.ok(motion.x >= 0 && motion.x <= BOUNDS.width - CREATURE_WIDTH);
    assert.ok(motion.y >= 0 && motion.y <= BOUNDS.height - CREATURE_HEIGHT);
  }
});

test('時間が来ると泳ぐ向きと速さを決め直す', () => {
  const next = stepMotion(motionAt({ wanderRemaining: 10 }), [], FRAME_MS, BOUNDS, () => 0.9);

  assert.notEqual(next.targetVx, 60);
  assert.ok(next.wanderRemaining > 0);
});

test('左右の向きは一瞬ではなく少しずつ切り替わる', () => {
  const turning = motionAt({ vx: -60, targetVx: -60, facing: 1 });
  const next = stepMotion(turning, [], FRAME_MS, BOUNDS);

  assert.ok(next.facing < 1 && next.facing > -1);
  assert.ok(runFrames(turning, 120).facing < -0.99);
});

test('時間が経つと次のコマンドへ進む', () => {
  const commands: Command[] = [
    { type: 'move', motion: 'jump' },
    { type: 'move', motion: 'spin' },
  ];

  // ジャンプ 1000ms + 休み 1500ms の後に次へ進む
  assert.equal(stepMotion(motionAt(), commands, 2400, BOUNDS).commandIndex, 0);

  const next = stepMotion(motionAt(), commands, 2700, BOUNDS);

  assert.equal(next.commandIndex, 1);
  assert.equal(next.commandElapsed, 200);
});

test('最後のコマンドまで進むと先頭へ戻る', () => {
  const commands: Command[] = [
    { type: 'move', motion: 'jump' },
    { type: 'move', motion: 'spin' },
  ];

  const next = stepMotion(
    motionAt({ commandIndex: 1, commandElapsed: 3400 }),
    commands,
    200,
    BOUNDS,
  );

  assert.equal(next.commandIndex, 0);
});

test('コマンドがない場合も泳ぎ続ける', () => {
  const next = stepMotion(motionAt(), [], 500, BOUNDS);

  assert.equal(next.commandIndex, 0);
  assert.equal(next.commandElapsed, 0);
  assert.equal(next.x, 330);
});

test('上下にふわふわ揺れる', () => {
  const top = toVisual(motionAt({ bobPhase: Math.PI / 2 }), []);
  const bottom = toVisual(motionAt({ bobPhase: -Math.PI / 2 }), []);

  assert.ok(top.y > bottom.y);
});

test('ジャンプの途中では上に持ち上がり、終わりでは元の高さに戻る', () => {
  const commands: Command[] = [{ type: 'move', motion: 'jump' }];

  assert.ok(toVisual(motionAt({ commandElapsed: 500 }), commands).y < 200);
  assert.ok(Math.abs(toVisual(motionAt({ commandElapsed: 999 }), commands).y - 200) < 1);
});

test('回転コマンドでは進み具合に応じて角度がつく', () => {
  const commands: Command[] = [{ type: 'move', motion: 'spin' }];
  // 回転は 2000ms かけてゆっくり 1 周する
  const visual = toVisual(motionAt({ commandElapsed: 1000 }), commands);

  assert.ok(Math.abs(visual.rotation - 180) < 1e-9);
});

test('動き終わった後の休み時間は回転もセリフもしない', () => {
  const spin: Command[] = [{ type: 'move', motion: 'spin' }];
  const say: Command[] = [{ type: 'say', text: 'こんにちは' }];

  assert.equal(toVisual(motionAt({ commandElapsed: 2500 }), spin).rotation, 0);
  assert.equal(toVisual(motionAt({ commandElapsed: 3000 }), say).sayText, null);
});

test('下へ進むときは進んでいる側を下げ、左へ進むときは傾きの向きが逆になる', () => {
  const right = toVisual(motionAt({ vx: 60, vy: 20 }), []);
  const left = toVisual(motionAt({ vx: -60, vy: 20, facing: -1 }), []);

  assert.ok(right.rotation > 0);
  assert.ok(left.rotation < 0);
});

test('向きを変えている途中は傾きもなめらかに切り替わる', () => {
  const right = toVisual(motionAt({ vx: -60, vy: 20, facing: 1 }), []);
  const turning = toVisual(motionAt({ vx: -60, vy: 20, facing: 0.2 }), []);

  assert.ok(turning.rotation > 0 && turning.rotation < right.rotation);
});

test('最初は必ず右へ泳ぎ出し、描いた向きのまま登場する', () => {
  for (const value of [0, 0.3, 0.999]) {
    const motion = createMotion(BOUNDS, () => value);

    assert.ok(motion.vx > 0);
    assert.equal(motion.facing, 1);
  }
});

test('左へ進んでも絵を左右反転させない', () => {
  const visual = toVisual(motionAt({ vx: -60, facing: -1 }), []);

  assert.equal('facing' in visual, false);
});

test('セリフコマンドではテキストを返す', () => {
  const commands: Command[] = [{ type: 'say', text: 'こんにちは' }];

  assert.equal(toVisual(motionAt(), commands).sayText, 'こんにちは');
  assert.equal(toVisual(motionAt(), []).sayText, null);
});

test('初期位置は画面の内側に収まる', () => {
  const motion = createMotion(BOUNDS, () => 0.999);

  assert.ok(motion.x <= BOUNDS.width - CREATURE_WIDTH);
  assert.ok(motion.y >= 0);
});
