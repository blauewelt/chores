const CACHE = 'haushalt-v159';
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
  // PERSOENLICHES MANIFEST (v4.56.0): gleiche Herkunft statt data:-URL, damit
  // Chrome auf Android eine echte App (WebAPK) bauen kann. Der Service Worker
  // erzeugt es aus den Parametern — auf einem statischen Host waere das sonst
  // unmoeglich. Ohne Parameter bleibt es die normale Datei.
  {
    const u = new URL(e.request.url);
    if (u.origin === location.origin && u.pathname === '/chores/manifest.json' && u.searchParams.get('u')) {
      const fam = u.searchParams.get('f') || '';
      const slug = u.searchParams.get('u');
      const name = u.searchParams.get('n') || '';
      const start = location.origin + '/chores/f/' + fam + '/u/' + slug;
      const icon = (f, s, p) => ({ src: location.origin + '/chores/' + f, sizes: s, type: 'image/png', purpose: p });
      const body = JSON.stringify({
        name: name ? 'Fairli · ' + name : 'Fairli',
        // Android beschriftet das Symbol mit SHORT_NAME — der muss «Fairli»
        // heissen (Maintainer-Befund 20.07.2026: das Symbol trug statt der
        // Marke den blossen Personennamen). Der Name der Person gehoert in
        // name, nicht auf den Startbildschirm.
        short_name: 'Fairli',
        description: 'Fairli – wer macht was im Haushalt, und wer punktet.',
        start_url: start, id: start, scope: location.origin + '/chores/',
        display: 'standalone', orientation: 'portrait',
        // Android malt den Start-Bildschirm mit background_color, BEVOR die
        // Seite zeichnet. Weiss ergab einen grellen Blitz vor der dunklen App
        // (Maintainer-Befund 20.07.2026) — die Farben folgen jetzt der App:
        // background = var(--bg), theme = <meta name="theme-color">.
        background_color: '#12161F', theme_color: '#141A17',
        icons: [icon('icon-192.png?v=47', '192x192', 'any'),
                icon('icon-512.png?v=47', '512x512', 'any'),
                icon('icon-512-maskable.png?v=47', '512x512', 'maskable')]
      });
      e.respondWith(new Response(body, { headers: { 'Content-Type': 'application/manifest+json' } }));
      return;
    }
  }
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
