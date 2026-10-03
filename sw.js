const CACHE = 'haushalt-v220';   // v4.114.1 Marken-Test: Splash-Logo zwinkert beim Start
// v4.113.1: Kachelkunst hat einen EIGENEN, versionsfesten Cache. Bis v4.113.0
// lag sie im versionierten CACHE — und den loescht `activate` bei JEDEM Deploy.
// Folge: nach jedem Deploy forderte jedes Geraet jedes Kachelbild neu an,
// also genau die Massen-Erzeugung, die Pollinations drosselt.
const ART_CACHE = 'haushalt-art-1';
const ART_MAX = 400;               // Eintraege; aelteste fliegen zuerst
const isArtUrl = u => { const h = new URL(u).hostname; return h === 'gen.pollinations.ai' || h === 'image.pollinations.ai'; };
const SHELL = [
  './',
  './index.html',
  './bricolage-grotesque.ttf',
  './privacy.html',
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
  './icon-512-maskable.png',
  './icon-b3-192.png',        // v4.113.0 Marken-Test: Favicon/Touch-Icon nur fuer Beta-Haushalte
  './icon-b3-512.png',
  './icon-b3-512-maskable.png'
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
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // Kachelkunst aus alten haushalt-Caches in den versionsfesten Kunst-Cache
    // UMZIEHEN, bevor sie geloescht werden — sonst loest genau dieser Deploy
    // noch einmal die Neu-Erzeugung aller Bilder aus. Nur echte Bilder (ok +
    // image/*); alles andere stirbt mit dem alten Cache (v4.110.0-Regel).
    try {
      const art = await caches.open(ART_CACHE);
      for (const k of keys) {
        if (k === CACHE || k === ART_CACHE || !k.startsWith('haushalt-v')) continue;
        const old = await caches.open(k);
        for (const req of await old.keys()) {
          if (!isArtUrl(req.url) || await art.match(req)) continue;
          const r = await old.match(req);
          if (r && r.ok && (r.headers.get('content-type') || '').startsWith('image/')) await art.put(req, r);
        }
      }
      await artTrim(art);
    } catch {}
    await Promise.all(keys.filter(k => k !== CACHE && k !== ART_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// App-Shell: cache-first; alles andere (z. B. Google Fonts): network-first mit Cache-Fallback
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Versions-Sonde der App (v4.110.0): index.html?fresh=<ts> fragt, welche
  // Version LIVE steht. Die darf der SW weder beantworten noch ablegen —
  // sonst sammelt der Cache eine Zeile pro Abfrage, und die Antwort waere
  // ausgerechnet die alte Fassung, die die Sonde entlarven soll.
  if (new URL(e.request.url).searchParams.has('fresh')) return;
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
  if (isArt) { e.respondWith(artFetch(e.request, e)); return; }
  if (!isShell && !isFont) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        const copy = resp.clone();
        if (resp.ok) caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      }).catch(() => cached);
    })
  );
});

// ---------- Kachelkunst (v4.110.0) ----------
// ZWEI Fehler, die einander verstaerkt haben (Befund 28.08.2026, ausgeloest
// von einer Kachel, die auf dem Geraet des Maintainers dauerhaft bildlos war):
//
// 1. Ein <img> laedt no-cors. Die Antwort kommt dadurch als 'opaque' an —
//    status 0, ok false — UNABHAENGIG davon, ob Pollinations 200 oder 503
//    geschickt hat. Die alte Regel «isArt && opaque → cachen» hat deshalb
//    auch Fehlerantworten in den Cache gelegt. Und weil hier cache-first
//    ohne Revalidierung gilt, war die Kachel danach DAUERHAFT kaputt: jeder
//    Wiederholversuch (artRetry 3x, warmArt 5x mit Backoff) bekam die
//    gespeicherte 503-JSON zurueck, ohne das Netz je wieder zu beruehren.
//    Erst der naechste Cache-Bump hat es geheilt — zufaellig, nicht gezielt.
// 2. Pollinations antwortet unter Last mit 503 «Queue full» (upstream flux).
//    Genau diese Last erzeugen wir selbst: das Aufgaben-Raster fordert ALLE
//    Kacheln gleichzeitig an, und ueber HTTP/2 bremst kein Browser-Limit pro
//    Host. Gemessen: 15–40 % Ausfall im Pulk, 0 % nacheinander.
//
// Kur: per CORS holen (Pollinations schickt `access-control-allow-origin: *`
// auch auf Fehlern — damit wird der Status LESBAR), nur echte Bilder cachen,
// und hoechstens ART_PAR Erzeugungen gleichzeitig laufen lassen. Fehler gehen
// UNGECACHT durch, sodass artRetry/warmArt tatsaechlich wieder ans Netz
// kommen. Der Preis ist Geduld: ein volles Raster fuellt sich gestaffelt —
// die Kacheln blenden ohnehin einzeln ein.
// ---------- Drosselung (v4.113.1) ----------
// Befund (Maintainer, 02.10.2026): der neue brand3-Prompt liess ALLE Kacheln
// eines Haushalts zugleich neu erzeugen, und Pollinations antwortete mit 429.
// Was v4.110.0 tat und was fehlte:
//  - ART_PAR = 3 gleichzeitig, aber KEIN Abstand: jede fertige Anfrage startete
//    sofort die naechste — ein Dauerfeuer von drei.
//  - Ein 429/503 ging direkt ans <img>; dessen artRetry wartete 5/10/15 s und
//    stellte sich hinten an — waehrenddessen liefen alle anderen weiter in die
//    Sperre. Jede Kachel wich EINZELN aus, die Schlange nie als Ganzes.
//  - Der Deckel (3 Versuche) hing am <img>-Element. Jeder Re-Render (Sync,
//    Tab-Wechsel) baute neue Elemente mit frischem Zaehler — und die Anfragen
//    der verworfenen Elemente blieben im SW eingereiht: Doppel-Erzeugungen.
//  - Sichtbar oder nicht, Vorwaermen oder Kachel: alles FIFO in einer Reihe.
// Jetzt: EINE Schlange mit Prioritaet (sichtbar 0 · Kachel 1 · Vorwaermen 2),
// hoechstens ART.par Erzeugungen gleichzeitig, mindestens ART.gap ms zwischen
// zwei Starts, gleiche URL = EINE Erzeugung fuer alle Wartenden. Ein 429/5xx
// pausiert die GANZE Schlange (exponentiell + Zufall, Retry-After hat Vorrang),
// der Versuch stellt sich VORNE wieder an; nach ART.tries Versuchen geht der
// Fehler UNGECACHT an die Seite — die laesst die Kachel bis zum naechsten
// App-Start bildlos. Cache-Treffer gehen nie in die Schlange.
// Werte aus einer Messung am 02.10.2026 (29 echte Erzeugungen, LOG v4.113.1):
// Pulk 10 → ein 429 «Retry after 1.46s» (Retry-After: 2), Pulk 4/6 und
// 2 parallel mit 1,5 s Abstand → fehlerfrei; eine Erzeugung dauert 5–8 s.
const ART = { par: 2, gap: 1200, base: 4000, max: 60000, tries: 3, wait: 240000 };
let artRunning = 0, artLastStart = 0, artCoolUntil = 0, artStrikes = 0, artTimer = null;
const artQueue = [];               // { url, prio, tries, resolve, since, event }
const artInflight = new Map();     // url → Promise<Response> (eine Erzeugung fuer alle)

self.addEventListener('message', e => {
  const d = e.data || {};
  // Test-Haken (haushalt.artpace, von der Seite weitergereicht): Zeiten stauchen.
  if (d.type === 'art-pace' && d.cfg && typeof d.cfg === 'object') {
    for (const k of ['par', 'gap', 'base', 'max', 'tries', 'wait']) {
      const v = +d.cfg[k]; if (Number.isFinite(v) && v >= 0) ART[k] = k === 'par' ? Math.max(1, Math.min(4, v)) : v;
    }
    artPump();
  }
  // Die Seite meldet, welche wartenden Bilder gerade im Bild sind → nach vorn.
  if (d.type === 'art-prio' && Array.isArray(d.urls)) {
    for (const j of artQueue) if (d.urls.includes(j.url)) j.prio = 0;
    artPump();
  }
});

async function artTrim(cache) {
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - ART_MAX; i++) await cache.delete(keys[i]);
  } catch {}
}

async function artFetch(request, event) {
  const hit = await caches.match(request);
  if (hit) return hit;         // im Cache liegen NUR gepruefte Bilder — sofort, nie in der Schlange
  const prio = request.destination === 'image' ? 1 : 2;   // fetch() = Vorwaermen
  let p = artInflight.get(request.url);
  if (p) {
    // Dieselbe URL wartet schon (Re-Render, Vorwaermen): mitwarten statt neu
    // erzeugen; eine sichtbare Kachel hebt ein Vorwaermen auf ihre Stufe.
    const q = artQueue.find(j => j.url === request.url);
    if (q && prio < q.prio) q.prio = prio;
  } else {
    p = new Promise(resolve => {
      artQueue.push({ url: request.url, prio, tries: 0, resolve, since: Date.now(), event });
    });
    artInflight.set(request.url, p);
    p.then(() => artInflight.delete(request.url));
    artPump();
  }
  // Jede wartende Anfrage bekommt eine eigene Kopie; das Original bleibt ungelesen.
  return (await p).clone();
}

function artFail() { return new Response('', { status: 503, statusText: 'art throttled' }); }

function artPump() {
  if (artTimer) { clearTimeout(artTimer); artTimer = null; }
  const now = Date.now();
  for (let i = artQueue.length - 1; i >= 0; i--) {
    if (now - artQueue[i].since > ART.wait) artQueue.splice(i, 1)[0].resolve(artFail());
  }
  if (!artQueue.length || artRunning >= ART.par) return;
  const wait = Math.max(artCoolUntil - now, artLastStart + ART.gap - now);
  if (wait > 0) { artTimer = setTimeout(artPump, wait); return; }
  let bi = 0;
  for (let i = 1; i < artQueue.length; i++) if (artQueue[i].prio < artQueue[bi].prio) bi = i;
  const job = artQueue.splice(bi, 1)[0];
  artRunning++; artLastStart = now;
  artRun(job).finally(() => { artRunning--; artPump(); });
  if (artQueue.length) artPump();   // plant den naechsten Start nach ART.gap
}

async function artRun(job) {
  job.tries++;
  let resp = null, retryAfter = 0;
  try {
    // mode:'cors' statt der no-cors-Anfrage des <img> — nur so ist der
    // Status sichtbar. Eine CORS-Antwort bedient das <img> genauso.
    resp = await fetch(job.url, { mode: 'cors', credentials: 'omit' });
  } catch {
    // Sollte Pollinations je die CORS-Kopfzeile verlieren, faellt der
    // Bilderdienst nicht aus: opake Antwort durchreichen, aber nicht cachen
    // (Status nicht pruefbar). Nur ein echter Netzfehler bleibt ein Fehlschlag.
    try { job.resolve(await fetch(job.url, { mode: 'no-cors', credentials: 'omit' })); return; } catch {}
  }
  if (resp) {
    if (resp.ok && (resp.headers.get('content-type') || '').startsWith('image/')) {
      artStrikes = 0;
      const copy = resp.clone();
      // waitUntil statt fire-and-forget: das Schreiben haelt die Antwort nicht
      // auf, ueberlebt aber garantiert das Ende des fetch-Handlers.
      const write = caches.open(ART_CACHE).then(c => c.put(job.url, copy).then(() => artTrim(c))).catch(() => {});
      if (job.event && job.event.waitUntil) { try { job.event.waitUntil(write); } catch {} }
      job.resolve(resp);
      return;
    }
    if (![429, 502, 503, 504].includes(resp.status)) { job.resolve(resp); return; }   // z. B. 400: kein Wiederholen
    const ra = resp.headers.get('retry-after');
    if (ra) retryAfter = /^\d+(\.\d+)?$/.test(ra.trim()) ? +ra * 1000 : Math.max(0, Date.parse(ra) - Date.now()) || 0;
  }
  // Drosselung (oder Netz weg): die GANZE Schlange pausiert.
  artStrikes++;
  const back = Math.min(ART.max, ART.base * 2 ** (artStrikes - 1));
  const cool = Math.max(back, Math.min(retryAfter, 300000)) + Math.random() * 0.5 * back;   // Retry-After hat Vorrang
  artCoolUntil = Math.max(artCoolUntil, Date.now() + cool);
  if (job.tries < ART.tries) { artQueue.unshift(job); return; }   // vorne wieder anstellen
  job.resolve(resp || artFail());                                  // gedeckelt: Fehler ungecacht an die Seite
}
