import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from a GitHub Pages *project* site (https://<user>.github.io/piano-learning-app/),
// not the domain root, so every asset/manifest/service-worker path must be prefixed with the
// repo name -- Vite's `base` handles the build output, and the PWA options below mirror it.
const BASE_PATH = '/piano-learning-app/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Piano Learning',
        short_name: 'Piano Learning',
        description: 'Tap a note or chord on the score to see which piano keys to play.',
        theme_color: '#2f7a3d',
        background_color: '#f6f5f2',
        display: 'standalone',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
})
