# Fairli — Developer Onboarding

Fairli ist eine Haushalts-Aufgaben-PWA (Familien, Paare, WGs) mit
Punkte-Gamification: Kacheln antippen = Punkte für die eingestellte Person.
Eine statische Single-File-App auf GitHub Pages, Supabase als Sync-Backend,
Ende-zu-Ende-Verschlüsselung für neue und migrierte Haushalte.
Dieses Dokument ist die Abkürzung für eine neue Session (Mensch oder KI):
Architektur, alle Design-Entscheidungen MIT Begründung, und die schmerzhaft
gelernten Plattform-Eigenheiten. Stand: v4.37.1 (17.07.2026).

---

## 1. Überblick & Dateien

- **Live:** https://blauewelt.github.io/chores/ — kanonischer App-Standort.
- **Alias:** https://blauewelt.github.io/fairli/ — eigenes Repo
  `blauewelt/fairli`, NUR ein JS-Redirect (index.html + 404.html), erhält
  Pfad/Query/Hash. Geteilte Links (Einladen, Empfehlen, QR) zeigen den
  Alias (`SHARE_BASE = '/fairli/'`); interne Navigation
  (history.replaceState, location.href) bleibt IMMER auf `/chores/`
  (`BASE`/`routeUrl()`). **Haupt-Repo NIE umbenennen** — Pages leitet
  nicht um, alle installierten Icons und QR-Codes der Familien stürben.
- **Repo:** `blauewelt/chores` (öffentlich; GitHub Pages, branch `main`).
- **Kern:** `index.html` (alles: CSS, JS, Markup — Vanilla, kein Build),
  `sw.js`, `manifest.json`, `404.html` (SPA-Routing), `qrcode.min.js`,
  `updates.html` (Release-Notes für Nutzer, DE/EN), Icons (`icon-*.png`),
  `i18n/*.json` (19 Dateien + Deutsch inline = 20 Sprachen),
  `supabase/migrations/*.sql`, `LOG.md` (Changelog, Deutsch, neueste
  zuerst), `PROMPT.md` (lebende Spezifikation), dieses Dokument,
  `TESTING_TIER2.md`.
- **Versionierung:** `APP_VERSION` in index.html, sichtbar in den
  Einstellungen — Nutzer verifizieren Updates darüber.

## 2. Deploy-Disziplin (bei JEDEM Deploy, keine Ausnahme)

1. `APP_VERSION` bumpen (index.html).
2. SW-Cache-Namen bumpen (`haushalt-vNNN` in sw.js) — sonst sehen
   installierte Clients nichts Neues.
3. `LOG.md`-Eintrag (Was + Warum, deutsch).
4. Volle Testsuite lokal grün (beide Engines) — eigener Lauf, nie einem
   fremden/älteren Log vertrauen.
5. Push ATOMAR via `GH_TOKEN=… node scripts/deploy.mjs -m "msg" <dateien…>`
   (Git Data API, EIN Commit für alle Dateien). NICHT Datei-für-Datei über
   die Contents API: das erzeugt Live-Zwischenzustände (neue index.html +
   alte sw.js). `scripts/check-discipline.mjs` (CI-Job) erzwingt
   zustandsbasiert: LOG.md muss aktuelle APP_VERSION + SW-Cache nennen.
6. Nach dem Deploy den `tests`-Workflow via GitHub-API pollen (~2–3 min).

Der SW lädt die Shell mit `{cache:'reload'}` (GitHub Pages cached mit
max-age=600). Update-Mechanik: skipWaiting + clients.claim +
controllerchange-Reload; Änderungen greifen beim NÄCHSTEN App-Öffnen —
der erste Start nach einem Deploy lädt nur herunter (wichtig bei
Support-Fragen: „einmal schliessen und neu öffnen").

## 3. Datenmodell (Supabase)

Projekt `uggipomhmnnmiqpbpxcc.supabase.co`; der **Publishable Key** steht
im Client (`cfg`) — by design, öffentlich sicher.

| Tabelle | Spalten | Zweck |
|---|---|---|
| families | family_id PK, name, write_key_hash, created_at | Haushaltsname; write_key_hash = SHA-256 des Schreib-Tokens (NULL = offen) |
| members  | id, name, color, family_id, url_slug, created_at, updated_at | url_slug = persönlicher Link-Schlüssel, revozierbar |
| chores   | id, name, points, note, art, family_id, created_at, updated_at | note ≤ 60 Zeichen; art = optionaler Bild-Prompt-Override |
| log      | id, chore_id, chore_name, chore_note, member_id, member_name, points, done_at, family_id, created_at, updated_at | Verlauf = Schnappschüsse |
| retired_families | family_id PK, retired_at | Grabsteine migrierter Klartext-Familien; INSERT offen, UPDATE/DELETE per RLS verboten — endgültig |

`updated_at` wird per Trigger (`touch_updated_at`) gepflegt (chores,
members, log) — Grundlage des Delta-Syncs.

**DESIGN-PRINZIP — Verlauf ist unveränderlich gegenüber der Aufgabe:**
`log` speichert Schnappschüsse (`chore_name`, `points`, `chore_note`).
Umbenennung/Löschung der Kachel ändert den Verlauf NICHT. Der EINTRAG
selbst ist editierbar (Titel, Notiz, Zeit, Punkte — bewusste
Nutzerkorrektur, kein Automatismus). Neue Felder, die im Verlauf
erscheinen sollen → immer als eigene Snapshot-Spalte ins log.

**Punkte-Akkumulation (v4.35.0):** Ein erneuter Tipp auf dieselbe Sache
(gleiche Person, gleiche chore_id bzw. gleicher Einmalig-Name) innerhalb
1 h ADDIERT die Punkte per PATCH in die bestehende Zeile; `done_at`
bleibt der erste Tipp — das Fenster schliesst sich von selbst.
Alt-Serien (mehrzeilig) rendern weiter gebündelt (×N, Summenpunkte);
Serien enden an der Tagesgrenze. Der frühere 600-ms-Doppeltipp-SCHUTZ
ist unter dieser Semantik obsolet → `pressLock` ist nur noch ein
250-ms-Geister-Klick-Filter.

**Multi-Tenancy:** ALLES per `family_id` partitioniert. `sb()`/`upsert()`
hängen `family_id=eq.<ROWFAM>` an jede Query und injizieren `family_id`
in jeden Schreib-Body (famRows). Direkte fetches daran vorbei = verboten
(einzige dokumentierte Ausnahmen: Grabstein-INSERT unter der ALTEN ID
bei der Migration; Wegweiser-PATCH der alten Familie; Backfill des
write_key_hash — alle drei kommentiert im Code).

## 4. Schema-Änderungen (Migrationen)

SQL nach `supabase/migrations/YYYYMMDDHHMMSS_name.sql` pushen, dann
GitHub-Action **db-migrate** dispatchen (workflow_dispatch). Sie führt
ALLE Dateien per psql gegen den Session-Pooler aus (Secret
`SUPABASE_DB_PASSWORD`) — deshalb MUSS jede Migration idempotent sein
(`if not exists` / `create or replace` / `drop … if exists`). Danach per
REST verifizieren (`select=<spalte>&limit=1` → 200). Sandboxen erreichen
Port 5432 nicht; die CI schon. **Falle (v4.36.2 gelernt):** eine Spalte,
die der Client selektiert, MUSS existieren, bevor der Client deployt
wird — PostgREST antwortet sonst 400 auf den ganzen Pull.

### Optimistische Schreibungen vs. pull()

`pull()` ersetzt `state.*` durch den Serverstand — keine lokale Änderung
darf ungeschützt neben einem laufenden pull stehen:

- **`push()` zählt `mutationSeq` hoch**; ein pull, dessen mutationSeq
  sich während des Wartens geändert hat, verwirft seinen Snapshot.
- **`pendingDeletes`/`pendingCreates`** überbrücken bis zum Server-Commit.
- **Neue Schreibpfade über `deleteRemote()`/`createRemote()`/`push()`** —
  nie `sb()` direkt feuern.
- **NIE innerhalb von pull() via push() schreiben** — das entwertet den
  eigenen Snapshot (Backfill-Lektion v4.36.2). Muss pull etwas
  nachschreiben (z. B. write_key_hash-Backfill): roher Fetch NACH der
  state-Zuweisung.

### Pull-Zweigordnung (NICHT umstellen!)

Reihenfolge in pull(): (1) Ersteinrichtung, (2) Upload-Wache (nur wenn
AUCH keine families-Zeile existiert — sonst Klartext-Auferstehung),
(3) famc-Re-Probe (sessionStorage-Schleifenschutz) — DANN erst der
mutationSeq-Stale-Guard, DANN reconcile. Der Guard schützt NUR die
Zustands-Übernahme; steht er früher, hungert eine zufällige
Boot-Schreibung die Heilungszweige aus (Valentins eingefrorener
Mittwoch, v4.36.2).

### Delta-Sync (v4.36.0)

Log wird per DELTA gezogen: Wasserzeichen `haushalt.delta:<fam>` (NUR aus
Server-Zeiten — Client-Uhren lügen), Vollabgleich-Marke
`haushalt.full:<fam>`; Delta nur wenn Wasserzeichen existiert, letzter
Vollabgleich < 24 h und Log-Cache vorhanden. Query:
`or=(created_at.gt.W,updated_at.gt.W)` — sieht dank Trigger auch fremde
ÄNDERUNGEN; fremde LÖSCHUNGEN erscheinen erst beim Vollabgleich
(dokumentierte Grenze). Merge by id, pendingDeletes respektiert, Cap 400.
Spalten-Diät auf allen Queries. Ergebnis: ~10 KB statt ~125 KB pro
wiederkehrendem Start (Egress-Wand ≈ 400k Starts/Monat).

## 5. Routing & Auth (Link = Auth)

Kein Konto, kein Login. Wer den Link kennt, hat den Zugriff:

- **Familien-Link (Admin):** `/chores/f/<family_id>` — alles.
- **Persönlicher Link:** `/chores/f/<family_id>/u/<url_slug>` — ICH-BIN
  verriegelt, Aufgaben-CRUD erlaubt, Personen-Verwaltung ausgeblendet.
  Verlauf: nur EIGENE Einträge bearbeit-/löschbar (v4.38.0,
  `canEditLog()`, client-seitig — s. §12 zur Server-Grenze); fremde
  Zeilen rendern als reine Anzeige (div statt button, kein Chevron).

**SW-Registrierung IMMER absolut** (`register('/chores/sw.js')`): das
relative 'sw.js' lief nach replaceState auf f/-Tiefpfaden ins 404 und
wurde still verschluckt — Neu-Geräte seit der Pfad-Migration hatten NIE
einen SW (v4.39.1 repariert). Auf der Wurzel ohne Familie endet das
Skript vor der Registrierung (Entry-Return) — bewusst so belassen.

**Warum Pfad-URLs statt Hash:** iOS verwirft Hashes beim
Homescreen-Install. GitHub Pages kennt die Pfade nicht → `404.html`
leitet um; der SW beantwortet Navigationen auf `/chores/`,
`/chores/index.html` und `/chores/f/…` zusätzlich direkt mit der Shell —
NUR diese: echte Seiten (updates.html) müssen durchgehen (Live-Bug
v4.39.1: die breite /chores/-Regel kaperte den News-Banner).
updates.html ist im SW-Precache.

**404-Handoff ist DREIkanalig:** `?r=` (Query) UND
`sessionStorage['fairli.handoff']` UND HASH. iOS Link Tracking Protection
strippt Query-Parameter (geheime Liste), nie Fragmente. Lese-Reihenfolge:
`?r=` → voller pathname (Regex NICHT verankert; BASE wird VOR dem
`f/`-Segment abgeleitet) → Hash → sessionStorage → gespeicherte Route.
Gefundene Routen → `history.replaceState` auf die kanonische Pfadform.
Die Einstiegsseite zeigt klein «Geöffnet:»/«Von:» als Diagnose — nicht
entfernen.

**Identität ist kontextgebunden:** `LS_ME` nur im Admin-Kontext
(`haushalt.me:<fam>:admin`). Persönliche Links leiten die Person aus dem
Slug ab und schreiben NIE in den Speicher. Regel: alles pro Kontext
Verschiedene (Route, Identität) braucht kontext-spezifische Schlüssel.

**Routen-Persistenz (family-first):** getrennte Keys
`haushalt.route.family` / `haushalt.route.user`; Bare-Launch-Restore
bevorzugt FAMILY (Admin-Geräte öffnen zwischendurch persönliche Links —
das darf die installierte Admin-App nicht kapern).

### Verschlüsselung (v4.30/v4.31, GDPR)

Versions-Schnitt per Link-Präfix:
- `fam-`/`rossi-` = Klartext, für immer (Alt-Clients nicht aussperrbar).
- `famx-` = verschlüsselt ab Geburt. DB-Schlüssel =
  `'famx-'+SHA-256(Geheimnis)[:48]`.
- `famc-` = migrierte Alt-Familie: GLEICHE URL, Zeilen unter
  `'famc-'+SHA-256(alte ID)[:48]` — Links und Icons bleiben gültig.

Werte AES-GCM-256 (HKDF aus dem Link-Geheimnis, salt `fairli-v1`, info
`data-key`), Format `'enc1:'+b64(iv|ct)`. `ENC_FIELDS` definiert die
Feldmenge: families.name, members.name, chores.name/note/art,
log.chore_name/chore_note/member_name. Klartext-Metadaten: Punkte,
Zeiten, IDs, url_slug, Farben. Integration NUR in `sb()`/`upsert()`
(encrypt write, decrypt read) — jeder neue Netzpfad MUSS durch diese
zwei Funktionen. ORDER BY auf ENC_FIELDS ist sinnlos (Chiffrat-Ordnung)
→ Ordnung clientseitig nach dem Entschlüsseln (members: localeCompare).

IS_ENC-Erkennung: `haushalt.encv:<fam>` → sonst famc-Probe gegen den
Server (Ergebnis gecacht; Re-Probe-Zweig in pull() heilt veraltete
'0'-Caches). `runMigration`: Backup-Download → verschlüsselte Kopie →
VERIFIKATION → erst dann Delete der Klartext-Zeilen; alte families.name
wird Wegweiser («App aktualisieren»); Grabstein in retired_families
(alte Klartext-ID) blockt jede Klartext-Wiederauferstehung serverseitig.

### Schreib-Auth (v4.36.0)

`WRITEKEY` = eigener HKDF-Ast (info `write-key-v1`) — geht als Header
`x-fairli-key` auf jedem Schreibzugriff mit; das Link-Geheimnis ist
daraus NICHT rückgewinnbar. DB speichert nur SHA-256
(families.write_key_hash); restriktive RLS-Policies
(`fairli_write_ok()`) auf members/chores/log (ins/upd/del) und families
(upd/del). Hash NULL = offen (Alt-Familien, Erst-Upload). Hash wird
gesetzt: famx-Ersteinrichtung, famc-Migration, Backfill in pull().
Live-verifiziert: ohne Key 401, mit Key 201.

## 6. Installation / Homescreen — die Plattform-Matrix

Das grösste Minenfeld des Projekts. Kernerkenntnisse (real erlebt):

1. **iOS liest `start_url` aus dem Manifest, NICHT die Seiten-URL.**
   Dynamische/Blob-Manifeste werden ignoriert (zweimal verworfen).
2. **Ohne Manifest nutzt der iOS Web Clip garantiert die aktuelle URL.**
   **Manifest NUR per JS-Injektion, nie statisch:** WebKit registriert
   ein statisches `<link rel="manifest">` beim PARSEN; JS-Entfernen ist
   kosmetisch. Injektion nur wenn `!IS_IOS && !USER_SLUG`
   (Android-Familienkontext). iPadOS-Erkennung: `MacIntel` +
   `maxTouchPoints > 1`. Standalone/Name/Icon via klassische Metas.
3. **Chrome auf iOS ist OK** (seit iOS 16.4 dasselbe System-Share-Sheet;
   `IS_IOS` matcht auch CriOS). Fairlis eigene Knöpfe heissen «Einladen»/
   «Empfehlen» — «Teilen» ist exklusiv Apples Share-Sheet-Wortlaut.
4. **Persönliche Links bekommen auf KEINER Plattform ein Manifest** —
   Android-Personen-Shortcuts öffnen im Browser-Tab (akzeptierter
   Trade-off), iPhone-Personen-Installs sind Vollbild (Metas).
5. **Alle Head-Links absolut** (`/chores/…`) — relative hrefs lösen auf
   Deep-Paths falsch auf.
6. Android cached WebAPK-Icons aggressiv: Icon-Wechsel = Cache-Buster
   `?v=NN` bumpen UND Nutzer müssen Remove+Re-Add des Homescreen-Icons.
7. `404.html` trägt denselben PWA-Head — sonst erwischt iOS beim Install
   leere Metadaten.

**Ist-Matrix:** iPhone Familie ✓ Vollbild · iPhone Person ✓ Vollbild ·
Android Familie ✓ WebAPK · Android Person ✓ korrekt, aber Browser-Tab.

**Option D (für später):** Cloudflare Pages + privates Repo +
Edge-Function für per-Person-Manifeste. Vorher eigene Domain festlegen.

## 7. Flicker-Regeln (erster Paint)

**Grundregel: nichts darf im Markup stehen, was JS gleich ersetzt.**

- Keine render-blockierenden externen Skripte vor dem Haupt-Skript
  (`qrcode.min.js` ist `defer` → nur im Klick-Pfad benutzen).
- `html.booting` synchron im `<head>`, von `render()` entfernt; CSS
  blendet JS-gefüllte Elemente aus, mit reservierter Höhe.
- `<h1 id="famTitle">` ist im Markup LEER; Inline-Skript setzt den Namen
  SYNCHRON aus localStorage. Nie einen Default-Namen ins Markup.
- Persönliche Links: Inline-Skript setzt `html.userlink` VOR dem ersten
  Paint (aus URL oder gespeicherter Route); CSS versteckt Admin-Elemente
  mit `!important`. Neue Admin-only-Elemente in DIESE Regel aufnehmen.
- **Boot-Splash (v4.39.0):** statisches #splash-Overlay nach <body>
  deckt den gesamten Boot ab und morpht dann per FLIP aufs #headLogo.
  `html.splash` kommt SYNCHRON im Head-Inline (Logo nie vorab sichtbar);
  Overlay IMMER pointer-events:none; Timeouts statt transitionend (die
  globale reduced-motion-Regel unterdrückt Transitions).
- **REGEL (19.07.2026, Maintainer): jede Änderung am Kunst-Prompt wird
  mit einem VORHER/NACHHER-Vergleichsblatt belegt** — dieselben Kacheln,
  derselbe Seed, Varianten nebeneinander als Bild, vom Menschen
  beurteilt. Prompt-Qualität lässt sich nicht aus dem Code ableiten;
  «klingt besser» ist kein Nachweis. Skript-Muster: URLs bauen, Bilder
  holen, mit PIL zu einem beschrifteten Blatt montieren, präsentieren.
- `c.art` = **Bild-Idee**, seit v4.53.0 im Bearbeiten-Sheet sichtbar
  (#cArt). Gesetzt: sie ist der ganze Prompt und erscheint NIE im
  sichtbaren Text (Kachel/Verlauf zeigen Name+Notiz). Englische
  Beschreibungen treffen deutlich besser als deutsche Verbphrasen.
- Kachel-Kunst-Prompt = `c.art || name + ', ' + note` (v4.46.2 — die
  Notiz erzaehlt dem Modell mehr; ein Custom-art gewinnt allein).
- Kachel-Kunst flackert nie: `ARTOK`-Set merkt geladene Bild-URLs; beim
  Re-Render starten bekannte Bilder direkt mit `.ok` (kein Fade), neue
  laden hinter einem Schimmer-Skeleton (`prefers-reduced-motion`
  respektiert).

## 8. UI-Konventionen & Entscheidungen

### Sheet-System — beim Bauen neuer Sheets einhalten
Alle dialog-Sheets sliden via CSS von unten herein (dialog[open] →
@keyframes sheetIn, v4.42.1) und lassen sich RUNTERWISCHEN (v4.42.2,
zentral in enableBackdropClose: mitziehender Finger, Schliess-Schwelle
120 px oder zuegig >40 px; dirty-Guards blocken den Swipe wie den
Backdrop-Tipp; Swipe greift nur bei scrollTop 0 + Abwaertszug). Beides
gilt automatisch fuer neue Sheets — Bedingung: enableBackdropClose
aufrufen (das Share-Sheet hatte das bis v4.42.2 vergessen). Toasts:
Runterwischen verwirft. Schliessen per Button bleibt sofort.
Anatomie: `Grabber · Kopf (.slot · zentrierter <h2> · .slot.end) · Body ·
EIN .btn.primary.wide UNTEN`. `.slot`s fest 84px. **`×` schliesst IMMER,
oben rechts, nie destruktiv.** Formular-Sheets (bestätigen): Löschen rot
LINKS oben, Speichern unten, Backdrop-Tipp ignoriert solange dirty.
Utility-Sheets (live gespeichert): Fertig unten. Listeneinträge löschen
nur übers `⋯`-Kebab-Menü. Textfelder in Dialogen selektieren beim Fokus
(Wert-Check im rAF).

### Kopfbereich
Flex-Row, NICHT sticky — der Kopf scrollt normal aus dem Bild, nur die
Tabs kleben (v4.42.0; die Schrumpf-Mechanik — erst binaer, dann
scroll-interpoliert — ist KOMPLETT entfernt: wenige Pixel Nutzen, viele
Probleme, u. a. klappten mehrzeilige Titel beim Kleinerwerden einzeilig
um. NICHT wieder einfuehren; der Scroll-Test wacht darueber). `.hrow` koppelt #headLogo + h1 in EINE Zeile
(align-items:center) — das Logo zentriert sich gegen die TITELZEILE,
nie gegen die Button-Hoehe (v4.39.2; vorher sass es im Slim-Zustand
sichtbar zu tief). #headLogo: App-Icon, Grösse = `--titlefs` wie die
Titelschrift («so gross wie das R»), Slim 19px, KEIN Admin-Element,
Landeziel des Boot-Splashs (s. §7). Titel `flex:1; min-width:0`,
`font-size:var(--titlefs)`, Slim OHNE Margins; neue Header-Elemente in
`.headbtns`. `--titlefs` setzt __setFamTitle am #apphead (Längenstufen
>14/>22 Zeichen → Titel UND Logo schrumpfen gemeinsam). Braucht der
Titel neben den Buttons mehr als 2 Clamp-Zeilen → `.wide` (v4.40.0):
Titelzeile volle Breite, Buttons eigene Zeile rechts. __updateWide misst
IMMER im geteilten Layout (deterministisch, kein Oszillieren), Epsilon =
halbe Zeilenhöhe; Trigger: __setFamTitle, Resize, Slim-Umschalten.
Locale-/breitenabhängig: auf iPhone-Breite mit de-Buttons geht fast
jeder Name korrekt wide — kein Bug. Die Tabs kleben bei top:0 mit DECKENDEM
Hintergrund plus ::after-Auslauf (14 px var(--bg) → transparent), damit
Kacheln unter der Leiste ausblenden statt in die Pills zu laufen
(v4.42.0). __updateWide laeuft bei Resize und Titelwechsel
(__afterTitle). Unter dem Kopf: `#installBar` (dismissbar, kontext-spezifischer
Schlüssel) und `#newsBar` («Was ist neu» — seit v4.43.1 INHALTS-verankert:
`NEWS_VERSION` = bis wohin updates.html berichtet; wer diesen Stand
gesehen hat, wird nie wieder gepingt, Releases sind egal. PFLICHT:
updates.html erweitern ⇒ NEWS_VERSION im SELBEN Commit bumpen — der
Banner-Test wacht, dass sie nie vor dem Berichtstand liegt. Erstkontakt
setzt die Marke still; Link → updates.html, × und Klick markieren
gesehen).

### Kacheln & Grid
Stift-Semantik (v4.47.3/4): das ✎ existiert NUR dort, wo die umgebende
Fläche eine ANDERE Bedeutung trägt — also ausschliesslich auf den
Kacheln (Kachel = verbuchen, ✎ = bearbeiten). Überall sonst: ganze
Fläche = eine Bedeutung, kein Symbol. In Sheets sind Felder normale,
direkt editierbare Inputs — ohne Fokus beim Öffnen springt auch keine
Tastatur auf; KEINE Statisch-Text-Konstruktionen bauen.
- Einmalig-Kachel IMMER erstes Grid-Element (gestrichelt, Sternschnuppe).
  Alles Verbuchen läuft durch `recordEntry(choreLike)`; chore_id darf
  null sein.
- EIN Formular-Sheet, drei Modi: Neu (Primär «Speichern + eintragen»,
  Ghost «Nur speichern»), Bearbeiten, Einmalig. Der FAB ist
  kontextsensitiv: in der Verlauf-Ansicht öffnet er Einmalig.
- **Sortierung:** `sortedChores()` ist die EINZIGE Ordnungsquelle.
  LS `haushalt.sort` = created (Standard — stabile Positionen) | alpha |
  usage. Neue Kacheln erscheinen an ihrem Sortier-Platz; die App scrollt
  hin + Flash (kein Pinning mehr).
- **Max. Punkte:** LS `haushalt.maxpts` = 3|5|10 (Standard 5); die
  Slider-Skala weicht beim Bearbeiten nie unter den Bestandswert.
  Mehrfach-Tippen addiert — Skala ist keine harte Grenze (Hinweis im
  Sheet).
- **Duplikat-Hinweis** am cName-Input (nur Anlege-Modus): «gibt es
  schon» + Aktion «Stattdessen verbuchen».
- Kachelhöhe `104 + 34*log2(points+1)`; Notiz ≤ 60 Zeichen (.cnote).
- Löschen ist NIE die Default-Aktion.

### Verlauf & Punkte
Tages-Köpfe (Heute/Gestern/lokalisiertes Datum), Zeilen zeigen nur die
Zeit. Einträge sind Buttons (ganze Zeile tappbar = Bearbeiten, OHNE
Symbol — v4.47.4; gesperrte Zeilen sind DIVs) → #logSheet: Titel, Punkte, Notiz, Zeit —
GLEICHE Feldordnung und -elemente wie das Aufgaben-Sheet. Punkte (nur
Einzelzeilen) sind seit v4.38.0 derselbe ptsrow+range-Slider wie beim
Anlegen; EINE Mechanik `syncPtsRange(sl, out, v)` für cPts UND lPts
(setPtsSlider delegiert), Skala max(MAXPTS, Bestand). Zeit:
datetime-local, dunkel gestylt; Serien verschieben sich um EIN Delta.
Rechte: am persönlichen Link nur eigene Einträge (canEditLog);
openLogSheet hat eine Defense-in-Depth-Wache mit Toast. Verlauf-Löschen = verzögerter Commit
(lokal sofort, Server-DELETE nach dem 5-s-Undo-Fenster; NIE
DELETE+Re-INSERT). Löschungen sind VERIFIZIERT: `deleteRemote(table, id,
onFail)` — 1 Retry, dann Wiederherstellung + ehrlicher Toast
(err.silent-Konvention gegen Doppel-Toasts). Punkte-Ansicht: Balken,
Krone, Zähler. **NIE eine Variable `t` nennen** (schattet i18n; Live-Bug
Punkte-Tab leer).

### Admin-Modell (v4.55.0)
`members.admin`. **Alle** Rechte-Fragen laufen über `isAdmin()` —
niemals über `USER_SLUG` (das ist nur die IDENTITÄT). Der blanke
Familien-Link gilt weiter als namenloser Admin (Bestandsschutz), wird
aber nicht mehr angeboten. Invarianten: mindestens ein Admin;
Nicht-Admins dürfen den Schalter nicht bedienen, aber Links teilen.
Neue Haushalte: erste Person = Admin.

### Wer hat verbucht (v4.54.0)
`log.logged_by` = Mitglieds-ID des LINKS (slugSelf()), NULL am
Familien-Link. Nur Kontext im Detail-Sheet, nie in der Liste. Beim
Zusammenlegen (<1 h) bleibt der erste Verbucher stehen.

### Aufbewahrung (v4.52.0)
`families.retention_days` (NULL = unbegrenzt, Standard). `purgeExpired()`
läuft NUR am Admin-Link und NUR über `deleteRemote`, ausschliesslich auf
`log`. Einstellung ist admin-only; Aktivierung verlangt eine
Bestätigung, die die betroffene Anzahl nennt. Beim Erweitern gilt:
NIEMALS auf chores/members/families ausweiten — der Test prüft genau
das.

### Suche (v4.50.0, Auto-Aktivierung v4.51.0)
Ab mehr als `SEARCH_AUTO_AT` (7) Kacheln schaltet `maybeAutoSearch()`
die Suche einmalig ein — aber NUR, wenn der LS-Schlüssel fehlt (die
Person hat nie selbst entschieden). Eine bewusste Abschaltung schreibt
'0' und ist damit endgültig; Automatik überstimmt Menschen nicht.
Schalter `SEARCH_ON` (localStorage, Default AUS), Eingabe in `QUERY`.
Gefiltert wird beim Rendern: Aufgaben über `matches(name, note)`, Log
über `matches(chore_name, chore_note, member_name)`. `norm()` ist
diakritik-blind (NFD + Marks weg, ß→ss). WICHTIG: die Leiste steht im
statischen Markup AUSSERHALB von `#list` — sonst frisst render() bei
jedem Tastendruck den Fokus.

### Betreute Mitglieder (v4.49.0)
`members.assisted` markiert Personen ohne eigenes Telefon. Zentrale
Helfer: `slugSelf()` = Identität des LINKS (Einstellungen, Mein Name —
NIE die Chip-Auswahl verwenden!), `allowedIds()` = selbst + betreute
(Chips, Chip-Klick, canEditLog, Pull-Rückzug). Wer eine neue
Rechte-Frage stellt, fragt allowedIds() — nicht `me === x`.

### Mein Name (v4.46.0)
Einstellungen → 👤 «Mein Name», NUR am persönlichen Link (Admin nutzt
die Personen-Verwaltung). openMyNameSheet: lokal sofort, Server
`sb('members?id=eq.me','PATCH',{name})`. Verlauf bleibt historisch.
MERKE: ALLE Edit-Schreibpfade IMMER über upsertRemote()
(Personen v4.46.1, Aufgaben-Edit v4.47.1 — der ungeschützte
push(PATCH) verliert das Race gegen pull; Neu-Anlage/Löschung über
createRemote/deleteRemote). Historisch zu Personen (v4.46.1:
Pull-Schutz via pendingCreates-OVERLAY — reconcile ersetzt damit auch
veraltete Serverfassungen editierter Zeilen; bare upsert()/sb()-PATCH
verliert das Race gegen pull). Historie: der Roh-Fetch — in finishMembers umging encRow und x-fairli-key (v4.46.0
behoben); der famx-Klartext-Test deckt den Personen-Upsert bislang
NICHT ab (offen, §12).

### Haushalt umbenennen (v4.41.0)
Einstellungen → 🏠 Haushaltsname, NUR am Familien-Link (persönliche
Links: Zeile fehlt). openRenameSheet: lokal sofort (state/save/
__setFamTitle), Server `sb('families','PATCH',{name})` — famScope zielt
auf die Zeile, ENC_FIELDS.families verschlüsselt bei famc/famx
automatisch. PATCH-Fehler → Toast; der nächste Pull stellt dann den
Servernamen wieder her (bewusst simpel, kein Offline-Queue).

### Personen-Chips
Alphabetisch (localeCompare, nach Entschlüsselung). Mehrzeilig →
zentriert (.multi via rAF-scrollHeight-Check); Umbruch-Ausgleich: steht
unten genau EIN Chip und die Zeile darüber hat ≥3, wird ein
flex-basis:100%-Umbruch gesetzt → nie jemand allein («two people, or 0»).

### Tastatur (Android)
`interactive-widget=resizes-content` im Viewport-Meta + `.sheet
{max-height:100dvh; overflow-y:auto}` — die Tastatur verdeckt keine
Knöpfe mehr.

### Onboarding «Zugriff sichern» (v4.45.0)
#onboardSheet ist Schritt 1 für JEDEN Erstbesuch: Ersteller nach dem
Setup (→ «Weiter: Mitglieder einladen» → Einladen-Sheet als Schritt 2),
Link-Empfänger via maybeOnboard() nach dem ersten Render. Marke
`haushalt.onboard:FAMILIE:a|u`; Wächter: Standalone, firstRunOpen,
offene Dialoge, NUR famName als «Familie steht»-Signal. Der 📲-Banner
feuert das native Prompt DIREKT wenn verfügbar (nativ-zuerst), sonst
Anleitungen — und SCHWEIGT, solange #onboardSheet offen ist (v4.45.1,
keine Doppel-Botschaft; close ruft initInstallBar() für die sofortige
Dauer-Erinnerung). Tests laufen als Wiederkehrer-Persona (mockBackend setzt
die Marke; Onboarding-Tests schalten sie via
sessionStorage fairli.obPersona.off ab) — beim Schreiben neuer
Onboarding-Tests dieses Muster nutzen.

### Einladen & Sprache
Die Familien-Zeile (ERSTE im Sheet) heisst «Admin-Link» mit Subnote
«Gibt vollen Zugriff auf alle Mitglieder und ihre Aktivitäten» und
trägt die .savenote-Warnung «diesen Link sichern … sonst Zugriff weg»
(v4.44.0) — mit «Zum Home-Bildschirm hinzufügen»-Button, wenn
deferredInstall (beforeinstallprompt) verfügbar ist; sonst greifen die
Anleitungen darunter. WICHTIG (v4.44.1): Chrome feuert das Prompt oft
erst Sekunden nach dem Laden — der BIP-Listener rüstet darum OFFENE
Sheets nach (Install-Sheet re-rendert, Einladen-Sheet bekommt den
Button injiziert). Bei bereits installierter PWA feuert Chrome NIE —
kein Button ist dort korrekt. Der 📲-Banner (#installBar) erscheint in
JEDEM Nicht-Standalone-Kontext, auch für Empfänger persönlicher Links
(Dismissal-Schlüssel pro Familie+Rolle). Die persönlichen Links tragen die Erklärung
«Damit loggt jede Person ihre Aufgaben — ohne Admin-Zugriff». Der
Empfehlen-Knopf ist NICHT mehr ghost-gedaempft und seine Subnote fuehrt
mit «Für Freunde: …» (v4.43.0 — verhindert, dass der Admin-Link als
Empfehlung geteilt wird). Diese Unterscheidung beim Umbauen erhalten.
Einladen-Sheet (Admin): Familie oben (Link, QR, Install-Hinweis), dann
persönliche Links, unten «Empfehlen». Mitglieder-Variante zeigt die
persönlichen Links ALLER (Lektion: wer Optionen versteckt, lenkt auf die
falsche). QR-Captions benennen, was sie öffnen; `.shqr[hidden]
{display:none}` nicht entfernen. Alle geteilten Links über
`shareRouteUrl()`/`appLink()` = fairli-Alias. Das Sheet ist seit
v4.38.0 VOLLSTÄNDIG über t() übersetzt (Titel, Knöpfe, Familie-Block,
QR-Aria/Alt, Share-Texte) — der EN-Test «kein deutsches Leck» wacht
darüber; neue Sheet-Strings IMMER durch t() führen. Der Familien-Knopf
trägt bewusst KEIN data-name (leerer nm = Familien-Zweig in shareLink).
Sprache: Deutsch,
Schweiz-freundlich; App heisst «Fairli». Farben: `--accent #84B2FF`,
Navy-Neutrals, immer CSS-Variablen.

### Internationalisierung (20 Sprachen)
Audit-Einzeiler (t()-Schlüssel vs. Wörterbücher) bei größeren
UI-Runden laufen lassen — die Migrations-Lücke (v4.45.2) blieb Monate
unbemerkt, weil t() still auf Deutsch zurückfällt.
Deutsch = Quellsprache = Schlüssel (gettext-Muster): `t('Speichern')`,
Fallback Deutsch. Wörterbücher `i18n/<code>.json`; nur die aktive
Sprache wird geladen (localStorage-Kopie für Offline). Statik via
`data-i18n`/translatePage(), Dynamik via t(). **Schlüssel-Parität ist
Gesetz** — jeder neue Schlüssel × 19 Dateien; der Integritäts-Test
erzwingt gleiche Schlüssel, identische Platzhalter, nie leer. Deutsche
Quellstrings als API behandeln (Umformulieren verwaist Übersetzungen).
Neue Sprache: JSON anlegen, LANGS + LOCALES + sw-Precache ergänzen.
Tests laufen mit locale de-CH (gepinnt). Wachstumspfad falls je extern
übersetzt: abstrakte Schlüssel, nicht Englisch-als-Schlüssel.

## 9. KI-Kachelbilder & Icons

`choreArt()` baut Pollinations-URLs (`gen.pollinations.ai/image/…`,
`model=flux`, deterministischer numerischer Seed aus der Chore-ID —
Pollinations lehnt NaN mit 400 ab). Prompt = `(c.art || c.name) +
', minimalist flat vector illustration, single subject, centered, dark
moody background, vibrant accent color, no text, no words'` — KEIN
«household chore»-Rahmen (überschrieb das Motiv). Der `pk_`-Key ist
client-safe, aber REFERRER-LOCKED auf blauewelt.github.io —
Server-seitige Fetches brauchen den Referer-Header (z. B. via
Playwright-Request-Context); Rate-Limits → Backoff zwischen Requests.
Fehlerpfad: `artRetry` mit 3 Backoff-Versuchen (Pollinations drosselt
bei Massen-Repaints).

**App-Icon (seit v4.36.3):** vier abgerundete Farb-Kacheln auf dunklem
Grund — wie das Aufgaben-Board. icon-192/512/512-maskable (maskable:
Motiv in der Safe-Zone). Icon-Wechsel: alle drei PNGs ersetzen +
Cache-Buster `?v=NN` in index.html, 404.html UND manifest.json + SW-Bump.
iOS/Android übernehmen neue Icons erst nach Entfernen + Neu-Hinzufügen
des Homescreen-Icons (Launcher-Cache).

**Bekannte Offenlegung bei verschlüsselten Familien:** Kachel-Namen
gehen als Bild-Prompts an Pollinations (dokumentiert; Privacy-Schalter
ist ein offener Punkt, §12).

## 10. Automatisierte Tests (Tier 1)

**Stand v4.37.0: 97 Tests, grün auf Chromium (Pixel 7) und WebKit
(iPhone 14).** Playwright gegen einen lokalen Pages-Mimic-Server
(`tests/pages-server.mjs`: `/chores/`, unbekannte Pfade → 404 MIT
404.html-Body). Supabase komplett gemockt (`mockBackend(context, …)`);
Fonts/Pollinations geblockt — Bespoke-Tests mit eigenem Routing MÜSSEN
externe Hosts ebenfalls abbrechen (webkit hängt sonst am reload).
SW in Tests geblockt (Determinismus). CI bei jedem Push (`tests.yml`)
+ discipline-Job.

**Regeln (jede aus einem echten Bug geboren):**
- Jeder Test referenziert den Bug/das Feature in der Beschreibung.
  Neue Bugs → erst Regressionstest, dann Fix. Feld-Befunde ohne geklärte
  Ursache werden trotzdem als Test festgehalten.
- **Jede Ansicht braucht mindestens einen Render-Test** (der Punkte-Tab
  hatte keinen — Bruch blieb einen Tag unbemerkt).
- **Gegenprobe bei neuen Guards:** Guard temporär entfernen → Test muss
  rot werden (sonst testet er nichts).
- **Eigener Bestätigungslauf vor jedem Deploy** — fremden/älteren Logs
  (auch eigenen aus Phantom-Zuständen der Sandbox) nie vertrauen.
- Mocks modellieren einen KONSISTENTEN Server (nach DELETE liefert GET
  die Zeile nicht mehr; merge-duplicates nachbilden; family_id-Filter
  respektieren — famc-Probe!). Races mit VERZÖGERTEM DELETE testen.
- Playwright-Fallen: `?` in Routen-Patterns ist Wildcard (`log**` +
  Methoden-Check); `waitForURL` auf dieselbe URL löst sofort aus (auf
  Statustext warten); initScripts laufen auch nach app-eigenen
  location.reload()s → sessionStorage-Einmal-Guard, wenn sie
  localStorage präparieren; Serien-/Buendel-Fixtures SEEDEN statt tippen
  (Tipp-Folgen akkumulieren seit v4.35); Tages-Bündelung trennt nur an
  Tagesgrenzen — Fixtures entsprechend datieren.
- **Quelltext-Edits nur an verifizierten Statement-Grenzen** — nie
  Zeilen-Regex über Template-Literals (hat zweimal Massen-Rot erzeugt
  und einmal einen Zweig-Körper in einen Kommentar gefressen).

**Tier 2** (nightly, Emulatoren): iOS-Simulator openurl/Install/
Stale-Icon-Falle, Android Chrome/WebAPK — Details in `TESTING_TIER2.md`.
**Tier 2b** (vor Produktion): BrowserStack-Echtgeräte. **Tier 3:**
Kamera-Scan bleibt untestbar; QR-Byte-Exaktheit ist bewiesen.

### Emulator-Funktionscheck pro Deploy (Pflicht, 18.07.2026)
Vor dem Abschluss jedes Deploys: das gebaute Feature im Emulator IM
REALISTISCHEN NUTZERZUSTAND durchspielen (z. B. seenver-Marke wie auf
den Familien-Geräten, Onboarding gesehen, echte Klickpfade) — nicht
nur die synthetischen Testbedingungen der Suite. Der erste Einsatz
fand sofort zwei Fehlerklassen: NEWS_VERSION unter bereits gesehenen
Marken (zündet nie) und einen Mock-Teilstring-Fehler
(retired_families enthält 'families' — Reihenfolge der URL-Prüfung!).
NEWS_VERSION-Regel: IMMER = Version des Recap-Releases selbst.

### Suite-Ausgabe & Selbst-Router (Pflicht)
Suite-Ergebnisse NIE mit tail-N kuerzen — «X failed» steht OBERHALB der
«passed»-Zeile und faellt sonst weg (so blieben zwei echte Bruecke
unbemerkt, v4.46.2). Muster: `grep -E "failed|skipped|passed"` auf die
letzte Zusammenfassung. Tests mit EIGENEN Routen (ohne mockBackend)
brauchen `await suppressOnboarding(context)` — sonst blockiert das
Onboarding-Modal (v4.45.0) ihre Klicks.

### Service-Worker-Tests
Die Config blockt SWs global (`serviceWorkers:'block'`, Determinismus).
EINE Ausnahme: describe «Service Worker (echt)» mit
`test.use({ serviceWorkers: 'allow' })`, Chromium-only. Netz bleibt
hermetisch: SW-eigene Fetches gehen an den Pages-Mimic (context.route
sieht sie nicht — kein Supabase-Risiko: dessen Calls stellt der SW nie
selbst, sie laufen weiter durch die Mocks). Neue SW-Verhaltenstests NUR
in dieses describe.

## 11. Secrets & Arbeitsweise (für KI-Sessions)

### GRUNDREGEL: Keine sensiblen Informationen im Repo (Standing Rule, 18.07.2026)
Weder App-Quellcode noch Tests noch Dokumentation dürfen sensible
Informationen enthalten: keine echten Namen, Adressen, Orte, Anekdoten
mit Personenbezug, keine Familien-Link-IDs (das sind Zugangs-URLs!),
keine Secrets. Fixtures sind IMMER fiktiv; Vorfälle werden ohne Namen
dokumentiert («ein Mitglied», «der Maintainer»). Hintergrund: das Repo
ist weltlesbar (GitHub Pages), fühlte sich aber jahrelang privat an —
so landeten Roster, Anekdoten und sogar die echte Familien-ID
öffentlich (Audit + Rotation 17./18.07.). Die gehashte
Anonymisierungs-Wache in check-discipline erzwingt diese Regel;
sie ist Netz, nicht Ersatz fürs Mitdenken.

### Visuelle Abnahme VOR jedem UI-Deploy (Pflicht, 17.07.2026)
Geänderte Screens/Zustände in BEIDEN Geräte-Projekten über den
Pages-Mimic rendern (echte Fonts, NICHT das Test-Harness mit
Font-Block) und die Screenshots ANSCHAUEN — auch die Rand-Zustände:
langer Name, gescrollt, wide, leere Daten, de UND en. Dabei zwei
Fragen stellen: (1) Sieht es aus wie beabsichtigt? (2) Was VERSPRICHT
die UI — und hält sie es? (Grabber → wischbar, Chevron → führt wohin,
Pencil → editierbar, …). Lehren des Tages: Swipe-Lücke, Tabs-
Transparenz und Titel-Umbruch beim Schrumpfen waren alle in Screenshots
sichtbar bzw. als gebrochene Affordanz erkennbar. Grenze: Scroll- und
Animations-GEFÜHL zeigen Screenshots nicht — das bleibt Geräte-Test
(Tier 2 / Maintainer).

**Stehende Anweisungen (Maintainer):**
- Am Ende JEDER Arbeitsrunde dieses Dokument (und TESTING_TIER2.md wo
  relevant) aktualisieren — die Doku ist die Übergabe an die nächste
  Session; veraltete Aussagen sind schlimmer als fehlende.
- **Ersetzter-Link-Hinweis** (v4.47.0): Boot prüft retired_families
  (Klartext-ID + Zeilen-Scope) → klebriger Vollbild-Hinweis. Beim
  Tombstonen IMMER BEIDE IDs eintragen.
- **Repro gegen Produktion**: im Sandbox-Browser ignoreHTTPSErrors
  setzen (Egress-Proxy-MITM) — sonst sind «Befunde» nur Artefakte.
- **Link-Rotation** (18.07.): der Haushalt läuft auf einem neuen
  famx-Geheimnis; der Alt-Link ist exponiert und wird nach
  Geräte-Verifikation tombstoned. Bis dahin ZWEI parallele Bestände —
  Schreibungen am Alt-Link landen NICHT im Neu-Bestand (bewusst; kurze
  Übergangsphase). Rotations-Skripte liegen AUSSERHALB des Repos.
- **Anonymisierungs-Wache** (v4.46.3, seit 18.07. gehasht — kennt
  Tokens nur als SHA-256, prüft sich selbst): check-discipline bricht bei
  Personenbezug/Link-ID-Mustern ab. Neue Test-Artefakt-IDs kurz halten
  (<10 Zeichen nach dem Präfix) oder in die ALLOW-Liste. Die
  Ersetzungstabelle war LÄNGEN-EXAKT — bei neuen Fixture-Namen Längen
  beibehalten (Chip-Wrap-/Wide-Tests messen Pixel).
- **NIEMALS Nutzerdaten löschen** (Haushalte, Mitglieder, Logs) — auch
  versehentlich entstandene nicht (12.07.2026; die konkrete ID der
  bekannten Streuner-Familie steht im PRIVATEN Notizzettel des
  Maintainers, NIE im Repo — Familien-IDs sind Zugangs-URLs). Eigene
  Test-/Probe-Zeilen (z. B. `lock-probe1`, `famx-authselftest01`) sind
  KEINE Nutzerdaten und werden sofort aufgeräumt.

- In Chats geteilte Credentials gelten als exponiert → nach der Session
  rotieren. PAT fein granuliert (chores + fairli), kurze Laufzeit,
  Passwort-Manager. Pollinations: nur `pk_` in den Client.
- Sandboxen: nur HTTP(S)-Egress. Git via deploy.mjs (Data API), DB-DDL
  via db-migrate-Action. JS vor dem Push mit `new Function(<IIFE-Body>)`
  syntax-checken. Sandbox-Verzeichnisse können Phantom-Zustände
  abgebrochener Turns enthalten → Remote ist die Wahrheit: Version
  prüfen, frisch fetchen, eigenen Testlauf machen.
- Bei Plattform-Verhalten (v. a. iOS-PWA) erst recherchieren, dann
  bauen; wenn zwei Lösungen existieren, gewinnt die deterministische.
  Ground Truth schlägt Inferenz — wechselnde Theorien bei gleichem
  Symptom sind Erzählung, nicht Debugging.

## 12. Bekannte offene Punkte / Vertagt

- **Pro-Mitglied-Rechte serverseitig:** die v4.38.0-Rechte sind
  client-seitig. Alle Link-Inhaber (auch persönliche — der Familien-Teil
  steckt in ihrer URL) teilen denselben Familien-Write-Key; echte
  Durchsetzung bräuchte Pro-Mitglied-Schlüssel (HKDF je Slug) +
  RLS-Prüfung member_id↔Key. Größerer Umbau, bewusst vertagt — das
  Bedrohungsmodell sind Familienmitglieder, keine Angreifer.
- **famx-Klartext-Test erweitern:** der «sendet NIE Klartext»-Test
  exerziert den Personen-Upsert (finishMembers) nicht — genau dort sass
  das v4.46.0-Leck. Test um eine Personen-Änderung ergänzen.
- ~~Fanti write_key_hash~~ seit der Link-Rotation (18.07.) erledigt —
  die famx-Familie trägt den Hash ab Geburt. Historischer Punkt:
  eines Fanti-Geräts (SW-Staging). Danach live verifizieren; bis dahin
  ist die Familie verschlüsselt, aber schreib-offen.
- **mutationSeq-Boot-Verursacher** (v4.36.2 beobachtet): irgendetwas
  pusht während des Boot-Pulls; durch die Zweig-Neuordnung unschädlich,
  Verursacher unidentifiziert.
- **Kunst-Privacy-Schalter** für verschlüsselte Familien (Pollinations
  sieht Kachel-Namen als Prompts).
- **Nudge für Alt-Familien-Admins** zur Verschlüsselungs-Migration
  (gutgeheissen, nie beauftragt).
- **TTL für inaktive FAMILIEN** (ganze Haushalte, nicht Einträge):
  weiterhin offen — v4.52.0 deckt nur den Verlauf ab.
- **Custom Domain** (fairli.app/ch) + Option D (Cloudflare, private
  Repos, per-Person-Manifeste) — vor jeder URL-Migration Domain fixieren.
- Android-Personen-Shortcuts = Browser-Tab (akzeptiert; echter Fix =
  Option D). iOS-Standalone kann Storage bei Platzdruck leeren →
  Entry-Screen + QR-Codes sind der Rettungsanker.
- Arabisch/RTL nicht unterstützt (LTR-Layout-Annahmen).
- Fremde Löschungen erscheinen erst beim 24-h-Vollabgleich (Delta-Grenze,
  dokumentiert; bei Beschwerden: App neu öffnen erzwingt keinen
  Vollabgleich — erst nach Ablauf der Marke).
- Verlauf-Einträge vor v4.11.1 ohne note-Snapshot (gewollt).
- Chrome-auf-iOS-Install: nur per Echtgerät final verifizierbar
  (Simulator-Wege erschöpfend geprüft und nicht machbar).
