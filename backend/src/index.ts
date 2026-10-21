import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ReleaseResponse } from 'shared';
import { isReleaseAuthorized } from './lib/auth';
import { listRecentCreatures } from './lib/creatures';
import { createCreatureAddedMessage } from './lib/display';
import { fingerprintReleaseRequest, isValidIdempotencyKey } from './lib/idempotency';
import { decodeImageDataUrl } from './lib/image';
import { getAllowedOrigins, isAllowedOrigin } from './lib/origin';
import { saveImage, type SavedImage } from './lib/storage';
import { validateReleaseRequest } from './validation';

type Bindings = CloudflareBindings & {
  ALLOWED_ORIGINS?: string;
  RELEASE_TOKEN?: string;
};

const DISPLAY_ROOM_NAME = 'main';
const CREATURE_IMAGE_KEY_PREFIX = 'creatures/';
/** R2 の `assets/` から返してよい画面用の画像。素材の再配布を避けるためリポジトリには置かない（#88） */
const DISPLAY_ASSET_NAMES = new Set(['ocean-background.jpg']);
const DISPLAY_ASSET_CACHE_CONTROL = 'public, max-age=86400';

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      const allowedOrigins = getAllowedOrigins(c.env.ALLOWED_ORIGINS);

      return allowedOrigins.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    maxAge: 600,
  }),
);

app.get('/ws/display', (c) => {
  const upgradeHeader = c.req.header('Upgrade');

  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('WebSocket接続が必要です', 426);
  }

  if (!isAllowedOrigin(c.req.header('Origin'), c.req.url, c.env.ALLOWED_ORIGINS)) {
    return c.text('許可されていない接続元です', 403);
  }

  const id = c.env.DISPLAY_ROOM.idFromName(DISPLAY_ROOM_NAME);
  const room = c.env.DISPLAY_ROOM.get(id);

  return room.fetch(c.req.raw);
});

app.get('/api/images/:key{.+}', async (c) => {
  const key = c.req.param('key');

  if (
    !key.startsWith(CREATURE_IMAGE_KEY_PREFIX) ||
    key.length === CREATURE_IMAGE_KEY_PREFIX.length
  ) {
    return c.text('画像が見つかりません', 404);
  }

  const image = await c.env.IMAGES.get(key);

  if (image === null) {
    return c.text('画像が見つかりません', 404);
  }

  const headers = new Headers();
  image.writeHttpMetadata(headers);
  headers.set('ETag', image.httpEtag);

  return new Response(image.body, { headers });
});

app.get('/api/assets/:name', async (c) => {
  const name = c.req.param('name');

  if (!DISPLAY_ASSET_NAMES.has(name)) {
    return c.text('画像が見つかりません', 404);
  }

  const asset = await c.env.IMAGES.get(`assets/${name}`);

  if (asset === null) {
    return c.text('画像が見つかりません', 404);
  }

  const headers = new Headers();
  asset.writeHttpMetadata(headers);
  headers.set('ETag', asset.httpEtag);
  headers.set('Cache-Control', DISPLAY_ASSET_CACHE_CONTROL);

  return new Response(asset.body, { headers });
});

app.get('/api/creatures', async (c) => {
  try {
    const creatures = await listRecentCreatures(c.env.IMAGES);

    c.header('Cache-Control', 'no-store');

    return c.json(creatures);
  } catch (error) {
    console.error('作品の一覧を取得できませんでした', error);

    return c.json({ message: '作品の一覧を取得できませんでした' }, 500);
  }
});

app.post('/api/release', async (c) => {
  const configuredToken = c.env.RELEASE_TOKEN;

  if (!configuredToken) {
    console.error('RELEASE_TOKEN が設定されていません');

    const errorResponse: ReleaseResponse = {
      success: false,
      code: 'RELEASE_AUTH_UNAVAILABLE',
      message: '放流機能を利用できません。スタッフに知らせてください。',
    };

    return c.json(errorResponse, 503);
  }

  if (!isReleaseAuthorized(c.req.header('Authorization'), configuredToken)) {
    const errorResponse: ReleaseResponse = {
      success: false,
      code: 'UNAUTHORIZED',
      message: 'この端末からは作品を放流できません。',
    };

    c.header('WWW-Authenticate', 'Bearer');
    return c.json(errorResponse, 401);
  }

  const idempotencyKey = c.req.header('Idempotency-Key');

  if (!isValidIdempotencyKey(idempotencyKey)) {
    const errorResponse: ReleaseResponse = {
      success: false,
      message: 'Idempotency-Key はUUID v4で指定してください',
    };

    return c.json(errorResponse, 400);
  }

  let requestBody: unknown;

  try {
    requestBody = await c.req.json<unknown>();
  } catch {
    const errorResponse: ReleaseResponse = {
      success: false,
      message: 'リクエストボディは有効なJSON形式で指定してください',
    };

    return c.json(errorResponse, 400);
  }

  const validationResult = validateReleaseRequest(requestBody);

  if (!validationResult.success) {
    const errorResponse: ReleaseResponse = {
      success: false,
      message: validationResult.message,
    };

    return c.json(errorResponse, 400);
  }

  const decoded = decodeImageDataUrl(validationResult.data.image_base64);

  if (!decoded.success) {
    const errorResponse: ReleaseResponse = {
      success: false,
      message: decoded.message,
    };

    return c.json(errorResponse, 400);
  }

  const fingerprint = await fingerprintReleaseRequest(validationResult.data);
  const room = c.env.DISPLAY_ROOM.get(c.env.DISPLAY_ROOM.idFromName(DISPLAY_ROOM_NAME));
  let claim: Awaited<ReturnType<typeof room.claimRelease>>;

  try {
    claim = await room.claimRelease(idempotencyKey, fingerprint, Date.now());
  } catch (error) {
    console.error('放流処理の状態を確認できませんでした', error);

    const errorResponse: ReleaseResponse = {
      success: false,
      code: 'RELEASE_STATUS_UNKNOWN',
      message: '保存状況を確認できませんでした。同じ作品のまま再確認してください。',
    };

    return c.json(errorResponse, 503);
  }

  if (claim.status === 'in_progress') {
    const errorResponse: ReleaseResponse = {
      success: false,
      code: 'REQUEST_IN_PROGRESS',
      message: 'この作品はまだ送信処理中です。少し待ってから同じ内容で再確認してください。',
    };

    return c.json(errorResponse, 409);
  }

  if (claim.status === 'key_reused') {
    const errorResponse: ReleaseResponse = {
      success: false,
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: '送信キーが別の内容で使われています。新しいキーで再送します。',
    };

    return c.json(errorResponse, 409);
  }

  if (claim.status === 'succeeded') {
    return c.json(claim.response, 200);
  }

  let saved: SavedImage;
  try {
    const existing = await c.env.IMAGES.head(claim.saved.key);

    if (existing?.customMetadata?.requestFingerprint === fingerprint) {
      saved = claim.saved;
    } else if (existing !== null) {
      throw new Error('R2に同じ作品IDの異なる画像が存在します');
    } else {
      saved = await saveImage(
        c.env.IMAGES,
        decoded.image,
        validationResult.data.commands,
        claim.saved,
        fingerprint,
      );
    }
  } catch (error) {
    console.error('R2への保存結果を確認します', error);

    try {
      const existing = await c.env.IMAGES.head(claim.saved.key);

      if (existing?.customMetadata?.requestFingerprint === fingerprint) {
        saved = claim.saved;
      } else if (existing === null) {
        await room.markReleaseFailed(idempotencyKey, fingerprint, claim.attemptToken, Date.now());

        const errorResponse: ReleaseResponse = {
          success: false,
          code: 'IMAGE_SAVE_FAILED',
          message: '画像を保存できませんでした。同じ作品のまま再送してください。',
        };

        return c.json(errorResponse, 500);
      } else {
        const errorResponse: ReleaseResponse = {
          success: false,
          code: 'RELEASE_STATUS_UNKNOWN',
          message: '保存状況を確認できませんでした。同じ作品のまま再確認してください。',
        };

        return c.json(errorResponse, 503);
      }
    } catch (statusError) {
      console.error('R2への保存状況を確認できませんでした', statusError);

      const errorResponse: ReleaseResponse = {
        success: false,
        code: 'RELEASE_STATUS_UNKNOWN',
        message: '保存状況を確認できませんでした。同じ作品のまま再確認してください。',
      };

      return c.json(errorResponse, 503);
    }
  }

  const successResponse: ReleaseResponse = {
    success: true,
    message: '作品を保存しました！',
  };

  let completion: Awaited<ReturnType<typeof room.completeRelease>>;
  try {
    completion = await room.completeRelease(
      idempotencyKey,
      fingerprint,
      claim.attemptToken,
      successResponse,
      Date.now(),
    );
  } catch (error) {
    console.error('放流APIの処理結果を保存できませんでした', error);

    const errorResponse: ReleaseResponse = {
      success: false,
      code: 'RELEASE_STATUS_UNKNOWN',
      message: '保存状況を確認できませんでした。同じ作品のまま再確認してください。',
    };

    return c.json(errorResponse, 503);
  }

  if (completion.status === 'in_progress') {
    const errorResponse: ReleaseResponse = {
      success: false,
      code: 'REQUEST_IN_PROGRESS',
      message: 'この作品はまだ送信処理中です。少し待ってから同じ内容で再確認してください。',
    };

    return c.json(errorResponse, 409);
  }

  if (completion.status === 'succeeded') {
    return c.json(completion.response, 200);
  }

  if (completion.shouldNotify) {
    try {
      await room.broadcast(createCreatureAddedMessage(saved, validationResult.data.commands));
    } catch (error) {
      console.error('大画面への通知に失敗しました', error);
    }
  }

  return c.json(successResponse, 200);
});

export { DisplayRoom } from './durable-objects/DisplayRoom';
export default app;
