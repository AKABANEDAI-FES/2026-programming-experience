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

export type Command = MoveCommand | SayCommand;

/** 画面③で追加できるコマンドの上限 */
export const MAX_COMMANDS = 5;

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
