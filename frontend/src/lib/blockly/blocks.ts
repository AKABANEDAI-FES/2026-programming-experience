import * as Blockly from 'blockly';
import { MAX_SAY_TEXT_LENGTH } from 'shared/release';
import {
  DEFAULT_SAY_TEXT,
  MOTION_FIELD_NAME,
  MOTION_OPTIONS,
  MOVE_BLOCK_TYPE,
  SAY_BLOCK_TYPE,
  TEXT_FIELD_NAME,
  limitSayText,
} from './commandSchema.ts';

const SAY_TEXT_LIMIT_EXTENSION = 'say_text_limit';

export const defineCommandBlocks = () => {
  if (!Blockly.Extensions.isRegistered(SAY_TEXT_LIMIT_EXTENSION)) {
    Blockly.Extensions.register(SAY_TEXT_LIMIT_EXTENSION, function (this: Blockly.Block) {
      this.getField(TEXT_FIELD_NAME)?.setValidator((text: string) => limitSayText(text));
    });
  }

  Blockly.common.defineBlocksWithJsonArray([
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
