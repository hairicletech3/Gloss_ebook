import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Not autoUpdate: a worker that swaps code under a reader mid-page is
      // how you end up serving half of one build and half of another. The app
      // asks first — see useAppUpdate.
      registerType: 'prompt',
      workbox: {
        // pdf.js ships a worker chunk well over the 2MB default.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,woff,woff2,svg,png,ico}'],
        // Supabase responses must never be precached — auth tokens and book
        // rows go stale, and the app has its own IndexedDB cache for those.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Google Fonts are the only third party the reading page needs.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gloss-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Gloss',
        short_name: 'Gloss',
        description: 'Read anything, in any language.',
        start_url: '/',
        display: 'standalone',
        background_color: '#e9e7e0',
        theme_color: '#e9e7e0',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  // epubjs reaches for a global `JSZip` in some code paths and expects a
  // browser-ish `global`. Neither exists in a Vite ESM build.
  define: { global: 'globalThis' },
  optimizeDeps: { include: ['epubjs', 'jszip'] },
  server: { port: 5173 },
});
