import {
  CONDITIONS,
  countCommands,
  MAX_COMMANDS,
  MAX_NESTING_DEPTH,
  MAX_REPEAT_TIMES,
  MAX_SAY_TEXT_LENGTH,
  MIN_REPEAT_TIMES,
  MOTIONS,
  type Command,
  type ReleaseRequest,
} from 'shared/release';

const PNG_DATA_URL_PATTERN =
  /^data:image\/png;base64,(?=[A-Za-z0-9+/])(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type ReleaseRequestValidationResult =
  { success: true; data: ReleaseRequest } | { success: false; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const allowedMotions = MOTIONS.map((motion) => `"${motion}"`).join(' または ');

/** うごき・セリフを確認する。path はエラーメッセージに出す場所（例: commands[0].commands[1]） */
const validateBasicCommand = (command: Record<string, unknown>, path: string): string | null => {
  if (command.type === 'move') {
    return MOTIONS.some((motion) => motion === command.motion)
      ? null
      : `${path}.motion は ${allowedMotions} を指定してください`;
  }

  if (command.type === 'say') {
    if (typeof command.text !== 'string') {
      return `${path}.text は文字列で指定してください`;
    }

    if (Array.from(command.text).length > MAX_SAY_TEXT_LENGTH) {
      return `${path}.text は${MAX_SAY_TEXT_LENGTH}文字以下で指定してください`;
    }

    return null;
  }

  return null;
};

const allowedConditions = CONDITIONS.map((condition) => `"${condition}"`).join('・');

/** 入れ物（くりかえし・「もし」）の中のコマンドの並びを確かめる */
const validateCommandList = (list: unknown, path: string, depth: number): string | null => {
  if (!Array.isArray(list)) {
    return `${path} は配列で指定してください`;
  }

  for (const [index, inner] of list.entries()) {
    const errorMessage = validateCommand(inner, `${path}[${index}]`, depth);

    if (errorMessage !== null) {
      return errorMessage;
    }
  }

  return null;
};

/** depth は、このコマンドを囲んでいるくりかえし・「もし」の数（いちばん外なら 0） */
const validateCommand = (command: unknown, path: string, depth: number): string | null => {
  if (!isRecord(command)) {
    return `${path} はオブジェクトで指定してください`;
  }

  if (command.type === 'move' || command.type === 'say') {
    return validateBasicCommand(command, path);
  }

  if (command.type !== 'repeat' && command.type !== 'if') {
    return `${path}.type は "move"・"say"・"repeat"・"if" のいずれかを指定してください`;
  }

  if (depth >= MAX_NESTING_DEPTH) {
    return `${path} くりかえしや「もし」は${MAX_NESTING_DEPTH}段までしか重ねられません`;
  }

  if (command.type === 'if') {
    if (!CONDITIONS.some((condition) => condition === command.condition)) {
      return `${path}.condition は ${allowedConditions} のいずれかを指定してください`;
    }

    return (
      validateCommandList(command.thenCommands, `${path}.thenCommands`, depth + 1) ??
      validateCommandList(command.elseCommands, `${path}.elseCommands`, depth + 1)
    );
  }

  if (
    typeof command.times !== 'number' ||
    !Number.isInteger(command.times) ||
    command.times < MIN_REPEAT_TIMES ||
    command.times > MAX_REPEAT_TIMES
  ) {
    return `${path}.times は${MIN_REPEAT_TIMES}〜${MAX_REPEAT_TIMES}の整数で指定してください`;
  }

  return validateCommandList(command.commands, `${path}.commands`, depth + 1);
};

export const validateReleaseRequest = (value: unknown): ReleaseRequestValidationResult => {
  if (!isRecord(value)) {
    return { success: false, message: 'リクエストボディはオブジェクトで指定してください' };
  }

  if (typeof value.image_base64 !== 'string' || !PNG_DATA_URL_PATTERN.test(value.image_base64)) {
    return {
      success: false,
      message: 'image_base64 はPNG画像のData URL形式で指定してください',
    };
  }

  if (!Array.isArray(value.commands)) {
    return { success: false, message: 'commands は配列で指定してください' };
  }

  // 中身を確認する前に、上の段の数だけで明らかに多すぎるものは弾く
  if (value.commands.length > MAX_COMMANDS) {
    return {
      success: false,
      message: `commands は${MAX_COMMANDS}個以下で指定してください`,
    };
  }

  for (const [index, command] of value.commands.entries()) {
    const errorMessage = validateCommand(command, `commands[${index}]`, 0);

    if (errorMessage !== null) {
      return { success: false, message: errorMessage };
    }
  }

  // くりかえしの中のブロックも合わせて数える（画面の「つかった ブロック」と同じ数え方）
  if (countCommands(value.commands as Command[]) > MAX_COMMANDS) {
    return {
      success: false,
      message: `commands は、くりかえしの中も合わせて${MAX_COMMANDS}個以下で指定してください`,
    };
  }

  return {
    success: true,
    data: {
      image_base64: value.image_base64,
      commands: value.commands as ReleaseRequest['commands'],
    },
  };
};
