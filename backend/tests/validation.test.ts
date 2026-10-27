import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_COMMANDS, MAX_SAY_TEXT_LENGTH, MOTIONS } from 'shared/release';
import { validateReleaseRequest } from '../src/validation.ts';

const createRequestWithSayText = (text: string) => ({
  image_base64: 'data:image/png;base64,AAAA',
  commands: [{ type: 'say', text }],
});

const createRequestWithMotion = (motion: string) => ({
  image_base64: 'data:image/png;base64,AAAA',
  commands: [{ type: 'move', motion }],
});

test('すべての動き（はやく およぐ・ふくらむ・ぶるぶる ふるえる を含む）を受け付ける', () => {
  for (const motion of MOTIONS) {
    assert.equal(validateReleaseRequest(createRequestWithMotion(motion)).success, true, motion);
  }

  for (const motion of ['dash', 'grow', 'shake']) {
    assert.ok((MOTIONS as readonly string[]).includes(motion));
  }
});

test('知らない動きはエラーにする', () => {
  assert.equal(validateReleaseRequest(createRequestWithMotion('swim')).success, false);
});

test('セリフは最大文字数ちょうどまで受け付ける', () => {
  const result = validateReleaseRequest(createRequestWithSayText('あ'.repeat(MAX_SAY_TEXT_LENGTH)));

  assert.equal(result.success, true);
});

test('セリフが最大文字数を超える場合はエラーにする', () => {
  const result = validateReleaseRequest(
    createRequestWithSayText('あ'.repeat(MAX_SAY_TEXT_LENGTH + 1)),
  );

  assert.deepEqual(result, {
    success: false,
    message: `commands[0].text は${MAX_SAY_TEXT_LENGTH}文字以下で指定してください`,
  });
});

const requestWith = (commands: unknown[]) => ({
  image_base64: 'data:image/png;base64,AAAA',
  commands,
});

const jump = { type: 'move', motion: 'jump' };

test('くりかえしを受け付ける', () => {
  const result = validateReleaseRequest(
    requestWith([{ type: 'repeat', times: 3, commands: [jump, { type: 'say', text: 'やあ' }] }]),
  );

  assert.equal(result.success, true);
});

test('くりかえしの回数は 2〜5 の整数だけ受け付ける', () => {
  for (const times of [1, 6, 2.5, '3']) {
    const result = validateReleaseRequest(
      requestWith([{ type: 'repeat', times, commands: [jump] }]),
    );

    assert.equal(result.success, false, String(times));
  }
});

test('くりかえしの中のくりかえし（2 段）は受け付ける', () => {
  const result = validateReleaseRequest(
    requestWith([
      { type: 'repeat', times: 2, commands: [{ type: 'repeat', times: 2, commands: [jump] }] },
    ]),
  );

  assert.equal(result.success, true);
});

test('くりかえしを 3 段重ねるとエラーにする', () => {
  const result = validateReleaseRequest(
    requestWith([
      {
        type: 'repeat',
        times: 2,
        commands: [
          { type: 'repeat', times: 2, commands: [{ type: 'repeat', times: 2, commands: [jump] }] },
        ],
      },
    ]),
  );

  assert.deepEqual(result, {
    success: false,
    message: 'commands[0].commands[0].commands[0] くりかえしは2段までしか重ねられません',
  });
});

test('くりかえしの中のコマンドも確認する', () => {
  const result = validateReleaseRequest(
    requestWith([{ type: 'repeat', times: 2, commands: [{ type: 'move', motion: 'fly' }] }]),
  );

  assert.equal(result.success, false);
  assert.match(result.success ? '' : result.message, /^commands\[0\]\.commands\[0\]\.motion/);
});

test('くりかえしの中も合わせて上限の数を超えるとエラーにする', () => {
  // くりかえし（1 個）＋ 中のくりかえし（1 個）＋ 中の中の動き 3 個 ＝ 5 個
  const five = {
    type: 'repeat',
    times: 2,
    commands: [{ type: 'repeat', times: 2, commands: [jump, jump, jump] }],
  };
  const rest = Array.from({ length: MAX_COMMANDS - 5 }, () => jump);

  assert.equal(validateReleaseRequest(requestWith([five, ...rest])).success, true);
  assert.deepEqual(validateReleaseRequest(requestWith([five, ...rest, jump])), {
    success: false,
    message: `commands は、くりかえしの中も合わせて${MAX_COMMANDS}個以下で指定してください`,
  });
});
