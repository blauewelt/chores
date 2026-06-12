const CACHE = 'haushalt-v25';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u =>
        fetch(new Request(u, { cache: 'reload' })).then(r => { if (r.ok) return c.put(u, r); })
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App-Shell: cache-first; alles andere (z. B. Google Fonts): network-first mit Cache-Fallback
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Nur App-Shell und Fonts cachen – API-Aufrufe (Supabase) IMMER ans Netz
  const url = new URL(e.request.url);
  const isShell = url.origin === location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isArt = url.hostname === 'gen.pollinations.ai' || url.hostname === 'image.pollinations.ai';
  if (!isShell && !isFont && !isArt) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        const copy = resp.clone();
        // Cross-Origin-Bilder kommen als 'opaque' (ok=false) – trotzdem cachen
        if (resp.ok || (isArt && resp.type === 'opaque')) caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      }).catch(() => cached);
    })
  );
});
