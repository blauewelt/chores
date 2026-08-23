# Fairli — Developer Onboarding

Fairli is a household-chores PWA (families, couples, shared flats) with
points gamification: tap tiles = points for the currently set person.
A static single-file app on GitHub Pages, Supabase as the sync backend,
end-to-end encryption for new and migrated households.
This document is the shortcut for a new session (human or AI):
architecture, all design decisions WITH rationale, and the painfully
learned platform quirks. As of: v4.37.1 (17.07.2026).

---

## 1. Overview & files

- **Live:** https://blauewelt.github.io/chores/ — canonical app location.
- **Alias:** https://blauewelt.github.io/fairli/ — its own repo
  `blauewelt/fairli`, ONLY a JS redirect (index.html + 404.html),
  preserves path/query/hash. Shared links (Einladen, Empfehlen, QR) point
  to the alias (`SHARE_BASE = '/fairli/'`); internal navigation
  (history.replaceState, location.href) ALWAYS stays on `/chores/`
  (`BASE`/`routeUrl()`). **NEVER rename the main repo** — Pages does not
  redirect, all installed icons and the families' QR codes would die.
- **Repo:** `blauewelt/chores` (public; GitHub Pages, branch `main`).
- **Core:** `index.html` (everything: CSS, JS, markup — vanilla, no
  build), `sw.js`, `manifest.json`, `404.html` (SPA routing),
  `qrcode.min.js`, `updates.html` (release notes for users, DE/EN), icons
  (`icon-*.png`), `i18n/*.json` (19 files + German inline = 20
  languages), `supabase/migrations/*.sql`, `LOG.md` (changelog, English,
  newest first), `PROMPT.md` (living specification), this document,
  `TESTING_TIER2.md`. **Doc language is English** (switched 26.07.2026 at
  v4.71.1; the German originals are frozen under `docs/de/` and are NOT
  maintained — never edit them, never treat them as current). This is
  about the DOCS only: the app's source language for i18n stays German
  (`t('Speichern')` — see §8 Internationalisation), and so do the UI
  strings quoted throughout these documents.
- **Versioning:** `APP_VERSION` in index.html, visible in the settings —
  users verify updates through it.

## 2. Deploy discipline (on EVERY deploy, no exceptions)

1. Bump `APP_VERSION` (index.html).
2. Bump the SW cache name (`haushalt-vNNN` in sw.js) — otherwise
   installed clients see nothing new.
3. `LOG.md` entry (what + why, English — see §1 on doc language).
4. Full test suite green locally (both engines) — your own run, never
   trust someone else's/an older log.
5. Push ATOMICALLY via `GH_TOKEN=… node scripts/deploy.mjs -m "msg"
   <files…>` (Git Data API, ONE commit for all files). NOT file-by-file
   via the Contents API: that produces live intermediate states (new
   index.html + old sw.js). `scripts/check-discipline.mjs` (CI job)
   enforces it state-based: LOG.md must name the current APP_VERSION +
   SW cache.
6. After the deploy, poll the `tests` workflow via the GitHub API
   (~2–3 min).

The SW loads the shell with `{cache:'reload'}` (GitHub Pages caches with
max-age=600). Update mechanics: skipWaiting + clients.claim +
controllerchange reload; changes take effect on the NEXT app open —
the first start after a deploy only downloads (important for support
questions: "close it once and reopen").

## 3. Data model (Supabase)

Project `uggipomhmnnmiqpbpxcc.supabase.co`; the **publishable key** sits
in the client (`cfg`) — by design, publicly safe.

| Table | Columns | Purpose |
|---|---|---|
| families | family_id PK, name, write_key_hash, created_at | household name; write_key_hash = SHA-256 of the write token (NULL = open) |
| members  | id, name, color, family_id, url_slug, created_at, updated_at | url_slug = personal link key, revocable |
| chores   | id, name, points, note, art, family_id, created_at, updated_at | note ≤ 60 characters; art = optional image prompt override |
| log      | id, chore_id, chore_name, chore_note, member_id, member_name, points, done_at, family_id, created_at, updated_at | history = snapshots |
| retired_families | family_id PK, retired_at | tombstones of migrated cleartext families; INSERT open, UPDATE/DELETE forbidden by RLS — final |

`updated_at` is maintained by a trigger (`touch_updated_at`) (chores,
members, log) — the basis of the delta sync.

**DESIGN PRINCIPLE — history is immutable with respect to the chore:**
`log` stores snapshots (`chore_name`, `points`, `chore_note`).
Renaming/deleting the tile does NOT change the history. The ENTRY itself
is editable (title, note, time, points — a deliberate user correction,
not an automatism). New fields that should appear in the history →
always as their own snapshot column in log.

**`log.app_version` (v4.72.0) — write-only telemetry, the ONE documented
exception to rule C.** Every entry records the version that CREATED it
(set on INSERT only; never on edit, never on the 1 h accumulation).
NULL = written by a client older than v4.72.0, which is a statement and
not a gap. It sits on `log` rather than `members` on purpose: `members`
carries the `touch_updated_at` trigger and the delta sync keys off
`updated_at`, so stamping a version there would push the row into every
device's next delta and add churn next to the pendingCreates machinery.
The log is written anyway, and it yields a time series instead of a
snapshot. **It is deliberately absent from the pull's LCOLS list** — the
client never reads it, so adding it would only cost egress; rule C
(«new column = three places») is about columns the client DISPLAYS. A
test guards the absence, otherwise the next session will «fix» it.
Cleartext (not in ENC_FIELDS): a build number is not personal data, and
encrypted it would be worthless since it has to be readable in the
dashboard. Nothing else is collected — no user agent, no device model.
Read it with SQL in the Supabase dashboard; there is intentionally NO
view and no extra grant, because read access to `log` is open to anon
and a global aggregate view would hand anyone with the publishable key a
cross-family adoption report. The queries live in the migration file
`20260727080000_log_app_version.sql`.

**Points accumulation (v4.35.0):** Tapping the same thing again (same
person, same chore_id or same one-off name) within 1 h ADDS the points
into the existing row via PATCH; `done_at` stays the first tap — the
window closes by itself.
Old runs (multi-row) still render grouped (×N, summed points);
runs end at the day boundary. The former 600 ms double-tap PROTECTION
is obsolete under this semantics → `pressLock` is now only a
250 ms ghost-click filter.

**Multi-tenancy:** EVERYTHING is partitioned by `family_id`.
`sb()`/`upsert()` append `family_id=eq.<ROWFAM>` to every query and
inject `family_id` into every write body (famRows). Direct fetches
bypassing them = forbidden (the only documented exceptions: tombstone
INSERT under the OLD ID during the migration; signpost PATCH of the old
family; backfill of write_key_hash — all three commented in the code).

## 4. Schema changes (migrations)

Push SQL to `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, then dispatch
the GitHub Action **db-migrate** (workflow_dispatch). It runs ALL files
via psql against the session pooler (secret `SUPABASE_DB_PASSWORD`) —
which is why every migration MUST be idempotent (`if not exists` /
`create or replace` / `drop … if exists`). Afterwards verify via REST
(`select=<column>&limit=1` → 200). Sandboxes cannot reach port 5432; CI
can. **Trap (learned in v4.36.2):** a column that the client selects MUST
exist before the client is deployed — otherwise PostgREST answers 400 on
the entire pull.

### Optimistic writes vs. pull()

`pull()` replaces `state.*` with the server state — no local change may
sit unprotected alongside a running pull:

- **`push()` increments `mutationSeq`**; a pull whose mutationSeq has
  changed while it was waiting discards its snapshot.
- **`pendingDeletes`/`pendingCreates`** bridge until the server commit.
- **New write paths go through `deleteRemote()`/`createRemote()`/`push()`** —
  never fire `sb()` directly.
- **NEVER write via push() inside pull()** — that invalidates your own
  snapshot (backfill lesson v4.36.2). If pull has to write something
  afterwards (e.g. write_key_hash backfill): raw fetch AFTER the state
  assignment.

### Pull branch ordering (do NOT reorder!)

Order in pull(): (1) first-run setup, (2) upload guard (only if there is
ALSO no families row — otherwise cleartext resurrection),
(3) famc re-probe (sessionStorage loop guard) — THEN comes the
mutationSeq stale guard, THEN reconcile. The guard protects ONLY the
state adoption; if it sits earlier, a random boot write starves the
healing branches (Valentin's frozen Wednesday, v4.36.2).

### Delta sync (v4.36.0)

The log is pulled by DELTA: watermark `haushalt.delta:<fam>` (ONLY from
server times — client clocks lie), full-sync mark
`haushalt.full:<fam>`; delta only if the watermark exists, the last full
sync was < 24 h ago and the log cache is present. Query:
`or=(created_at.gt.W,updated_at.gt.W)` — thanks to the trigger it also
sees other clients' CHANGES; other clients' DELETIONS only appear on the
full sync (documented limit). Merge by id, pendingDeletes respected,
cap 400. Column diet on all queries. Result: ~10 KB instead of ~125 KB
per returning start (egress wall ≈ 400k starts/month).

## 5. Routing & auth (link = auth)

No account, no login. Whoever knows the link has access:

- **Family link (admin):** `/chores/f/<family_id>` — everything.
- **Personal link:** `/chores/f/<family_id>/u/<url_slug>` — ICH-BIN
  (I am) locked, chore CRUD allowed, person management hidden.
  History: only YOUR OWN entries are editable/deletable (v4.38.0,
  `canEditLog()`, client-side — see §12 for the server boundary); other
  people's rows render as display only (div instead of button, no
  chevron).

**SW registration ALWAYS absolute** (`register('/chores/sw.js')`): the
relative 'sw.js' ran into the 404 on f/ deep paths after replaceState and
was silently swallowed — new devices since the path migration NEVER had
a SW (fixed in v4.39.1). On the root without a family the script ends
before the registration (entry return) — deliberately left that way.

**Why path URLs instead of hash:** iOS discards hashes on homescreen
install. GitHub Pages does not know the paths → `404.html` redirects; the
SW additionally answers navigations to `/chores/`,
`/chores/index.html` and `/chores/f/…` directly with the shell —
ONLY those: real pages (updates.html) must pass through (live bug
v4.39.1: the broad /chores/ rule hijacked the news banner).
updates.html is in the SW precache.

**The 404 handoff is THREE-channel:** `?r=` (query) AND
`sessionStorage['fairli.handoff']` AND HASH. iOS Link Tracking Protection
strips query parameters (secret list), never fragments. Read order:
`?r=` → full pathname (regex NOT anchored; BASE is derived BEFORE the
`f/` segment) → hash → sessionStorage → stored route.
Routes that are found → `history.replaceState` to the canonical path
form. The entry screen shows a small «Geöffnet:»/«Von:» (opened:/from:)
as diagnostics — do not remove.

**Identity is context-bound:** `LS_ME` only in the admin context
(`haushalt.me:<fam>:admin`). Personal links derive the person from the
slug and NEVER write to storage. Rule: anything that differs per context
(route, identity) needs context-specific keys.

**Route persistence (family-first):** separate keys
`haushalt.route.family` / `haushalt.route.user`; bare-launch restore
prefers FAMILY (admin devices open personal links now and then — that
must not hijack the installed admin app).

### Encryption (v4.30/v4.31, GDPR)

Version cut by link prefix:
- `fam-`/legacy prefix (family name, not named here) = cleartext, forever (old clients cannot be locked out).
- `famx-` = encrypted from birth. DB key =
  `'famx-'+SHA-256(secret)[:48]`.
- `famc-` = migrated legacy family: SAME URL, rows under
  `'famc-'+SHA-256(old ID)[:48]` — links and icons stay valid.

Values AES-GCM-256 (HKDF from the link secret, salt `fairli-v1`, info
`data-key`), format `'enc1:'+b64(iv|ct)`. `ENC_FIELDS` defines the field
set: families.name, members.name, chores.name/note/art,
log.chore_name/chore_note/member_name. Cleartext metadata: points,
times, IDs, url_slug, colors. Integration ONLY in `sb()`/`upsert()`
(encrypt write, decrypt read) — every new network path MUST go through
these two functions. ORDER BY on ENC_FIELDS is pointless (ciphertext
ordering) → ordering client-side after decryption (members:
localeCompare).

IS_ENC detection: `haushalt.encv:<fam>` → otherwise famc probe against
the server (result cached; the re-probe branch in pull() heals stale
'0' caches). `runMigration`: backup download → encrypted copy →
VERIFICATION → only then delete of the cleartext rows; the old
families.name becomes a signpost («App aktualisieren» — update the app);
a tombstone in retired_families (old cleartext ID) blocks any cleartext
resurrection server-side.

### Write auth (v4.36.0)

`WRITEKEY` = its own HKDF branch (info `write-key-v1`) — rides along as
header `x-fairli-key` on every write access; the link secret is NOT
recoverable from it. The DB stores only SHA-256
(families.write_key_hash); restrictive RLS policies
(`fairli_write_ok()`) on members/chores/log (ins/upd/del) and families
(upd/del). Hash NULL = open (legacy families, first upload). The hash is
set at: famx first-run setup, famc migration, backfill in pull().
Live-verified: without key 401, with key 201.

## 6. Installation / homescreen — the platform matrix

The project's biggest minefield. Core findings (actually experienced):

1. **iOS reads `start_url` from the manifest, NOT the page URL.**
   Dynamic/blob manifests are ignored (discarded twice).
2. **Without a manifest the iOS web clip is guaranteed to use the current
   URL.** **Manifest ONLY by JS injection, never statically:** WebKit
   registers a static `<link rel="manifest">` at PARSE time; removing it
   with JS is cosmetic. Injection only if `!IS_IOS && !USER_SLUG`
   (Android family context). iPadOS detection: `MacIntel` +
   `maxTouchPoints > 1`. Standalone/name/icon via classic metas.
3. **Chrome on iOS is OK** (since iOS 16.4 the same system share sheet;
   `IS_IOS` also matches CriOS). Fairli's own buttons are called
   «Einladen»/«Empfehlen» (invite/recommend) — «Teilen» (share) is
   exclusively Apple's share-sheet wording.
4. **Personal links get a manifest on NO platform** —
   Android person shortcuts open in a browser tab (accepted trade-off),
   iPhone person installs are fullscreen (metas).
5. **All head links absolute** (`/chores/…`) — relative hrefs resolve
   wrongly on deep paths.
6. Android caches WebAPK icons aggressively: icon change = bump the cache
   buster `?v=NN` AND users must remove+re-add the homescreen icon.
7. `404.html` carries the same PWA head — otherwise iOS catches empty
   metadata on install.

**As-is matrix:** iPhone family ✓ fullscreen · iPhone person ✓ fullscreen ·
Android family ✓ WebAPK · Android person ✓ correct, but browser tab.

**Option D (for later):** Cloudflare Pages + private repo +
edge function for per-person manifests. Decide on an own domain first.

## 7. Flicker rules (first paint)

**Basic rule: nothing may sit in the markup that JS is about to replace.**

- No render-blocking external scripts before the main script
  (`qrcode.min.js` is `defer` → only use it in the click path).
- `html.booting` synchronously in the `<head>`, removed by `render()`; CSS
  hides JS-filled elements, with reserved height.
- `<h1 id="famTitle">` is EMPTY in the markup; an inline script sets the
  name SYNCHRONOUSLY from localStorage. Never put a default name in the
  markup.
- Personal links: an inline script sets `html.userlink` BEFORE the first
  paint (from the URL or the stored route); CSS hides admin elements
  with `!important`. Add new admin-only elements to THIS rule.
- **Boot splash (v4.39.0):** a static #splash overlay after <body>
  covers the entire boot and then morphs onto #headLogo via FLIP.
  `html.splash` is set SYNCHRONOUSLY in the head inline script (the logo
  is never visible beforehand); the overlay is ALWAYS pointer-events:none;
  timeouts instead of transitionend (the global reduced-motion rule
  suppresses transitions).
- **RULE (19.07.2026, maintainer): every change to the art prompt is
  backed by a BEFORE/AFTER comparison sheet** — the same tiles, the same
  seed, variants side by side as an image, judged by a human. Prompt
  quality cannot be derived from the code; «sounds better» is not
  evidence. Script pattern: build URLs, fetch images, compose them with
  PIL into a labelled sheet, present it.
- `c.art` = **image idea**, visible in the edit sheet since v4.53.0
  (#cArt). When set, it is the entire prompt and NEVER appears in the
  visible text (tile/history show name+note). English descriptions land
  distinctly better than German verb phrases.
- Tile art prompt = `c.art || name + ', ' + note` (v4.46.2 — the note
  tells the model more; a custom art wins on its own).
- Tile art never flickers: the `ARTOK` set remembers loaded image URLs;
  on re-render, known images start directly with `.ok` (no fade), new
  ones load behind a shimmer skeleton (`prefers-reduced-motion`
  respected).

## 8. UI conventions & decisions

### Sheet system — follow this when building new sheets
All dialog sheets slide in from the bottom via CSS (dialog[open] →
@keyframes sheetIn, v4.42.1) and can be SWIPED DOWN (v4.42.2, centrally
in enableBackdropClose: the finger drags along, close threshold 120 px
or a brisk >40 px; dirty guards block the swipe just like the backdrop
tap; the swipe only engages at scrollTop 0 + a downward pull). Both
apply automatically to new sheets — condition: call
enableBackdropClose (the share sheet had forgotten that until v4.42.2).
Toasts: swiping down dismisses. Closing via button stays immediate.
Anatomy: `Grabber · head (.slot · centred <h2> · .slot.end) · body ·
ONE .btn.primary.wide AT THE BOTTOM`. `.slot`s are a fixed 84px.
**`×` ALWAYS closes, top right, never destructive.** Form sheets
(confirm): delete in red TOP LEFT, save at the bottom, the backdrop tap
is ignored while dirty. Utility sheets (saved live): Done at the
bottom. List entries are deleted only via the `⋯` kebab menu. Text
fields in dialogs select on focus (value check in the rAF).

### Head area
Flex row, NOT sticky — the head scrolls out of view normally, only the
tabs stick (v4.42.0; the shrink mechanic — first binary, then
scroll-interpolated — is COMPLETELY removed: a few pixels of benefit,
many problems, among them multi-line titles collapsing to a single line
as they got smaller. Do NOT reintroduce it; the scroll test watches over
that). `.hrow` couples #headLogo + h1 into ONE line
(align-items:center) — the logo centres itself against the TITLE LINE,
never against the button height (v4.39.2; before that it sat visibly too
low in the slim state). #headLogo: app icon, size = `--titlefs` like the
title type («as big as the R»), slim 19px, NOT an admin element, the
landing target of the boot splash (see §7). Title `flex:1; min-width:0`,
`font-size:var(--titlefs)`, slim WITHOUT margins; new header elements go
in `.headbtns`. `--titlefs` is set by __setFamTitle on #apphead (length
steps >14/>22 characters → title AND logo shrink together). If the title
needs more than 2 clamp lines next to the buttons → `.wide` (v4.40.0):
title line at full width, buttons on their own line to the right.
__updateWide ALWAYS measures in the split layout (deterministic, no
oscillation), epsilon = half a line height; triggers: __setFamTitle,
resize, slim toggle. Locale-/width-dependent: at iPhone width with de
buttons almost every name correctly goes wide — not a bug. The tabs
stick at top:0 with an OPAQUE background plus an ::after run-out (14 px
var(--bg) → transparent), so that tiles fade out under the bar instead
of running into the pills (v4.42.0). __updateWide runs on resize and on
title change (__afterTitle). Below the head: `#installBar` (dismissible,
context-specific key) and `#newsBar` («Was ist neu» — CONTENT-anchored
since v4.43.1: `NEWS_VERSION` = how far updates.html reports; whoever
has seen that state is never pinged again, releases are irrelevant.
updates.html reads `haushalt.lang` for its initial language (v4.75.1:
the app setting wins; de → de, other set languages → en, no setting →
browser language; the in-page toggle lasts for the visit). And note:
updates.html sits in the SW PRECACHE — the shell rule routes navigations
past the app shell (v4.39.1), but the generic cache-first handler still
serves the precached copy, so ANY edit to it needs a cache bump.
MANDATORY: extend updates.html ⇒ bump NEWS_VERSION in the SAME commit —
the banner test watches that it never runs ahead of the reported state.
First contact sets the mark silently; link → updates.html, × and click
mark it as seen).

### Tiles & grid
Pencil semantics (v4.47.3/4): the ✎ exists ONLY where the surrounding
surface carries a DIFFERENT meaning — that is, exclusively on the tiles
(tile = log an entry, ✎ = edit). Everywhere else: the whole surface =
one meaning, no symbol. In sheets, fields are normal, directly editable
inputs — without focus on opening, no keyboard pops up either; do NOT
build static-text constructions.
- The one-off tile is ALWAYS the first grid element (dashed, shooting
  star). All logging runs through `recordEntry(choreLike)`; chore_id may
  be null.
- ONE form sheet, three modes: New (primary «Speichern + eintragen»,
  ghost «Nur speichern»), Edit, One-off. The FAB is context-sensitive:
  in the history view it opens One-off.
- **Sorting:** `sortedChores()` is the ONLY source of order.
  LS `haushalt.sort` = created (default — stable positions) | alpha |
  usage. New tiles appear at their sort position; the app scrolls there
  + flash (no more pinning).
- **Max. points:** LS `haushalt.maxpts` = 3|5|10 (default 5); when
  editing, the slider scale never drops below the existing value.
  Tapping multiple times adds up — the scale is not a hard limit (note
  in the sheet).
- **Duplicate hint** on the cName input (create mode only): «gibt es
  schon» + action «Stattdessen verbuchen».
- Tile height `104 + 34*log2(points+1)`; note ≤ 60 characters (.cnote).
- Deleting is NEVER the default action.

### History & points
Day headers (Today/Yesterday/localized date), rows show only the time.
Entries are buttons (the whole row is tappable = edit, WITHOUT a symbol
— v4.47.4; locked rows are DIVs) → #logSheet: title, points, note, time
— the SAME field order and elements as the chore sheet, plus the one
log-specific field «Person» APPENDED at the end (v4.107.0, see below). Points (single
rows only) have been the same ptsrow+range slider as in the create flow
since v4.38.0; ONE mechanism `syncPtsRange(sl, out, v)` for cPts AND
lPts (setPtsSlider delegates), scale max(MAXPTS, existing). Time:
datetime-local, styled dark; runs shift by ONE delta. Permissions: on
the personal link, only your own entries (canEditLog); openLogSheet has
a defense-in-depth guard with a toast. Deleting from the history =
deferred commit (locally immediate, server DELETE after the 5 s undo
window; NEVER DELETE+re-INSERT). Deletions are VERIFIED:
`deleteRemote(table, id, onFail)` — 1 retry, then restore + an honest
toast (err.silent convention against double toasts). Points view: bars,
crown, counter. **NEVER name a variable `t`** (it shadows i18n; live bug
Punkte tab empty).

**`families.beta` is NOT the weekly goal any more (v4.74.0).** The goal
shipped to every household; the flag now gates exactly ONE thing, the
v4.73.0 address-bar stripping, until the device checks in §12 pass.
The settings row is labelled «Beta: Adressleiste» accordingly, and a
test guards that switching it off does NOT take the goal away — that
coupling would have silently removed a shipped feature from any
household that left the beta.

**Goal card (v4.70.0/.1) — ONE lead figure, and that is the
ranking criterion.** With a weekly goal the app ranks by GOAL
ATTAINMENT (v4.67.0); so the percentage stands ALONE in the place of the
big number (`.num.pct`, from 100 % on golden `#E8B931` like the goal
line in the weekly chart), the points are named only in the subline
(«X von Y Punkten»). v4.70.0 additionally had them as a secondary figure
in the head — that repeated the subline and has been gone since v4.70.1
(at 0 points «0 0 %» also read like an error). The bar has HEADROOM:
100 % of the goal sits at `GOALW = 80 %` of the width with a tick
(`u.tick`) on it, the overachievement fills the rest striped (`b.over`),
from `CAPPCT = 125 %` on it is full and the tip (`.capped`) says «geht
weiter». Before that the bar ended at 100 % — 100 %, 120 % and 300 %
looked identical.
**Standing rule:** a bar that shows a quantity that can be exceeded
needs headroom and a mark; otherwise it conceals exactly the information
it exists for. Attained/open must NEVER hang on colour alone (the number
and the tick carry it too). Without a goal the card is unchanged — there
is a dedicated test for that.

**Mixed state = two blocks (v4.71.0).** If only SOME have a goal,
`.scoresep` («ohne Wochenziel») separates the goal block from the
goal-less one. Order as before (goals first by goal attainment, then the
goal-less by points); what is new is the announcement that a different
register applies from there on — before that, two kinds of bar stood
uncommented below one another and measured different things, so that the
column told the opposite of the ranking. On top of that: the reference
value for the relative bars is the best GOAL-LESS one, not the best
overall (otherwise a diligent goal holder squashes the whole lower
block). **Standing rule: two scales in one list need a visible boundary
— or they must become one scale.** Divider only in the mixed state and
only in «Diese Woche».

### Claiming an identity (v4.60.0)
claimIdentity()/maybeOfferClaim(): ONE mechanism for the existing link
and for post-migration (sessionStorage fairli.claimAfterMig). Guards:
bare link only, only after syncOk+famName, once per device
(haushalt.claim:<fam>), never over open dialogs, assisted members never
offered for selection. The v4.59 skip path MUST call maybeOfferClaim()
(otherwise the no-diff pull swallows the offer for returning users).
The test persona sets the device mark — claim tests remove it via
initScript.

### Secrets & git (INCIDENT 21.07.2026)
NEVER `git add -A` after a secret (keystore, token, .env) has been
copied into the working tree — named paths only, read `git status`
before every commit. Checks run BEFORE the commit, never in the same
command afterwards. The upload keystore v1 is burned (it was public);
only v2 is valid (fingerprint starts 09:11:99:33).

### Play Store TWA (prepared 21.07.2026)
twa/twa-manifest.json + twa/PLAY_STORE.md. assetlinks.json lives in the
ROOT repo (blauewelt.github.io) — it needs the .nojekyll there,
otherwise 404. After the first Play upload: add Google's app-signing
fingerprint as a second array entry. Store wording: «einsehbar»
(viewable), never «Open Source» (LICENSE!). Redraw principle: sheets
build themselves only on opening; pull() never touches open dialogs and
since v4.59.0 draws ONLY on an actual change (state fingerprint — `me`
belongs in it, otherwise the v4.49.0 snap-back breaks); the front door
builds itself exactly once; inputs commit to the state on every
keystroke.

### Entry screen (v4.58.0)
renderEntry() draws the front door EXACTLY ONCE — with a foreign
language only after loadDict() (race with a 1.5 s cap, German offline);
until then the boot splash stands. NEVER build in a redraw path
(maintainer directive 21.07.). Diagnostics: collapsed as <details> in
the browser, ALWAYS open under IS_STANDALONE (icon-problem context). The
warning box «Veraltetes Fairli-Icon» is never to be softened. When
translating new front-door texts: keys ×19.

### First-run setup (v4.57.0)
After the form it asks «Wer bist du?» (chips of the entered names).
claim(): admin=true ONLY for the chosen one, generate the slug, await
the upsert DIRECTLY (never the push queue — redirect!), sessionStorage
`fairli.creatorOb`, then redirect to the personal link; maybeOnboard()
reads the flag and opens the onboarding as the creator. Solo: no
question. On creation NOBODY is admin — never build in «first row =
admin» again.

### Manifest & installation (v4.56.0)
Personal links have their own manifest at
`/chores/manifest.json?f=…&u=…&n=…` (same origin, NEVER data:).
The service worker answers this address with a personalized manifest
(its own id/start_url per person). **`short_name` MUST stay «Fairli»** —
Android labels the icon with it; the person's name belongs only in
`name` (v4.56.1, live finding). **Colours MUST follow the app colours**
(`background_color` = var(--bg) #12161F, `theme_color` = #141A17) —
otherwise a white system splash screen flashes up before the dark app
(v4.56.2, live finding); without the SW the static host serves the
normal file — that is installable too. iOS stays manifest-free
(parse-time trap, v4.20.0). `loadRoute()` prefers the LAST used route,
so that a start at the generic start_url does not land under the wrong
identity. SW-dependent tests: project `chromium-sw`, mark titles with
`@sw`.

### Admin model (v4.55.0)
`members.admin`. **All** permission questions run through `isAdmin()` —
never through `USER_SLUG` (that is only the IDENTITY). The bare family
link still counts as a nameless admin (grandfathered), but is no longer
offered. Invariants: at least one admin; non-admins may not operate the
switch, but may share links. New households: first person = admin.

### Toast → entry (v4.108.0)
`recordEntry()` ends in `toastLogged()`, which adds an «Ändern» action to the
«+N für X» toast; `openLoggedEntry(id)` switches to Verlauf, clears LOGFILTER
and the search term (otherwise the sheet can open over a list that does not
contain the row), renders, then `openLogSheet(id)`. Both write paths feed it —
the fresh row and the 1 h accumulation — so the button always points at the row
that actually grew. Deliberately a LABELLED button, not a tappable toast: a
toast promises nothing, a button does. Action toasts stand 5 s, plain ones 1.8.

**`#toast` needs `width:max-content`.** `left:50%` without `right` leaves only
the right half as available width, so shrink-to-fit capped near 50vw and
`max-width:85vw` never bit — every two-part toast wrapped, action under text.
Do not remove it; a test measures the single line.

### The entry's person (v4.107.0)
The «Person» field in #logSheet changes `member_id` + `member_name` — who the
entry COUNTS FOR. `logWhoOptions()` is a thin wrapper over `allowedIds()`
(admin = whole family, otherwise self + assisted), so the reach is identical
to the «Ich bin» chips; the save path re-checks against a fresh allowedIds()
because a pull can move under an open sheet. **Fewer than two options → no
field at all** (a lone dead chip promises a choice that does not exist).
The rebooking runs AFTER the points slider is applied and moves BOTH halves:
`bumpTotals(old, -pts, -1)` and `bumpTotals(new, +pts, +1)` — dropping the
`dN` half leaves «N Aufgaben erledigt» on a card that has no such entry.
`logged_by` is deliberately untouched (that is a record, not a setting).
The transfer is announced in the SAME toast as a date move, joined with « · »
— `toast()` replaces its text, so two calls would eat one another.

### Who logged it (v4.54.0)
`log.logged_by` = member ID of the LINK (slugSelf()), NULL on the
family link. Context in the detail sheet only, never in the list. When
entries are merged (<1 h), the first logger stays.

### Retention (v4.52.0)
`families.retention_days` (NULL = unlimited, default). `purgeExpired()`
runs ONLY on the admin link and ONLY via `deleteRemote`, exclusively on
`log`. The setting is admin-only; activation requires a confirmation
that names the number of affected rows. When extending this: NEVER
widen it to chores/members/families — the test checks exactly that.

### Search (v4.50.0, auto-activation v4.51.0)
Above more than `SEARCH_AUTO_AT` (7) tiles, `maybeAutoSearch()` turns
search on once — but ONLY if the LS key is missing (the person has
never decided for themselves). A deliberate opt-out writes '0' and is
thereby final; automation does not overrule humans. Toggle `SEARCH_ON`
(localStorage, default OFF), input in `QUERY`. Filtering happens at
render time: chores via `matches(name, note)`, log via
`matches(chore_name, chore_note, member_name)`. `norm()` is
diacritic-blind (NFD + marks removed, ß→ss). IMPORTANT: the bar sits in
the static markup OUTSIDE `#list` — otherwise render() eats the focus
on every keystroke.

### Assisted members (v4.49.0)
`members.assisted` marks people without their own phone. Central
helpers: `slugSelf()` = identity of the LINK (settings, Mein Name —
NEVER use the chip selection!), `allowedIds()` = self + assisted
(chips, chip click, canEditLog, pull retraction). Anyone raising a new
permissions question asks allowedIds() — not `me === x`.

### Mein Name (v4.46.0)
Settings → 👤 «Mein Name», ONLY on the personal link (admins use the
person management). openMyNameSheet: locally immediate, server
`sb('members?id=eq.me','PATCH',{name})`. History stays historical.
NOTE: ALL edit write paths ALWAYS go through upsertRemote()
(persons v4.46.1, chore edit v4.47.1 — the unprotected
push(PATCH) loses the race against pull; creation/deletion via
createRemote/deleteRemote). Historical note on persons (v4.46.1:
pull protection via pendingCreates OVERLAY — reconcile thereby also
replaces stale server versions of edited rows; a bare upsert()/sb()
PATCH loses the race against pull). History: the raw fetch — in
finishMembers it bypassed encRow and x-fairli-key (fixed in v4.46.0);
the famx cleartext test does NOT cover the person upsert so far (open,
§12).

### Renaming the household (v4.41.0)
Settings → 🏠 Haushaltsname, ONLY on the family link (personal links:
the row is absent). openRenameSheet: locally immediate (state/save/
__setFamTitle), server `sb('families','PATCH',{name})` — famScope
targets the row, ENC_FIELDS.families encrypts automatically on
famc/famx. PATCH error → toast; the next pull then restores the server
name (deliberately simple, no offline queue).

### Person chips
Alphabetical (localeCompare, after decryption). Multi-line → centered
(.multi via rAF scrollHeight check); wrap balancing: if exactly ONE
chip sits on the bottom row and the row above has ≥3, a
flex-basis:100% break is inserted → nobody is ever alone («two people,
or 0»).

### Keyboard (Android)
`interactive-widget=resizes-content` in the viewport meta + `.sheet
{max-height:100dvh; overflow-y:auto}` — the keyboard no longer covers
any buttons.

### Onboarding «Zugriff sichern» (secure access) (v4.45.0)
#onboardSheet is step 1 for EVERY first visit: creators after the
setup (→ «Weiter: Mitglieder einladen» → invite sheet as step 2),
link recipients via maybeOnboard() after the first render. Mark
`haushalt.onboard:FAMILIE:a|u`; guards: standalone, firstRunOpen,
open dialogs, ONLY famName as the "family is set up" signal. The 📲
banner fires the native prompt DIRECTLY when available (native-first),
otherwise instructions — and STAYS SILENT as long as #onboardSheet is
open (v4.45.1, no double message; close calls initInstallBar() for the
immediate persistent reminder). Tests run as a returning-visitor
persona (mockBackend sets the mark; onboarding tests disable it via
sessionStorage fairli.obPersona.off) — when writing new onboarding
tests, use this pattern.

### Inviting & language
The family row (FIRST in the sheet) is called «Admin-Link» with the
subnote «Gibt vollen Zugriff auf alle Mitglieder und ihre Aktivitäten»
and carries the .savenote warning «diesen Link sichern … sonst Zugriff
weg» (v4.44.0) — with a «Zum Home-Bildschirm hinzufügen» button when
deferredInstall (beforeinstallprompt) is available; otherwise the
instructions below it apply. IMPORTANT (v4.44.1): Chrome often fires
the prompt only seconds after load — which is why the BIP listener
retrofits OPEN sheets (install sheet re-renders, invite sheet gets the
button injected). With an already installed PWA, Chrome NEVER fires —
no button is correct there. The 📲 banner (#installBar) appears in
EVERY non-standalone context, including for recipients of personal
links (dismissal key per family+role). The personal links carry the
explanation «Damit loggt jede Person ihre Aufgaben — ohne
Admin-Zugriff». The Empfehlen button is NO longer ghost-dimmed and its
subnote leads with «Für Freunde: …» (v4.43.0 — prevents the admin link
from being shared as a referral). Preserve this distinction when
reworking. Invite sheet (admin): family at the top (link, QR, install
hint), then personal links, «Empfehlen» at the bottom. The member
variant shows the personal links of EVERYONE (lesson: whoever hides
options steers people to the wrong one). QR captions name what they
open; do not remove `.shqr[hidden] {display:none}`. All shared links go
through `shareRouteUrl()`/`appLink()` = fairli alias. Since v4.38.0 the
sheet is COMPLETELY translated via t() (title, buttons, family block,
QR aria/alt, share texts) — the EN test «kein deutsches Leck» (no
German leak) watches over this; ALWAYS route new sheet strings through
t(). The family button deliberately carries NO data-name (empty nm =
family branch in shareLink). Language: German,
Swiss-friendly; the app is called «Fairli». Colors: `--accent #84B2FF`,
navy neutrals, always CSS variables.

### Internationalization (20 languages)
Run the audit one-liner (t() keys vs. dictionaries) during larger UI
rounds — the migration gap (v4.45.2) went unnoticed for months,
because t() falls back to German silently.
Language choice (v4.76.0): `haushalt.lang` stores only an EXPLICIT
choice; absence of the key means «Wie das Gerät» (default) — the device
language is re-derived on every boot via deviceLang(). The sheet's
checkmark shows the choice, not the effect. Never write the key on the
user's behalf; updates.html shares the same semantics.
German = source language = key (gettext pattern): `t('Speichern')`,
fallback German. Dictionaries `i18n/<code>.json`; only the active
language is loaded (localStorage copy for offline). Static content via
`data-i18n`/translatePage(), dynamic content via t(). **Key parity is
law** — every new key × 19 files; the integrity test enforces identical
keys, identical placeholders, never empty. Treat German source strings
as an API (rewording orphans translations). New language: create the
JSON, extend LANGS + LOCALES + sw precache. Tests run with locale de-CH
(pinned). Growth path if ever translated externally: abstract keys, not
English-as-key.

## 9. AI tile images & icons

`choreArt()` builds Pollinations URLs (`gen.pollinations.ai/image/…`,
`model=flux`, deterministic numeric seed from the chore ID —
Pollinations rejects NaN with a 400). Prompt = `(c.art || c.name) +
', minimalist flat vector illustration, single subject, centered, dark
moody background, vibrant accent color, no text, no words'` — NO
«household chore» framing (it overrode the subject). The `pk_` key is
client-safe, but REFERRER-LOCKED to blauewelt.github.io —
server-side fetches need the Referer header (e.g. via a
Playwright request context); rate limits → backoff between requests.
Error path: `artRetry` with 3 backoff attempts (Pollinations throttles
on mass repaints).

**App icon (since v4.36.3):** four rounded color tiles on a dark
background — like the chore board. icon-192/512/512-maskable (maskable:
subject inside the safe zone). Changing the icon: replace all three
PNGs + cache buster `?v=NN` in index.html, 404.html AND manifest.json +
SW bump. iOS/Android only pick up new icons after removing and re-adding
the home screen icon (launcher cache).

**Known disclosure with encrypted families:** tile names go to
Pollinations as image prompts (documented; a privacy toggle is an open
item, §12).

## 10. Automated tests (Tier 1)

**Status v4.37.0: 97 tests, green on Chromium (Pixel 7) and WebKit
(iPhone 14).** Playwright against a local Pages mimic server
(`tests/pages-server.mjs`: `/chores/`, unknown paths → 404 WITH the
404.html body). Supabase fully mocked (`mockBackend(context, …)`);
fonts/Pollinations blocked — bespoke tests with their own routing MUST
abort external hosts as well (otherwise webkit hangs on the reload).
SW blocked in tests (determinism). CI on every push (`tests.yml`)
+ discipline job.

**Rules (each one born from a real bug):**
- Every test references the bug/the feature in its description.
  New bugs → regression test first, then fix. Field findings without a
  clarified cause are recorded as a test anyway.
- **Every view needs at least one render test** (the Punkte tab
  had none — the breakage went unnoticed for a day).
- **Counter-check for new guards:** temporarily remove the guard → the
  test must go red (otherwise it tests nothing).
- **Your own confirmation run before every deploy** — never trust
  foreign/older logs (including your own from phantom states of the
  sandbox).
- Mocks model a CONSISTENT server (after DELETE, GET no longer returns
  the row; replicate merge-duplicates; respect the family_id filter —
  the famc probe!). Test races with a DELAYED DELETE.
- Playwright traps: `?` in route patterns is a wildcard (`log**` +
  method check); `waitForURL` on the same URL fires immediately (wait
  for status text instead); initScripts also run after the app's own
  location.reload()s → sessionStorage one-shot guard when they
  prepare localStorage; SEED run/grouping fixtures instead of tapping
  them in (tap sequences accumulate since v4.35); day grouping only
  splits at day boundaries — date the fixtures accordingly.
- **A fixture that seeds «N hours ago» and asserts a WEEK sum must
  clamp to the week boundary** — use `weekSafeAgo(ms)`. Otherwise the
  CALENDAR decides whether CI is green: `weekStart()` is Monday 00:00,
  so on a Monday morning most of a 40-hour fixture falls outside the
  week and the sum collapses. Found on 27.07.2026 at 06:14 UTC, when
  the v4.65.0 test went red without a single line of it having changed;
  it had been green for weeks because the runs happened later in the
  week. Same class as the day-boundary rule above, one level up.
- **Source edits only at verified statement boundaries** — never
  line regexes across template literals (this has produced mass red
  twice and once ate a branch body into a comment).

**Tier 2** (nightly, emulators): iOS simulator openurl/install/
stale-icon trap, Android Chrome/WebAPK — details in `TESTING_TIER2.md`.
**Tier 2b** (before production): BrowserStack real devices. **Tier 3:**
camera scan remains untestable; QR byte exactness is proven.

### Emulator function check per deploy (mandatory, 18.07.2026)
Before finishing every deploy: play through the built feature in the
emulator IN A REALISTIC USER STATE (e.g. seenver mark as on the
family devices, onboarding seen, real click paths) — not just the
synthetic test conditions of the suite. The first use immediately
found two classes of bug: NEWS_VERSION under already-seen
marks (never fires) and a mock substring bug
(retired_families contains 'families' — order of the URL check!).
NEWS_VERSION rule: ALWAYS = version of the recap release itself.

### Suite output & self-routers (mandatory)
**Verify, READ, and only THEN deploy — never in one command
(27.07.2026).** Chaining the suite check and `deploy.mjs` into a single
shell line means the deploy fires regardless of what the check said;
there is no way to act on a red you have not read yet. It happened
exactly once: one webkit case was red and the deploy went out anyway.
It turned out to be a sandbox WebKit crash during context teardown and
CI on real infrastructure was green — but that was luck, not process.
Related trap from the same incident: `grep -E "failed|flaky"` also
matches GPU/driver noise («MESA: error», «libEGL warning») and can make
a red run look clean. Anchor on the SUMMARY lines, and on `✘`.

**The sandbox WebKit spawn flake (27.07.2026).** In GPU-less containers
WebKit occasionally wedges on context/page start: `goto` hangs until the
test timeout, a DIFFERENT test each run, 3/3 green in isolation, MESA/
EGL noise in the log. Local runs now retry once (same as CI always did);
Playwright reports such tests as FLAKY, and a flaky count in the summary
is a finding to read, not a pass to wave through. A test that fails
BOTH attempts is a real failure.

**A crashing teardown is infrastructure, not a finding.** Helpers that
own a context (`withUA`) shield ONLY the disposal, never the test body:
a disposable context failing to be disposed must not turn a run red
after every assertion has already passed.

**Abort external hosts — even with your own routing (v4.70.0).**
`blockExternal(context)` (fonts.googleapis, fonts.gstatic,
gen.pollinations) sits inside `mockBackend`, but must be called
separately in EVERY test with its own routes. In sandboxes with an
egress proxy a font request does not RESPOND, it HANGS: the load event
never fires and `waitForURL` runs into the timeout — a red that does
not occur on CI runners and therefore looks like a phantom. Two
first-run setup tests hung on exactly this.

NEVER truncate suite results with tail -N — «X failed» stands ABOVE the
«passed» line and otherwise gets cut off (this is how two real
breakages went unnoticed, v4.46.2). Pattern: `grep -E
"failed|skipped|passed"` on the final summary. Tests with THEIR OWN
routes (without mockBackend) need `await suppressOnboarding(context)` —
otherwise the onboarding modal (v4.45.0) blocks their clicks.

### Service worker tests
The config blocks SWs globally (`serviceWorkers:'block'`, determinism).
ONE exception: the describe «Service Worker (echt)» with
`test.use({ serviceWorkers: 'allow' })`, Chromium-only. The network
stays hermetic: the SW's own fetches go to the Pages mimic
(context.route does not see them — no Supabase risk: the SW never
issues those calls itself, they keep running through the mocks). New SW
behavior tests go ONLY into this describe.

## 11. Secrets & working practices (for AI sessions)

### RED CI = NO DEPLOY (mandatory, 21.07.2026)
tests.yml runs on every push and is the last line of defence —
also and ESPECIALLY when the sandbox runner is broken. Before every
deploy: suite green locally OR check the CI run of the previous push; a
red run blocks the next deploy, no exceptions. Lesson from v4.60: CI was
red (the claim sheet blocked 18 tests), the deploy went out anyway,
and the regression sat live for half a day.

### Marks only AFTER adoption (sync invariant, 21.07.2026)
Delta watermark, full mark and version mark may only move on once the
snapshot has really been adopted into state (behind the
stale guard). Any persistence BEFORE a possible discard is a
ratchet: discarded rows are never requested again and then «go missing»
without comment. Incident «Der eingefrorene Leser» (the frozen
reader), LOG 21.07.

### GROUND RULE: no sensitive information in the repo (standing rule, 18.07.2026)
Neither app source code nor tests nor documentation may contain
sensitive information: no real names, addresses, places, anecdotes
with personal references, no family link IDs (those are access URLs!),
no secrets. Fixtures are ALWAYS fictional; incidents are documented
without names («a member», «the maintainer»). Background: the repo
is world-readable (GitHub Pages) but felt private for years —
which is how the roster, anecdotes and even the real family ID ended up
public (audit + rotation 17./18.07.). The hashed
anonymization guard in check-discipline enforces this rule;
it is a net, not a substitute for thinking.

### Visual sign-off BEFORE every UI deploy (mandatory, 17.07.2026)
Render changed screens/states in BOTH device projects via the
Pages mimic (real fonts, NOT the test harness with the
font block) and LOOK AT the screenshots — including the edge states:
long name, scrolled, wide, empty data, de AND en. While doing so ask two
questions: (1) Does it look as intended? (2) What does the UI PROMISE
— and does it keep it? (grabber → swipeable, chevron → leads somewhere,
pencil → editable, …). Lessons of the day: swipe gap, tabs
transparency and title wrapping when shrinking were all visible in
screenshots, or recognizable as a broken affordance. Limit: scroll and
animation FEEL are not shown by screenshots — that stays a device test
(Tier 2 / maintainer).

**Standing instructions (maintainer):**
- At the end of EVERY working round, update this document (and
  TESTING_TIER2.md where relevant) — the docs are the handover to the
  next session; stale statements are worse than missing ones.
- **Replaced-link notice** (v4.47.0): boot checks retired_families
  (cleartext ID + row scope) → sticky full-screen notice. When
  tombstoning, ALWAYS enter BOTH IDs.
- **Repro against production**: set ignoreHTTPSErrors in the sandbox
  browser (egress proxy MITM) — otherwise «findings» are just artifacts.
- **Link rotation** (18.07.): the household runs on a new
  famx secret; the old link is exposed and will be tombstoned after
  device verification. Until then TWO parallel data sets — writes
  on the old link do NOT land in the new set (deliberate; short
  transition phase). Rotation scripts live OUTSIDE the repo.
- **Anonymization guard** (v4.46.3, hashed since 18.07. — knows
  tokens only as SHA-256, checks itself): check-discipline aborts on
  personal-reference/link-ID patterns. Keep new test artifact IDs short
  (<10 characters after the prefix) or put them in the ALLOW list. The
  replacement table was LENGTH-EXACT — keep the lengths for new fixture
  names (chip wrap / wide tests measure pixels).
- **NEVER delete user data** (households, members, logs) — not even
  accidentally created ones (12.07.2026; the concrete ID of the
  known stray family is in the maintainer's PRIVATE notes,
  NEVER in the repo — family IDs are access URLs). Own
  test/probe rows (e.g. `lock-probe1`, `famx-authselftest01`) are
  NOT user data and are cleaned up immediately.

- Credentials shared in chats count as exposed → rotate after the
  session. PAT fine-grained (chores + fairli), short lifetime,
  password manager. Pollinations: only `pk_` in the client.
- Sandboxes: HTTP(S) egress only. Git via deploy.mjs (Data API), DB DDL
  via the db-migrate action. Syntax-check JS before the push with
  `new Function(<IIFE-Body>)`. Sandbox directories can contain phantom
  states from aborted turns → remote is the truth: check the version,
  fetch fresh, do your own test run.
- For platform behaviour (especially iOS PWA) research first, then
  build; if two solutions exist, the deterministic one wins.
  Ground truth beats inference — shifting theories for the same
  symptom are storytelling, not debugging.

## 11a. Standing UI/sync rules (maintainer directive 26.07.2026)

These three rules apply to EVERY future change; they come from
live incidents (weekly goal «had to be saved twice»,
«Sync fehlgeschlagen» (sync failed), keyboard over the save button).

**A. Save means save — and no way out loses anything.**
- A button labelled «Speichern» (save) persists AND syncs
  itself; it never relies on a later button somewhere else.
- EVERY exit path of a sheet with inputs syncs: button, ×,
  backdrop tap, swipe-down AND Esc (dialog-close event as a net;
  sync functions must be idempotent for that — delete marks after
  handover to the queue, otherwise double POSTs).
- Unsynced changes survive a reload (SW updates!): marks
  persist (LS_PENDMEMB pattern) and are handed over again
  SYNCHRONOUSLY at boot — synchronously so the pendingCreates shield is
  up BEFORE the first pull reconciles (otherwise the boot pull
  overwrites the change and the follow-up push sends the old state back).
- Never clear mark sets «to be safe» (the old
  changedMembers.clear() on open was a real loss path).

**B. On-screen keyboard: every sheet stays usable with the keyboard open.**
- Do NOT rely on interactive-widget=resizes-content or dvh —
  the installed app (PWA/TWA) ignores both in practice.
- What counts is the visualViewport measurement: --kb on :root, sheets
  are anchored at the bottom (margin-bottom:var(--kb)) and factor --kb
  into their max height. Threshold ~40 px against URL-bar jitter.
- For new sheets with input fields: test with the keyboard open
  (a screenshot from the device counts as evidence).

**C. Batch upserts: PostgREST demands IDENTICAL key sets.**
- PGRST102 («All object keys must match»): ONE row with differing
  keys makes the WHOLE batch blow up with 400 — but local rows
  drift naturally (freshly created = 3 keys, pulled =
  all columns). upsert() therefore groups by key signature and
  sends one request per group. Do not remove this guard; new
  write paths use upsert()/upsertRemote instead of raw fetches.
- Related standing rules: migrate new columns BEFORE the client
  (LCOLS order), and back-fill views in OLD migration files
  when later ones extend them (replay rule, §Migrations).

**C. New column = THREE places, otherwise the app lies.**
- Every new table column needs: (1) the migration, (2) the write path
  (upsert/PATCH), and (3) **the pull's explicit SELECT column list**.
  Live incident 26.07. (weekly goal): migration and write were right, the
  pull list was missing — the server KEPT every goal, but every sync
  replaced state.members with goal-less rows: «saved first,
  gone seconds later», only the freshest change seemed to stick
  (shield window). Symptom signature for the future: the server has
  the value, the client loses it after the next pull.
- Test harness rule for this: mocks must PROJECT select= like
  PostgREST. A mock that always delivers all fields masks exactly
  this class of bug (20+ green goal tests while the real app discarded
  the column). Since v4.69.4 mockBackend projects members/chores;
  new table mocks adopt the pattern.

## 11b. Working in parallel (protocol, 27.07.2026)

Three release collisions in ONE day taught this: two sessions merged
each other's code cleanly all day — what collided every single time was
the RELEASE: both independently assigned the same next APP_VERSION and
the same next SW cache, and deployed over each other. Human teams
parallelize work but centralize release numbering; here that
centralization is mechanical:

- **Release lock (enforced by deploy.mjs — you cannot forget it).**
  Deploying acquires `refs/heads/release-lock` atomically (ref creation
  fails if it exists); held by another session → abort with holder and
  age; stale after 30 min → broken automatically (crashed sessions).
  Every abort path releases the lock. Set `FAIRLI_SESSION=<name>` so
  the holder is identifiable.
- **Version is assigned UNDER the lock, from the remote.** Never pick
  your APP_VERSION/cache during development. Before the bump: fetch,
  rebase onto origin/main, read the LIVE version, increment. deploy.mjs
  guards this: pushing an index.html/sw.js whose version/cache EQUALS
  the remote's aborts (exit 3) — that equality is exactly the collision.
- **Intent board (`scripts/wip.mjs`) — the substitute for talking.**
  `wip.mjs claim "<area>"` at task START, `wip.mjs done` when finished,
  `wip.mjs list` before starting anything. If a foreign claim overlaps
  your area: STAND DOWN or renegotiate with the maintainer. The lock
  serializes deploys; it cannot merge two opinions about the same UI.
- **Merging when the head moved:** stash → reset to origin/main → pop,
  resolve LOG.md by keeping BOTH entries (newest on top), verify the
  foreign feature survived (diff your base against their commit),
  renumber, re-run the FULL suite on the merged state.
- Deploys still go straight to main (trunk = prod). No PR layer: there
  is no human reviewer, the suite + discipline checks are the review,
  and a PR would double every 10-minute suite run. Exception: a large
  refactor lives on a feature branch until its release slot.
- The old rule «one session at a time» is hereby replaced for RELEASES;
  it still holds per FEATURE AREA (see intent board).

### Tier-2 nightlies (state 23.08.2026)
All four were red for a week, none because of the app.
- **android:** the emulator has no ROUTE right after `boot_completed` (the
  artefact showed Chrome's «No internet»; `-dns-server` was the wrong guess).
  `tier2-s4.sh` now nudges `svc wifi/data`, polls connectivity for 60 s and
  dumps `ip addr`/`ip route`/airplane mode before failing — an emulator
  problem must never read as «Testperson nicht gefunden».
- **ios (S1):** it was measuring the modal first-visit onboarding. The locked
  view is fully rendered BEHIND it, just dimmed — `scripts/ocr-boost.py`
  (crop top 45 %, autocontrast, 2×) makes tesseract read it. **No idb:**
  `idb-companion` refuses on macOS 14 and needs a full Xcode 26 on macOS 15.
- **capture / webclip:** need idb, therefore `macos-26` (= macos-latest, the
  only image with Xcode 26). Both stay RED on purpose: Safari moved Share out
  of the bottom toolbar into the `⋯` menu (S2's whole premise), and webclip's
  iOS-17 runtime pin has no image left to run on. See TESTING_TIER2.md
  §Status 23.08.2026 — including the product finding that the app's own
  onboarding text still points iOS users at the old share position.

**Standing lesson:** a nightly that is always red is not a watchdog. When one
goes red, read the ARTEFACT (screenshot, OCR dump, UI dump) before touching
code or tools — twice in one day the artefact already held the answer while
the plausible-sounding fix (DNS flag, UI automation) did not.

## 12. Known open items / deferred

- **Per-member permissions server-side:** the v4.38.0 permissions are
  client-side. All link holders (including personal ones — the family
  part sits in their URL) share the same family write key; real
  enforcement would need per-member keys (HKDF per slug) +
  RLS check member_id↔key. Larger rework, deliberately deferred — the
  threat model is family members, not attackers.
- **Extend the famx cleartext test:** the «sendet NIE Klartext»
  (never sends cleartext) test does not exercise the person upsert
  (finishMembers) — which is exactly where the v4.46.0 leak sat.
  Add a person change to the test.
- ~~Fanti write_key_hash~~ done since the link rotation (18.07.) —
  the famx family carries the hash from birth. Historical item:
  of a Fanti device (SW staging). Then verify live; until then
  the family is encrypted, but write-open.
- **mutationSeq boot causer** (observed in v4.36.2): something
  pushes during the boot pull; harmless thanks to the branch reordering,
  causer unidentified.
- **Goal suggestions instead of goal nudge** (considered and
  deferred 26.07.): showing a banner «setz Ziele für alle» (set goals
  for everyone) in the mixed state was REJECTED — it does not make the
  state honest (v4.71.0 does that), you inevitably end up back in it
  (new member), and households that deliberately give goals only to the
  children would be nagged forever. If it happens anyway: ONCE, directly
  after the first goal is set, with SUGGESTED values from the Ø/week
  (v4.68.0) instead of an empty form, dismissible per household, and
  with the sentence «Ziele dürfen unterschiedlich sein» (goals may
  differ) — otherwise people reflexively set the same number for
  everyone and it is a points race again.
- **In-app link rotation — DESIGN APPROVED 27.07.2026, build when
  scheduled.** The maintainer reviewed and approved this design; a future
  session can build it cold from here. Motivation: the household link has
  now been exposed twice (repo history 17.07., chat screenshot 27.07.);
  the out-of-repo scripts from 18.07. exist only on the maintainer's
  side. Link = auth cannot be made un-leakable — rotation is the real
  recovery path.

  **Entry:** Einstellungen → «Neuer Haushalts-Link». isAdmin() only.
  v1 scope: famx/famc households only; fam- (never-migrated cleartext)
  gets a hint to run the encryption migration first.

  **Sheet** (one button, progress list ①–④ ticks through):
  header «Neuer Haushalts-Link»; body: «Der alte Link wird dauerhaft
  ungültig. Danach braucht JEDES Mitglied den neuen Link — am
  einfachsten per QR. Nutzt das, wenn euer Link geteilt oder
  versehentlich weitergegeben wurde.» Steps shown: ① Sicherungskopie
  herunterladen ② Alles unter neuem Link kopieren ③ Prüfen ④ Alten Link
  stilllegen. Red button «Neuen Link erstellen». On success: open the
  EXISTING invite sheet with the new QR. Old-link devices are handled by
  the EXISTING v4.47.0 replaced-link notice (retired_families check at
  boot) — re-invite is guided, not mysterious.

  **Mechanics** (mostly runMigration reuse — backup → copy → VERIFY →
  only then retire):
  * New secret from the same generator as famx first-run; new DB id =
    'famx-'+SHA256(secret)[:48]; families row carries re-encrypted name,
    write_key_hash = SHA256(HKDF(new secret, write-key-v1)), and the
    beta/retention flags copied over.
  * Copy members/chores/log INCLUDING tombstoned rows (deleted_at) —
    trash and retention semantics survive. The client window holds only
    300 log rows: page the FULL log from the server (created_at cursor,
    explicit column list). Decrypt with the old HKDF data-key,
    re-encrypt with the new, per ENC_FIELDS. Preserve ids, url_slugs and
    all timestamps — member identities and personal links survive; only
    the family part of every URL changes. log.app_version is copied
    verbatim (it describes the entry's creator, not the copier).
  * VERIFY like the migration: read the new store back and compare row
    by row after decryption — counts alone are not verification.
  * **Crash-safe order, each step behind a persisted pending mark so an
    interrupted run resumes at boot:** (1) write the new store — purely
    additive, old store untouched; a re-run deletes the partial new
    store first (those rows are minutes old and OURS — the never-delete-
    user-data rule is about the old store). (2) switch the ACTING device
    to the new route (saveRoute, canonUrl; carry the
    haushalt.linksafe consent to the new family key; reset delta/full
    watermarks). (3) tombstone the OLD id in retired_families —
    permanent by RLS, this is the point of no return, everything before
    it is abortable. (4) delete the old rows with the old write key
    (log, chores, members, families LAST). Between (2) and (3) the
    household is briefly split (old store still writable) — same
    transition the 18.07. manual rotation had; the pending mark keeps it
    to seconds unless the network dies, and boot-resume closes it.
  * Tests the build must include: full-log paging against a mock that
    enforces the page size; failure injection at every step boundary
    incl. resume; the replaced-link notice on an old-link device; a
    famx e2e proving no cleartext and no OLD-key material ever leaves
    the client during the copy.

- ~~Un-gate the address-bar stripping~~ DONE in v4.77.0: the row is
  visible for every household (not on iOS — a switch that cannot work is
  a broken promise), consent is the only gate, default off. families.beta
  gates nothing any more and is free for the next experiment. The
  localStorage-loss trade-off stands, made visible in the confirmation:
  with the secret stripped, a device that loses storage has no fallback
  in bookmark or history — entry screen + QR are the rescue path.
- **Art privacy switch** for encrypted families (Pollinations
  sees tile names as prompts).
- **Nudge for old-family admins** about the encryption migration
  (approved, never commissioned).
- **TTL for inactive FAMILIES** (whole households, not entries):
  still open — v4.52.0 only covers the history.
- **Custom Domain** (fairli.app/ch) + option D (Cloudflare, private
  repos, per-person manifests) — fix the domain before any URL migration.
- Android person shortcuts = browser tab (accepted; the real fix =
  option D). iOS standalone can clear storage under space pressure →
  entry screen + QR codes are the lifeline.
- Arabic/RTL not supported (LTR layout assumptions).
- Foreign deletions only appear at the 24 h full sync (delta limit,
  documented; on complaints: reopening the app does not force a
  full sync — only after the mark expires).
- History entries before v4.11.1 without a note snapshot (intended).
- Chrome-on-iOS install: only finally verifiable on a real device
  (simulator routes exhaustively checked and not feasible).
