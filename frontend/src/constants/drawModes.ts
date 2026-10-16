import type { DrawMode } from 'shared';

type DrawModeCopy = {
  /** 両画面で共通のモード名 */
  label: string;
  /** 画面①のボタンに出す名前（子ども向けにひらがな多め） */
  homeLabel: string;
  /** 画面②のヘッダーに出す説明 */
  drawingDescription: string;
  /** 描画エリア内のヒント */
  drawingHint: string;
};

export const DRAW_MODE_COPY: Record<DrawMode, DrawModeCopy> = {
  free: {
    label: '自由にお絵かき',
    homeLabel: 'じゆうに おえかき',
    drawingDescription: 'まっ白な紙に、好きなものを自由にかこう！',
    drawingHint: 'ここに自由におえかきできます',
  },
  coloring: {
    label: 'イニャーの塗り絵',
    homeLabel: 'イニャーの ぬりえ',
    drawingDescription: 'イニャーを見ながら、好きなように色や絵をかこう！',
    drawingHint: 'イニャーの上にも自由におえかきできます',
  },
};

/** 画面①・画面②で並べる順番 */
export const DRAW_MODES: readonly DrawMode[] = ['free', 'coloring'];
