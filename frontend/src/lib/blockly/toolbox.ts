import * as Blockly from 'blockly';
import {
  DEFAULT_SAY_TEXT,
  MOTION_FIELD_NAME,
  MOVE_BLOCK_TYPE,
  SAY_BLOCK_TYPE,
  TEXT_FIELD_NAME,
} from './commandSchema.ts';

/**
 * ブロックの一覧を最初から左に並べておく（カテゴリーを押して開く形より、子どもが迷わない）。
 * うごきは種類ごとに分けて並べ、置いたあとでも切り替えられる。
 */
export const TOOLBOX = {
  kind: 'flyoutToolbox',
  contents: [
    { kind: 'label', text: 'うごき', 'web-class': 'toolboxLabel' },
    { kind: 'block', type: MOVE_BLOCK_TYPE, fields: { [MOTION_FIELD_NAME]: 'jump' } },
    { kind: 'block', type: MOVE_BLOCK_TYPE, fields: { [MOTION_FIELD_NAME]: 'spin' } },
    { kind: 'label', text: 'セリフ', 'web-class': 'toolboxLabel' },
    { kind: 'block', type: SAY_BLOCK_TYPE, fields: { [TEXT_FIELD_NAME]: DEFAULT_SAY_TEXT } },
  ],
} as Blockly.utils.toolbox.ToolboxDefinition;
