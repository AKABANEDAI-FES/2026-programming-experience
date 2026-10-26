import assert from 'node:assert/strict';
import test from 'node:test';
import type { Command } from 'shared';
import {
  conditionsUsed,
  createPreviewMotion,
  isSameCommands,
  previewWorldAt,
  stepPreviewMotion,
  toPreviewVisual,
} from '../../src/lib/display/previewMotion.ts';

const FRAME_MS = 16;

const runFor = (ms: number, commands: Command[]) => {
  let motion = createPreviewMotion();

  for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
    motion = stepPreviewMotion(motion, commands, FRAME_MS);
  }

  return motion;
};

test('ブロックがないときは、絵をそのまま見せる', () => {
  const visual = toPreviewVisual(runFor(1000, []), []);

  assert.deepEqual(visual, { offsetX: 0, offsetY: 0, rotation: 0, scale: 1, sayText: null });
});

test('左右に泳がず、その場で動く', () => {
  const start = createPreviewMotion();
  const later = runFor(5000, [{ type: 'move', motion: 'jump' }]);

  assert.equal(later.x, start.x);
  assert.equal(later.y, start.y);
});

test('ジャンプすると上に動き、プレビューの枠に合わせて小さく動く', () => {
  const jump: Command[] = [{ type: 'move', motion: 'jump' }];
  const visual = toPreviewVisual(runFor(500, jump), jump);

  assert.ok(visual.offsetY < -20);
  assert.ok(visual.offsetY > -60);
});

test('セリフを再生し、終わったら次のコマンドへ進む', () => {
  const commands: Command[] = [
    { type: 'say', text: 'やあ' },
    { type: 'move', motion: 'spin' },
  ];

  assert.equal(toPreviewVisual(runFor(500, commands), commands).sayText, 'やあ');
  assert.equal(runFor(4500, commands).cursor[0]?.index, 1);
});

test('はやく およぐ と ふくらむ も、その場で見てわかる動きになる', () => {
  const dash: Command[] = [{ type: 'move', motion: 'dash' }];
  const grow: Command[] = [{ type: 'move', motion: 'grow' }];

  assert.ok(toPreviewVisual(runFor(600, dash), dash).offsetX > 20);
  assert.ok(toPreviewVisual(runFor(750, grow), grow).scale > 1.2);
});

test('並び・動き・セリフが同じときだけ、同じコマンドとみなす', () => {
  const commands: Command[] = [
    { type: 'say', text: 'やあ' },
    { type: 'move', motion: 'jump' },
  ];

  // クリックなどで新しい配列が届いても、中身が同じなら同じとみなす
  assert.equal(isSameCommands(commands, structuredClone(commands)), true);
  assert.equal(isSameCommands(commands, [...commands].reverse()), false);
  assert.equal(isSameCommands(commands, [{ type: 'say', text: 'やっほー' }, commands[1]]), false);
  assert.equal(isSameCommands(commands, commands.slice(0, 1)), false);
});

test('見立ての時計に合わせて、なかまが通りかかり、そのあとはしにいることにする', () => {
  assert.deepEqual(previewWorldAt(0), { friendNear: false, friendProgress: null, atEdge: false });
  assert.deepEqual(previewWorldAt(3500), { friendNear: true, friendProgress: 0.5, atEdge: false });
  assert.deepEqual(previewWorldAt(7000), { friendNear: false, friendProgress: null, atEdge: true });
  // 10 秒で 1 回り
  assert.deepEqual(previewWorldAt(13_500), previewWorldAt(3500));
});

test('組んだブロックで使っている「もし」の条件を集める（くりかえしや「もし」の中も見る）', () => {
  const used = conditionsUsed([
    {
      type: 'repeat',
      times: 2,
      commands: [
        {
          type: 'if',
          condition: 'at_edge',
          thenCommands: [],
          elseCommands: [
            { type: 'if', condition: 'chance_25', thenCommands: [], elseCommands: [] },
          ],
        },
      ],
    },
  ]);

  assert.deepEqual([...used].sort(), ['at_edge', 'chance_25']);
  assert.equal(conditionsUsed([{ type: 'move', motion: 'jump' }]).size, 0);
});

test('プレビューの「もし」は、見立てのなかま・はしで分かれ道を選ぶ', () => {
  const program: Command[] = [
    {
      type: 'if',
      condition: 'near_friend',
      thenCommands: [{ type: 'say', text: 'なかま' }],
      elseCommands: [{ type: 'say', text: 'ひとり' }],
    },
  ];
  const sayTextWith = (friendNear: boolean) =>
    toPreviewVisual(
      stepPreviewMotion(createPreviewMotion(), program, FRAME_MS, {
        friendNear,
        friendProgress: friendNear ? 0.5 : null,
        atEdge: false,
      }),
      program,
    ).sayText;

  assert.equal(sayTextWith(true), 'なかま');
  assert.equal(sayTextWith(false), 'ひとり');
});
