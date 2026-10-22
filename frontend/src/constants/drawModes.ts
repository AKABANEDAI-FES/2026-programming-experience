import type { DrawMode } from 'shared';

type DrawModeCopy = {
  /** 両画面で共通のモード名（読み上げや描画エリアの名前に使う） */
  label: string;
  /** ボタンに出す名前（子ども向けにひらがな多め） */
  homeLabel: string;
};

export const DRAW_MODE_COPY: Record<DrawMode, DrawModeCopy> = {
  free: {
    label: '自由にお絵かき',
    homeLabel: 'じゆうに おえかき',
  },
  coloring: {
    label: 'イニャーの塗り絵',
    homeLabel: 'イニャーの ぬりえ',
  },
};

/** 画面①・画面②で並べる順番 */
export const DRAW_MODES: readonly DrawMode[] = ['free', 'coloring'];
