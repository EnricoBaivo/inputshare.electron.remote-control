import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@inputshare/shared': resolve(__dirname, 'packages/shared/index.ts'),
      '@inputshare/ui': resolve(__dirname, 'packages/ui/index.ts'),
    },
  },
  build: {
    outDir: 'dist/ui',
    rollupOptions: {
      input: {
        client: resolve(__dirname, 'apps/client/ui/index.html'),
        host: resolve(__dirname, 'apps/host/ui/index.html'),
      },
    },
    target: 'chrome120',
  },
});
