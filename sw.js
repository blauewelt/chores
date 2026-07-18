const CACHE = 'haushalt-v136';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './updates.html',
  './qrcode.min.js',
  './i18n/da.json',
  './i18n/en.json',
  './i18n/es.json',
  './i18n/fr.json',
  './i18n/hi.json',
  './i18n/id.json',
  './i18n/it.json',
  './i18n/ja.json',
  './i18n/ko.json',
  './i18n/nl.json',
  './i18n/pl.json',
  './i18n/pt.json',
  './i18n/ro.json',
  './i18n/ru.json',
  './i18n/sv.json',
  './i18n/tr.json',
  './i18n/uk.json',
  './i18n/vi.json',
  './i18n/zh.json',
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
  // Navigationsanfragen auf tiefe Pfade (/chores/f/...) → App-Shell ausliefern.
  // NUR fuer die App-Wurzel und f/-Routen — ECHTE Seiten wie updates.html
  // muessen normal durchgehen (Live-Bug 17.07.: der News-Banner fuehrte
  // «nirgendwohin», weil die Shell-Regel JEDE /chores/-Navigation kaperte).
  if (e.request.mode === 'navigate') {
    const u = new URL(e.request.url);
    const p = u.pathname;
    if (u.origin === location.origin &&
        (p === '/chores/' || p === '/chores/index.html' || p.startsWith('/chores/f/'))) {
      e.respondWith(
        caches.match('./index.html').then(c => c || fetch('./index.html')).catch(() => fetch(e.request))
      );
      return;
    }
  }
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
