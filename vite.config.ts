/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/kush-games/',
  plugins: [react()],
  // card thumbnails stay separate, cacheable, lazily loaded files instead of being inlined into the JS bundle
  build: { assetsInlineLimit: (filePath: string) => (filePath.endsWith('.svg') ? false : undefined) },
  test: { include: ['src/**/*.test.ts'] },
});
