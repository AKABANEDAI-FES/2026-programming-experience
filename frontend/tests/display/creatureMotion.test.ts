import assert from 'node:assert/strict';
import test from 'node:test';
// 大画面の動きは、くりかえしを展開した後のコマンド（BasicCommand）を受け取る
import type { BasicCommand as Command } from 'shared';
import {
  CREATURE_HEIGHT,
  CREATURE_WIDTH,
  ENTER_DURATION_MS,
  createMotion,
  hasLeftScreen,
  startLeaving,
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
  enterRemaining: 0,
  enterFromY: -CREATURE_HEIGHT - 40,
  leaveDirection: 0,
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

test('左へ進むと向きが左になり、絵の角度は変わらない', () => {
  const visual = toVisual(motionAt({ vx: -60, facing: -1 }), []);

  assert.equal(visual.facing, 'left');
  assert.equal(visual.rotation, 0);
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

test('上端でジャンプしても作品が画面の外に出ない', () => {
  const commands: Command[] = [{ type: 'move', motion: 'jump' }];
  const atTop = stepMotion(motionAt({ y: 0, vy: -18, targetVy: -18 }), [], FRAME_MS, BOUNDS);
  const fromCreate = createMotion(BOUNDS, () => 0);

  for (const motion of [atTop, fromCreate]) {
    const peak = toVisual({ ...motion, bobPhase: -Math.PI / 2, commandElapsed: 500 }, commands);

    assert.ok(peak.y >= 0);
  }
});

test('上端でセリフを再生しても吹き出しの分の余白がある', () => {
  const bubbleHeight = 60;
  const commands: Command[] = [{ type: 'say', text: 'こんにちは' }];
  const atTop = stepMotion(motionAt({ y: 0, vy: -18, targetVy: -18 }), [], FRAME_MS, BOUNDS);
  const visual = toVisual({ ...atTop, bobPhase: -Math.PI / 2 }, commands);

  assert.ok(visual.y >= bubbleHeight);
});

test('はやく およぐ：動いている間は、ふだんより速く進み、泡がいちばん多く出る', () => {
  const dash: Command[] = [{ type: 'move', motion: 'dash' }];
  // 進み具合が真ん中（いちばん速いとき）の 1 フレーム
  const start = motionAt({ commandElapsed: 600 });
  const normal = stepMotion(start, [], FRAME_MS, BOUNDS);
  const dashing = stepMotion(start, dash, FRAME_MS, BOUNDS);

  assert.ok(dashing.x - start.x > (normal.x - start.x) * 2.5);
  assert.equal(toVisual(start, dash).dashIntensity, 1);
});

test('はやく およぐ：休み時間は、ふだんの速さに戻る', () => {
  const dash: Command[] = [{ type: 'move', motion: 'dash' }];
  const start = motionAt({ commandElapsed: 2000 });

  assert.equal(
    stepMotion(start, dash, FRAME_MS, BOUNDS).x,
    stepMotion(start, [], FRAME_MS, BOUNDS).x,
  );
  assert.equal(toVisual(start, dash).dashIntensity, 0);
});

test('ふくらむ：途中で大きくなり、終わると元の大きさに戻る', () => {
  const grow: Command[] = [{ type: 'move', motion: 'grow' }];

  assert.ok(toVisual(motionAt({ commandElapsed: 750 }), grow).scale > 1.25);
  assert.ok(Math.abs(toVisual(motionAt({ commandElapsed: 1499 }), grow).scale - 1) < 0.01);
  assert.equal(toVisual(motionAt(), []).scale, 1);
});

test('ぶるぶる ふるえる：左右に小刻みに揺れる', () => {
  const shake: Command[] = [{ type: 'move', motion: 'shake' }];
  const base = toVisual(motionAt(), []).x;
  const offsets = [42, 125].map((ms) => toVisual(motionAt({ commandElapsed: ms }), shake).x - base);

  // 揺れの山と谷で、左右逆に動く
  assert.ok(offsets[0] > 4);
  assert.ok(offsets[1] < -4);
});

test('どの動きも、終わったあとは次のコマンドへ進む', () => {
  for (const motion of ['dash', 'grow', 'shake'] as const) {
    const commands: Command[] = [
      { type: 'move', motion },
      { type: 'say', text: 'つぎ' },
    ];
    const next = stepMotion(motionAt(), commands, 5000, BOUNDS);

    assert.equal(next.commandIndex, 1);
  }
});

test('登場：水面（画面の上の外）から沈み始め、終わると泳ぐ高さに着く', () => {
  const entering = createMotion(BOUNDS, () => 0.5, { entering: true });

  assert.ok(toVisual(entering, []).y < -CREATURE_HEIGHT);

  // 沈んでくる間も、泳ぐ高さ（y）は変わらない
  const halfway = runFrames(entering, ENTER_DURATION_MS / 2 / FRAME_MS);
  assert.equal(halfway.y, entering.y);
  assert.ok(toVisual(halfway, []).y > -CREATURE_HEIGHT);

  const arrived = runFrames(entering, ENTER_DURATION_MS / FRAME_MS + 1);
  assert.equal(arrived.enterRemaining, 0);
  assert.equal(toVisual(arrived, []).entering, false);
  assert.ok(Math.abs(toVisual(arrived, []).y - arrived.y) <= 8);
});

test('登場：沈んでくる間はコマンドを始めず、着いてから始める', () => {
  const say: Command[] = [{ type: 'say', text: 'やあ' }];
  const entering = createMotion(BOUNDS, () => 0.5, { entering: true });
  const halfway = runFrames(entering, 60, say);

  assert.equal(halfway.commandElapsed, 0);
  assert.equal(toVisual(halfway, say).sayText, null);
  assert.equal(toVisual(halfway, say).entering, true);

  const arrived = runFrames(entering, ENTER_DURATION_MS / FRAME_MS + 10, say);
  assert.equal(toVisual(arrived, say).sayText, 'やあ');
});

test('登場しない作品（開き直して戻ってきた作品）は、最初から泳ぐ高さにいる', () => {
  const motion = createMotion(BOUNDS, () => 0.5);

  assert.equal(motion.enterRemaining, 0);
  assert.ok(toVisual(motion, []).y < BOUNDS.height);
});

/** 画面の外へ出きるまで進める（出きらなければ maxMs で止める） */
const runUntilLeft = (motion: CreatureMotion, commands: Command[] = [], maxMs = 10_000) => {
  let current = motion;
  let elapsed = 0;

  while (!hasLeftScreen(current, BOUNDS) && elapsed < maxMs) {
    current = stepMotion(current, commands, FRAME_MS, BOUNDS, () => 0.5);
    elapsed += FRAME_MS;
  }

  return { motion: current, elapsed };
};

test('退場：画面の真ん中より左にいれば左へ、右にいれば右へ泳いで、画面の外に出る', () => {
  const left = runUntilLeft(startLeaving(motionAt({ x: 100 }), BOUNDS));
  const right = runUntilLeft(startLeaving(motionAt({ x: 700 }), BOUNDS));

  assert.ok(hasLeftScreen(left.motion, BOUNDS));
  assert.ok(left.motion.x < -CREATURE_WIDTH);
  assert.ok(hasLeftScreen(right.motion, BOUNDS));
  assert.ok(right.motion.x > BOUNDS.width);
  // 右へ泳いでいる途中でも、左の端が近ければ向きを変えて左へ出ていく
  assert.ok(left.elapsed < 5000);
});

test('退場：泳いでいく間はコマンドを進めず、後ろに泡を出す', () => {
  const say: Command[] = [{ type: 'say', text: 'やあ' }];
  const leaving = runFrames(startLeaving(motionAt({ x: 700 }), BOUNDS), 30, say);
  const visual = toVisual(leaving, say);

  assert.equal(leaving.commandElapsed, 0);
  assert.equal(visual.sayText, null);
  assert.ok(visual.dashIntensity > 0);
});

test('退場していない作品は、画面の外に出たことにならない', () => {
  assert.equal(hasLeftScreen(motionAt({ x: -1000 }), BOUNDS), false);
});
