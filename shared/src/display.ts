import type { Command } from './release';

/** R2に保存された作品1件 */
export interface Creature {
  id: string;
  imageUrl: string; // 画像の取得URL、またはR2のオブジェクトキー
  commands: Command[];
  createdAt: number; // UNIXミリ秒。FIFO削除の判定に使う
}

/** 保存完了時にバックエンドが大画面へプッシュする通知 */
export interface CreatureAddedMessage {
  type: 'creature_added';
  creature: Creature;
}

export type DisplayMessage = CreatureAddedMessage;
