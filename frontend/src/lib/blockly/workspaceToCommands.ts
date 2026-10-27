import {
  MAX_NESTING_DEPTH,
  MAX_REPEAT_TIMES,
  MIN_REPEAT_TIMES,
  type BasicCommand,
  type Command,
  type Motion,
} from 'shared/release';
import {
  CUSTOM_SAY_PRESET,
  DEFAULT_REPEAT_TIMES,
  DO_INPUT_NAME,
  MOTION_FIELD_NAME,
  MOVE_BLOCK_TYPE,
  REPEAT_BLOCK_TYPE,
  SAY_BLOCK_TYPE,
  SAY_PRESET_FIELD_NAME,
  TEXT_FIELD_NAME,
  TIMES_FIELD_NAME,
  limitSayText,
} from './commandSchema.ts';

type BlockState = {
  type?: string;
  x?: number;
  y?: number;
  enabled?: boolean;
  disabledReasons?: string[];
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockState }>;
  next?: { block?: BlockState };
};

type WorkspaceState = {
  blocks?: { blocks?: BlockState[] };
};

const isDisabled = (block: BlockState) =>
  block.enabled === false || (block.disabledReasons?.length ?? 0) > 0;

/** つながっているブロックを上から順にたどる */
const chainOf = (first: BlockState | undefined): BlockState[] => {
  const blocks: BlockState[] = [];

  for (let block = first; block !== undefined; block = block.next?.block) {
    blocks.push(block);
  }

  return blocks;
};

const toBasicCommand = (block: BlockState): BasicCommand | null => {
  const fields = block.fields ?? {};

  if (block.type === MOVE_BLOCK_TYPE) {
    return { type: 'move', motion: fields[MOTION_FIELD_NAME] as Motion };
  }

  if (block.type === SAY_BLOCK_TYPE) {
    // 用意したセリフを選んでいればそれを、「じぶんで かく…」なら打った文字を使う
    const preset = fields[SAY_PRESET_FIELD_NAME];
    const text =
      typeof preset === 'string' && preset !== CUSTOM_SAY_PRESET
        ? preset
        : String(fields[TEXT_FIELD_NAME] ?? '');

    return { type: 'say', text: limitSayText(text) };
  }

  return null;
};

const toRepeatTimes = (value: unknown): number => {
  const times = Number(value);

  return Number.isInteger(times) && times >= MIN_REPEAT_TIMES && times <= MAX_REPEAT_TIMES
    ? times
    : DEFAULT_REPEAT_TIMES;
};

/** depth は、このブロックを囲んでいるくりかえしの数（いちばん外なら 0） */
const toCommand = (block: BlockState, depth = 0): Command | null => {
  if (isDisabled(block)) {
    return null;
  }

  if (block.type === REPEAT_BLOCK_TYPE) {
    // くりかえしは MAX_NESTING_DEPTH 段まで（画面でも外に出すが、念のため中身からも外す）
    if (depth >= MAX_NESTING_DEPTH) {
      return null;
    }

    const inner = chainOf(block.inputs?.[DO_INPUT_NAME]?.block)
      .map((child) => toCommand(child, depth + 1))
      .filter((command): command is Command => command !== null);

    return {
      type: 'repeat',
      times: toRepeatTimes(block.fields?.[TIMES_FIELD_NAME]),
      commands: inner,
    };
  }

  return toBasicCommand(block);
};

/** Blockly.serialization.workspaces.save() の出力を、上に置かれたブロックから順に変換する */
export const workspaceToCommands = (workspaceJson: unknown): Command[] => {
  const topBlocks = [...((workspaceJson as WorkspaceState)?.blocks?.blocks ?? [])];
  topBlocks.sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));

  return topBlocks
    .flatMap((topBlock) => chainOf(topBlock))
    .map((block) => toCommand(block))
    .filter((command): command is Command => command !== null);
};
