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

/** 実際に動いたり話したりするコマンド（くりかえしなどの入れ物ではないもの） */
export type BasicCommand = MoveCommand | SayCommand;

/** くりかえす回数の範囲 */
export const MIN_REPEAT_TIMES = 2;
export const MAX_REPEAT_TIMES = 5;

export interface RepeatCommand {
  type: 'repeat';
  /** MIN_REPEAT_TIMES 〜 MAX_REPEAT_TIMES の整数 */
  times: number;
  /** 中のコマンド。くりかえしも入れられる（MAX_NESTING_DEPTH 段まで） */
  commands: Command[];
}

export type Command = BasicCommand | RepeatCommand;

/** 画面③で追加できるコマンドの上限（くりかえし自体と、その中のコマンドも数える） */
export const MAX_COMMANDS = 10;

/** くりかえしを重ねられる段の数（くりかえしの中のくりかえしまで） */
export const MAX_NESTING_DEPTH = 2;

/** ブロックの数を数える。くりかえしは、くりかえし自体と中のコマンドを合わせて数える */
export const countCommands = (commands: readonly Command[]): number =>
  commands.reduce(
    (count, command) =>
      count + 1 + (command.type === 'repeat' ? countCommands(command.commands) : 0),
    0,
  );

/** くりかえしが何段重なっているか（くりかえしがなければ 0） */
export const nestingDepth = (commands: readonly Command[]): number =>
  commands.reduce(
    (depth, command) =>
      command.type === 'repeat' ? Math.max(depth, 1 + nestingDepth(command.commands)) : depth,
    0,
  );

/** 再生される順に並べる。くりかえしは中身を回数分だけ並べる（テストや確認用） */
export const expandCommands = (commands: readonly Command[]): BasicCommand[] =>
  commands.flatMap((command) =>
    command.type === 'repeat'
      ? Array.from({ length: command.times }, () => expandCommands(command.commands)).flat()
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
