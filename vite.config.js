import { defineConfig } from 'vite';

// base './' : GitHub Pages(저장소 하위 경로)와 Capacitor 모두에서 상대 경로로 동작
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  // Windows에서 파일 저장 시 감시기가 EBUSY로 죽는 문제 방지
  server: { watch: { usePolling: true, interval: 300 } },
});
