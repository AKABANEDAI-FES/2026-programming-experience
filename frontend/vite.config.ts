import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_URL = 'http://localhost:8787';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 本番は画面と API を同じ Worker から配信するため、開発中も同じパスでバックエンドへ転送する
    proxy: {
      '/api': BACKEND_URL,
      '/ws': { target: BACKEND_URL, ws: true },
    },
  },
});
