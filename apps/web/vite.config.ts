import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const singleFile = process.env.SINGLE_FILE === '1';

// Capacitor WebView에서 crossorigin 속성이 모듈 스크립트 로딩을 막는 문제 방지
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin/g, '');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), stripCrossorigin(), ...(singleFile ? [viteSingleFile()] : [])],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
