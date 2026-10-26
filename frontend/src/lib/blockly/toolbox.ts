import * as Blockly from 'blockly';
import {
  CONDITION_FIELD_NAME,
  DEFAULT_CONDITION,
  DEFAULT_REPEAT_TIMES,
  DEFAULT_SAY_TEXT,
  IF_BLOCK_TYPE,
  MOTION_FIELD_NAME,
  MOTION_OPTIONS,
  MOVE_BLOCK_TYPE,
  REPEAT_BLOCK_TYPE,
  SAY_BLOCK_TYPE,
  SAY_PRESET_FIELD_NAME,
  TEXT_FIELD_NAME,
  TIMES_FIELD_NAME,
} from './commandSchema.ts';

/** ブロックの下の間隔。全部のブロックがスクロールせずに一覧に収まるよう、標準より詰める */
const BLOCK_GAP = 8;
/** うごき・セリフ・くりかえしの間だけ少し空けて、種類の切れ目をわかるようにする */
const GROUP_GAP = 20;

/**
 * ブロックの一覧を最初から左に並べておく（カテゴリーを押して開く形より、子どもが迷わない）。
 * 見出しは置かず、種類は色と間隔で分ける（見出しがあると一覧に収まらない）。
 * うごきは種類ごとに分けて並べ、置いたあとでも切り替えられる。
 */
export const TOOLBOX = {
  kind: 'flyoutToolbox',
  contents: [
    ...MOTION_OPTIONS.map(([, motion], index) => ({
      kind: 'block',
      type: MOVE_BLOCK_TYPE,
      fields: { [MOTION_FIELD_NAME]: motion },
      gap: index === MOTION_OPTIONS.length - 1 ? GROUP_GAP : BLOCK_GAP,
    })),
    {
      kind: 'block',
      type: SAY_BLOCK_TYPE,
      fields: { [SAY_PRESET_FIELD_NAME]: DEFAULT_SAY_TEXT, [TEXT_FIELD_NAME]: DEFAULT_SAY_TEXT },
      gap: GROUP_GAP,
    },
    {
      kind: 'block',
      type: REPEAT_BLOCK_TYPE,
      fields: { [TIMES_FIELD_NAME]: String(DEFAULT_REPEAT_TIMES) },
      gap: GROUP_GAP,
    },
    // 「もし」はいちばん下に置く（使いたい人だけが使えばよい、少しむずかしいブロック）
    {
      kind: 'block',
      type: IF_BLOCK_TYPE,
      fields: { [CONDITION_FIELD_NAME]: DEFAULT_CONDITION },
    },
  ],
} as Blockly.utils.toolbox.ToolboxDefinition;
