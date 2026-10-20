import { MAX_SAY_TEXT_LENGTH, type Motion } from 'shared/release';

export const MOVE_BLOCK_TYPE = 'move_command';
export const SAY_BLOCK_TYPE = 'say_command';

export const MOTION_FIELD_NAME = 'MOTION';
export const TEXT_FIELD_NAME = 'TEXT';

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
