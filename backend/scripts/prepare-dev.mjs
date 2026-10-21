// `npm run dev` の前に、wrangler dev が起動できる状態にそろえる
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

// assets.directory がないと wrangler dev が起動しないため、フロント未ビルドでも空のフォルダを用意する
mkdirSync('../frontend/dist', { recursive: true });

// 開発用の放流トークンを設定なしで使えるよう、.dev.vars がなければ example からコピーする
if (!existsSync('.dev.vars')) {
  copyFileSync('.dev.vars.example', '.dev.vars');
  console.log('backend/.dev.vars を .dev.vars.example から作成しました');
}

// 大画面の背景画像を手元の R2 に入れる（#88）。素材の再配布を避けるため、リポジトリには置かず各自の PC で取得する。
// 取得できなくても大画面はグラデーションで表示できるため、失敗しても起動は止めない。
const BUCKET_NAME = '2026-programming-experience'; // wrangler.jsonc の bucket_name と同じ
const BACKGROUND_KEY = 'assets/ocean-background.jpg';
const BACKGROUND_SOURCE_URL =
  'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEicP5lru16Y8Sh5sfeqG4sb3QfxIyd4Y1yqYkMiqC-ok-SdeKhZ7_kazKeoOjv4xaCyWiJW63GNVcR-cAJ0S5uvhkaeLWVBcRN4jOLS2xHh-__cImAvq_SSD-ZYKzqsBhJ_JYYoDf_QoMzD/s0/bg_natural_ocean.jpg';
// 手元の R2 の保存先（.wrangler/state）に目印を置き、state を消したときは入れ直す
const SEEDED_MARKER = '.wrangler/state/ocean-background.seeded';
const DOWNLOAD_PATH = '.wrangler/tmp-ocean-background.jpg';

const seedBackground = async () => {
  if (existsSync(SEEDED_MARKER)) {
    return;
  }

  const response = await fetch(BACKGROUND_SOURCE_URL, { signal: AbortSignal.timeout(10_000) });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  mkdirSync('.wrangler/state', { recursive: true });
  writeFileSync(DOWNLOAD_PATH, Buffer.from(await response.arrayBuffer()));

  const result = spawnSync(
    'wrangler',
    [
      'r2',
      'object',
      'put',
      `${BUCKET_NAME}/${BACKGROUND_KEY}`,
      '--file',
      DOWNLOAD_PATH,
      '--content-type',
      'image/jpeg',
      '--local',
    ],
    { stdio: 'ignore', shell: process.platform === 'win32' },
  );
  rmSync(DOWNLOAD_PATH, { force: true });

  if (result.status !== 0) {
    throw new Error('wrangler r2 object put に失敗しました');
  }

  writeFileSync(SEEDED_MARKER, '');
  console.log('大画面の背景画像を手元の R2 に入れました');
};

try {
  await seedBackground();
} catch (error) {
  console.warn(
    `大画面の背景画像を準備できませんでした（グラデーションで表示します）: ${error.message}`,
  );
}
