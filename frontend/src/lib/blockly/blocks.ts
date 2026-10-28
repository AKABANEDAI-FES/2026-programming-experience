import * as Blockly from 'blockly';
import { MAX_NESTING_DEPTH, MAX_SAY_TEXT_LENGTH } from 'shared/release';
import {
  DEFAULT_SAY_TEXT,
  DO_INPUT_NAME,
  ELSE_INPUT_NAME,
  IF_BLOCK_TYPE,
  MOTION_FIELD_NAME,
  MOTION_OPTIONS,
  MOVE_BLOCK_TYPE,
  REPEAT_BLOCK_TYPE,
  CONDITION_FIELD_NAME,
  CONDITION_OPTIONS,
  CONTAINER_BLOCK_TYPES,
  CUSTOM_SAY_PRESET,
  REPEAT_TIMES_OPTIONS,
  SAY_BLOCK_TYPE,
  SAY_PRESET_FIELD_NAME,
  SAY_PRESET_OPTIONS,
  TEXT_FIELD_NAME,
  THEN_INPUT_NAME,
  TIMES_FIELD_NAME,
  limitSayText,
} from './commandSchema.ts';

const SAY_TEXT_LIMIT_EXTENSION = 'say_text_limit';
const SAY_PRESET_SWITCH_EXTENSION = 'say_preset_switch';
const LIMIT_NESTING_EXTENSION = 'limit_nesting';

export const defineCommandBlocks = () => {
  if (!Blockly.Extensions.isRegistered(SAY_TEXT_LIMIT_EXTENSION)) {
    Blockly.Extensions.register(SAY_TEXT_LIMIT_EXTENSION, function (this: Blockly.Block) {
      this.getField(TEXT_FIELD_NAME)?.setValidator((text: string) => limitSayText(text));
    });
  }

  // セリフは用意したものから選ぶ。「じぶんで かく…」を選んだときだけ、文字を打つところを出す
  if (!Blockly.Extensions.isRegistered(SAY_PRESET_SWITCH_EXTENSION)) {
    Blockly.Extensions.register(SAY_PRESET_SWITCH_EXTENSION, function (this: Blockly.Block) {
      const presetField = this.getField(SAY_PRESET_FIELD_NAME);
      const textField = this.getField(TEXT_FIELD_NAME);

      if (presetField === null || textField === null) {
        return;
      }

      const showTextField = (preset: unknown) => {
        textField.setVisible(preset === CUSTOM_SAY_PRESET);

        // 出し入れしたら、ブロックの幅を描き直す
        if (this instanceof Blockly.BlockSvg && this.rendered) {
          void this.queueRender();
        }
      };

      presetField.setValidator((preset: string) => {
        showTextField(preset);
        return preset;
      });
      showTextField(presetField.getValue());
    });
  }

  // くりかえしや「もし」は、合わせて MAX_NESTING_DEPTH 段まで重ねられる。
  // それより深く入れたら外に出す（子どもが迷子にならないように）
  if (!Blockly.Extensions.isRegistered(LIMIT_NESTING_EXTENSION)) {
    Blockly.Extensions.register(LIMIT_NESTING_EXTENSION, function (this: Blockly.Block) {
      this.setOnChange(() => {
        // ドラッグしている途中は、落とすまで待つ
        const isDragging =
          this.workspace instanceof Blockly.WorkspaceSvg && this.workspace.isDragging();

        if (this.isInFlyout || isDragging) {
          return;
        }

        // このブロックが何段目か（外側のくりかえし・「もし」の数 + 1）
        let depth = 1;

        for (let parent = this.getSurroundParent(); parent; parent = parent.getSurroundParent()) {
          if (CONTAINER_BLOCK_TYPES.includes(parent.type)) {
            depth += 1;
          }
        }

        if (depth > MAX_NESTING_DEPTH) {
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
      extensions: [LIMIT_NESTING_EXTENSION],
    },
    {
      type: IF_BLOCK_TYPE,
      message0: 'もし %1 なら',
      args0: [
        {
          type: 'field_dropdown',
          name: CONDITION_FIELD_NAME,
          options: CONDITION_OPTIONS,
        },
      ],
      message1: '%1',
      args1: [{ type: 'input_statement', name: THEN_INPUT_NAME }],
      message2: 'そうでなければ',
      message3: '%1',
      args3: [{ type: 'input_statement', name: ELSE_INPUT_NAME }],
      previousStatement: null,
      nextStatement: null,
      colour: '#2E9E6B',
      tooltip: 'じょうけんに あうときと あわないときで、うごきを かえます',
      extensions: [LIMIT_NESTING_EXTENSION],
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
      message0: '%1 %2 と いう',
      args0: [
        {
          type: 'field_dropdown',
          name: SAY_PRESET_FIELD_NAME,
          options: SAY_PRESET_OPTIONS,
        },
        {
          type: 'field_input',
          name: TEXT_FIELD_NAME,
          text: DEFAULT_SAY_TEXT,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: '#D9536F',
      tooltip: `キャラクターに しゃべらせる ことばを えらびます（じぶんで かくときは ${MAX_SAY_TEXT_LENGTH}もじまで）`,
      extensions: [SAY_TEXT_LIMIT_EXTENSION, SAY_PRESET_SWITCH_EXTENSION],
    },
  ]);
};
