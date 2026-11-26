/**
 * Dynamic Web App Manifest Generator for Meyar-e-Madaris PWA
 * Allows distinct start_url and branding when installed from /admin or /principal/:code
 */

export function updateDynamicManifest(opts: {
  name?: string;
  short_name?: string;
  start_url: string;
}) {
  try {
    if (typeof window !== 'undefined' && window.self !== window.top) {
      return; // Skip inside sandbox iframe to avoid cross-origin / blob security errors
    }
    const existing = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const manifestObj = {
      id: opts.start_url || '/',
      name: opts.name || 'معیارِ مدارس — پورٹل و رزلٹ سسٹم',
      short_name: opts.short_name || 'معیار مدارس',
      description: 'معیارِ مدارس — جامع امتحانی، رزلٹ اور پرنسپل ڈیش بورڈ ویب ایپ',
      theme_color: '#064e3b',
      background_color: '#064e3b',
      display: 'standalone',
      start_url: opts.start_url || '/',
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
          url: '/admin',
          icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
        },
        {
          name: 'پرنسپل پورٹل',
          short_name: 'پرنسپل',
          url: '/login',
          icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
        },
        {
          name: 'امتحانی نتائج',
          short_name: 'نتائج',
          url: '/results',
          icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
        },
      ],
    };

    const blob = new Blob([JSON.stringify(manifestObj, null, 2)], { type: 'application/manifest+json' });
    const blobUrl = URL.createObjectURL(blob);

    if (existing) {
      existing.href = blobUrl;
    } else {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = blobUrl;
      document.head.appendChild(link);
    }
  } catch (err) {
    console.warn('[PWA] Could not update dynamic manifest:', err);
  }
}
