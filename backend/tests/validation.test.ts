import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SAY_TEXT_LENGTH, MOTIONS } from 'shared/release';
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
