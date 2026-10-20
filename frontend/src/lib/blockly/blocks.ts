import * as Blockly from 'blockly';
import { MAX_SAY_TEXT_LENGTH } from 'shared/release';
import {
  DEFAULT_SAY_TEXT,
  DO_INPUT_NAME,
  MOTION_FIELD_NAME,
  MOTION_OPTIONS,
  MOVE_BLOCK_TYPE,
  REPEAT_BLOCK_TYPE,
  REPEAT_TIMES_OPTIONS,
  SAY_BLOCK_TYPE,
  TEXT_FIELD_NAME,
  TIMES_FIELD_NAME,
  limitSayText,
} from './commandSchema.ts';

const SAY_TEXT_LIMIT_EXTENSION = 'say_text_limit';
const NO_NESTED_REPEAT_EXTENSION = 'no_nested_repeat';

export const defineCommandBlocks = () => {
  if (!Blockly.Extensions.isRegistered(SAY_TEXT_LIMIT_EXTENSION)) {
    Blockly.Extensions.register(SAY_TEXT_LIMIT_EXTENSION, function (this: Blockly.Block) {
      this.getField(TEXT_FIELD_NAME)?.setValidator((text: string) => limitSayText(text));
    });
  }

  // くりかえしの中にくりかえしを入れたら、外に出す（子どもにわかりやすく、送るデータも単純にするため）
  if (!Blockly.Extensions.isRegistered(NO_NESTED_REPEAT_EXTENSION)) {
    Blockly.Extensions.register(NO_NESTED_REPEAT_EXTENSION, function (this: Blockly.Block) {
      this.setOnChange(() => {
        // ドラッグしている途中は、落とすまで待つ
        const isDragging =
          this.workspace instanceof Blockly.WorkspaceSvg && this.workspace.isDragging();

        if (this.isInFlyout || isDragging) {
          return;
        }

        if (this.getSurroundParent()?.type === REPEAT_BLOCK_TYPE) {
          this.unplug(true);
          this.bumpNeighbours();
        }
      });
    });
  }

  Blockly.common.defineBlocksWithJsonArray([
    {
      type: REPEAT_BLOCK_TYPE,
      message0: '%1 かい くりかえす',
      args0: [
        {
          type: 'field_dropdown',
          name: TIMES_FIELD_NAME,
          options: REPEAT_TIMES_OPTIONS,
        },
      ],
      message1: '%1',
      args1: [{ type: 'input_statement', name: DO_INPUT_NAME }],
      previousStatement: null,
      nextStatement: null,
      colour: '#E8963C',
      tooltip: 'なかに いれた ブロックを くりかえします',
      extensions: [NO_NESTED_REPEAT_EXTENSION],
    },
    {
      type: MOVE_BLOCK_TYPE,
      message0: '%1',
      args0: [
        {
          type: 'field_dropdown',
          name: MOTION_FIELD_NAME,
          options: MOTION_OPTIONS,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#1F6FB8',
      tooltip: 'キャラクターの うごきを えらびます',
    },
    {
      type: SAY_BLOCK_TYPE,
      message0: '%1 と いう',
      args0: [
        {
          type: 'field_input',
          name: TEXT_FIELD_NAME,
          text: DEFAULT_SAY_TEXT,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#D9536F',
      tooltip: `キャラクターに しゃべらせる ことばを きめます（${MAX_SAY_TEXT_LENGTH}もじまで）`,
      extensions: [SAY_TEXT_LIMIT_EXTENSION],
    },
  ]);
};
