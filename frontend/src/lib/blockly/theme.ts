import * as Blockly from 'blockly';

const FONT_FAMILY = "'M PLUS Rounded 1c', system-ui, sans-serif";
const FONT_WEIGHT = 'bold';
const FONT_SIZE = 14;

/** ブロックの文字のフォント（読み込みを待つときに使う CSS の font の書き方） */
export const KIDS_FONT = `${FONT_WEIGHT} ${FONT_SIZE}pt ${FONT_FAMILY}`;

/** 画面のデザイン（海のテーマ）に合わせた Blockly の見た目 */
export const KIDS_THEME = Blockly.Theme.defineTheme('kids', {
  name: 'kids',
  base: Blockly.Themes.Classic,
  fontStyle: {
    family: FONT_FAMILY,
    weight: FONT_WEIGHT,
    size: FONT_SIZE,
  },
  componentStyles: {
    workspaceBackgroundColour: '#ffffff',
    flyoutBackgroundColour: '#f2f6f9',
    flyoutForegroundColour: '#17305a',
    flyoutOpacity: 1,
    scrollbarColour: '#c9d9e6',
  },
});
