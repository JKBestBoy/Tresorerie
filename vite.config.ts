import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH est fourni par le déploiement GitHub Pages ("/nom-du-depot/").
// En local et sur Netlify, l'app est servie à la racine.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Une nouvelle version est proposée (bandeau), jamais appliquée en pleine saisie
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'favicon-48.png'],
      manifest: {
        name: 'Ma trésorerie',
        short_name: 'Trésorerie',
        description: 'Simulateur de trésorerie personnelle : solde projeté, matelas, grosses dépenses et placements.',
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f5fb',
        theme_color: '#4f46e5',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // Les données (Supabase) et les cours ne sont jamais mis en cache par le service worker
        navigateFallbackDenylist: [/^\/functions\//, /^\/rest\//, /^\/auth\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'polices', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
})
