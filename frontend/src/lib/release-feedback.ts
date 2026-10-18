/** 放流（うみに はなす）の状態 */
export type ReleaseState =
  | 'idle'
  /** 送っている途中 */
  | 'sending'
  /** 同じ作品の処理がまだ終わっていない（少し待ってから送り直す） */
  | 'processing'
  /** 保存できたかわからない（同じ内容で送り直す） */
  | 'unknown'
  /** 送れなかった */
  | 'error'
  /** この PC に放流用のトークンが設定されていない */
  | 'notReady';

export type ReleaseFeedback = {
  /** 見た目（ふだん・送信中・失敗） */
  tone: 'idle' | 'sending' | 'error';
  message: string;
  /** 2行目の補足（どうすればいいか） */
  detail: string | null;
  buttonLabel: string;
  /** ボタンを押せないようにするか */
  buttonDisabled: boolean;
};

const RETRY_DETAIL = 'もういちど おしてね。だめなら スタッフを よんでね';

/** 状態ごとに、子ども向けのメッセージとボタンの表示を決める */
export const getReleaseFeedback = (state: ReleaseState): ReleaseFeedback => {
  switch (state) {
    case 'idle':
      return {
        tone: 'idle',
        message: 'できたら うみに はなそう →',
        detail: null,
        buttonLabel: 'うみに はなす',
        buttonDisabled: false,
      };
    case 'sending':
      return {
        tone: 'sending',
        message: 'うみへ おくって いるよ…',
        detail: null,
        buttonLabel: 'おくってるよ…',
        buttonDisabled: true,
      };
    case 'processing':
      return {
        tone: 'idle',
        message: 'まだ おくって いるよ',
        detail: 'すこし まってから もういちど おしてね',
        buttonLabel: 'もういちど はなす',
        buttonDisabled: false,
      };
    case 'unknown':
      return {
        tone: 'error',
        message: 'うまく おくれたか わからないよ',
        detail: RETRY_DETAIL,
        buttonLabel: 'もういちど はなす',
        buttonDisabled: false,
      };
    case 'error':
      return {
        tone: 'error',
        message: 'うまく おくれなかったよ',
        detail: RETRY_DETAIL,
        buttonLabel: 'もういちど はなす',
        buttonDisabled: false,
      };
    case 'notReady':
      return {
        tone: 'error',
        message: 'この パソコンは じゅんび ちゅうだよ',
        detail: 'スタッフを よんでね',
        buttonLabel: 'もういちど はなす',
        buttonDisabled: false,
      };
  }
};
