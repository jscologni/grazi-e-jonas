import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/grazi-e-jonas/'

export default defineConfig({
  base: BASE,
  // a pasta tem acento ("Área de Trabalho"); o atalho curto do Windows confunde a checagem de caminho do Vite
  server: { fs: { strict: false } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Grazi e Jonas',
        short_name: 'Grazi e Jonas',
        description: 'Lista de compras, despensa, tarefas e o dinheiro do casal.',
        lang: 'pt-BR',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#EEF3E2',
        theme_color: '#EEF3E2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: `${BASE}index.html`,
        importScripts: ['push-sw.js?v=2'], // avisos de contas com o app fechado
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/pdf-*.js'], // leitor de PDF: só baixa quando alguém importa um extrato em PDF
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fontes', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
})
