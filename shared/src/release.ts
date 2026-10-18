export type DrawMode = 'free' | 'coloring';

/** 大画面で再生できる動きの種類 */
export const MOTIONS = ['jump', 'spin', 'dash', 'grow', 'shake'] as const;

export type Motion = (typeof MOTIONS)[number];

export interface MoveCommand {
  type: 'move';
  motion: Motion;
}

export interface SayCommand {
  type: 'say';
  text: string;
}

/** くりかえしの中に入れられるコマンド（くりかえしの中にくりかえしは入れない） */
export type BasicCommand = MoveCommand | SayCommand;

/** くりかえす回数の範囲 */
export const MIN_REPEAT_TIMES = 2;
export const MAX_REPEAT_TIMES = 5;

export interface RepeatCommand {
  type: 'repeat';
  /** MIN_REPEAT_TIMES 〜 MAX_REPEAT_TIMES の整数 */
  times: number;
  commands: BasicCommand[];
}

export type Command = BasicCommand | RepeatCommand;

/** 画面③で追加できるコマンドの上限（くりかえし自体と、その中のコマンドも数える） */
export const MAX_COMMANDS = 5;

/** ブロックの数を数える。くりかえしは、くりかえし自体と中のコマンドを合わせて数える */
export const countCommands = (commands: readonly Command[]): number =>
  commands.reduce(
    (count, command) => count + 1 + (command.type === 'repeat' ? command.commands.length : 0),
    0,
  );

/** 再生するときの並びにする。くりかえしは中身を回数分だけ並べる */
export const expandCommands = (commands: readonly Command[]): BasicCommand[] =>
  commands.flatMap((command) =>
    command.type === 'repeat'
      ? Array.from({ length: command.times }, () => command.commands).flat()
      : [command],
  );

// 【設定】セリフ1件の最大文字数。調整するときはこの数値を変更する。
export const MAX_SAY_TEXT_LENGTH = 25;

/** 大画面に同時表示する生き物の上限。超えたら古い順に削除（FIFO） */
export const MAX_CREATURES = 30;

/** POST /api/release のリクエストボディ */
export interface ReleaseRequest {
  image_base64: string; // Data URL 形式: "data:image/png;base64,..."
  commands: Command[];
}

export interface ReleaseSuccessResponse {
  success: true;
  message: string;
}

export interface ReleaseErrorResponse {
  success: false;
  message: string;
  code?:
    | 'UNAUTHORIZED'
    | 'RELEASE_AUTH_UNAVAILABLE'
    | 'REQUEST_IN_PROGRESS'
    | 'IDEMPOTENCY_KEY_REUSED'
    | 'IMAGE_SAVE_FAILED'
    | 'RELEASE_STATUS_UNKNOWN';
}

export type ReleaseResponse = ReleaseSuccessResponse | ReleaseErrorResponse;
