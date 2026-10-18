import * as Blockly from 'blockly';
import {
  DEFAULT_SAY_TEXT,
  MOTION_FIELD_NAME,
  MOTION_OPTIONS,
  MOVE_BLOCK_TYPE,
  SAY_BLOCK_TYPE,
  TEXT_FIELD_NAME,
} from './commandSchema.ts';

/**
 * ブロックの一覧を最初から左に並べておく（カテゴリーを押して開く形より、子どもが迷わない）。
 * うごきは種類ごとに分けて並べ、置いたあとでも切り替えられる。
 */
/** ブロックの下の間隔。全部のブロックがスクロールせずに一覧に収まるよう、標準より詰める */
const BLOCK_GAP = 8;

export const TOOLBOX = {
  kind: 'flyoutToolbox',
  contents: [
    { kind: 'label', text: 'うごき', 'web-class': 'toolboxLabel' },
    ...MOTION_OPTIONS.map(([, motion]) => ({
      kind: 'block',
      type: MOVE_BLOCK_TYPE,
      fields: { [MOTION_FIELD_NAME]: motion },
      gap: BLOCK_GAP,
    })),
    { kind: 'label', text: 'セリフ', 'web-class': 'toolboxLabel' },
    {
      kind: 'block',
      type: SAY_BLOCK_TYPE,
      fields: { [TEXT_FIELD_NAME]: DEFAULT_SAY_TEXT },
      gap: BLOCK_GAP,
    },
  ],
} as Blockly.utils.toolbox.ToolboxDefinition;
