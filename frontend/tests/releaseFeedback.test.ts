import assert from 'node:assert/strict';
import test from 'node:test';
import { getReleaseFeedback, type ReleaseState } from '../src/lib/release-feedback.ts';

test('ふだんはメッセージを出さず、「うみに はなす」を押せる', () => {
  const feedback = getReleaseFeedback('idle');

  assert.equal(feedback.tone, 'idle');
  assert.equal(feedback.message, null);
  assert.equal(feedback.buttonLabel, 'うみに はなす');
  assert.equal(feedback.buttonDisabled, false);
});

test('送っている間はボタンを押せない', () => {
  const feedback = getReleaseFeedback('sending');

  assert.equal(feedback.tone, 'sending');
  assert.equal(feedback.buttonDisabled, true);
});

test('失敗や保存状況がわからないときは、もういちど押すかスタッフを呼ぶよう案内する', () => {
  for (const state of ['error', 'unknown'] as const) {
    const feedback = getReleaseFeedback(state);

    assert.equal(feedback.tone, 'error');
    assert.match(feedback.detail ?? '', /スタッフを よんでね/);
    assert.equal(feedback.buttonLabel, 'もういちど はなす');
    assert.equal(feedback.buttonDisabled, false);
  }
});

test('この PC の準備ができていないときはスタッフを呼ぶよう案内する', () => {
  assert.match(getReleaseFeedback('notReady').detail ?? '', /スタッフを よんでね/);
});

test('ふだん以外の状態ではメッセージを出す', () => {
  const states: ReleaseState[] = ['sending', 'processing', 'unknown', 'error', 'notReady'];

  for (const state of states) {
    const feedback = getReleaseFeedback(state);

    assert.ok((feedback.message ?? '').length > 0);
    assert.ok(feedback.buttonLabel.length > 0);
  }
});
