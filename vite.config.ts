import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Same value as THEME.ui.background in src/data/theme.ts (and index.html).
const NIGHT = '#120F20'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs: the build works from any subpath (GitHub Pages
  // serves it from /<repository>/) as well as from a domain root.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration lives in src/main.tsx (same one-liner the plugin would
      // inject) so the native app (Capacitor) can skip it: its files are local.
      injectRegister: null,
      // the workbox glob below already picks the icons up
      includeManifestIcons: false,
      manifest: {
        name: '스플랜더',
        short_name: '스플랜더',
        description: '보석을 모아, 둘이서 쌓는 명성',
        lang: 'ko',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: NIGHT,
        background_color: NIGHT,
        // relative to the manifest, so they follow `base`
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // The whole app shell (including the lazily loaded PeerJS chunk) is
        // precached: the app opens offline, and vs-AI / pass-and-play work
        // without a network. Online play of course still needs one.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
})
