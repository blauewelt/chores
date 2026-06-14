# LOG.md — Change history

All work on the Haushalt app, newest first. Maintained by Claude.

## 2026-06-14 — v4.3.3: Share-Text nutzt Haushaltsnamen

- Teilen-Text «… mach mit bei unseren Haushalts-Aufgaben» (klobig, und
  «Hausaufgaben» hiesse Schulaufgaben) → «… mach mit bei <Haushaltsname>»,
  z. B. «Jana, mach mit bei Rossi WG:». Fallback «unseren Aufgaben», falls
  kein Name gesetzt
- APP_VERSION → 4.3.3, SW cache → haushalt-v35

## 2026-06-14 — v4.3.2: Onboarding-Flow repariert

- BUG: Der 20-Sekunden-Auto-Sync (und visibilitychange) rief firstRunSetup()
  erneut auf, solange die Familie leer war → Dialog wurde neu aufgebaut und
  überschrieb laufende Eingaben (Haushaltsname/Personen wurden gelöscht).
  Fix: firstRunSetup() ist jetzt idempotent (Guard + DOM-Check); pull()
  fasst während offener Einrichtung weder DOM noch State an; Auto-Sync und
  visibilitychange pausieren, solange firstRunOpen
- Einrichtung wird beim Start einer brandneuen Familie sofort gezeigt, nicht
  erst nach dem ersten Netzwerk-Pull (kein kurzes leeres Raster mehr,
  keine Verzögerung)
- Doppelten pull()-Aufruf bei Init entfernt
- APP_VERSION → 4.3.2, SW cache → haushalt-v34

## 2026-06-14 — v4.3.1: App heisst «Fairli»

- App-Name (Manifest, Titel, Onboarding-Screen, Default-H1) → «Fairli»
  (Swiss-Touch-Variante von «Fairly»); der pro-Familie gespeicherte
  Haushaltsname bleibt davon unberührt und überschreibt weiterhin den
  Titel im laufenden Betrieb
- «Neuer Haushalt»-Einrichtungsdialog und «Name des Haushalts» bewusst
  beibehalten — das ist haushalt-, nicht app-spezifisch
- Icon-Cache-Buster → ?v=43, SW cache → haushalt-v33, APP_VERSION → 4.3.1

## 2026-06-14 — v4.3.0: Reibungsloses Teilen — Share-Sheet, Native Share, QR

- Neues «Links teilen»-Sheet: listet alle persönlichen Links + Familien-Link,
  je mit Teilen-Button und QR-Code (für Einrichtung vor Ort: scannen statt
  tippen)
- Teilen nutzt jetzt primär das native Share-Sheet (WhatsApp/Signal/…),
  Clipboard nur als Fallback — ein Tipp vom Link zur Familien-Chatgruppe
- Nach der Ersteinrichtung öffnet sich das Share-Sheet automatisch mit Hinweis,
  damit neue Familien das Teilen sofort finden (vorher versteckt im
  Personen-Sheet)
- QR-Generierung offline: qrcode-generator (21 KB, dependency-free) inline,
  im SW-Cache; funktioniert ohne Netz
- Personen-Sheet: 🔗 und Familien-Button öffnen jetzt dieses Sheet
- APP_VERSION → 4.3.0, SW cache → `haushalt-v32`

## 2026-06-14 — v4.2.3: Reihenfolge waehrend der Sitzung eingefroren

- Kachel-Reihenfolge wird einmal berechnet und gecacht; 20-Sekunden-Auto-Sync
  und Wechsel in den Vordergrund aktualisieren weiterhin Daten und Punkte,
  ordnen die Kacheln aber NICHT mehr um — nichts springt unter dem Finger weg
- Neuberechnung nur bei erwartbaren Anlaessen: Tab-Wechsel, App in den
  Vordergrund holen, Aufgabe anlegen/aendern/loeschen
- Bei gleicher Aufgaben-Menge bleibt die gemerkte Reihenfolge bestehen,
  auch wenn sich Nutzungszahlen im Hintergrund aendern
- APP_VERSION → 4.2.3, SW cache → `haushalt-v31`

## 2026-06-14 — v4.2.2: Kacheln nach Gruppe sortiert

- Kompromiss-Sortierung: Aufgaben nach erstem Wort gruppiert; Gruppen nach
  Gesamtnutzung absteigend (haeufigste oben), innerhalb jeder Gruppe A–Z.
  «Wäsche waschen/aufhängen/falten» bleiben zusammen, oft genutzte Gruppen
  wandern nach oben. Tie-Break zwischen gleich genutzten Gruppen: A–Z.
- APP_VERSION → 4.2.2, SW cache → `haushalt-v30`

## 2026-06-14 — v4.2.1: Kacheln alphabetisch sortiert

- Aufgaben-Kacheln jetzt alphabetisch nach Name (locale 'de', akzent-/
  grossschreibungsunabhaengig) statt nach Nutzungshaeufigkeit — verwandte
  Aufgaben wie «Wäsche waschen / aufhängen / falten» stehen beieinander
- APP_VERSION → 4.2.1, SW cache → `haushalt-v29`

## 2026-06-14 — v4.2.0: Echter Mehrfamilien-Start + Manifest-Rebrand

- `families`-Tabelle (family_id, name); Haushaltsname wird geladen und als
  Titel/H1 gerendert statt hartem "Rossi WG"
- Ersteinrichtung für komplett neue Familien: Name, Personen (eine pro Zeile),
  optionales Vorausfüllen typischer Aufgaben — danach ist der Haushalt sofort
  bespielbar
- manifest.json generisch: Name "Haushalt", Navy-Farben (#12161F) statt
  altem Gruen, Icon-Cache-Buster `?v=41` damit Android das neue Icon zieht
- index.html: Titel/Description/H1-Default neutralisiert (nur vor Sync sichtbar)
- APP_VERSION → 4.2.0, SW cache → `haushalt-v28`

## 2026-06-12 — v4.1.0: Mehrfamilien-Betrieb mit Link-Auth

- DB: `family_id` auf members/chores/log (+ Indizes), `url_slug` auf members;
  Migration via GitHub-Action `db-migrate` (Repo-Secret SUPABASE_DB_PASSWORD,
  psql gegen Session-Pooler) — bestehende Daten der Rossi-Familie automatisch
  migriert
- Routing: `#f/<familie>` = Familien-Link (voller Zugriff),
  `#f/<familie>/u/<slug>` = persönlicher Link (Ich-bin fest verriegelt,
  Punkte nur für sich; Aufgaben anlegen/ändern/löschen weiterhin erlaubt;
  Personen- und Sync-Sheet ausgeblendet); Route wird in localStorage
  gemerkt, damit die installierte PWA ohne Hash startet; ungültiger Slug
  zeigt eine Fehlerseite
- Alle REST-Zugriffe zentral familien-skopiert (famScope/famRows in sb()
  und upsert()); localStorage-Keys pro Familie namespaced
- Personen-Sheet: 🔗 pro Person erzeugt/kopiert persönlichen Link,
  Button für Familien-Link; Slugs revozierbar (neu generieren)
- Ohne Link: Onboarding-Screen mit «Neue Familie erstellen»
- APP_VERSION → 4.1.0, SW cache → `haushalt-v27`

## 2026-06-12 — v4.0.3: Header-Gradient auf Akzentfarbe

- "Rossi WG"-Titel hatte das alte Mint (#52C08A) hart im Textgradient
  kodiert; nutzt jetzt `var(--accent)` und folgt damit jedem Rebrand
- APP_VERSION → 4.0.3, SW cache → `haushalt-v26`

## 2026-06-12 — v4.0.2: Finales Icon — Gelb/Koralle auf Creme

- App-Icon final: gelber Schwamm mit Koralle-Scrubschicht und -Blasen auf
  warmem Creme-Verlauf (Variante 3 aus dem Auswahlbogen); helle Platte
  statt Navy, damit es sich auf dem Homescreen neben den hellen
  System-Icons einreiht
- APP_VERSION → 4.0.2, SW cache → `haushalt-v25`

## 2026-06-12 — v4.0.1: Wasserzeichen-Ziffer entfernt

- Punkte waren dreifach kodiert (Badge, Wasserzeichen, Kachelhoehe);
  die grosse Hintergrund-Ziffer ist raus, Badge bleibt die eine Quelle
- APP_VERSION → 4.0.1, SW cache → `haushalt-v24`

## 2026-06-12 — v4.0: Navy/Kornblume rebrand, neues Icon, Edit-Tap-Target

- Akzentfarbe Mint → Kornblume leuchtend (`#84B2FF`, press `#6B99E6`);
  Hintergrund-Neutrals von gruen- auf navy-getoent (`--bg #12161F`,
  `--card #1A2230`, `--line #2A3447`, `--muted #91A1B8`)
- Neues App-Icon: flacher gelber Schwamm mit Scrubschicht im Akzentblau,
  Seifenblasen, Navy-Verlauf (192/512/maskable, als SVG via cairosvg gebaut)
- Edit-Stift auf Kacheln: Tap-Target von ~30px auf 52x52px vergroessert
  (Ecke der Kachel), :active-Feedback ergaenzt — Fehltipps buchten Punkte
- APP_VERSION → 4.0, SW cache → `haushalt-v23`
- Hinweis: Android cached PWA-Icons im WebAPK; Homescreen-Icon erneuert sich
  ggf. erst nach Re-Add der App

## 2026-06-10 — v3.9.2: SW shell cache bypasses HTTP cache

- GitHub Pages serves assets with `max-age=600`; the SW's install step was
  pre-caching `index.html` from the browser's HTTP cache, so rapid successive
  deploys installed new SWs containing stale HTML
- Install now fetches the shell with `{cache: 'reload'}` so every new SW
  caches truly fresh files
- SW cache → `haushalt-v22`

## 2026-06-10 — v3.9.1: Fix stale version display

- `APP_VERSION` constant had been left at 3.6 through v3.7–3.9; now 3.9.
  Reminder for future changes: bump `APP_VERSION` alongside the SW cache name
- SW cache → `haushalt-v21`

## 2026-06-10 — v3.9: Logarithmic tile sizing

- Tile height now `104 + 34 * log2(points + 1)` px (was linear `104 + 9p`);
  `+1` guards the zero-points case
- Same overall range (104–240px for 0–15 points), but low-value chores
  differentiate more and high values compress
- SW cache → `haushalt-v20`

## 2026-06-10 — v3.8: Flat tiles

- Removed the solid 6px bottom ledge (3D "sticking out" effect) from chore
  tiles; soft drop shadow retained
- Press feedback softened to a 2px sink to match the flat look
- SW cache → `haushalt-v19`

## 2026-06-10 — v3.7: Pollinations tile art live

- Added a Pollinations publishable key (`pk_s3BNDnxTvRHULT3z`, scoped to the
  `flux` model, 50 Pollen budget) to the `choreArt` image URL — tile art now
  authenticates against the migrated gen.pollinations.ai API
- Key is client-safe by design (publishable type); the secret key stays out
  of the repo
- SW cache → `haushalt-v18`

## 2026-06-10 — v3.6: Worth-sized masonry tiles

- Aufgaben view is now a two-column masonry flow (CSS multi-column,
  break-inside:avoid): tiles flow down the columns at natural heights
- Tile height scales with point value (104 + 9·points px) — high-worth chores
  are visually and physically bigger tap targets
- Order is by usage count derived from the completion log (most-used first),
  then points, then name; reorders live as habits change

## 2026-06-10 — v3.5: Tile art moved to new Pollinations gateway

- Tile art was failing: Pollinations migrated from the legacy keyless
  `image.pollinations.ai/prompt/` to `gen.pollinations.ai/image/` with API
  keys + pollen billing; switched to the new endpoint on the anonymous tier
- SW fix: cross-origin images are opaque responses (ok=false), which the
  cache condition rejected — art is now cached despite opacity
- Open risk: anonymous tier limits are opaque too; if tiles stay blank, the
  options are a free pk_ key from enter.pollinations.ai, an OpenAI image API
  behind a Supabase Edge Function, or emoji-based tile art
- Not the cause: prompt language (German chore nouns are fine for Flux)
- SW cache → `haushalt-v16`

## 2026-06-10 — v3.4: AI tile art

- Each chore tile gets an AI-generated illustration via Pollinations.ai
  (keyless, free): URL built deterministically from chore name + id-derived
  seed, so all devices fetch the identical image; nothing stored in the DB
- Art renders at 55% opacity under a dark legibility gradient; text gets a
  subtle shadow; graceful fallback to the plain colored tile if the image
  fails to load (onerror removes the img)
- SW now caches pollinations images (immutable per URL — safe, unlike the
  v3.0.1 API-caching bug) for offline tiles and snappy reloads
- Trade-off accepted: chore names are sent to a third-party service; free
  tier means occasional slowness. SW cache → `haushalt-v14`

## 2026-06-10 — v3.3: Self-updating app

- App now reloads itself once when a new service worker takes control
  (controllerchange listener, guarded against first-install and reload loops)
  and checks for SW updates every time it returns to the foreground.
  Ends the "close and reopen twice" ritual: from this version on, updates
  apply on the next foreground at the latest.
- Context: user's installed PWA was stuck on v3.0.x because swiping an app
  from Android recents doesn't reliably kill it; force-stop required once.
- SW cache → `haushalt-v12`

## 2026-06-10 — v3.2: Rename behind an edit button

- In the edit sheet the chore name now renders as static text with an
  "✎ Ändern" button; the input (and thus the keyboard) only appears on demand.
  Fixes the dialog auto-focusing the text field on open — slider, save, and
  delete are all visible immediately. New chores still open with the input
  active.
- SW cache → `haushalt-v11`

## 2026-06-10 — v3.1: Slider + keyboard-safe sheets

- Points input replaced with a 0–15 slider (filled track, large live value);
  editing points no longer opens the keyboard at all
- Sheets restructured: Abbrechen/Speichern (chore) and Fertig (members) moved
  to a top action bar that stays visible above the soft keyboard; "Aufgabe
  löschen" is now a full-width danger button at the sheet bottom
- SW cache → `haushalt-v10`

## 2026-06-10 — v3.0.1: Critical sync bugfix

- **Bug:** the service worker's cache-first fetch handler cached Supabase REST
  GET responses, so after the first pull every subsequent "refresh" returned a
  stale snapshot from the device cache — edits (e.g. chore points) appeared to
  revert, although the PATCH had succeeded server-side
- **Fix:** SW now only intercepts same-origin requests and Google Fonts; all
  API traffic goes straight to the network. Cache bump to `haushalt-v9`
  purges the poisoned caches on update
- Lesson recorded: never let an app-shell SW cache dynamic API endpoints

## 2026-06-10 — v3.0: "Rossi WG" — dark colorful theme

- Renamed app to "Rossi WG" (header wordmark with mint gradient, title,
  manifest name/short_name); regenerated icons in dark/mint
- Full dark theme: bg `#141A17`, cards `#1D2521`, mint accent `#52C08A`
- Per-chore colors: hue derived deterministically from the chore id (hash into
  a 10-color palette), applied to tile face/border/shadow/watermark/points via
  CSS `color-mix` — consistent across devices with zero setup
- Gold tier replaced by a ★ marker on 10+ point chores (color is now per-chore)
- SW cache → `haushalt-v8`

## 2026-06-09 — v2.5: Visual refresh

- Chore tiles redesigned as pressable 3D "keys": gradient face, hard drop
  shadow that compresses on press (translateY), giant point-number watermark
  in the display face; chores worth 10+ points get a gold finish
- Typography scaled up: body 17px, header 34px, tile names 18px, scoreboard
  numbers 34px with larger avatars and thicker bars; bigger tabs, FAB, log
- v2.4 (earlier today): Sync sheet shows app version, prefills built-in
  defaults, and gained "Auf Standard zurücksetzen" to clear local overrides
- SW cache → `haushalt-v7`

## 2026-06-09 — v2.3: Zero-config sync

- Hardcoded the household's Supabase URL + publishable key as `DEFAULT_SYNC`;
  devices now sync automatically with no setup (key is public by design)
- Empty-backend seeding moved into `pull()` so the first device to launch
  uploads its local state (previously only the manual connect flow seeded);
  also prevents an empty backend from wiping local chores
- v2.2 (earlier today): `DEFAULT_SYNC` scaffolding, "Trennen" became an
  explicit opt-out stored as `{"off":true}`
- SW cache → `haushalt-v5`

## 2026-06-09 — v2.1: Auto-sync + repo documentation

- Added automatic background sync: full pull every 20 s while the app is
  visible, in addition to pull on load and on returning to the foreground
- Added `PROMPT.md` (living app specification) and this `LOG.md` to the repo
- Service worker cache bumped to `haushalt-v3`
- Supabase project setup itself remains a user step: Claude's sandbox can reach
  only an allowlist of domains (GitHub, package registries — not supabase.com),
  and account creation requires an OAuth/email signup Claude cannot perform.
  In-app Sync settings mean no code changes are needed once the project exists.

## 2026-06-09 — v2: Points economy, shared chores

Redesign from assignment model to volunteer model per Chris's spec:

- Chores are standing buttons with a point value (1–100); no assignees, no due
  dates, no recurrence — pressing the button logs the completion
- Per-device "Ich bin" person selector; tap a chore → points credited, toast
  `+N für X`, double-tap protection, undo in Verlauf
- Punkte tab: weekly (Monday reset) and all-time scoreboard with bars and 👑
- Verlauf tab: append-only log, denormalized names so deleting a chore or
  person preserves history
- Design decision: one editable point value per chore instead of per-member
  max/average estimation (simpler; estimation flow listed as possible v3)
- Optional Supabase sync (REST, optimistic writes, pull on load/foreground),
  configured in-app per device; first device seeds an empty backend; app
  remains fully functional locally without sync
- Added `supabase-setup.sql` (tables + open RLS policies)
- v1 members migrated automatically on first run; SW cache → `haushalt-v2`

## 2026-06-09 — Deployment to GitHub Pages

- Pushed v1 files to `blauewelt/chores` via the GitHub Contents API using a
  user-provided fine-grained PAT (after iterating on token scope: repo access,
  then Contents/Pages read-write permissions)
- Repo had to be made public: GitHub free plan doesn't serve Pages from
  private repos
- Enabled Pages (branch `main`, root); site live at
  https://blauewelt.github.io/chores/
- Notes: Google Drive ruled out (connector is read-only; Drive no longer hosts
  static sites). Passkeys clarified as unusable for API auth.

## 2026-06-09 — v1: Initial PWA

- Task tracker with assignment model: tasks with assignee, due date,
  recurrence (täglich/wöchentlich/alle 2 Wochen/monatlich); Heute/Alle/Erledigt
  tabs; member management with color chips; overdue highlighting
- localStorage persistence (per device), offline via service worker
- German UI, de-CH formats; sage/spruce visual identity, Bricolage Grotesque
- Generated icons (192/512/maskable) with Pillow; delivered as zip
