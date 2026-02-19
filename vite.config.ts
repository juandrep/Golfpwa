import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'GreenCaddie',
        short_name: 'GreenCaddie',
        theme_color: '#111827',
        background_color: '#f9fafb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/services\.arcgisonline\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'arcgis-tiles',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
          {
            urlPattern: /^https:\/\/a\.basemaps\.cartocdn\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-tiles',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /\/assets\/.*\.(js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-static-assets',
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          firebase: ['firebase/app', 'firebase/auth'],
          map: ['maplibre-gl'],
          state: ['zustand', 'dexie'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
