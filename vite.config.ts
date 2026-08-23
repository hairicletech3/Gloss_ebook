import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // epubjs reaches for a global `JSZip` in some code paths and expects a
  // browser-ish `global`. Neither exists in a Vite ESM build.
  define: { global: 'globalThis' },
  optimizeDeps: { include: ['epubjs', 'jszip'] },
  server: { port: 5173 },
});
