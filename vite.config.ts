import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vite bundler. base: './' — so the built interface opens from app:// in Electron.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5190,
    strictPort: true,
    open: false,
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
  },
});
