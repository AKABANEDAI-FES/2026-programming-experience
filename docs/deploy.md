# デプロイ手順

フロントエンド（参加者画面・大画面）とバックエンド（API・WebSocket）を、1つの Cloudflare Worker から配信します（#61・#73）。
画面と API が同じ URL になるため、接続先は相対パス（`/api/...`、`/ws/display`）で書きます。

## 構成

| 項目                  | 値                                                           |
| :-------------------- | :----------------------------------------------------------- |
| Cloudflare アカウント | 実行委員会（`akabanedai-fes`）                               |
| Worker 名             | `2026-programming-experience`                                |
| 公開 URL              | `https://2026-programming-experience.akabanedai.workers.dev` |
| R2 バケット           | `2026-programming-experience`                                |

`backend/wrangler.jsonc` で次のように振り分けています。

- `/api/*` と `/ws/*` は Worker（Hono）が処理する
- それ以外は `frontend/dist` の静的ファイルを返す
- `/display` などファイルがないパスには `index.html` を返す

## 初回だけ行うこと

1. 実行委員会のアカウントで R2 バケット `2026-programming-experience` を作る（ダッシュボードの「R2 オブジェクトストレージ」→「バケットを作成」）
2. WSL などのターミナルで Cloudflare にログインする

   ```bash
   npx wrangler login
   ```

3. 放流用トークン（#74）を Worker の Secret に設定する。十分に長いランダムな値を使い、ソースコードや Issue・PR には書かない

   ```bash
   npx wrangler secret put RELEASE_TOKEN --config backend/wrangler.jsonc
   ```

   設定していないと、放流 API はすべて `503`（`RELEASE_AUTH_UNAVAILABLE`）を返します。

4. 大画面の背景画像（#88）を R2 にアップロードする。画像は[いらすとやの「海の中のイラスト」](https://www.irasutoya.com/2016/01/blog-post_620.html)（1920×1080）で、素材の再配布を避けるためリポジトリには置いていません。ダウンロードした画像を指定して実行します

   ```bash
   npx wrangler r2 object put 2026-programming-experience/assets/ocean-background.jpg --file <ダウンロードした画像> --content-type image/jpeg --remote --config backend/wrangler.jsonc
   ```

   アップロードしていなくても、大画面はグラデーションの背景で表示されます。

Durable Object は初回のデプロイで自動的に作られます。

## 会場 PC の準備

各会場 PC の Chrome で参加者画面を開き、開発者ツールのコンソールで、Worker に設定したものと同じトークンを保存してから再読み込みします。

```js
localStorage.setItem('programming-experience-release-token', '<Worker に設定したトークン>');
```

- トークンはブラウザに保存されるため、**シークレットウィンドウでは使わない**でください。閉じたときにトークンが消え、放流できなくなります。
- キオスク設定（#22）で開発者ツールを無効にする前に設定してください。
- 大画面（`/display`）にはトークンは不要です。

## デプロイする

リポジトリのルートで実行します。フロントをビルドしてから、Worker をデプロイします。

```bash
npm run deploy
```

## 開発環境

`npm run dev` のまま使えます。Vite（`localhost:5173`）が `/api` と `/ws` を `wrangler dev`（`localhost:8787`）へ転送するので、本番と同じパスで動作確認できます。

放流用トークンの設定も不要です。`npm run dev` で起動すると、`backend/.dev.vars` がなければ `.dev.vars.example` から作られ、参加者画面も同じ開発用トークンを使います。開発用トークンは本番のビルドには含まれません。

大画面の背景画像も、初回の `npm run dev` でいらすとやから取得して手元の R2 に入れます。取得できなかった場合はグラデーションの背景で起動します。入れ直したいときは `backend/.wrangler/state/ocean-background.seeded` を削除してから起動してください。
