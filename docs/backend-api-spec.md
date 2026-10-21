# バックエンドAPI仕様書

このドキュメントは、フロントエンド（参加者画面や大画面モニター）とバックエンド（APIサーバー）がやり取りするデータの形式とルールを定義します。

画面と API は1つの Worker から配信するため（`docs/deploy.md`）、フロントからは相対パスで呼び出します。開発中は Vite（`localhost:5173`）が `/api` と `/ws` を `wrangler dev`（`localhost:8787`）へ転送します。

## 1. 放流API（絵とプログラムの送信）

参加者のPCから、描いた絵と組んだプログラムをサーバーに送るためのAPIです。

- **エンドポイント**: `/api/release`
- **HTTPメソッド**: `POST`
- **目的**: 参加者の作品データをサーバーで受け取り、保存および大画面への通知を行う。

### リクエスト（フロントから送るデータ）

- **Headers**:
  - `Authorization: Bearer <共有トークン>`（会場PCに設定した放流用トークン）
  - `Content-Type: application/json`
  - `Idempotency-Key: <UUID v4>`（同一作品の再送には同じキーを使用）
- **Body**:

```json
{
  "image_base64": "data:image/png;base64,...", // 文字列: キャンバスの画像データ
  "commands": [
    { "type": "move", "motion": "jump" },
    { "type": "say", "text": "こんにちは" }
  ] // 0〜5件のコマンドオブジェクト配列。空配列も受け付ける
}
```

描画モードは参加者画面で使用しますが、放流APIおよび大画面通知には含めません。

### 冪等性キー

- フロントエンドは放流操作の初回送信時に `crypto.randomUUID()` でキーを生成します。
- 同じ内容の再試行では同じキーを使います。内容を変更して送信し直す場合は新しいキーを使います。
- 同じキー・同じ内容の送信が成功済みの場合、APIは保存済みの成功レスポンスを返し、R2への二重保存や通知の再発行を行いません。
- 同じキーの処理が進行中の場合は、`409 Conflict` と `REQUEST_IN_PROGRESS` を返します。少し待ってから、同じキーで再確認できます。
- 同じキーが別の内容に使われた場合は、`409 Conflict` と `IDEMPOTENCY_KEY_REUSED` を返します。フロントエンドは新しいキーで再送します。
- 成功結果は24時間保持します。処理が一定時間残った場合は、再送時にR2の保存状況を確認してから処理を再開します。
- バリデーションに失敗したリクエストは冪等性キーを確定しません。画像保存に失敗した場合も、同じキー・同じ内容で再試行できます。

`commands` の各要素は以下のいずれかです。`type: "move"` の `motion` には、共有定数 `MOTIONS`（`shared/src/release.ts`）で定義した `"jump"` または `"spin"` を指定します。それ以外の値は `400 Bad Request` になります。

```json
{ "type": "move", "motion": "jump" }
```

```json
{ "type": "say", "text": "こんにちは" }
```

`say` の `text` は、共有定数 `MAX_SAY_TEXT_LENGTH`（`shared/src/release.ts`）以下で指定します。画面表示に合わせて上限を調整する場合は、この共有定数の数値を変更します。

### レスポンス（バックエンドからの返事）

成功時 (ステータスコード: 200 OK)

```json
{
  "success": true,
  "message": "作品を保存しました！"
}
```

リクエストが不正な場合 (ステータスコード: 400 Bad Request)

```json
{
  "success": false,
  "message": "commands は配列で指定してください"
}
```

認証情報がない、または共有トークンが一致しない場合は `401 Unauthorized` と `code: "UNAUTHORIZED"` を返します。認証に失敗したリクエストは、バリデーション、R2保存、WebSocket通知を行いません。

Workerに `RELEASE_TOKEN` Secretが設定されていない場合は `503 Service Unavailable` と `code: "RELEASE_AUTH_UNAVAILABLE"` を返します。共有トークンはソースコードやViteの環境変数へ埋め込まず、本番ではWorker Secretと会場PCのlocalStorageに設定します。ローカル開発では、`npm run dev` が `backend/.dev.vars`（Git管理対象外）を作成し、参加者画面も同じ開発用トークンを自動で使います（`docs/deploy.md`）。

同じキーの処理中、または同じキーが異なるリクエスト内容で使われた場合は `409 Conflict` を返します。処理中は `code: "REQUEST_IN_PROGRESS"`、キー再利用時は `code: "IDEMPOTENCY_KEY_REUSED"` を設定します。

### 失敗時 (ステータスコード: 500 Internal Server Error)

```json
{
  "success": false,
  "message": "データの受け取りに失敗しました"
}
```

R2への保存結果や処理記録の状態を確認できない場合は `503 Service Unavailable` と `code: "RELEASE_STATUS_UNKNOWN"` を返します。この場合、フロントエンドは内容を保持し、同じキーで手動確認を続けます。

APIの成功は画像がR2に保存されたことを意味します。WebSocket通知はベストエフォートで、通知に失敗してもAPIは成功を返します。

放流用トークンは書き込み操作である `POST /api/release` だけに使用します。大画面のWebSocketは受信専用であり、画像取得APIと作品一覧APIも `creatures/` 配下の読み取りだけに制限されているため、これらには同じトークンを要求しません。

## 2. 画像取得API

大画面モニターが、R2に保存された作品画像をWorker経由で取得するためのAPIです。

- **エンドポイント**: `/api/images/:key`
- **HTTPメソッド**: `GET`
- **取得対象**: `creatures/` で始まるR2オブジェクトキー

`key` にはスラッシュを含むR2オブジェクトキーを指定します。

```text
GET /api/images/creatures/1789452946224-12345678-1234-4234-8234-123456789abc.png
```

画像が存在する場合は `200 OK` で画像データを返します。`Content-Type` はR2への保存時に設定したHTTPメタデータを使用します。

画像が存在しない場合、または `creatures/` 以外のキーを指定した場合は `404 Not Found` を返します。許可されていないキーについてはR2への読み取りを行いません。

## 3. 大画面WebSocket接続

大画面モニターとバックエンドの常時接続を確立し、作品の保存完了通知をリアルタイムで受信するための接続口です。

- **エンドポイント**: `/ws/display`（開いているページと同じホストへ接続する。HTTPS のページでは `wss://` を使用する）
- **HTTPメソッド**: `GET`
- **接続方式**: WebSocket
- **接続対象**: 大画面モニター
- **接続元の制限**: 画面と同じオリジンからの接続を許可する。開発環境ではあわせて `http://localhost:5173` と `http://127.0.0.1:5173` からの接続を許可する

### 接続時のエラー

- 通常のHTTPアクセスには `426 Upgrade Required` を返す。
- 許可されていない接続元には `403 Forbidden` を返す。

接続はDurable ObjectsのHibernation APIで管理し、放流APIで画像のR2保存が完了すると、接続中のすべての大画面へ `creature_added` メッセージを送信します。通知に失敗しても、画像が保存済みであれば放流APIは200を返します。

### サーバーからの通知メッセージ

```json
{
  "type": "creature_added",
  "creature": {
    "id": "12345678-1234-4234-8234-123456789abc",
    "imageUrl": "creatures/1789452946224-12345678-1234-4234-8234-123456789abc.png",
    "commands": [
      { "type": "move", "motion": "jump" },
      { "type": "say", "text": "こんにちは" }
    ],
    "createdAt": 1789452946224
  }
}
```

`imageUrl` はR2のオブジェクトキーであり、画像の取得には `GET /api/images/:key` を使います。

## 4. 作品一覧API

大画面モニターを再読み込みしたときや再接続したときに、R2に保存されている直近の作品を取得するためのAPIです。

- **エンドポイント**: `/api/creatures`
- **HTTPメソッド**: `GET`
- **取得件数**: 直近 `MAX_CREATURES`（30）件

成功時は `200 OK` で、作品の配列を古い順に返します。各要素は通知メッセージ（`creature_added`）の `creature` と同じ形式で、`id` も通知と同じ値です。大画面では `id` で通知との重複を判定できます。

```json
[
  {
    "id": "12345678-1234-4234-8234-123456789abc",
    "imageUrl": "creatures/1789452946224-12345678-1234-4234-8234-123456789abc.png",
    "commands": [{ "type": "move", "motion": "jump" }],
    "createdAt": 1789452946224
  }
]
```

作品がない場合は空配列を返します。レスポンスには `Cache-Control: no-store` を付け、キャッシュさせません。

R2から一覧を取得できない場合は `500 Internal Server Error` を返します。

```json
{ "message": "作品の一覧を取得できませんでした" }
```

`id` と `commands` は、放流時にR2の customMetadata に保存した値を使います。`createdAt` はオブジェクトキーに含まれる作成時刻です。`id` を保存していない作品は、オブジェクトキーに含まれるUUIDを `id` として返します。
