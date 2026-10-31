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
  /** 中のコマンド。くりかえしや「もし」も入れられる（MAX_NESTING_DEPTH 段まで） */
  commands: Command[];
}

/**
 * 「もし〜なら」の条件。再生がその「もし」に来たときに調べる
 * - near_friend: ほかの作品が近くにいる
 * - at_edge: 画面の端にいる
 * - chance_25 / chance_50 / chance_75: その確率で当たる（4かいに1かい・2かいに1かい・4かいに3かい）
 */
export const CONDITIONS = [
  'near_friend',
  'at_edge',
  'chance_25',
  'chance_50',
  'chance_75',
] as const;

export type Condition = (typeof CONDITIONS)[number];

export interface IfCommand {
  type: 'if';
  condition: Condition;
  /** 条件に合ったときに再生するコマンド */
  thenCommands: Command[];
  /** 条件に合わなかったときに再生するコマンド（空でもよい） */
  elseCommands: Command[];
}

/** くりかえしや「もし」のように、中にコマンドを入れられるもの */
export type ContainerCommand = RepeatCommand | IfCommand;

export type Command = BasicCommand | ContainerCommand;

/** 画面③で追加できるコマンドの上限（くりかえし・「もし」自体と、その中のコマンドも数える） */
export const MAX_COMMANDS = 10;

/** くりかえしや「もし」を重ねられる段の数（2 なら、くりかえしの中の「もし」まで） */
export const MAX_NESTING_DEPTH = 2;

export const isContainer = (command: Command): command is ContainerCommand =>
  command.type === 'repeat' || command.type === 'if';

/** 中に入っているコマンドをすべて（「もし」はどちらの分かれ道も） */
export const childCommands = (command: ContainerCommand): Command[] =>
  command.type === 'repeat' ? command.commands : [...command.thenCommands, ...command.elseCommands];

/** ブロックの数を数える。くりかえしや「もし」は、それ自体と中のコマンドを合わせて数える */
export const countCommands = (commands: readonly Command[]): number =>
  commands.reduce(
    (count, command) =>
      count + 1 + (isContainer(command) ? countCommands(childCommands(command)) : 0),
    0,
  );

/** くりかえしや「もし」が何段重なっているか（なければ 0） */
export const nestingDepth = (commands: readonly Command[]): number =>
  commands.reduce(
    (depth, command) =>
      isContainer(command) ? Math.max(depth, 1 + nestingDepth(childCommands(command))) : depth,
    0,
  );

/**
 * 再生される順に並べる。くりかえしは中身を回数分だけ並べる（テストや確認用）。
 * 「もし」は decide で、どちらへ進むかを決める（決めなければ「そうでなければ」へ進む）
 */
export const expandCommands = (
  commands: readonly Command[],
  decide: (condition: Condition) => boolean = () => false,
): BasicCommand[] =>
  commands.flatMap((command) => {
    if (command.type === 'repeat') {
      return Array.from({ length: command.times }, () =>
        expandCommands(command.commands, decide),
      ).flat();
    }

    if (command.type === 'if') {
      return expandCommands(
        decide(command.condition) ? command.thenCommands : command.elseCommands,
        decide,
      );
    }

    return [command];
  });

// 【設定】セリフ1件の最大文字数。調整するときはこの数値を変更する。
export const MAX_SAY_TEXT_LENGTH = 25;

/** 大画面に同時表示する生き物の上限。超えたら古い順に削除（FIFO） */
export const MAX_CREATURES = 15;

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
