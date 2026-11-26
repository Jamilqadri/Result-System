import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if ((globalThis as any).__dirname === '.') {
  delete (globalThis as any).__dirname;
}

export default defineConfig(async ({ command }) => {
  const isBuild = command === 'build';
  const pwaPlugins = isBuild
    ? [
        (await import('vite-plugin-pwa')).VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
              workbox: {
                maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
              },
              manifest: {
          id: '/',
          name: 'معیارِ مدارس — پورٹل و رزلٹ سسٹم',
          short_name: 'معیار مدارس',
          description: 'معیارِ مدارس — جامع امتحانی، رزلٹ اور پرنسپل ڈیش بورڈ ویب ایپ',
          theme_color: '#064e3b',
          background_color: '#064e3b',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'ایڈمن پینل',
              short_name: 'ایڈمن',
              description: 'معیارِ مدارس ایڈمن ڈیش بورڈ',
              url: '/admin',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'پرنسپل پورٹل',
              short_name: 'پرنسپل',
              description: 'مدرسہ پرنسپل پورٹل لاگ ان',
              url: '/login',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'امتحانی نتائج',
              short_name: 'نتائج',
              description: 'آن لائن رزلٹ پورٹل',
              url: '/',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ]
    : [];

  return {
    plugins: [react(), tailwindcss(), ...pwaPlugins],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio
      hmr: false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
