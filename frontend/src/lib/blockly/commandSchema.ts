import {
  MAX_REPEAT_TIMES,
  MAX_SAY_TEXT_LENGTH,
  MIN_REPEAT_TIMES,
  type Motion,
} from 'shared/release';

export const MOVE_BLOCK_TYPE = 'move_command';
export const SAY_BLOCK_TYPE = 'say_command';
export const REPEAT_BLOCK_TYPE = 'repeat_command';

export const MOTION_FIELD_NAME = 'MOTION';
export const TEXT_FIELD_NAME = 'TEXT';
export const TIMES_FIELD_NAME = 'TIMES';
/** くりかえしの中にブロックを入れる場所 */
export const DO_INPUT_NAME = 'DO';

export const DEFAULT_REPEAT_TIMES = 3;

/** くりかえす回数の選択肢（2〜5） */
export const REPEAT_TIMES_OPTIONS: [label: string, value: string][] = Array.from(
  { length: MAX_REPEAT_TIMES - MIN_REPEAT_TIMES + 1 },
  (_, index) => {
    const times = String(MIN_REPEAT_TIMES + index);

    return [times, times];
  },
);

export const DEFAULT_SAY_TEXT = 'こんにちは';

/** セリフを上限の文字数で切る。絵文字も1文字として数え、バックエンドと数え方を合わせる */
export const limitSayText = (text: string): string =>
  Array.from(text).slice(0, MAX_SAY_TEXT_LENGTH).join('');

export const MOTION_OPTIONS: [label: string, motion: Motion][] = [
  ['ジャンプする', 'jump'],
  ['くるっとまわる', 'spin'],
  ['はやく およぐ', 'dash'],
  ['ふくらむ', 'grow'],
  ['ぶるぶる ふるえる', 'shake'],
];
