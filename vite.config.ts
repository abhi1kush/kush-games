/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/kush-games/',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
});
