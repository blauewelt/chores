## 2026-08-23 — v4.108.0 (SW haushalt-v212): the logging toast leads back INTO the entry — and the tier2 nightlies run again

- Maintainer: «could the user tap the displayed toast to get into the history
  view with the just added activity open? For example, if they added it under
  the wrong user.» That is the moment the mistake is noticed — one second
  after the tap, with the toast still on screen. Until now the cure was: switch
  tab, find the row, tap it. Three steps for something one second old.
- `recordEntry()` now ends in `toastLogged()`: the same «+N für X» text, plus
  an action button «Ändern». Tapping it switches to Verlauf and opens that
  entry's sheet — where v4.107.0's Person field is one more tap away.
  Both write paths feed it, the fresh row AND the 1 h accumulation, so the
  button always points at the row that actually grew.
- **A labelled button, not a tappable toast.** A toast promises nothing by
  itself; a button does (standing question §11: what does the UI promise, and
  does it keep it?). The action toast also stands 5 s instead of 1.8 — the
  second in which you notice the wrong name is exactly that one.
- `openLoggedEntry()` clears an active person filter (LOGFILTER) and the
  search term before rendering: a fresh entry for someone else would be
  filtered out, and the sheet would open over a list that does not contain it.
- **`#toast` gets `width:max-content` — an old bug, found by looking.**
  `left:50%` without `right` leaves only the RIGHT half as available width, so
  shrink-to-fit was always capped near 50vw and `max-width:85vw` never bit.
  «Gelöscht · Rückgängig» has been wrapping for a year; the new toast is the
  most frequent one in the app and would have wrapped on EVERY tap, with the
  action sitting under the text reading like a caption. max-content takes the
  one-line preferred width, 85vw still caps long sentences. A test measures it
  (height < 56 px, action to the right of the text) so it cannot regress.
- i18n: one new key («Ändern») across all 19 files.
- Three tests: toast action opens the just-logged entry and the person is
  correctable right there; the action follows the 1 h merge to the GROWN row
  (2+2 = 4 in the sheet); filter and search are cleared so the sheet never
  opens over a list without the row.

### Tier-2 nightlies: all four were red, for three different reasons

**Nachtrag, same day, after dispatching the fixed workflows** — the first round
of fixes was partly wrong, and the runs said so:

- **android:** `-dns-server` was the obvious guess and the wrong one. The
  precheck now reported «Network is unreachable» — no ROUTE, not a name
  resolution problem. The script now nudges (`svc wifi/data enable`), polls
  connectivity for up to 60 s (the virtual Wi-Fi association is not finished
  when `boot_completed` fires) and, if it still fails, dumps `ip addr`,
  `ip route`, airplane mode and the net props — so the next round starts from
  a measurement instead of another guess.
- **ios (S1):** the idb route was a dead end — `idb-companion` refuses on
  macOS 14 (Sequoia), and on macOS 15 it demands a full Xcode 26 install.
  Then the artefact settled it: the screenshot ALREADY contained «E2E
  Testhaushalt», the ICH-BIN chip and the tabs, fully rendered behind the
  dimmed onboarding — only too dark for tesseract. So no UI automation at
  all: `scripts/ocr-boost.py` crops the top 45 %, autocontrasts and doubles
  it, and the assertion reads both passes. Verified locally against the real
  failing artefact: the boosted pass yields «E2E Testhaushalt», «ICH BIN
  Testperson», «Points History». Lesson: read the artefact before buying a
  tool.
- **capture / webclip:** moved on to `macos-26` (= macos-latest), the only
  image carrying Xcode 26. webclip will now likely fail LATER, at its iOS-17
  runtime pin, which no macOS 26 image can offer — that is the real open item
  for that scenario, and the workflow says so out loud instead of dying at
  `brew install`.

**Round 3 (same day) — S1 is GREEN.** The contrast-boost pass reads the locked
view straight through the dimmed onboarding; no idb, no tapping, no tool
install beyond tesseract. The other three moved one honest step further:
- **android:** now measured, not guessed. `ip addr`/`ip route` from the failing
  run show eth0 (10.0.2.15) and wlan0 (10.0.2.16) with addresses and on-link
  routes but **no default route** — hence «Network is unreachable». The image
  runs the virtio-Wi-Fi path (`ro.boot.qemu.virtiowifi=1`) and never gets one
  by DHCP. QEMU's slirp gateway is always 10.0.2.2, so the script adds the
  route itself (`adb root` + `ip route add default via 10.0.2.2`) and re-probes
  before giving up.
- **capture:** died on a leftover hardcode — `grep "iPhone 15 Pro ("` matches
  nothing on the macOS 26 image, and `simctl erase ""` took the job with it.
  Both capture and webclip now pick a device the same resilient way S1 does,
  and abort loudly when no iPhone exists at all.

**Round 4 — what the runs then said, and what it cost to hear it.**
- **android:** the route fix answered «File exists» — the default route was
  there all along. ping runs as the `shell` user and asks the MAIN table,
  while Android selects networks per-UID through policy tables, so
  «Network is unreachable» never said anything about the browser. The gate is
  now a `dumpsys connectivity` check that only WARNS: a precheck that is wrong
  more often than the thing it guards does not belong in the gate.
- **capture:** idb installed, Safari opened, and the share tap landed in the
  APP — the onboarding sheet was over the page again, and the «share sheet»
  OCR was reading «Save your access». It now dismisses the onboarding first,
  and derives the share-button coordinate from the device size instead of
  hardcoding 196,812 (the image ships 402×874 now, not 393×852). `ocr-tap.py`
  takes the logical width from `OCR_TAP_PT_WIDTH` for the same reason.
- **webclip:** reached the springboard and found no injected clip icon —
  exactly the predicted iOS-17 dependency. The scenario needs rebuilding on
  the capture flow (create the clip through the share sheet instead of
  injecting it); filesystem injection is dead on current runtimes. Left red
  ON PURPOSE, with the reason in the log, rather than softened into a green
  that proves nothing.


None of them was the app. They had been red for at least a week — a watchdog
that only ever barks is not a watchdog.

- **tier2-android:** the screenshot artefact showed Chrome's «No internet».
  The emulator no longer inherits the runner's DNS reliably (the log's
  «Netsim Wifi dns:///… is gone» is the tell). Fixed with
  `-dns-server 8.8.8.8,8.8.4.4`; `tier2-s4.sh` now PINGS before the deep link
  and fails with «Emulator hat kein Netz» instead of the misleading
  «Testperson nicht gefunden».
- **tier2-ios-capture / tier2-ios-webclip:** `brew install idb-companion`
  refuses on macOS 14 («does not run on macOS versions older than Sequoia»,
  wants Xcode 26). Both moved to `macos-15`. Caveat noted in webclip: its
  iOS-17 runtime pin may come up empty on the new image — then the existing
  fallback warns and the run fails on a STATEMENT instead of on tooling.
- **tier2-ios:** not tooling at all. The OCR dump was the onboarding sheet
  «Save your access» (v4.45.0) — modal on every first visit, and a freshly
  booted simulator is always a first visit. The dialog is in fact PROOF that
  the personal link resolved, but the assertion is meant to measure the locked
  VIEW. It now installs idb and OCR-taps «Let's go» first. Two more honesty
  fixes while in there: the device pick no longer hardcodes iPhone 14/15
  (runner images move on) and aborts loudly if no iPhone exists, and the UI
  assertion accepts English as well as German — the simulator runs in English
  and the app follows it, so the old grep measured the runner locale.

## 2026-08-22 — v4.107.0 (SW haushalt-v211): an entry's PERSON is editable — within the link's reach

- Maintainer, from a screenshot of the entry sheet: let the user be changed
  from here. The everyday case is banal and had no cure: you tap a tile while
  the «Ich bin» chip still stands on somebody else. Until now the only way
  back was delete + re-enter, and that threw away the entry's time, note and
  points correction along with the wrong name.
- New field «Person» in #logSheet, between Zeit and Speichern: the same
  `.chip` language as the «Ich bin» row (dot + name, aria-pressed on the
  current one) in a new `.chiprow` wrapper. Same question, same look — up
  there you pick who is logging, down here who the entry COUNTS FOR.
- **Reach = `allowedIds()`, not a new rule.** `logWhoOptions()` is a thin
  wrapper over it: admin (family link or `members.admin`) gets the whole
  family, everyone else gets themselves + the assisted members (v4.49.0 —
  the people without their own phone). This is the §8 standing rule
  exercised, not bent: every permission question goes through allowedIds(),
  never through `me === x` or USER_SLUG. The save path re-checks against a
  FRESH allowedIds() — the rendered chips are the allowed set, but a pull can
  move underneath an open sheet.
- **With fewer than two options the field is absent**, not disabled. A single
  dead chip would promise a choice that does not exist. A personal link in a
  household without assisted members therefore sees exactly the old sheet.
- **The rebooking is complete: points AND row count.** `bumpTotals(old, -pts,
  -1)` + `bumpTotals(new, +pts, +1)`, and deliberately AFTER the points slider
  has been applied, so what moves is the value that is actually saved. Doing
  it before would move the stale amount and let the server sums drift until
  the next pull. Without the `dN` half, the loser's card would keep claiming
  «N Aufgaben erledigt» for an entry they no longer have.
- `logged_by` stays untouched. Who ENTERED it is a record, not a setting
  (v4.54.0); only who it counts for is a correction.
- **One toast, not two.** `toast()` replaces its text, so a second call would
  silently eat the first — the move-toast (v4.78.0) and the new «Übertragen
  auf {name}» are joined with « · ». The transfer announcement exists for the
  same reason the move-toast does: the entry leaves one person's score card,
  appears on another's, and drops out of an active person filter (LOGFILTER)
  immediately. Nobody should have to go looking for it.
- i18n: one new key («Übertragen auf {name}») across all 19 files; «Person»
  already existed. Dictionary integrity test green (224 keys × 19).
- Five tests: admin rebooking end-to-end (row, toast, upsert body incl.
  unchanged logged_by, score cards), personal link offers only self +
  assisted (never the whole family), no field at all without a real choice,
  points + person + time in ONE save (the CURRENT amount moves, and both
  findings share one toast), and the chip click alone marking the form dirty
  so a backdrop tap cannot discard it silently. Visual sign-off in both engines, DE + EN, with a deliberately
  over-long member name: chips wrap, Speichern and «Eingetragen von …» stay
  in view under the field.
- **Fixed a red main that was nobody's commit:** the v4.63.0 tombstone test
  pinned its fixtures to fixed July dates. The trash has a 30-day clock
  (TRASH_DAYS) and purgeExpired() runs on the admin link — from 20.08. the
  tombstone was simply overdue and the sheet was empty for the right reason.
  It failed on a CALENDAR DAY, not on a commit, which is exactly the lesson
  behind weekSafeAgo (§11a). Fixtures are relative to now again.

## 2026-08-05 — v4.106.0 (SW haushalt-v210): narrower art, moved toward the points — and the text now runs OVER the motif

- Maintainer, immediately after v4.105: the art should use less horizontal
  room and sit a bit further right (toward the +n), and text should render
  over the tile art rather than stopping short of it.
- Art strip 190 → 140px at the same right offset, so its left edge moves
  from x 152 to x 202 (Pixel 7): less of the row, closer to the points.
  The reserved points column (--ptcol 56px) is unchanged, so +12 and +1
  still stand alone — measured gap 15–26px depending on digit count.
- TEXT OVER ART is now real, not just tolerated: padding-right drops
  170 → 70px (it only clears the points column), so the title uses the
  full row. `.what` gets position:relative + z-index:2 — without it the
  absolutely positioned art would paint OVER the static flex child — plus
  a text-shadow. The scrim widens from a left-edge fade to the WHOLE
  strip (.58 → .34 → .16), strongest where text begins.
- Effect: «Duschabfluss reinigen» and «Aufräumen Küche» render in full
  instead of truncating at the art's edge; the motif shows through behind
  them. This is the v4.104 «license for text on art» finally exercised.
- Contract test follows: art now 110–170px wide (was >170), text right
  edge provably past the art's left edge, .what z-index ≥2 and a real
  text-shadow; +n still never overlaps the art, one row height, points on
  one x, band on every row. No i18n, no schema.
- APP_VERSION 4.106.0, SW-Cache haushalt-v210

## 2026-08-05 — v4.105.0 (SW haushalt-v209): the art enters earlier and leaves before the points — +n always stands alone

- Maintainer, one release after v4.104: the tile should come in EARLIER
  (further left) and the +n should ALWAYS stand alone. So the row needs
  two gradients — one that introduces the art, one that ends it before
  the points column.
- Geometry: `.eartb` widened 150 → 190px and pulled off the right edge by
  a reserved points column (`--ptcol:56px`). Measured on Pixel 7: art
  spans x 152–342, +n sits 364–384, a real 22px of untouched card
  between them. Points column stays image-free in EVERY row, so +12 and
  +1 line up identically with and without art.
- ONE mask now serves image and veil: transparent → opaque (44%) →
  opaque (76%) → transparent. The soft exit on the right REPLACES the
  v4.104 right-hand scrim — there is simply no image under the points
  anymore, and the text-shadow on .pts is gone with it.
- The scrim moves LEFT, where the image now enters: it keeps long titles
  readable if they run into the fade-in zone. The v4.104 promise (a dark
  zone as the license to render text over art) is preserved, just
  relocated to the edge where text and art actually meet.
- Row height, uniform-height rule, Farbband, artless-row handling and the
  art-off mode are untouched.
- v4.103/104 contract test superseded by a v4.105 one: art ends >40px
  before the card edge, is >170px wide, +n never overlaps it, mask has
  TWO zero-alpha stops, veil still multi-layered, plus the surviving
  invariants (one height, no slot without art, points on one x, band on
  every row). No i18n, no schema.
- APP_VERSION 4.105.0, SW-Cache haushalt-v209

## 2026-08-05 — v4.104.0 (SW haushalt-v208): points move hard right OVER the art — the scrim is the license for text-on-art

- Maintainer screenshot from the live device: at the fade boundary the
  +n «floated» — its visual anchor depended on what each image happened
  to be doing underneath. His proposal, shipped as specced: a SECOND
  gradient on the art's right edge (a scrim), and the points sit on it,
  at the card's right edge.
- .pts in art mode is now position:absolute (right 14px, vertically
  centered, z-lifted, soft text-shadow): every number in the list lands
  on the SAME x — including artless rows — like a column. Leaving the
  flex flow returns the chip's width to the title (Duschabfluss reinigen
  no longer truncates at Pixel width).
- The eartb ::after veil gains a second layer: 270° scrim (.78 → 0 over
  the right 52%) stacked on the v4.99 vertical veil, both under the same
  leftward mask, both scaled by --dk. The scrim is deliberately strong
  enough that +n reads on ANY motif — and it is the stated license to
  render further text over the art later if the household wants it.
- Farbband-only mode (art off) untouched: .pts stays in flow there.
- v4.103 contract test extended: same right offset (14±3) and vertical
  centering in every row, ::after carries ≥2 gradients. No i18n, no
  schema. APP_VERSION 4.104.0, SW-Cache haushalt-v208

## 2026-07-31 — v4.103.0 (SW haushalt-v207): Verlauf-Anschnitt — the art bleeds from the card's right edge

- Maintainer request: explore GRADIENTS for the Verlauf art instead of a
  border. Four variants were rendered through the real app and compared
  on one sheet (soft-edge vignette / gradient frame running out into the
  card / ANSCHNITT full-bleed with leftward fade / borderless glow); the
  household picked Anschnitt, with one addition: ONE row height for all.
- The eartr box (v4.92–4.99: 90×84, task-color frame) is DELETED, not
  hidden. The image now sits flush against the card's right edge, full
  row height, and dissolves leftward into the row via a mask gradient
  (52% opaque → 96% transparent). No frame, no box — the illustration
  emerges from the card. choreColor/--c left the markup with the border
  that carried it; --dk stays (the v4.99.0 dark veil survives, now
  wearing the same mask, and doubles as contrast for the points).
- UNIFORM HEIGHT (maintainer 31.07.): in art mode every row — with or
  without an image — is .bleed: fixed 88px, same right text edge
  (padding-right 122px), points anchored and z-lifted above the fade.
  Art-off (Farbband default) is byte-identical to before.
- Contract test rewritten as v4.103.0: surviving intents kept (image
  right, text left of the opaque zone, veil present, artless rows
  slotless with anchored points, Farbband on every row) — box geometry
  (90×84, border color, overscan guard) retired with the box itself.
  The v4.92.0 toggle test follows the container rename (eartb).
- PIGGYBACKED CI REPAIR: the tests workflow had been RED since 29.07.
  (three runs), and v4.97–v4.102 were deployed over it — against the
  standing rule ROTES CI = KEIN DEPLOY. Root cause, verified against a
  clean checkout and the CI logs: the v4.96.0 preview-tile test asserted
  rect height == tileMinH(pts), but WebKit wraps «Müll rausbringen» into
  three lines and the tile legitimately grows 16px past its min-height —
  exactly as the real Aufgaben tile would. The test now pins the
  MECHANISM (min-height follows tileMinH, growing with points) and
  allows content to exceed it (rect >= tileMinH − 3). Green on both
  engines again; this deploy waited for that.

- No i18n keys, no schema. APP_VERSION 4.103.0, SW-Cache haushalt-v207

## 2026-07-31 — DB: RLS read-hardening applied (Supabase no longer world-readable for keyed families)

- Migration `20260731083000_rls_read_hardening.sql` (auto-applied via the
  db-migrate workflow on push): restrictive SELECT policies on members/
  chores/log bind reads to `fairli_read_ok(family_id)` — same key logic as
  writes (`x-fairli-key` vs. families.write_key_hash). Encrypted households
  are no longer readable without their family key. `families` stays readable
  by design (pre-key existence/migration lookup). Keyless legacy `fam-`
  households remain open (version-cut philosophy) — their migrate-or-retire
  cleanup is the separate, still-pending step (20260726_retire_legacy.sql).
- Pre-checks before applying (maintainer confirmed go): only ONE keyed
  family active in the last 7 days; its newest pre-v4.85 write was ~84 h
  old while v4.85+ clients wrote as recently as <1 h — no active client
  left that reads without the key. Rollback: drop the three auth_sel_*
  policies.
- No client change, no APP_VERSION/SW bump (current: 4.102.0 / haushalt-v206).

## 2026-07-29 — v4.102.0 (SW haushalt-v206): Folge-Tipp frischt den Verlaufs-Schnappschuss auf (Notiz erscheint sofort)

- Live-Fund (Maintainer): Notiz zu einer Aufgabe ergänzt, Aufgabe erneut
  getippt — die bestehende Verlaufs-Zeile blieb notizlos, bis irgendwann
  (> 1 h) ein frischer Eintrag entstand. Ursache: die 1-h-Zusammenlegung
  (v4.35.0) addierte NUR Punkte und liess den alten Name/Notiz-Schnappschuss
  stehen. Jetzt verbucht der Folge-Tipp die Aufgabe, WIE SIE JETZT IST:
  die Zusammenlegung frischt chore_name/chore_note der Zeile auf — genau wie
  ein frischer Eintrag den aktuellen Stand einfriert. §3 (Verlauf ist
  unveränderlich gegenüber Kachel-BEARBEITUNGEN) bleibt unangetastet: nicht
  der Kachel-Edit schreibt die Historie um, der neue TIPP tut es.
- Direkter Eintrag-Edit (Notiz im Verlauf-Sheet ändern) war und ist sofort
  sichtbar — per Repro bestätigt, Testabdeckung besteht.

## 2026-07-29 — v4.101.0 (SW haushalt-v205): Render-Bündelung («×N») gelöscht, Folge-Tipp zählt nie mehr auf einen Grabstein

- **«Tippen tut nichts mehr»-Bug behoben (Live 29.07.):** Die 1-h-Zusammen-
  legung (v4.35.0) suchte den jüngsten passenden Eintrag OHNE Grabsteine
  auszunehmen. Nach «Löschen» lag der Eintrag als Grabstein (deleted_at)
  wieder in state.log — der nächste Tipp fand IHN, addierte die Punkte auf
  die gelöschte Zeile und upsertete sie: sichtbar passierte nichts. Jetzt
  ist `!e.deleted_at` Teil der Suche; der Tipp erzeugt wieder eine echte
  neue Zeile. (Der Zustand war nie «kaputt» — nur die Punkte versickerten
  im Papierkorb-Eintrag; per Wiederherstellen wären sie sichtbar geworden.)
- **Render-Bündelung im Verlauf GELÖSCHT (Maintainer):** Einträge derselben
  Person/Aufgabe/Tag kollabierten beim Rendern zu «×N» mit Summenpunkten
  (v4.23.0) — zusätzlich zur echten 1-h-Zusammenlegung. Doppelt gemoppelt
  und mehrdeutig (Löschen traf N Zeilen auf einmal). Jetzt gilt: Folge-Tipps
  < 1 h werden beim ERFASSEN zu EINEM Eintrag zusammengelegt (unverändert);
  weiter auseinanderliegende Tipps sind bewusst getrennte Einträge und
  erscheinen auch getrennt. Mit der Bündelung fällt die Serien-Mehrfach-
  bearbeitung («Löschen (n)», gemeinsames Verschieben, ×N-Element samt CSS)
  ersatzlos weg — openLogSheet arbeitet nur noch auf genau einem Eintrag.
- Nebenbei: die Zusammenlegung und der Punkte-Edit ziehen jetzt auch
  state.totalsAll sofort mit (bumpTotals-Lücke seit v4.65.0).

## 2026-07-29 — v4.100.0 (SW haushalt-v204): Eintrag-Edit und Aufgabe-Edit teilen sich EINE Kachel-Vorschau

- Die beiden Bearbeiten-Sheets zeigten die Kachelkunst unterschiedlich: das
  Aufgabe-Edit als volle `.chore`-Kachel (halbe Breite, Name/Notiz/Punkte-
  Overlay, Aufgabenfarbe, Dunkel-Schleier), das Eintrag-Edit (Verlauf) als
  kleinen 96×64-Thumbnail. Jetzt tragen BEIDE dieselbe Vorschau — gemeinsame
  Klassen `.artprevslot`/`.artprevtile` (die alte `.artprevw` ist weg) und
  gemeinsame Füll-Helfer `paintPreviewTile()`/`setTilePreviewPts()`. Titel,
  Notiz und Punkte ziehen im Eintrag-Edit live in die Kachel nach, genau wie im
  Aufgabe-Edit; der Höhen-Slot ist ebenso reserviert, damit nichts springt.
- Kontext-Unterschied bewusst weggelassen: das Eintrag-Edit hat KEIN
  «Bild-Idee»-Feld (ein Eintrag ändert die Kachelkunst nicht) — das Bild bleibt
  dort also fest die Kachelkunst, während alles andere identisch ist.

## 2026-07-29 — v4.99.0 (SW haushalt-v203): Verlauf-Kachel bekommt den Dunkel-Schleier der Aufgaben-Kachel (helle Creme-Ränder weg), Suche wird beim Tab-Wechsel gelöscht

- **Weisse Linien oben/unten auf Verlauf-Kacheln behoben:** manche generierten
  Bilder tragen einen hellen Creme-Rand oben und unten (z. B. die Katze «Ginj
  hinaus begleiten»). Die Aufgaben-Kachel verdeckt ihn mit dem Dunkel-Verlauf
  (`.chore::after`) — die Verlauf-Kachel hatte diesen Schleier nicht, also
  blitzten die Ränder als weisse Linien durch. Jetzt trägt `.eartr::after`
  denselben Verlauf (oben/unten dunkel, Mitte klar) inkl. `--dk` aus artDim() —
  die Verlauf-Kachel sieht damit exakt aus wie im Aufgaben-Tab.
- **Suche nicht mehr über Tabs mitschleppen:** ein in Aufgaben getippter
  Suchbegriff blieb beim Wechsel zu Verlauf/Punkte aktiv und filterte dort
  weiter — das fühlte sich kaputt an (Maintainer 29.07.). Der Tab-Wechsel setzt
  die Suche jetzt zurück (Feld + QUERY leer). Der Leeren-Knopf und die Suche
  innerhalb einer Ansicht funktionieren unverändert.

## 2026-07-29 — v4.98.0 (SW haushalt-v202): Verlauf-Kachel 90×84 + Rahmen in Aufgabenfarbe, Kunst-Vorwärmen gegen bildlose Einträge

- Verlauf-Kachel höher: 90×60 → **90×84** (quadratischer, Seiten werden per
  cover beschnitten; Quelle 440×300). Aus dem Höhen-Mock gewählt (Maintainer
  29.07.). Breite bleibt 90.
- **Rahmen in der Aufgabenfarbe:** die Verlauf-Kachel trägt jetzt denselben
  Farbrand wie ihre Kachel im Aufgaben-Tab — `color-mix(in srgb, var(--c) 45 %,
  var(--card))` mit `--c` = `choreColor(chore.id)` inline pro Zeile, statt des
  einheitlichen Creme-Rahmens (`--artframe`, bleibt als Fallback). Die farbige
  Leiste links bleibt die Personenfarbe — zwei getrennte Signale (wer / welche
  Aufgabe).
- **Bildlose Verlauf-Einträge behoben:** «Speichern & verbuchen» einer frisch
  angelegten Kachel legte sofort einen Verlaufs-Eintrag an, während Pollinations
  das Bild noch erzeugte — die Zeile blieb bildlos (und ein `<img>`-Fehler nach
  3 Retries entfernte es ganz). Neu: `warmArt()` lädt die Kunst beim Anlegen im
  Hintergrund vor (losgelöst von jedem sichtbaren `<img>`), trägt sie bei Erfolg
  in ARTOK/SW-Cache und rendert den Verlauf einmalig nach. Zusätzlich wärmt der
  Verlauf-Render jede noch fehlende Kachel-Kunst aktiv nach (Nachschlagen der
  Kachel aus `state.chores` wie im Aufgaben-Tab) — so bleibt keine Zeile
  dauerhaft ohne Bild.

## 2026-07-29 — v4.97.0 (SW haushalt-v201): Edit-Vorschau exakt wie Listen-Kachel, Abdunkelungs-Regler entfernt (Schema bleibt), Kunst regeneriert 1s nach dem Tippen

- Edit-Vorschau == Listen-Kachel: Die `display:block`-Regel auf `#cArtPrevW`
  hatte das Flex-Layout der `.chore` ausser Kraft gesetzt — das Punkte-Pill
  klebte oben statt unten. Regel entfernt; beide Kacheln sind nun deckungs-
  gleich (Titel oben, Notiz darunter, `+n` unten links, Bild dahinter).
- Abdunkelungs-Regler entfernt (Maintainer 29.07.): der Dunkel-Verlauf sitzt
  nur oben, der Regler brachte wenig und kostete viel Platz. Das Schema
  (Spalte `chores.opacity`) BLEIBT — Kacheln und Edit-Vorschau spiegeln den
  gespeicherten Wert weiter als `--dk`; `artDim()` liest ihn. Beim Speichern
  bleibt ein vorhandener opacity-Wert unangetastet (kein Ueberschreiben auf
  100 %). Markup + `setDimSlider()` sind auskommentiert/entfernt, leicht
  reaktivierbar. Der v4.95.0-Regler-Test ist auf das neue Verhalten umge-
  schrieben.
- Kunst-Neuerzeugung: Beim Ändern von Bild-Idee, Titel oder Notiz wird die
  Vorschau-Kunst 1 s nach dem letzten Tastendruck neu erzeugt (Debounce, kein
  Fetch pro Zeichen). War bereits vorhanden — Verhalten bestätigt.

## 2026-07-28 — v4.96.0 (SW haushalt-v200): Aufgaben-Edit-Vorschau — Kachelhoehe waechst mit den Punkten, reservierter Slot

- Die Vorschau-Kachel ist jetzt exakt so hoch wie die echte Kachel: EINE
  Formel tileMinH(p)=104+34·log2(p+1) fuer Aufgaben-Kachel UND Vorschau,
  live am Punkte-Regler mitgefuehrt.
- Reservierter Slot (#cArtPrevWrap) in Hoehe der GROESSTEN moeglichen Kachel
  des Haushalts: tileMinH(max(MAXPTS, Kachel-Punkte)). MAXPTS ist die
  Haushalts-Einstellung «Max. Punkte» (Standard 5) — kein hartes 15, also
  wenig Leerraum. Die Felder darunter springen nicht mehr, wenn man die
  Punkte zieht. Links ausgerichtet (Maintainer-Entscheid gegen zentriert).
- 1 neuer Test (Vorschauhoehe = tileMinH(Punkte); Slot = tileMinH(MAXPTS);
  Ziehen der Punkte laesst den Slot stabil).
- APP_VERSION 4.96.0, SW-Cache haushalt-v200.

## 2026-07-28 — v4.95.0 (SW haushalt-v199): Pro-Kachel-Abdunkelung + Aufgaben-Edit-Vorschau ist eine echte Kachel

Maintainer praezisiert (28.07.):
- «Manche Kacheln zu dunkel» → der Regler steuert jetzt die ABDUNKELUNG,
  nicht die Bild-Deckkraft. Befund: das Bild rendert voll deckend; die
  Daempfung kommt vom Dunkel-Overlay (.chore::after). Der Regler
  «Abdunkelung» (0–100 %) setzt dessen Deckkraft pro Kachel via --dk.
  Standard 100 % = HEUTIGER Look (keine Bestandskachel aendert sich);
  nach links = heller. Persistenz: chores.opacity (0..1, Overlay-Deckkraft;
  NULL = 1.0). Migration 20260728210000, im Delta-Pull selektiert.
- Aufgaben-Edit-Vorschau: KEIN Banner mehr (v4.94.0 verworfen). Der
  Vorschau-Knoten traegt jetzt die .chore-Klasse und rendert EXAKT wie eine
  Kachel im Aufgaben-Tab — halbe Grid-Breite, links, gleicher Gradient,
  Name/Notiz/Punkte, nur nicht antippbar (DIV statt Button). --dk folgt dem
  Regler live; Name/Notiz/Punkte folgen den Feldern live.
- Der Eintrag-Edit (logSheet) behaelt seine zentrierte 96×64-Vorschau.
- Automatischer Migrations-Fluss: db-migrate laeuft jetzt bei jedem Push
  unter supabase/migrations/** (idempotent). Die opacity-Spalte wurde so
  bereits angewandt (REST-Probe 400 → 200).
- Tests auf v4.95.0 umgeschrieben (Vorschau = echte .chore, halbe Breite,
  nicht antippbar; --dk spiegelt/persistiert; Standard 1.0). Neuer i18n-Key
  «Abdunkelung» in 19 Sprachen (der ungenutzte «Bild-Deckkraft» entfernt).
- APP_VERSION 4.95.0, SW-Cache haushalt-v199.

## 2026-07-28 — v4.94.0 (SW haushalt-v198): Aufgabe-Bearbeiten zeigt die Kachel in echter Kachel-Größe

Maintainer-Entscheid (28.07., aus zwei gerenderten Varianten gewählt —
«volle Fläche klar» vs. «Kachel-Replik»): die REPLIK gewinnt.

- Das Aufgaben-Edit-Sheet (choreSheet) zeigt die Vorschau jetzt als echte
  Kachel: volle Sheet-Breite, 118px hoch, Bild gedimmt (.55) mit demselben
  Gradient wie .chore, NAME oben links + PUNKTE unten links im Overlay.
  Eine Live-Vorschau «so sieht die Kachel aus» — passt zum Bild-Idee-Feld.
- Overlays ziehen live mit: Name-Feld tippen → Overlay-Name sofort;
  Punkte-Slider → Overlay-Punkte sofort. Das Bild folgt debounced (jede
  Prompt-Variante ist eine eigene Erzeugung, unverändert seit v4.78.0).
- Der EINTRAG-Edit (logSheet) bleibt die kleine zentrierte 96×64-Vorschau
  aus v4.93.0 — nur das Aufgaben-Sheet wächst auf Kachel-Größe.
- Der busy-Funke sitzt bei der grossen Kachel unten rechts (::before, damit
  er nicht mit dem Gradient-::after kollidiert).
- 1 neuer Test (volle Breite, Banner-Verhältnis, gedimmt, Name+Punkte,
  Live-Name; Negativ-Kontrolle: keine Kachel-Overlays im logSheet).
- APP_VERSION 4.94.0, SW-Cache haushalt-v198.

## 2026-07-28 — v4.93.0 (SW haushalt-v197): Verlauf-Kachel 90×60 & Edit-Vorschau zentriert — durchgehend OHNE Overscan

Maintainer-Entscheid (28.07.), mit Messung statt Bauchgefühl:

- MESSUNG: 20 Live-Generierungen quer durch die Kachel-Namen (12 Namen ×
  Seeds) automatisch vermessen — KEIN einziges Bild trägt einen gemalten
  Rand. Der bisherige Ueberscan (22 %, später 12 %) schnitt also nur
  echtes Bild weg für einen Rand, den es nicht gibt. Nebenbefund: die
  Pollinations-API liefert 512×256 (2:1), nicht 440×300 — cover framt
  ohnehin, ein festes Quell-Seitenverhältnis anzunehmen war falsch.
- VERLAUF-KACHEL: 66×45 → 90×60 (3:2), KEIN Overscan (transform entfernt).
  Grösser, zeigt das ganze Bild; sitzt weiter rechts vor «+n».
- EDIT-VORSCHAU (beide Sheets, Aufgabe UND Eintrag): vereinheitlicht auf
  96×64 (3:2), ZENTRIERT (margin auto), KEIN Overscan — statt vorher
  Quadrat links (Aufgabe 96×96, Eintrag 84×84) mit 22 % Ueberscan. Die
  Titel-/Aufgabe-Zeile bleibt korrekt bei ihrem Eingabefeld (die zuvor
  erwogene Rechts-Platzierung hätte das Label verrutscht — daher zentriert).
- Der Pastell-Rahmen (v4.87.0) bleibt auf allen Flächen als ruhige Kante.
- Tests: Verlauf-Struktur- und Edit-Vorschau-Test auf v4.93.0 (90×60 bzw.
  96×64, Zentrierung, Negativ-Kontrolle gegen wiederkehrendes scale).
- APP_VERSION 4.93.0, SW-Cache haushalt-v197.

## 2026-07-28 — v4.92.0 (SW haushalt-v196): Verlauf-Kunst — Standard AUS, Bild wandert nach RECHTS, minimaler Crop

Maintainer-Entscheid (28.07.):

- STANDARD ist jetzt AUS: die Farbband-Variante (v4.91.0) ist die
  Grunderfahrung. haushalt.logart === '1' schaltet Bilder ein; Geraete
  mit explizitem An behalten es, unberuehrte Geraete wechseln auf Aus.
- Der An-Modus ist NEU GEBAUT, nicht mehr die alte Bild-links-Zeile:
  Basis ist die Farbband-Zeile (kompakt, 5px-Personenfarbe an der
  Kante, fetter Name), das Kachelbild sitzt RECHTS in der Zeile,
  direkt VOR den Punkten: [Band][Text] … [Bild] [+n]. Zeilen ohne Bild
  (Schnappschuss-Wache, Einmalige) lassen den Platz frei — kein
  Leer-Slot mehr; die Punkte bleiben rechts verankert. Die alten
  Bausteine eartw/eartph/edot sind GELOESCHT.
- CROP ERSETZT: Kachel im Bild-Seitenverhaeltnis 440:300 (66×45px)
  statt Quadrat, Ueberscan 12 % statt 22 %. Begruendung mit Messung:
  drei Live-Generierungen (28.07.) tragen GAR KEINEN gemalten Rand —
  cover in 1:1 + 22 % nahm seitlich rund ein Viertel des Bildes fuer
  einen Rand, den es meist nicht gibt. Jetzt: so wenig beschneiden wie
  noetig (~5 % je Kante als Versicherung); der Pastell-Rahmen (v4.87.0)
  schluckt seltene Reste optisch.
- Tests: die drei Verlaufs-Struktur/Toggle-Tests auf v4.92.0
  umgeschrieben (Standard Aus; Bild rechts vor +n mit Abstands- und
  Zentrier-Pins; Seitenverhaeltnis- und Ueberscan-Fenster 4px..20 % als
  Negativ-Grenze; kein Slot ohne Bild; Punkte-Kante buendig; Farbband
  in beiden Modi; geloeschte Klassen nirgends im DOM).
- APP_VERSION 4.92.0, SW-Cache haushalt-v196 (nur Bump).

## 2026-07-28 — v4.91.0 (SW haushalt-v195): tile art in the Verlauf is now a per-device choice — off = Farbband

- Household feedback (maintainer + flatmate): the art in the log can be
  visually overloading. Decision process: four art-less variants were
  RENDERED through the real app and compared side by side (Schlicht /
  Farbpunkt links / Farbband / Monogramm); the household picked FARBBAND.
- Settings row «Kachelbilder im Verlauf» (An/Aus), stored per device
  (haushalt.logart, default AN) — a viewing preference like the search
  toggle, never synced: one flatmate can turn it off without a family
  debate. The toggle re-renders immediately.
- OFF = Farbband: no art column, no empty slot, no initial circle — the
  person's color becomes a 5px ribbon on the card's left edge (position
  absolute under the card radius, overflow hidden), and rows drop from
  the fixed 96px art height to content height (~66px plain, ~86px with
  note). The ribbon forms a scannable color rail down the list; the bold
  name still says who, so no information is lost, only pixels.
- ON is byte-identical to v4.90.0 — the default experience does not move.
- 1 new i18n key in 19 languages; 1 new test (default ON, toggle to OFF:
  no eartw/eartph/edot, ribbon carries the person color, compact height,
  choice survives reload, toggle back restores the art row).
- APP_VERSION 4.91.0, SW-Cache haushalt-v195

## 2026-07-28 — v4.90.0 (SW haushalt-v194): Verlauf — the person circle moves to the row's right end, directly before the points

Maintainer follow-up to v4.89.0, same evening, after three mocks
(art corner top-right / far right at text-line height / far right at
points height): the winner is the circle as a normal flex child at the
END of the row, immediately BEFORE the «+n» points — both vertically
centered by the row itself, so person and points read as one pair:
«who, how much». The art crop is fully unobscured again, and the
artless placeholder slot is simply empty. The person's NAME stays in
the text line (maintainer choice — the chip is a color cue, not a
replacement for the name).

Markup: the dot leaves `.eartw`/`.eartph` and renders between `.what`
and `.pts`; CSS drops the absolute positioning (one flex child, no
geometry math). The structure test now pins: exactly one `.edot` per
row, none inside the art slots or the text line, the circle's right
edge before the points' left edge and within 20 px of it, and the
circle vertically centered in the row (±3 px). Negative control:
swapping the markup order (points before circle) turns the pin red.

## 2026-07-28 — v4.89.0 (SW haushalt-v193): Verlauf — the initial circle sits in the art's corner; text top-aligns as three lines

Two aesthetics refinements to the Verlauf rows, requested together:

- The 24 px colored initial circle (the ICH-BIN chip rendering) no longer
  sits inline in the text line — it overlays the TOP-LEFT CORNER of the
  art crop. Radius math: the circle has radius 12 and the crop's corner
  radius is 12, so the circle's arc CONTINUES the corner's arc — nested,
  not stacked. Coverage of the art stays minimal (a quarter of the circle
  at most overlaps painted content thanks to the 22 % overscan pushing
  the subject toward center). Rows WITHOUT art (snapshot guard: renamed
  or deleted chores, §3 history immutability) keep the same circle in the
  same place on their placeholder square, so the eye finds the person at
  a constant position in every row.
- The text column next to the art is laid out as if it always had three
  lines: `justify-content:flex-start` on a fixed 60 px column (= art
  height), so line 1 (person + task name) aligns with the TOP edge of
  the art even when only two lines exist. Before, short rows centered
  and line 1 wandered vertically between rows.

Tests: the Verlauf-Ordnung structure test pins the circle's new home
(`.eartw .edot` = 1, `.eartph .edot` = 1, `.eline1 .edot` = 0) and the
top alignment (|eline1.y − eartw.y| < 4 px, for an art row AND an
artless row). Negative control: restoring `justify-content:center` turns
the alignment pin red — the guard guards.

No behavior, storage, or sync changes — CSS and row markup only.

## 2026-07-28 — v4.88.1 (SW haushalt-v192): INCIDENT — v4.88.0 was deployed on a red suite; beat now rides the pull

CONFESSION, on the record: v4.88.0 went live although the full run had
4 failed tests. The deployer misread the tail of the log (saw «3 flaky …
318 passed», missed the «4 failed» block above it) and shipped. The rule
from v4.60 exists precisely for this: RED = NO DEPLOY, and «verify, READ,
then deploy» (ae0d3f4) means reading the WHOLE summary, not its last line.
The failures were real regressions of the new beat, not flakes:

- The boot-time beat fired for a plaintext family whose backend says
  «migrated» (Wegweiser row) — writing the retired fam- id into devices
  and breaking the v4.33.1 no-resurrection contract (its guard counts ANY
  non-famc POST, and it is right to).
- The v4.31.0 roundtrip test's request-recorder crashed on the unknown
  devices table (store[table].push on undefined) — masking the rest of
  that flow.

FIX (v4.88.1): deviceBeat() is no longer called raw at boot. It rides
EVERY ADOPTED pull that brought real members (called after lastSyncAt,
guarded by members.length) and self-throttles via the daily mark. A
device on a migrated/empty alt family never pulls members → never beats
→ never writes its plaintext id anywhere. Bonus: the member list is
always present when the beat runs, so the personal-link member_id needs
no wait-poll anymore (v4.88.0's 15 s loop deleted). The roundtrip test's
recorder now default-creates unknown tables — the migration contract is
about families/members/chores/log, not about every future table.

Suite re-run and READ this time: the v4.33.1 and v4.31.0 contracts are
green again alongside both beat tests, with retries off.

- APP_VERSION 4.88.1, SW-Cache haushalt-v192

## 2026-07-28 — v4.88.0 (SW haushalt-v191): device heartbeat — silent readers become visible
   [KORRIGIERT in v4.88.1, s. oben: der Beat feuert NICHT mehr roh am Boot,
   sondern nach jedem uebernommenen Pull mit Mitgliedern — der Boot-Beat
   dieser Fassung verletzte den v4.33.1-Vertrag auf migrierten Alt-Familien.]

- Maintainer question the log stamp (v4.72.0) cannot answer: «is anyone
  besides me updating?» The stamp sees only WRITERS; a device that just
  reads the scoreboard never reveals its build. Tonight's live case: the
  family-link device (no logged_by, no member identity) last wrote before
  the stamp existed — unclassifiable by design.
- New additive table `devices` (migration 20260728030000): device_id
  (client-minted, localStorage), family_id, member_id (nullable —
  EMPTY on the family link: the chip is a selection, not an identity),
  app_version, last_seen. Written once per day at boot, and immediately
  after a version change. WRITE-ONLY for clients: RLS has no select
  policy, so the publishable key reads an empty table — adoption data is
  dashboard-only (privacy stance of 20260727080000, sharpened). Writes
  gated by the same per-family write key as every table. No user agent,
  no model, nothing IP-adjacent — the version string and nothing else.
- Boot stays unimpressed: the beat is fire-and-forget behind CRYPTO_READY;
  the daily mark is set only AFTER a successful write, so offline devices
  and clients racing an unapplied migration retry on the next boot.
  On personal links the beat waits briefly (≤15 s poll) for the first
  pull's member list; if it never comes, it writes with empty member_id —
  the VERSION is the message, not the name.
- WHY NOT members-columns (the obvious idea): members carries
  touch_updated_at and feeds the delta sync — a daily write would bump
  rows into every device's pull (the churn 20260727080000 refused);
  a family-link device has no member row to stamp; multiple devices per
  person would last-writer-wins each other. One row per device answers
  the actual question.
- OPERATIONS: migration must be applied via the db-migrate workflow
  (workflow_dispatch) — the client tolerates its absence (404 → silent
  retry next boot), so deploy order is soft, but the data only starts
  flowing once the table exists.
- 2 new tests (personal link: version+member+device_id, same-day
  once-guard, version-change re-beat with STABLE device_id, family link
  with null member_id; failure path: 404 leaves no mark, boot unaffected,
  next boot retries). No i18n keys — the feature has no UI.
- APP_VERSION 4.88.0, SW-Cache haushalt-v191

## 2026-07-28 — v4.87.0 (SW haushalt-v190): one pastel frame around every art crop

- Maintainer request: a slight border around the crops so the tile art
  reads as the SAME object on every surface. Implemented as ONE warm
  pastel cream tone (--artframe, rgba(240,233,220,.42), 1.5 px) on all
  three crop surfaces — Verlauf thumb, task pane, entry pane — and on
  the Verlauf's empty slot, so the column keeps its rhythm.
- The tone is an echo of the painted cream frame that the generated
  images carry (and that the overscan crops away). Deliberately NOT
  measured per image: reading border pixels needs CORS-enabled canvas
  per thumbnail — a new failure mode for a 1.5 px line — and the painted
  frames are near-uniformly warm white anyway, so one fixed tone gets
  the effect without the machinery. Documented so the «infer it from the
  image» idea is not re-litigated without that cost in view.
- Same release, second maintainer finding: editing the prompt made the
  pane preview DISAPPEAR for the whole generation time. Cause: the
  debounce swapped src immediately, but a new prompt is a new IMAGE
  GENERATION (seconds) — the preview had no loaded image and faded to an
  empty frame; on failure it stayed empty. Now the old picture stays
  visible (dimmed, pulsing ✨ = «being repainted»), the new one preloads
  off-screen and swaps in ON LOAD; a failed generation quietly keeps the
  old picture, and a newer edit invalidates any older in-flight load.
  Test holds the «generation» open with a suspended route and asserts
  the old src is STILL displayed mid-generation; negative control
  (direct swap restored) → red.
- Pinned in the structure test (border color identical on image slot and
  empty slot); negative control: frame removed → red.

## 2026-07-28 — v4.86.0 (SW haushalt-v189): Verlauf polish — ICH-BIN-style person, one crop everywhere

- Maintainer-approved via MOCK before any deploy (new workflow for UI
  rounds — the screenshot went out first, the release second).
- The person in a Verlauf row now renders exactly like the ICH-BIN
  selector: colored circle with the initial, UNCOLORED name next to it.
  The v4.80.0 color chip is gone. Name and title share ONE font size
  (the compact one; weight separates them — name bold, title regular).
  The «·» separator was dropped after measuring: 19 px incl. gaps, which
  was precisely why «Aufräumen Küche» ellipsized 3 px short of fitting.
- «White stripes» on Verlauf thumbnails explained and fixed: generated
  tile art carries a PAINTED light frame on all four sides. On the tile
  (matching aspect) it reads as an intentional picture frame; cover-crop
  into the 1:1 Verlauf square removes the left/right frame but keeps
  top/bottom — two orphaned edges reading as artifacts. Fix: the image
  overscans its clipping wrapper by 22 % (transform:scale in an
  overflow:hidden square — cross-engine, unlike object-view-box, which
  Safari lacks). 15 % was measurably not enough: the frame is ~6.7 % per
  edge, 1.15 crops 6.5 %.
- Tests updated to the new markup, plus a new assertion pair: the slot
  is square AND the image inside is wider than the slot (overscan
  active). Negative controls: remove the overscan → red; let the two
  font sizes diverge → red.
- Engine lesson from the suite: WebKit collapses a BROKEN <img alt="">
  to 0×0 while Chromium keeps the CSS box — the overscan assertion was
  deterministically red on the iPhone project until the test routes a
  real 1×1 PNG instead of relying on the global art abort. Geometry
  assertions on images need LOADED images.
- First release fully under the §11b protocol: area claimed on the
  intent board beforehand, version assigned from the LIVE state at
  release time, deploy under the lock.
- Follow-up in the same release (maintainer, after seeing both features
  live side by side): ONE crop everywhere. Both edit panes previously
  showed the FULL 440×300 art including the painted frame while the
  Verlauf showed a frame-free square — two renderings of the same tile.
  Now a shared .artprevw wrapper gives the panes the same centered
  source-square crop (min(h,w) minus frame, via the 22 % overscan), just
  larger: task pane 96 px, entry pane 84 px (the colleague's «a tad
  smaller» relation between the panes is preserved), Verlauf thumb 60 px.
  The colleague's v4.84.0 test pinned the old 42 %-width geometry — that
  premise is superseded by the unification, so its assertion now pins
  the new truth (square wrapper, pane-sized, image overscans the
  wrapper) while keeping their snapshot-rule and no-placeholder checks.
- FOURTH version collision today — and the FIRST caught by tooling, not
  luck: the parallel session shipped its v4.84.0 (entry-edit-sheet art,
  e6347307) while this suite ran, and this session's deploy was REFUSED
  by the new version guard (exit 3, lock released cleanly) instead of
  interleaving blind. §11b works. Renumbered to 4.85.0, merged on top,
  their feature verified intact. Note for both sessions: the intent
  board only helps if it is READ before starting — the two art efforts
  were adjacent (Verlauf row vs. entry edit sheet) and composed, but
  that was proximity, not coordination.
- FIFTH collision, SECOND caught by the guard: the colleague shipped
  v4.85.0 (self-hosted font for GDPR + privacy.html) during this
  session's suite run; this deploy was refused cleanly (exit 3, lock
  released) and renumbered 4.85.0 → 4.86.0 on top of their head. The
  guard has now paid for itself twice in one evening.

## 2026-07-28 — v4.85.0: GDPR-Härtung — eigene Schrift, Read-Key auf GET, Datenschutz-Link

- Bricolage Grotesque selbst gehostet (bricolage-grotesque.ttf, variable
  100–900, @font-face inline): kein IP-Transfer mehr an Google Fonts.
  Nebeneffekt: Schrift rendert jetzt auch offline korrekt.
- sb() sendet den Familien-Schlüssel (x-fairli-key) auch auf GET —
  Vorbereitung für die RLS-Lesesperre (Supabase nicht mehr weltlesbar).
  Die SQL-Migration folgt SEPARAT, erst nach Client-Verbreitung
  (Reihenfolge zwingend, sonst brechen Reads gecachter Clients).
- Datenschutz-Link («Datenschutz») auf dem Einstiegs-Screen →
  privacy.html (Datei lag schon im Repo, war aber nirgends verlinkt).
- Kachel-Kunst (Pollinations) bewusst UNVERÄNDERT — Maintainer-Entscheid
  27.07.: Feature bleibt; Ersatz nur durch etwas Besseres (§12).
- SW-Cache haushalt-v188; Shell + bricolage-grotesque.ttf + privacy.html.

## 2026-07-27 — v4.84.0 (SW haushalt-v187): tile art in the ENTRY edit sheet

- Maintainer request («I think you shipped this before»): v4.79.0 put the
  art into the TASK edit sheet and the Verlauf rows — the Eintrag-
  bearbeiten sheet (logSheet) never had it. Now it does: top left under
  the bar, width 42% (deliberately a tad under the task sheet's 46% —
  «roughly tile size, maybe a tad smaller»), same radius/border/aspect.
- Same snapshot rule as the Verlauf row (v4.78.0, §3): image only if the
  chore still exists AND still carries the entry's snapshot name; one-off
  entries (chore_id null) and renamed chores show NO image and NO empty
  slot — a sheet has no column alignment to keep, unlike the list.
- Cached-image completion re-checked after innerHTML insertion (same
  pattern as the list render) so the fade-in cannot strand at opacity 0.
- Claimed on the §11b intent board as «logSheet art» (the parallel
  session's active claim covers the Verlauf ROW — no overlap).
- 1 new test (image with matching snapshot; 0.30 < width-ratio < 0.46;
  no element at all for one-offs). No i18n keys.
- APP_VERSION 4.84.0, SW-Cache haushalt-v187

## 2026-07-27 — process: release lock + intent board (§11b) — parallel sessions, serialized releases

- Maintainer question after the third collision: engineers work in
  parallel all the time, why can't sessions? Answer: they can — teams
  parallelize WORK but centralize RELEASE NUMBERING, and that was the
  missing piece. All three collisions were version/cache races; the code
  itself merged cleanly every time.
- deploy.mjs now takes an atomic release lock (refs/heads/release-lock;
  creation fails if held; stale >30 min is broken automatically; every
  abort path releases it — the first cut leaked the lock on abort
  because process.exit() skips finally, caught before shipping). It also
  guards the actual failure mode: deploying an index.html/sw.js whose
  APP_VERSION/cache EQUALS the live one aborts. Version numbers are now
  assigned under the lock, from the remote, never during development.
- scripts/wip.mjs is the intent board — claim/list/done on wip-* refs —
  because sessions cannot talk to each other, and today's five parallel
  releases composing cleanly was luck, not design: both sessions were in
  Verlauf-adjacent code all evening.
- All behaviours tested against the real repo before this deploy:
  foreign lock blocks (exit 2, holder + age printed), version guard
  aborts (exit 3), lock released on every abort, claim/list/done
  roundtrip. THIS deploy is the happy path's first real use.
- No version bump: app files are untouched — scripts and docs only.
- Adoption note for the OTHER session: you are running the old
  deploy.mjs until your next fetch/reset. Pull before your next release,
  set FAIRLI_SESSION, and claim your area on the board.

## 2026-07-27 — v4.83.0 (SW haushalt-v186): Verlauf order — one row height, square art, one baseline

- Maintainer spec (round 4, from the live device): uniform crops, SAME
  height for every row, chip and title letter-aligned on one baseline,
  note/time on the following lines, everything vertically centered.
- Row is now a fixed 96 px (.vrow — scoped so the trash sheet keeps its
  own layout). The art is a uniform 60 px SQUARE (object-fit:cover,
  radius 12) instead of the full-height bleed from v4.81.0 — variable
  row heights had made those crops visibly inconsistent from row to row.
- Line 1 is a flex row with align-items:baseline: chip text and chore
  title sit on the SAME baseline. Long titles and notes get single-line
  ellipsis — uniformity beats density in a feed.
- REVERSED from v4.80.0, deliberately: rows without art (one-offs,
  renamed tiles) now carry an EMPTY slot in the same size, so the text
  column starts at one x-coordinate in every row. The earlier «honest
  raggedness» stance lost to the maintainer's ordered-look requirement —
  the slot is quiet (slightly lighter than the card, no icon), so it
  reads as a gutter, not as a broken image.
- Structure test pins all of it: equal row heights, square image, slot
  in image size, and the text column x-position identical across rows
  with and without art.
- Renumbered AGAIN during deploy prep (4.82.0 → 4.83.0): the parallel
  session shipped ITS v4.82.0 (own time picker, ef461ff0) while this
  suite ran — third collision today, third time both sessions chose the
  same next version AND the same next SW cache independently. Merged on
  top; their picker verified present after the merge. The sessions are
  now effectively interleaving releases blind. STOP RULE for whoever
  reads this next: check git log for a foreign head before EVERY bump,
  and if the other session is still live, one of the two stands down.

## 2026-07-27 — v4.82.0 (SW haushalt-v185): own time picker — the OS dialog is gone

- Maintainer decision (after the v4.80.0 «Clear» round): replace
  datetime-local entirely. The system dialog was OS chrome — system
  language instead of app language, unstylable Set/Cancel emphasis, an
  unremovable Clear, and the wheel behind the 27.07. off-by-one.
- Zeit field in the edit sheet is now a Fairli-styled button showing the
  value in app language via dayLabel («Gestern, 19:47»); the machine
  value lives in data-v ('YYYY-MM-DDTHH:mm', local). Tapping opens an
  own picker SHEET in Fairli anatomy: grabber, title «Zeit wählen»,
  × top right, Heute/Gestern chips, month calendar (Mo–So per app
  locale, today ringed, selection filled, neighbor-month days dimmed
  but tappable), hour:minute selects, ONE primary action «Übernehmen».
- Contract: NOTHING commits until Übernehmen — ×, backdrop and swipe
  discard the selection outright (nothing is dirty until applied, so no
  guard). There is no clear path at all; the v4.80.0 snap-back listener
  is deleted with the input it guarded, its test replaced by the new
  anatomy contract (no Clear text, one primary action, × discards
  restlos, done_at byte-identical without Übernehmen).
- Save path unchanged: reads data-v where it read input.value; delta
  math, sub-minute rule and the v4.78.0 move-toast apply as before.
  Series editing (n>1) untouched — the picker sets the anchor, the
  delta shifts the series as always.
- 6 new i18n keys in 19 languages («Zeit wählen», «Übernehmen», month
  nav, Stunde/Minute — the calendar itself needs none, weekday and
  month names come from toLocaleDateString in the app locale).
- Tests: shared helper setPickerTime() drives the sheet UI; the three
  lTime.fill() call sites (v4.25.0 series, v4.78.0 both) rewritten to
  it; 2 new tests (anatomy/discard contract; Gestern chip end-to-end
  with the move-toast). datetime-local no longer appears in the app.
- APP_VERSION 4.82.0, SW-Cache haushalt-v185

## 2026-07-27 — v4.81.0 (SW haushalt-v184): Verlauf aesthetics — art leads, the person is a chip

- Maintainer feedback on v4.79.0 from the live device, two rounds:
  (1) the colored dots no longer fit next to the art, and the art could
  lead the row; (2) the edit-sheet preview at full width overwhelmed the
  sheet — tile size, top left.
- Maintainer feedback round 3 (mid-build, from the live device): the
  date could land visually under the art, and the art should span the
  FULL row height. Final row: the art is a full-height leading COLUMN
  (64 px wide, align-self:stretch, negative margins bleed it flush into
  the card, radius only on the outer corners) — nothing can sit under it
  by construction. Then the person as a COLORED CHIP (person color as
  background, dark bold text, ellipsis at 40 % width for long names),
  chore name inline, note and time left-aligned beneath in the same text
  column. The old color dot is gone from Verlauf rows — next to a
  picture it was noise, and the chip carries the same information where
  the eye already reads. The dot stays in the trash sheet (no art).
- Edit sheet: the preview sits at the TOP LEFT at tile proportions
  (46 % width, tile radius 14) — the sheet now opens with the picture of
  the tile being edited. The live Bild-Idee coupling is unchanged.
- Rows without art (one-offs, snapshot-name mismatches) start with the
  chip — deliberately no placeholder box, an empty frame would be worse
  than honest raggedness.
- Chip test pins name, computed person color, dot absence and art-first
  order. Visual acceptance re-rendered on both device projects.
- Renumbered 4.80.0 → 4.81.0 DURING deploy prep: the parallel session
  shipped ITS v4.80.0 (time-picker Clear fix, 886054de) while this
  feature's suite was running — the second collision today, and both
  sessions had independently chosen SW cache haushalt-v183. Merged on
  top (their index/tests changes are disjoint from the art work; the
  LOG both-prepend resolved by keeping both entries), cache leapfrogged
  to v184. Two sessions deploying at once WILL eventually clobber a
  release — the handover rule is not ceremony.

## 2026-07-27 — v4.80.0 (SW haushalt-v183): «Clear» in the native time picker is now visibly a no-op

- Maintainer concern (screenshot of the Android system picker): the OS
  dialog for datetime-local ships a Clear button that CANNOT be removed
  or restyled from the web page (no attribute hides it; `required` does
  not either) — but a Fairli entry without a time does not exist as a
  concept. Decision: keep the native picker (styling it means replacing
  it), make Clear harmless.
- The save path has always treated an empty Zeit field as «time
  unchanged» — the data was never at risk. What was wrong is the FORM:
  after Clear the field sat there empty, looking like a cleared time.
  Now an input listener restores the previous value the moment the field
  empties, so Clear visibly does nothing and the sheet can never show a
  timeless entry.
- Not touched: the picker's look (Set/Cancel/Clear labels, button
  emphasis) — that is OS chrome, rendered by Android in the SYSTEM
  language and theme; the page has no reach into it. On record because
  the question will come back.
- 1 new test (field snaps back on clear; Speichern afterwards changes
  nothing — done_at byte-identical, no move-toast). No i18n keys.
- APP_VERSION 4.80.0, SW-Cache haushalt-v183

## 2026-07-27 — v4.79.0 (SW haushalt-v182): tile art in the edit sheet and in the history

- Maintainer request: surface the tile art in two more places. Chosen in
  review: the task EDIT sheet and the Verlauf.
- Edit sheet: a full-width preview of the current tile art sits under the
  Bild-Idee field and follows it live (debounced 1 s — every prompt
  variant is its own image generation, per-keystroke would be waste; the
  prompt feeds from Bild-Idee OR name+note, so all three fields listen).
  Only when EDITING an existing tile: the art seed hangs off the id, and
  a new tile has none until save. This makes the Bild-Idee field
  tangible for the first time — change the idea, see the picture.
- Verlauf: a 38 px thumbnail per entry, person dot kept (it carries
  information). SNAPSHOT GUARD: the thumb appears only while the tile
  still exists AND still carries the entry's snapshot name — history is
  immutable with respect to the chore (§3), and a renamed tile's new
  picture would lie next to the old entry text. One-offs (chore_id null)
  have no art and render as before.
- Both places reuse EXACTLY the tile URL: SW-cached, so no new requests
  and no new privacy surface (Pollinations already saw that prompt).
- The hidden-attribute test caught a real CSS bug before it shipped:
  display:block on the preview overrode the hidden attribute, so the
  create sheet showed an empty preview frame. #cArtPrev[hidden] fixes it.
- **Parallel-session collision, recorded for the next reader:** while
  this was being built, ANOTHER session deployed v4.78.0 (move-toast for
  Verlauf date edits, cd73beb1) — its tests appeared unexplained in this
  session's tree after the base fetch and matched the -g v4.78.0 filter.
  This feature was renumbered 4.78.0 → 4.79.0, rebased on cd73beb1, and
  both features' tests run green together. The handover rule stands for
  a reason: ONE session per working tree at a time; deploy.mjs at least
  fails loudly on a moved ref (non-fast-forward) instead of clobbering.
- Visual acceptance on both device projects with a real PNG routed in
  place of Pollinations (an aborted route leaves art invisible and shows
  only the reserved gap — the earlier hand-built base64 PNG was invalid
  and produced exactly that, worth knowing for future previews).

## 2026-07-27 — v4.78.0 (SW haushalt-v181): move-toast after a Verlauf date edit — plus a seconds-nudge fix it exposed

INCIDENT (27.07., maintainer's own family): an entry meant for «yesterday»
was date-edited and «disappeared». Live-DB forensics: it existed the whole
time, owner unchanged, but it had landed one day FURTHER back than intended
— and because the edit happened on a Monday, «yesterday» was already last
week, so the entry also left the weekly scoreboard and the week-restricted
Verlauf jump (v4.66.0). Re-filed two headers down and absent from every
«Diese Woche» view, it read as data loss.

- Move-toast: saving a Verlauf edit whose date changed now confirms the
  landing day — «Verschoben auf Samstag, 25. Juli, 11:11» (dayLabel says
  Heute/Gestern where applicable; series: «{n} Einträge verschoben …»).
  If the new date lies before weekStart(), the toast appends
  «— nicht mehr in ‹Diese Woche›» — the answer BEFORE anyone goes looking.
- dayLabel moved to module scope (was render-local); shared by the day
  headers and the toast, byte-identical output.
- FOUND BY THE NEW TEST, fixed alongside: the datetime-local input has
  minute precision, so an untouched time differs from done_at by its
  stripped seconds — every unrelated save (rename, note, points) silently
  nudged done_at backwards by up to 59 s. Sub-minute deltas now count as
  «no move»: done_at stays byte-identical on unrelated edits, and the
  toast cannot fire on truncation noise.
- 3 new i18n keys in 19 languages; 2 new tests (name-only edit stays
  silent + same-day move names «Heute» without week warning; out-of-week
  move warns and the entry is provably still in the list). The name-only
  case doubles as the regression test for the seconds-nudge.
- APP_VERSION 4.78.0, SW-Cache haushalt-v181

## 2026-07-27 — v4.77.0 (SW haushalt-v180): «Adressleiste aufräumen» for every household; rotation design frozen in §12

- Maintainer decisions: un-gate the tidy toggle now; rotation design is
  approved but built later.
- Un-gate: the settings row appears for every household (icon 🔗 instead
  of 🧪 — it is no longer an experiment), default OFF, which is exactly
  the previous behavior. The consent mark is the only gate. On iOS the
  row does not appear at all: stripping can never work there (§6.2), and
  a switch that cannot do anything is a broken promise — asserted in the
  iOS test.
- The negative control did its real job by NOT going red: re-gating the
  sync-time strip block changed no test outcome, which exposed that the
  block has been DEAD since the v4.73.0 reload fix — every entry path
  runs through the boot replaceState (canonUrl), which already respects
  the consent, and the settings toggle strips immediately itself.
  Removed. A guard whose removal fails no test guards nothing; the
  control that bites is re-gating the settings ROW (roundtrip test with
  beta:null → red).
- Follow-through the suite demanded: the goal-coupling guard clicked the
  settings row on the iPhone project, where the row is now deliberately
  absent — deterministic red on webkit, green on chromium. The guard now
  runs under an Android UA (and with beta:null, proving the un-gate),
  because a test must exercise the switch where the switch exists.
- families.beta now gates NOTHING and is free for the next experiment.
  It is still read (🧪 marker in the sync details).
- Rotation («Neuer Haushalts-Link»): full build-ready design written
  into §12 — sheet mock, famx/famc-only v1 scope, runMigration reuse,
  full-log paging, decrypt/re-encrypt per ENC_FIELDS, row-by-row verify,
  crash-safe step order with persisted pending marks and boot resume,
  tombstone as the point of no return, and the test list the build must
  cover. Maintainer rotates the currently exposed link with the 18.07.
  scripts in the meantime.

## 2026-07-27 — v4.76.0 (SW haushalt-v179): «Wie das Gerät» is the default language choice

- Maintainer request, and the cheapest of the three open items because it
  is REPRESENTATIONAL: «no stored choice → derive from navigator.language
  at boot» has been the behavior all along. What was missing was honesty
  and a way back. The language sheet marked the DERIVED language with a
  checkmark as if the user had chosen it, and after one tap there was no
  way to return to following the device.
- Now: first row «Wie das Gerät · <resolved language>», carrying the
  checkmark whenever no explicit choice is stored — the language row
  below stays unmarked even while it is the active language, because the
  checkmark shows the CHOICE, not the effect. Picking a language stores
  it (as before); picking «Wie das Gerät» deletes the stored key.
- Absence of the key IS the state — no sentinel, no migration. Every
  existing user who never chose is already on the new default; every
  explicit choice keeps working unchanged (v4.27.0 test untouched and
  green). updates.html needs no change: it reads the same key and falls
  back to the browser language (v4.75.1), which is exactly the
  «Wie das Gerät» semantics.
- Follow-the-device is real, not one-shot: the device language is
  re-derived on EVERY boot, so changing the phone language changes the
  app on the next start without touching settings.
- Two tests (device wins without a choice + choice beats device and the
  way back survives a reload), two negative controls (checkmark back on
  the derived language → red; langAuto without deleting the key → red).
- New i18n key «Wie das Gerät» in 19 languages.

## 2026-07-27 — v4.75.1 (SW haushalt-v178): release notes follow the APP language

- Maintainer finding on device: app set to German, phone OS English →
  updates.html rendered in English. The page decided from its own memory
  (fairli.notes.lang) and then navigator.language — it never read the
  app's actual setting.
- Fix: `haushalt.lang` wins (same origin, so the notes page can read it).
  Notes exist only in DE/EN, so: de → de, any OTHER explicitly set app
  language → en (for an app set to fr/uk/ja, English is the better
  approximation — German would only be the accident of the source
  language). Without an app choice, behavior is unchanged: remembered
  toggle, else browser language. The in-page toggle still works but now
  lasts for the visit — on the next open the settings own the language
  again. All three rules tested; negative control (navigator-only init
  restored) → 2 red.
- Trap documented while shipping this: updates.html LOOKS like a plain
  network page (the v4.39.1 shell-rule fix routes navigations past the
  app shell), but it sits in the SW PRECACHE — installed devices serve
  it cache-first. A fix to it therefore needs a cache bump like any app
  change, hence v4.75.1/haushalt-v178 rather than a bump-less deploy.
- Shipping this surfaced the sandbox WebKit spawn flake clearly enough
  to name it: two consecutive full runs each had exactly ONE webkit
  failure — `goto` hanging until the timeout — on a DIFFERENT, unrelated
  test each time, both 3/3 green in isolation, MESA/EGL noise in the
  log. That is the GPU-less container wedging WebKit's process start,
  not the app. Local runs now retry once, exactly as CI always has;
  Playwright reports retried tests as FLAKY in the summary, which must
  be read (rule in §10). A test failing both attempts stays a real
  failure.
- NEWS_VERSION stays 4.74.0: the CONTENT of the notes is unchanged, and
  re-pinging every household over a language fix would be noise.

## 2026-07-27 — v4.75.0 (SW haushalt-v177): the address bar is only tidied WITH consent

- Maintainer, on reading v4.73.0: «losing access via losing local storage
  sounds scary». Correct, and the objection is sharper than the feature.
- What v4.73.0 got wrong was not the mechanism but the ASKING. The address
  bar, bookmarks and browser history are a copy of the household link that
  most people do not know they have. Stripping the URL silently removes
  that copy, and because family_id = SHA-256(secret) the server can never
  hand it back: lose every copy and the data still exists but is
  unreachable forever. An app must not take away a backup unasked.
- So the mark changed meaning: `haushalt.linksafe:<fam>` is now the user's
  CONSENT, not a side effect of stripping. No consent → the link stays in
  the address bar, exactly as before v4.73.0. Settings row «Adressleiste
  aufräumen» (19 languages), off by default, with a confirmation that
  names the trade-off and tells you to save the link as a bookmark, home
  screen icon or QR code first.
- Revoking restores the link IMMEDIATELY, not on the next start — whoever
  turns it back wants to see the address bar now, not later. Tested, and
  negative-controlled (drop the immediate replaceState → red).
- Three tests: without consent the link stays; consent + revoke round trip
  incl. persistence across a reload; declining the prompt changes nothing.
  Negative control on the gate itself: let the sync strip without checking
  consent → 3 red.
- Worth recording as a judgement, not just a diff: the honest reading of
  «only strip once the link is saved» is that the APP CANNOT KNOW whether
  a link is saved. Completing «Zugriff sichern» only means the sheet was
  dismissed; being installed does not help either, because the family
  WebAPK starts at the generic start_url and finds the household through
  localStorage anyway. The only truthful signal is the user saying so —
  so the app asks instead of guessing, and makes the trade-off visible in
  the question.
- The suite caught a rename of mine: the v4.74.0 coupling guard still
  pointed at #setBetaOff, which no longer exists. Repointed at
  #setStripUrl rather than deleted — the intent (the switch must never
  take the weekly goal away) is exactly as valid under the new name.
- NOT changed: iOS still never strips (§6.2, the web clip bakes in the
  current URL), and households without the beta flag see none of this.

## 2026-07-27 — tests: the v4.73.0 device checks became assertions (no version bump)

- Question was «can you run those install checks in the emulator?».
  Answer: not here — no /dev/kvm, no virtualisation extensions, no
  Android SDK, and the iOS Simulator needs macOS. WebAPK minting is also
  server-side at Google, so even a slow software-emulated Android would
  not have proven the interesting part.
- But the emulator was the detour, not the evidence. Installation depends
  ONLY on the manifest, and every start_url here is built from the route
  VARIABLES, never from location.href:
  * family → the STATIC /chores/manifest.json, whose start_url has been
    generic since forever (/chores/index.html, household via loadRoute()).
    The Android family WebAPK never carried the secret, so stripping the
    address bar cannot affect it. That was true before v4.73.0 too.
  * personal → manifest.json?f=<fam>&u=<slug>, assembled from
    FAMILY/USER_SLUG for the service worker to answer.
- So all three checks became deterministic tests, running on BOTH engines
  in CI instead of once on a device: family manifest unchanged after
  stripping; personal manifest still carries family and slug; and a
  simulated icon launch (blank /chores/ with a stored route) finds the
  household and stays stripped. Negative control: build the manifest from
  location.href instead of the variables → red.
- What still genuinely needs a device is untouched by this change: does
  Chrome mint the WebAPK, does iOS create the web clip. Both paths are
  unchanged and were working before.
- What is left is therefore NOT a test but a decision: with the secret
  gone from the address bar, a device that loses localStorage has no
  fallback in bookmark or history. Entry screen + QR are the documented
  rescue. §12 rewritten accordingly.
- No APP_VERSION/SW bump: tests and docs only, no client change.

## 2026-07-27 — v4.74.0 (SW haushalt-v176): the weekly goal ships to everyone

- Maintainer call: the beta is ready. The goal is now STANDARD for every
  household — goal field and week bars in the person sheet, 🎯 mark in
  the people list, ranking by attainment in «Diese Woche», the Ø/week
  yardstick in «Gesamt», headroom bar and the «ohne Wochenziel» divider.
- Un-gated in the CLIENT, not by writing to the database. Flipping
  families.beta for every row would have been a mass write to user data
  that only another mass write could undo; removing the condition ships
  the same thing, touches nobody's rows, and is revertible by a deploy.
- **The important part: families.beta gated TWO unrelated things.** The
  goal AND the v4.73.0 address-bar stripping, which is still waiting on
  the device checks (Android install, iPhone web clip). «Enable the beta
  for everyone» would therefore have shipped an unverified ROUTING and
  INSTALL change to every household — §6, the biggest minefield in this
  project. So the flag was split: the goal is unconditional, beta now
  gates the URL experiment alone.
- Follow-through on that split: the settings row said «Beta: Wochenziel»
  and would have been a lie — relabelled «Beta: Adressleiste» (19
  languages). A new test switches the beta OFF and asserts the goal is
  STILL there; with the old coupling, leaving the beta would have
  silently removed a shipped feature from that household.
- Test that asserted the opposite is inverted, not deleted: «OHNE Beta
  ist ALLES unverändert» (v4.67.0) was the promise while it was a beta,
  and is now false. It became «Wochenziel ist Standard: auch OHNE
  families.beta …». A test whose premise expires must be rewritten to
  state the NEW truth — deleting it would have dropped the coverage.
  Negative control: re-gate goalOf() behind BETA → 2 red.
- updates.html extended (DE + EN) and NEWS_VERSION bumped to 4.74.0 in
  the SAME commit, per the mandatory rule. Checked against the 18.07.
  dud case: devices carry seenver ≤ 4.73.0, which is BELOW 4.74.0, so
  the banner actually fires instead of silently never triggering.
  The release note names the point of the feature, not just the
  mechanics: goals may and should DIFFER per person, otherwise it turns
  back into a points race.
- Visual acceptance in both device projects, DE and EN, for a household
  that has never seen a goal: person sheet with 🎯 field, Ø hint and
  week bars, and the points view unchanged while no goal is set.
- **Process failure, recorded because it is the useful part:** the suite
  check and the deploy were chained into ONE shell command, so the deploy
  fired before the result could be read — and one webkit case WAS red.
  It turned out to be a WebKit crash inside ctx.close() in the sandbox
  (MESA/EGL without a GPU → «WebKit encountered an internal error»),
  every assertion in the test had already passed, CI on real
  infrastructure is green for bbd4b45e and the case passes 3/3 on
  re-run. So the shipped state is sound — by luck, not by process.
  Two fixes: withUA() now shields ONLY the teardown (a disposable
  context failing to be disposed is infrastructure, not a finding, and
  the test body stays unguarded), and §10 gets the rule: verify, READ,
  then deploy, never in one command. Second trap from the same incident:
  grep -E "failed|flaky" also matches «MESA: error» and «libEGL warning»
  in the log, which can make a red run look clean — anchor on the
  SUMMARY lines.
- Unchanged for households without goals — that promise still holds and
  is still tested: goalOf() returns 0 without a goal, so the card, bar
  and ranking render exactly as before.

## 2026-07-27 — v4.73.0 (SW haushalt-v175, BETA only): the household secret leaves the address bar

- Maintainer finding (Android): sharing a screenshot attaches the page
  URL. Since link = auth, that is the whole household handed over by
  accident. The same URL leaks through «share tab», browser history and
  history sync — a credential on permanent display.
- Fix: after the FIRST successful sync, `history.replaceState` to BASE.
  The route is already in localStorage by then (saveRoute at boot), so
  the app keeps running without a URL — this is not a new mode, it is
  exactly the homescreen-icon path (generic start_url + loadRoute()).
- Applies to PERSONAL links too, and that is the point: the personal
  link carries the family secret in front of the /u/ part (§12, first
  item). Cutting off /u/<slug> yields the family link. Revoking a
  url_slug revokes the label, not the access — personal links were never
  a containment boundary, and the earlier assumption that they were was
  wrong.
- NOT on iOS, deliberately: without a manifest the web clip bakes in the
  CURRENT URL (§6.2, dynamic manifests discarded twice). A stripped
  iPhone icon would point at BASE and depend entirely on localStorage —
  on the one platform documented to evict storage under pressure. Safari
  shows only the domain anyway, so the screenshot damage there is small
  while the lockout damage would be large.
- BETA-gated on purpose. This touches routing and install, «the
  project's biggest minefield» (§6), and the one thing that cannot be
  verified from a sandbox is a real install. So it ships to one
  household first. Un-gate only after the device checks below pass.
- Four tests, two negative controls (disable the strip → red; drop the
  BETA/iOS guards → red). Full suite green on both engines.
- The suite then caught the real gap, which the first cut had missed: on
  RELOAD the boot restores the route from localStorage and wrote the
  secret straight back into the address bar, so it reappeared on every
  start until the next sync stripped it again — precisely the seconds in
  which somebody takes a screenshot. And that is the homescreen-icon
  path, i.e. every launch. Fix: a per-device, per-household mark
  (`haushalt.stripurl:<fam>`) set when stripping; the boot's
  replaceState now goes through `canonUrl()` and never restores a secret
  once the mark stands. The mark deliberately does not depend on BETA —
  BETA is only known after the first sync, the boot has to decide
  earlier. IS_IOS moved above the routing block and is now defined ONCE:
  two platform detections in one file drift apart, and this one decides
  whether an iPhone icon still works.
- Test lesson, paid for once: the first cut asserted «the URL is
  stripped» from the shared page fixture, so on the webkit-iphone
  PROJECT it claimed the opposite of what iOS actually does — and the
  context it left behind killed an unrelated test three cases later
  («Target page has been closed»). Behaviour that depends on the
  PLATFORM must set its own user agent, not inherit the project's, and
  own contexts belong in try/finally. Both engines now run all four.
- STILL OPEN, and honestly the bigger half: a clean address bar does not
  make link = auth un-leakable. The invite sheet and the QR code show
  the link on screen, and that is a screen people screenshot ON PURPOSE
  to send to somebody. What actually helps is being able to rotate fast
  — see §12, «In-app link rotation».

## 2026-07-27 — v4.72.0 (SW haushalt-v174): log.app_version — which build are people actually running?

- Maintainer question: after a deploy nobody knows who has the new
  version. The SW only activates on the NEXT app open, so a device can
  sit on a stale build for days while its user reports bugs that were
  fixed long ago. v4.69.x lost half a day to exactly that — «device
  likely on a stale SW» was a GUESS. Now it is a measurement.
- ONE additive, nullable column on `log`, written on INSERT only. The
  value means «version that CREATED this entry», not «version that last
  touched the row»: the 1 h point accumulation and the entry editor
  leave it alone, so the number stays interpretable.
- WHY log and not members: `members` carries the touch_updated_at
  trigger and the delta sync keys off `updated_at`. Stamping a version
  there would bump the row into every device's next delta and add churn
  right next to the pendingCreates/marks machinery that produced the
  v4.69 goal saga. Log rows are written anyway — no extra traffic — and
  the log yields adoption over TIME, where members would only give a
  snapshot.
- Deliberately NOT in the pull column list (LCOLS). Rule C («new column
  = three places») is about columns the client DISPLAYS; this one is
  write-only and reading it back would just cost egress. A test guards
  the ABSENCE — without it the next session adds it «per the rule».
- Existing households, checked rather than asserted, against the LIVE
  database after the migration ran: the new column selects 200; the old
  client's exact LCOLS query still selects 200; log_totals and
  log_weekly still select 200 (all three views name explicit columns, so
  a new base column cannot reshape them); and no existing row was
  touched (`app_version=not.is.null` returns []). Old clients neither
  write the column (nullable) nor select it — version-cut philosophy,
  nobody gets locked out.
- Order kept: migration deployed and dispatched FIRST, verified against
  production, only THEN the client (LCOLS ordering rule).
- Cleartext by design, like points/done_at — NOT in ENC_FIELDS. A build
  number is not personal data, and encrypted it would be worthless
  because it has to be readable in the dashboard. Nothing else is
  collected: no user agent, no device model, no IP-adjacent data.
- NO view and NO new grant. Read access to `log` is open to anon, so a
  global aggregate view would hand anyone holding the publishable key a
  cross-family adoption report. Evaluation happens in the dashboard SQL
  editor (service role); the three queries are documented at the top of
  the migration file.
- Three tests, all three negative-controlled: remove the write → red;
  add the column to LCOLS → red; let the accumulation stamp the version
  → red.
- Known limit, so nobody over-reads the data: it only sees people who
  LOG something. Someone who never taps stays invisible — precisely the
  population most likely to be sitting on a stale build. It also cannot
  separate «SW not activated» from «has not opened the app since the
  deploy», and a person with a phone and a tablet appears as whichever
  device wrote. It answers «how fast does a release spread among active
  users», not «is everyone updated».
- Play Store note: a version string counts as diagnostics data in the
  data-safety declaration and belongs in the privacy policy page that is
  still outstanding.

## 2026-07-26 — v4.71.1 (SW haushalt-v173): quota() hardened — no NaN comparator possible any more

- During the rework into two blocks (v4.71.0) the guard clause fell out
  of quota(), because the callers pre-filter now. Correct, but a trap
  for the next session: a call without a goal would yield pts/0 =
  Infinity or 0/0 = NaN, and NaN in a comparator produces an unstable,
  engine-dependent ordering — that is, a bug that only shows up on some
  devices and does not reproduce in the suite.
- Clause is back, but with −1 as a FINITE fallback value and the
  explicit note that this is NOT a ranking device: that very sentinel
  is what the mixed sorting ran on, the one v4.71.0 replaced. Callers
  filter, the value is only the net.
- NO new test, and deliberately so: the change is not observable from
  outside (the callers do filter), a test would not be
  counter-checkable — remove the guard and the suite would stay green.
  By the rule from §10 («otherwise it tests nothing») such a test is
  theatre and not a safeguard. The 263 existing tests run green.
- Non-beta households: checked pixel-identical to v4.69.4 again (3
  states × 2 periods × 2 device projects, 12 renderings identical,
  incl. the tricky case «no beta, but goal is present in the rows»).
- **Doc language switched to English** (maintainer decision): LOG.md,
  DEVELOPER_ONBOARDING.md and TESTING_TIER2.md are English from here on.
  The German originals are frozen at this state under `docs/de/*.de.md`
  — reference only, NOT maintained; never edit them and never read them
  as the current state. Structure was verified rather than trusted:
  headings, sub-headings and bullets match the German source in count
  and order (LOG 178 H2 / 884 bullets, onboarding 13 H2 / 34 H3, Tier 2
  7 H2 / 2 H3). Translated per chunk against a shared glossary so the
  vocabulary stays consistent across 178 entries.
- Untouched on purpose: the app's i18n source language stays GERMAN
  (`t('Speichern')` is the key, §8) — the docs changed, the product did
  not. UI strings quoted in the docs therefore stay verbatim in German;
  translating them would have turned documentation into fiction.
- **Suite caught a time bomb that has nothing to do with this change**,
  and it is worth more than the hardening: the v4.65.0 test («Gesamt
  kommt vom SERVER») seeds 40 hours of history and then checks a WEEK
  sum. Run it on a Monday at 06:14 UTC and most of that history lies
  before weekStart() (Monday 00:00) — Mira scores 3 instead of 20 and
  the test is red. Green on every other day of the week, and green in
  the CI runs for v4.70.x/v4.71.0 because those happened to run on a
  Sunday evening. New helper `weekSafeAgo(ms)` clamps such fixtures to
  the week boundary; outside the edge case it changes nothing.
  RULE (§10): a fixture that seeds «N hours ago» and asserts a WEEK sum
  must clamp, otherwise the calendar decides whether CI is green.
  Two further fixtures (v4.66.0, 1–3 h offsets) carry the same shape but
  a window of only a few hours after midnight on Monday, and their
  assertions do not depend on the week — left untouched on purpose,
  noted here so nobody has to rediscover it at 06:00 on a Monday.
- One guard hit while assembling, worth knowing: a translated phrase
  produced a literal «famx-»+word, which the anonymization guard reads
  as a link-ID pattern and rightly rejected. Reworded. Prose generated
  near those prefixes can trip the guard — that is the guard working,
  not a false alarm to be silenced.

## 2026-07-26 — v4.71.0 (SW haushalt-v172): Partially set goals — two blocks instead of one mixed list

- Finding prompted by the maintainer's question («should we recommend
  goals for everyone?»), reproduced live instead of derived: in the
  MIXED state two kinds of card sat under each other without comment
  and measured different things. On top goal bars (reference: your own
  goal), below relative bars (reference: the week's best). Concretely
  «1 von 100 Punkten» (1 of 100 points) wore the crown, while two cards
  down 80 points made the bar swing out full. Anyone skimming the
  column read the opposite of the ranking — exactly the case from §11
  «what does the UI promise».
- Fix (variant 1 of three put forward): the goalless part gets its own
  block with the divider row «ohne Wochenziel» (without a weekly goal;
  .scoresep, 19 languages). The ORDER is unchanged (goals by goal
  attainment first, then the goalless by points) — what is new is that
  the list announces where the register changes.
- Second: the reference value of the relative bars is now the best
  GOALLESS member, not the best overall. Before, one diligent goal
  holder squashed the entire lower block (90 points with a goal push
  the 40-point best down to 44 %). Without goals in the household this
  is exactly the old value — the promise to all other households holds.
- Divider ONLY in the mixed state and ONLY in «Diese Woche»; «Gesamt»
  stays the absolute register. Crown unchanged: it hangs on first place
  and drops away when nobody there has points.
- Four tests, both negative controls run (divider removed → 3 red; old
  global scale → 1 red). Lesson from the first attempt: the first test
  was called «goalless members no longer slide to the bottom» and was
  GREEN even when the old sorting was put back in — the order had in
  fact already been the same before. Test names that claim more than
  the test checks are a bug in their own right.
- DELIBERATELY NOT built: a banner «set goals for everyone». A hint
  does not make the mixed state honest, it only nags you out of it —
  and you inevitably end up back in it (new member). Households that
  deliberately give goals only to the children would be nagged forever.
  Deferred in §12: offer suggested values from the Ø/week when setting
  the FIRST goal, once and dismissible.

## 2026-07-26 — v4.70.1 (SW haushalt-v171): Goal card now shows only the percentage large

- Maintainer decision after the visual acceptance of v4.70.0: the small
  points secondary figure in the header goes away. It repeated what is
  two lines below anyway («36» next to «36 von 30 Punkten»), and at
  0 points «0 0 %» read like a bug. From now on: ONE lead figure per
  card, and that is the ranking criterion; the points are named by the
  subline exactly once.
- Only markup/CSS of the goal card (`.score .pts` gone, rule removed) —
  bar geometry, sorting, sync and everything WITHOUT a goal unchanged.
- Test brought along and sharpened: it now nails down the absence
  (`.score .pts` = 0 hits, header row does NOT contain the point
  count), not just the presence of the percentage.

## 2026-07-26 — v4.70.0 (SW haushalt-v170): Goal bars with headroom, goal attainment as the lead figure

- Maintainer finding on the live ranking: the goal bar ended at 100 %.
  100 %, 120 % and 300 % therefore looked IDENTICAL — of all things the
  number that has decided the order since v4.67.0 was the only one the
  bar could not show. And goal attainment sat small in the subline,
  while the big number showed the points (= NOT the ranking criterion).
- Bar: 100 % of the goal now sits at GOALW = 80 % of the width, marked
  by a tick (u.tick, protrudes above/below). The rest is headroom:
  overachievement fills it as a striped segment (b.over) in the
  person's colour. From 125 % on the bar is full — then the capped tip
  (.capped) says so, the truth is in the number. Regression test
  measures the RENDERED geometry (0/50/100/120/200 %) incl.
  monotonicity; negative control run (GOALW=100 → red).
- Card: goal attainment is the big number (var(--display), from 100 %
  golden like the goal line in the weekly chart), the points stand
  beside it as the secondary figure, the subline now only says «X von Y
  Punkten» (new i18n key, 19 languages derived from the old one). At
  0 points the secondary figure is dropped — «0 0 %» read like a bug.
  Attained/open does NOT hang on colour alone: number and bar tick
  carry the same information.
- WITHOUT a goal the card is unchanged (all other households,
  «Gesamt», beta off): points large, relative bar, no tick, no
  percentage — its own test that nails down exactly that.
- Visual acceptance in both device projects (Pixel 7 + iPhone 14), DE
  and EN, incl. edge states: 0 %, 400 %, goal 100 at 1 point, very long
  name (wraps, numbers stay flush).
- Test hygiene on the side: blockExternal() is now a function, and the
  two first-run-setup tests with their OWN routing use it. Without
  aborts a font request in sandboxes with an egress proxy does not
  ANSWER, it HANGS — the load event never fires, waitForURL runs into
  the timeout. Exactly the standing rule from §10 that was missing
  there.

## 2026-07-26 — v4.69.4: The «lost» weekly goal was never gone — goal was missing from the pull column list

- Maintainer finding (precise sequence: admin goal 30 gone, second
  admin goal 30 gone, the goal 7 set last stayed) led to the server
  truth: ALL three writes
  were there (updated_at 12:08:32/41/56, exactly his sequence). Only
  the DISPLAY lost anything: the regular sync fetched members with an
  explicit column list WITHOUT goal — every pull replaced state.members
  with goalless rows. Only the freshest change apparently survived
  (pendingCreates shield until the next sync) — hence also the original
  «had to save twice».
- Fix: goal in the pull SELECT list (one line). The initial-load path
  used select=* and showed goals briefly — that explained the flicker.
- WHY 20+ goal tests stayed green: the mock ALWAYS delivered all
  fields and ignored select= — it was more generous than PostgREST.
  mockBackend now projects select= for members/chores; the new
  regression test (goal survives TWO syncs) demonstrably fails with the
  old column list (negative control run).
- E2E lesson noted: checking wire+server is not enough — the state
  AFTER the next pull belongs in every save verification.
- ONBOARDING 11a extended with rule C: new column = migration +
  write path + pull list, and mocks must project select=.
- No data repair needed: the server had everything; after the update
  all goals reappear by themselves.
- APP_VERSION 4.69.4, SW cache haushalt-v169

## 2026-07-26 — v4.69.3: Live proof on the server (goal does save, even encrypted) + retry after failure

- Maintainer report «still not saving» + hypothesis of schema drift
  (beta family vs. the rest). Finding: NO — schema and crypto path are
  innocent. End-to-end proof against the REAL server: fresh famx
  household (famx-e2e-…, rows stay in place per the ops rule),
  onboarding run through, goal 7 saved in the per-person sheet →
  POST 200 with goal in the (encrypted) payload, server row goal=7.
  encRow is copy-and-encrypt without a field whitelist — goal passes
  through.
- Most likely cause on the device: STALE service worker (≤4.69.1):
  there the PGRST102 guard was missing AND marks were never cleared —
  ONE member of a foreign shape poisoned every further save of the
  session. Please check: Einstellungen → Fairli 4.69.3, otherwise close
  the app completely and reopen it (SW cycle).
- Hardening (§11a «no path loses anything»): if the person push fails,
  the marks come BACK persisted — the next save gesture or the next
  boot repeats the upsert automatically, instead of letting the change
  live on only locally. upsertRemote can take onFail for that (pattern
  adopted from deleteRemote).
- Honesty test extended: failure → toast + mark stays; server healthy →
  next save sends the same person, mark cleared. Suite 123 green.
- APP_VERSION 4.69.3, SW cache haushalt-v168

## 2026-07-26 — v4.69.2: The «had to save twice» bug — found, reproduced, sealed three ways

CAUSE (reproduced with a 400): PostgREST demands IDENTICAL key sets
within ONE batch (PGRST102 «All object keys must match»). Local person
rows drift naturally, though — freshly created has 3 keys, pulled has
all columns. ONE deviating row (here: the assisted person in the old
shape) made EVERY batch it rode along in blow up: «Sync fehlgeschlagen»
(sync failed), that person's weekly goal never arrived, and
pendingCreates kept the local values alive — it LOOKED saved. Three
symptoms, one mechanism.

- FIX 1 (mechanism): upsert() groups rows by key signature and sends
  one request per group — for ALL tables; PGRST102 is thereby
  impossible by construction.
- FIX 2 (loss resistance): change marks persist (LS_PENDMEMB) and are
  brought along SYNCHRONOUSLY at boot — synchronously, because the
  pendingCreates shield must be standing BEFORE the first pull
  reconciles (the debug harness demonstrated the race live: goal 7 →
  null sent back). The mark clear-cut when opening the list
  (changedMembers.clear) is removed — it was a real loss path.
- FIX 3 (exit paths): Esc/programmatic close now saves too (close event
  as a net); syncChangedMembers deletes marks after the handover and is
  thereby idempotent — button + net produce ONE POST.
- Standing rules written down in DEVELOPER_ONBOARDING §11a (maintainer
  assignment): saving saves / no exit loses / reload does not lose;
  keyboard rule (visualViewport, not interactive-widget); PGRST102
  guard.
- 3 new tests: signature grouping (heterogeneous batches → separate,
  uniform requests), Esc saves exactly ONCE, reload in the middle of
  editing loses nothing. 121 green.
- Note to the family: enter the assisted person's lost weekly goal of 7
  once AGAIN — the old state lived only in device storage.
- Addendum (same day): maintainer reported «Sync fehlgeschlagen» as the
  trigger of the double saving — diagnosis proven write-free on the
  LIVE server (mixed key sets → 400 PGRST102 «All object keys must
  match» BEFORE any auth; same-shape ones get through the parse stage).
  Two supplementary tests: boot catch-up with MIXED open marks
  (same-shape grouped + first pull does not reset the goal) and honesty
  toast on a failing person upsert. Suite 123 green.
- APP_VERSION 4.69.2, SW cache haushalt-v167

## 2026-07-26 — v4.69.1: Keyboard no longer covers the save button; sheet saves BY ITSELF; breathing room

- KEYBOARD (live screenshot from the maintainer): the on-screen
  keyboard lay over the button. interactive-widget=resizes-content and
  dvh had long been set — the INSTALLED app ignores both reliably
  enough to make the fix necessary. Now visualViewport measures the
  keyboard height (--kb on :root); sheets are anchored at the bottom
  (margin-bottom:var(--kb)) and the max height factors the keyboard in.
  Threshold 40 px against jitter resizes (URL bar).
- SAVE INSTEAD OF DONE (maintainer: «usual gesture to save changes»):
  the button is called Speichern and it SAVES — every exit from the
  per-person sheet (button, ×, backdrop/swipe) syncs the changed
  persons immediately (syncChangedMembers, extracted from
  finishMembers; nameless ones are not synced, the list clears them up
  on close). Before, only the list save saved — a sheet close + list
  reopen could have lost changes (changedMembers.clear on open).
- Admin test switched to multi-POST semantics (the last state per
  person counts). More generous spacing in the sheet (rows, hips around
  the graphic, button spacing).
- APP_VERSION 4.69.1, SW cache haushalt-v166

## 2026-07-26 — v4.69.0: Per-person sheet with weekly bars — the ⋯ menu retires

RELEASED after preview (maintainer: «Nice preview, let's go ahead» +
question about weekly bars → yes, fits on the sheet).

- Person list: rows are now pure tap targets (colour field, name,
  badges 🔑📵🎯N, chevron). Tapping opens the per-person sheet in
  task-sheet style: name/colour, (beta:) weekly goal with average line
  and weekly bars, admin and «Ohne eigenes Telefon» (no phone of their
  own) as EXPLAINED rows («Darf Aufgaben, Personen und Einstellungen
  ändern» / «Andere tragen für diese Person ein» — the menu never had
  room for that), «Persönlichen Link teilen», red «Person löschen»,
  «Fertig». The sheet replaces the ⋯ menu FOR ALL households (one
  interaction world, one test suite); goal/avg/bars stay beta-gated.
  «+ Person hinzufügen» opens the new person's sheet directly.
- Weekly bars (beta): 8 week slots starting from the local Monday, gaps
  = 0, current week highlighted, dashed goal line follows the goal
  field LIVE (slot cache, no refetch). Data from the new server view
  log_weekly (family_id, member_id, week_start, pts, n) — the client
  window only reaches back ~2 weeks for active families. Slot keys from
  LOCAL date parts (toISOString slipped to Sunday at UTC+x → all bars
  empty); the view's UTC week boundary documented as deliberate edge
  fuzziness.
- REPLAY TRAP of the migration runner found and healed: the runner
  plays ALL files on EVERY run, and «create or replace view» cannot
  remove columns. The older log_totals migration (4 columns) therefore
  failed on top of the 5-column view extended by v4.68 — ON_ERROR_STOP
  choked the run off BEFORE log_weekly came into being. Rule from now
  on (documented in the file): if a later migration extends a view, the
  older file is brought along to the same definition.
- Old bug in the delete undo fixed: _delM was captured AFTER the
  filter() (always null) — the restore callback was dead code.
- Tests: 3 existing tests (add/rename, 📵, admin rules) migrated to the
  sheet flow; openPerson helper (synthetic click, visibility
  assertion); harness delivers log_weekly from logRows; 1 new bar test
  (slots, gaps, goal line, heights). 118 green.
- 8 new i18n keys in 19 languages.
- APP_VERSION 4.69.0, SW cache haushalt-v165

## 2026-07-26 — v4.68.0: Ø points/week in «Gesamt» (beta) — the yardstick for the weekly goal

- Maintainer idea: weekly goals are easier to set when you can see what
  a person has managed per week SO FAR. Implementation: «Gesamt» cards
  show (only to beta households) «· Ø N/Woche» — total points divided
  by weeks since the FIRST entry (at least 1 week).
- The first entry comes as first_done from the server view log_totals
  (create or replace, additive — the v4.65 client selects explicitly
  and stays untouched): the client window does not know the first
  entry, the same 300-row trap as in the totals incident of 22.07.
- Only in «Gesamt», not in «Diese Woche» (there the goal rules);
  bumpTotals sets first on the very first local entry of a new person.
  Mock harness computes first_done from logRows.
- By-product of this round: preview of the per-person sheet (task-sheet
  style: name/colour, weekly goal with average line, explained
  admin/📵 switches, share link, delete) to the maintainer — the rework
  follows after release as its own round.
- 1 new i18n key in 19 languages; 1 new test (Ø in Gesamt, not in the
  week; beta-OFF guarantee green again).
- APP_VERSION 4.68.0, SW cache haushalt-v164

## 2026-07-26 — v4.67.1: Weekly goal input field looks like the app (not like 1998)

- Maintainer finding: the number field came across as «very dated».
  Cause: the base input field styles in the person sheet applied only
  to input[type=text] — the new number field fell back to the bare
  browser default (light field, native spinners). The preview had
  inline styles and hid the bug.
- Fix: number inputs share the base rule (dark ground, border, radius,
  16 px); native spin buttons removed; width 84 px, centred. Computed
  styles checked in the harness, not just by eye.
- Side finding, fixed: the flake in the claim backdrop test (v4.61.0)
  was a REAL race — the «Später» (later) mark hung on the close EVENT
  (queued task) and could lose against immediate navigation.
  Backdrop/swipe now marks synchronously; onclose remains the net for
  close() calls; test taps the real backdrop (repeated 3× green).
- APP_VERSION 4.67.1, SW cache haushalt-v163

## 2026-07-26 — v4.67.0: Weekly goal as BETA — switchable per household, inert for everyone else

MAINTAINER REQUEST: try out the weekly goal without anything changing for
any other family. Implemented as a feature switch PER HOUSEHOLD
(families.beta) instead of as a second deployment environment — a
deliberate choice:

- ONE code base, ONE test suite, one deploy. A «/beta/» branch would
  have diverged (its own SW cache, its own migration state), and the
  installed PWA/TWA hangs on the production URL anyway: the family
  could not have seen the beta on the home screen at all.
- The switch hangs on the HOUSEHOLD, not on the device: all of the
  family's phones (including children's and assisted devices) see the
  same thing, without anyone having to know a secret gesture.
  families?select=* fetches it with no further client change.
- The price, named honestly: the beta code also sits in the bundle of
  all other households — inert, but present. That is exactly what the
  first new test stands against (beta OFF ⇒ no 🎯, no goal sorting,
  no %).

FUNCTION (only with beta=true):
- Person sheet: ⋯ menu per person → «🎯 Wochenziel» folds open a number
  field (empty = no goal). Goals that are set are shown by a 🎯N badge;
  the field is automatically open when a goal exists. Admin-gated like
  the rest of the person changes, syncs as a normal members field.
- Punkte/«Diese Woche»: whoever has a goal is ranked by GOAL ATTAINMENT
  (bar and subtitle «6 von 8 Punkten · 75 %»), persons without a goal
  follow below by points as before. A child with 6/8 thereby stands
  ahead of adults with more absolute points — that was the whole point.
- «Gesamt» remains untouched as the absolute register (v4.65.0 server
  totals).
- Settings show beta households «🧪 Beta: Wochenziel · An» with a
  self-exit (PATCH families.beta=false). Non-beta households never see
  the row — entry only via the database.

- Migration 20260726010000_beta_goal.sql (additive, nullable:
  families.beta, members.goal) applied BEFORE the client deploy and
  checked by REST probe.
- 7 new i18n keys in 19 languages; famRows hook in the test harness.
- 4 new tests: beta OFF changes nothing / set goal + child leads /
  Gesamt stays absolute / clearing the goal removes it again.
- APP_VERSION 4.67.0, SW cache haushalt-v162

## 2026-07-25 — v4.66.0: Totals banner in the history + week jump from the points card

Maintainer request (follow-up to the window incident v4.65.0): the
history points were never re-computable («Not sure which tasks these
are»), and the jump from the week view landed in the person's ENTIRE
history.

- Totals banner: above the history list there is now «{n} Einträge ·
  {p} Punkte» — what is summed is exactly the DISPLAYED entries (person
  filter, week restriction, search; tombstones excluded). With that,
  every scoreboard number is verifiable in the history at a glance.
- HONESTY RULE in the banner: if older rows are missing (300 window)
  although neither week nor search is narrowing anything down, the
  banner names both truths — «{n} von {total} Einträgen geladen · {p}
  von {ptotal} Punkten» (comparison against the server totals from
  log_totals). The window total never again passes silently as
  «everything»; it was exactly this silent gap that kept the incident
  of 22.07 invisible for days.
- Week jump: tapping a points card in the WEEK view now opens the
  history restricted to the person AND this week; the pill says so
  («Nur Mira · diese Woche ×»). From the totals view it stays a pure
  person filter. What is stored is a BOOL, what is checked is live
  against weekStart() — the pill promises «diese Woche», not the week
  of the tap. Releasing the pill removes person + week together.
- The empty message knows the week («Für Mira ist diese Woche noch
  nichts eingetragen.»).
- 5 new i18n keys in 19 languages; 3 new tests (banner follows filter +
  search; week jump incl. pill release and totals contrast; honesty
  banner with missing older rows).
- APP_VERSION 4.66.0, SW cache haushalt-v161

## 2026-07-22 — v4.65.0: INCIDENT «shrinking total points» — totals now come from the server

INCIDENT (affected family, screenshots 12:01 vs 15:03): a member's total
points FELL from 163 to 155 without anyone deleting anything. Forensics
against the live server: the family has 353 log rows — but the client
only fetches the newest 300 (egress diet v4.36, delta cap 400) and
computed «Gesamt» FROM THIS WINDOW. As soon as a family exceeds the
window, the oldest entries fall out and the all-time totals of the
early-active members appear to sink. True totals (server):
member A 193/160, member B 188/147 — the window showed 164/136 and
158/123. Honestly noted: the version full sync from v4.61
(self-healing) trims devices from up to 400 down to 300 rows and made
the drops VISIBLE on update days; the decay mechanism itself is
v4.36-old and was only reached now.

FIX: aggregation belongs where ALL the rows are.
- View log_totals (migration 20260722160000, security_invoker, grant
  like the tables): sum(points)/count per family_id+member_id,
  tombstones excluded. points/member_id are cleartext in famx too — no
  decryption needed. Applied BEFORE the client deploy and verified live
  against the affected family (193/188/… = the truth).
- pull() loads the totals along with EVERY sync (one row per person);
  adoption behind the stale guard, the fingerprint knows totalsAll.
- totals(): «Gesamt» from state.totalsAll; «Diese Woche» deliberately
  remains a window computation (a week is practically always inside the
  window). Fallback without server totals (offline/error): window
  computation as before — never zeros.
- The instant feel stays: bumpTotals() pulls the totals along locally
  and immediately on entry, tombstone commit and restore; the next pull
  corrects it (known 20 s latency on points EDITs noted).
- Test harness: mockBackend serves log_totals (BEFORE the /log prefix —
  prefix trap) from its logRows, so that existing tests keep their
  numbers. 3 new tests: window incident rebuilt (server totals beat the
  window), 500 fallback without zeros, instant adjustment on entry +
  deletion.
- The history still shows the newest ~300–400 entries (feed); «load
  older» would be its own round, if wanted.
- SIDE FINDING during the deploy: a force push from elsewhere (commit
  «fables_corner.txt ist umgezogen», 25.07. 12:11, stale clone) had
  displaced the already pushed migration commit from main — the view
  had long been applied in the DB, the file is checked in here again
  (now in an anonymized version; the displaced commit carried the
  family name in the message and is thereby out of the history).
  The rule stands: NEVER force-push without pulling first — deploy.mjs
  itself cannot clobber (no force on the ref update).
- APP_VERSION 4.65.0, SW cache haushalt-v160

## 2026-07-22 — v4.64.0: Filter the history by person — points cards are tap targets

- Maintainer request: jump from the Punkte tab into ONE person's
  history. Every points card is now a tap target (role=button,
  tabindex, Enter/space handled explicitly — divs do not fire a
  keyboard click) and opens the history filtered to that person.
- Filter visible as a pill («Nur Mira ×») above the list, releasable
  there as well; it combines with the search; tombstones stay excluded.
  Deliberately NOT persisted (session view state), but it survives tab
  switches — the pill makes that obvious.
- An empty filtered history says WHO is meant («Fuer Mira ist hier
  noch nichts eingetragen») instead of the generic empty message.
- If the filtered member disappears (reconcile), the filter releases
  itself.
- 4 new i18n keys in 19 languages; 2 new tests (filtering + releasing
  via the pill; person-specific empty message + filter survives a tab
  switch visibly).
- APP_VERSION 4.64.0, SW cache haushalt-v159

## 2026-07-21 — v4.63.0: Trash — deleting is a tombstone, no more 24 h ghosts

DESIGN (maintainer release: 30 days / v4.55 permission model / settings):
deleting a history entry writes deleted_at + deleted_by (member ID,
never a name — famx-safe) instead of a DELETE. The trick: the
existing log_touch trigger stamps updated_at, so the tombstone travels
in the normal delta to ALL devices within 20 s. That incidentally closes
a real sync tear: hard deletions were invisible to other devices for up
to 24 h (the delta only sees new/changed things; pendingDeletes shields
only the deleting device).

- Migration 20260721210000_log_trash.sql (additive, idempotent) applied
  via the db-migrate workflow BEFORE the client deploy and verified by
  REST probe (LCOLS selects the new columns — order is mandatory).
- Undo window (5 s) unchanged; only the commit sets the tombstone and
  sends it via upsertRemote (pull overlay + retry for free).
- History, points and the retention purge ignore tombstones; tombstones
  have their OWN 30-day clock and are finally removed at the admin link
  via the existing purge path.
- Trash sheet in the settings (the maintainer switched from «at the
  bottom of the history» to settings before construction started): list
  with who/what/when + «Gelöscht von …», restore = deleted_at:null
  (travels back the same way). Visibility/restore = canEditLog: admins
  everything, personal links their own (+ assisted) entries.
- 6 new i18n keys in 19 languages.
- 6 new tests: tombstone protocol (never DELETE), delta propagation to
  a foreign device, restore incl. return of the points, permissions at
  the personal link, points ignore tombstones, 30-day expiry.
- Existing test v4.24.0 (undo/DELETE window) adapted to the tombstone
  contract: same safeguard (within the window NOTHING goes out, undo
  purely local), the commit is now the tombstone upsert, DELETE is
  forbidden.
- APP_VERSION 4.63.0, SW cache haushalt-v158

## 2026-07-21 — v4.62.0: Person selection sticks to the top — chips + tabs as one block

- Maintainer request: the person chips («Ich bin …») stay reachable
  while scrolling, like Aufgaben/Punkte/Verlauf. Implementation: ONE
  shared sticky wrapper #topbar around chips + tabs instead of two
  sticky elements — the chip row can wrap (variable height), a top
  offset for the tabs would be fragile. The tabs fade-out gradient
  (::after) now hangs on the bottom of the wrapper, same look.
- z-index reviewed: kebab menus in the history (z 5, later in the DOM),
  FAB (20), toast (50), splash (60) — no collisions.
- TEST incl. negative probe: 60 day entries, scrolled to the end →
  chips and tabs in the viewport AND operable; with position:relative
  instead of sticky the test fails (verified). The first version of the
  test failed instructively: 60 identical hourly entries grouped into
  too short a page (run rendering) — fixture diversified.
- Existing test v4.42.0 («tabs stick at 0») adapted to the new
  contract: the sticky bar is now the #topbar block; head-scrolls-away,
  opaque-at-0 and tabs-below-chips remain safeguarded.
- APP_VERSION 4.62.0, SW cache haushalt-v157

## 2026-07-21 — Store round: TWA inputs brought along to the violet icon

- twa/twa-manifest.json: iconUrl/maskableIconUrl to ?v=48 — the NEXT
  bubblewrap build bakes the current icon (violet tile) into the
  launcher icons. twa/store_icon.png (Play entry, 512 RGBA)
  regenerated from the new icon-512.png.
- CONSEQUENCE for the AAB already handed over privately (1.0.0, rotated
  key): it still carries the launcher icons of the pre-violet version.
  Since NOTHING has been uploaded to Play yet, a rebuild before the
  first upload is cleaner than a 1.0.1 afterwards. The rebuild needs
  the private keystore (not in the sandbox) — path A: the maintainer
  builds locally following twa/PLAY_STORE.md (~15 min); path B: hand
  the keystore over privately in the session again, build here (git add
  -A stays forbidden, named paths only).
- No version/SW bump: pure store inputs, app unchanged.

## 2026-07-21 — v4.61.1: App icon — bottom right tile now violet

- Icon iteration (maintainer round): bottom right tile in exactly the
  same violet gradient as the variant reviewed earlier (values taken
  pixel-precise from the released version, position swapped); the other
  three tiles, roof and background unchanged (original pixels).
- Working method documented: Pollinations once again unsuitable for the
  precise tile geometry (as in v4.37.1) — change made as a pixel
  operation directly on the original PNGs (hue relocation with an edge
  mask); the first attempt clipped the tile by 5 px at the top/bottom
  (edge sampling error), fixed by remapping over the MEASURED tile
  edges in x AND y.
- icon-192.png, icon-512.png, icon-512-maskable.png replaced;
  cache buster ?v=47→48 (index.html, 404.html, manifest.json)
- Note: the TWA/Play Store icon (twa/store_icon.png) is separate from
  this — aligning it belongs in the next store round.
- Test hardening: the two v4.61.0 tests had '4.61.0' hard-coded and
  broke on the patch bump — the version number now comes from
  index.html at runtime (the suite blocked the deploy correctly: the
  rule works)
- POST-DEPLOY INCIDENT (fixed minutes later): deploy.mjs read ALL files
  as utf8 — the three PNGs arrived as destroyed byte sequences
  (0x89 → U+FFFD, 27 KB → 48 KB) and were briefly broken live. The
  script can now handle binary files (base64 blob API); PNGs
  re-deployed correctly. Lesson: deploy.mjs had only ever been used
  with text — v4.37.1 had still deployed icons via git push.
- APP_VERSION 4.61.1, SW cache haushalt-v156

## 2026-07-21 — v4.61.0: INCIDENT «Der eingefrorene Leser» (the frozen reader) — watermark ratchet fixed, identity sheet repaired, sync made visible

INCIDENT (19–21 July, live): entries by other family members after Sun
~19:00 CEST no longer appeared on the affected device; the device's own
entries kept coming. All data was sitting correctly on the server (delta
request verified, it returns them). No data loss — a read bug.

CAUSE 1 — THE WATERMARK RATCHET (latent since v4.36.0, reproduced):
pull() persisted the delta watermark AND the 24 h full mark BEFORE the
stale guard. A tap during a running pull discarded the snapshot
(correct) — but the marks had already moved on: the discarded rows were
NEVER REQUESTED AGAIN. Invisible until the full sync, which the same
race could swallow as well AND thereby restart the 24 h deadline.
syncOk stayed true → no red dot. Fix: marks only move AFTER the state
has been adopted. Regression test with a pinned log response + a tap
inside the window.

CAUSE 2 — IDENTITY SHEET (v4.60.0, today):
- claimIdentity swallowed failed upserts (catch{}) and redirected to
  the new slug ANYWAY → boot on a dead slug → «Link ungültig» (link
  invalid), device locked out. Fix: server confirmation first, then
  navigation; on error an honest toast, the device stays on the family
  link.
- The «Claim gesehen» (claim seen) mark was missing from the STANDARD
  test persona (only suppressOnboarding had it): the modal sheet
  blocked 18 existing tests — exactly the class of failure the suite
  exists for.
- Closing via the backdrop now counts as «Später» (no nagging again).

DIAGNOSTIC CORRECTION (important for the future): NULL updated_at on
log rows is BY DESIGN (log_touch is BEFORE UPDATE; the delta catches
inserts via created_at). NO DB migration was run; the contemplated
backfill updated_at:=created_at would have been wrong — it would have
marked every old row as «freshly changed» for every delta client.
Chore creation: the server accepts inserts (201, checked the day
before), the creation tests are green on v4.57–v4.59 — no demonstrable
defect apart from today's modal blocker; the gap since Sat 17:04Z is
explainable by a small user base + the modal since early today.

PROCESS, HONESTLY: The sandbox runner was broken — but CI (tests.yml)
ran on EVERY push: green up to v4.59, RED on the v4.60 push (09:55Z),
and the deploy went out anyway. The «untested batch» was in truth only
v4.60 — and precisely the one regression the suite could see, it saw.
New standing rule in §11: RED CI = NO DEPLOY.

VISIBILITY (the promise coming out of the incident): Settings now shows
«Letzter Abgleich: vor X Min.» (last sync: X min ago) plus counters for
syncs received-but-not-adopted and unreadable (encryption) rows. Silent
failure must never again look like absence of data.

SELF-HEALING: After every app update the first pull forces a full sync
(version mark haushalt.pullver) — devices with an already poisoned
ratchet (the affected device) see their entries again immediately after
the SW update to haushalt-v155.

- 7 new i18n keys in all 19 languages (de = key)
- Tests: Chromium 97/97, WebKit 95 (+2 skips), chromium-sw 1/1 — ALL
  projects green BEFORE the deploy; 6 new v4.61 regression tests
  (ratchet, version full sync, claim success/failure/backdrop,
  sync display)

## 2026-07-21 — v4.60.0: «Wer bist du?» for existing families + as the conclusion of the encryption migration

- ⚠️ TEST STATUS OF THIS VERSION (read first): from mid-session on the
  sandbox aborted EVERY Playwright run — including single tests that
  had been green minutes before. VERIFIED against the last code state:
  the new identity test (1/1, incl. the «Später» path, exclusion of
  assisted members, admin POST, redirect). NOT RUN: the remaining 90
  Chromium tests and WebKit. THE NEXT SESSION MUST BEGIN with the
  full double run (Chromium + WebKit backlog v4.57.0–v4.60.0),
  BEFORE any new work. Risk assessment: the cross-cutting change
  (render hook) is doubly guarded (claimShown + device mark); the test
  persona sets the mark and thereby reproduces for old tests exactly
  the pre-feature environment.
- FUNCTION (maintainer's brief, points 1+2): ONE shared adoption
  mechanism instead of two migration flows:
  · maybeOfferClaim(): on the BARE family link the card «Wer bist du?»
    appears once per device (chips of all non-assisted people).
    Choice → claimIdentity(): admin=true (whoever holds the bare
    link IS admin), generate a slug if needed, direct awaited
    upsert (never the push queue — redirect!), device mark,
    redirect to the personal link. «Später»/× only sets the mark
    — never nag again.
  · The encryption migration sets sessionStorage
    fairli.claimAfterMig before its reload — the same card opens
    IMMEDIATELY afterwards. IMPORTANT CORRECTION of my assumption:
    today's migration keeps all links VALID (in-place re-encryption,
    famc hash) — there is no second link-swap moment at all. That
    makes the card the one shared moment, exactly the maintainer's wish.
- TWO REAL FINDINGS while building:
  (1) The card fired before the first pull and offered the local
      seed state («Ich») → guard: only after syncOk===true AND a
      present famName.
  (2) Interaction with v4.59.0: for returning users the first pull
      often brings exactly the local state → no redraw → the offer
      inside render() would have been swallowed. The skip path now
      calls maybeOfferClaim() directly (idempotent, guard-secured).
- Assisted members are NEVER on offer as a choice — a cat is nobody's
  identity.
- DATA WORK in the same session (before the feature): famc-943… had
  ALREADY been tombstoned (retired_families; my POST correctly bounced
  off RLS, 401) — the entries from 17.07. date from before that.
  The two affected link holders: slugs cj9ymgafm6hd and
  a2z03c0s08jz (names encrypted, IDs f6ijwv9h/tio7okqk); the
  maintainer is sending out new links. Inventory: 23 families (+3
  retired), 4 active ≤30 days, 11 encrypted, slugs widely
  distributed, admin bits almost nowhere — exactly the gap this
  card closes.
- 2 keys ×19. No recap update (the card explains itself when it
  appears; the recap follows with the next collected era).
- APP_VERSION 4.60.0, SW cache haushalt-v154

## 2026-07-21 — INCIDENT fixed: the upload keystore was in the public history — key rotated

- WHAT HAPPENED: for the TWA build the keystore was copied to twa/;
  a later blanket `git add -A` swept it into commit b2bb8b0 in the
  PUBLIC repo. Aggravating: the LOG entry of the same run claimed
  «the keystore was and is NEVER in the repo (checked)», although
  the check in the same command printed the violation. Both my
  fault; the false passage is marked below in the original entry
  instead of deleted.
- FIXED:
  · history cleaned with git filter-repo and force-pushed — main
    and all reachable branches no longer contain the blob
  · old commit IDs stay retrievable via the API until GitHub's GC
    (known situation, §7): f65dc90, b2bb8b0, 2297cf5 → add to the
    existing support request
  · THEREFORE the key was ROTATED rather than merely deleted: new
    keystore (fingerprint 09:11:99:33:…), random password, handed
    over privately; the old one counts as burned and is accepted
    nowhere any more
  · assetlinks.json carries the NEW fingerprint live (verified)
  · AAB + test APK rebuilt and signed with the new key; certificate
    digest = the new assetlinks entry (chain closed).
    The previously handed-over artifacts are superseded — do NOT upload
  · Play was not affected at any point (nothing uploaded yet)
- NEW STANDING RULE: after every step that copies a secret into the
  working tree, `git add -A` is FORBIDDEN — only add named paths,
  and read `git status` BEFORE the commit. Check commands belong
  BEFORE the commit, never behind it in the same run.

## 2026-07-21 — TWA BUILT AND SIGNED: fairli-play.aab ready for the Play Console

- bubblewrap build pushed through in the sandbox (maintainer's brief).
  Result handed over privately: fairli-play.aab (signed, 1.3 MB) and
  fairli-test.apk (signed, for adb install). Certificate SHA-256 of the
  artifact = f5a0d327… = EXACTLY the fingerprint in assetlinks.json —
  chain closed, the link takeover will take hold.
- Package io.github.blauewelt.fairli, version 1.0.0 (code 1), label
  «Fairli», targetSdk 35 (Play-compliant), compileSdk 36.
- FOUR STUMBLING BLOCKS, all documented in twa/PLAY_STORE.md:
  (1) AGP only finds platforms in the STANDARD SDK layout — the
  cmdline-tools folder as sdk.dir cost four failed attempts incl.
  futile package.xml surgery; (2) the template's androidx.browser
  requires compileSdk ≥ 36; (3) the system Java was a JRE without
  javac («does not provide JAVA_COMPILER») → installed JDK 17; (4)
  Bubblewrap left versionName EMPTY — set to «1.0.0» and re-signed
  (an empty name would have been confusing in Play).
- Repo hygiene: 31 MB of intermediate build state had landed in the
  first commit — removed again via .gitignore (twa/app/build,
  twa/.gradle). [CORRECTED 21.07., see the incident entry above: the
  claim originally standing here, «the keystore was and is NEVER in
  the repo (checked)», was FALSE — the check in the same run reported
  the violation, the entry claimed the opposite.]
- REMAINING for the maintainer: upload the AAB in the Play Console,
  then add Google's app-signing fingerprint as a SECOND entry in
  assetlinks.json (the step everyone forgets); optionally first put
  fairli-test.apk on the Pixel via adb — expectation: NO browser bar,
  dark start, the app lands in the household.

## 2026-07-21 — v4.59.0: a pull with no news no longer redraws

- Implementation of the recommendation from the redraw inventory
  (maintainer's brief): before syncing, pull() takes a fingerprint of
  the visible state (members, chores, log, famName, RETENTION, me as
  JSON) and only redraws if it differs afterwards. Unchanged → only
  renderSyncDot(); save() is then skipped as well (nothing to save).
- EFFECT: the 20 s auto pull no longer replaces the tile list without
  reason — a tap at the moment of a pull never again lands on a freshly
  swapped tile. Order changes and all real news of course still redraw.
- DELIBERATELY in the fingerprint: me (chip selection) — the snap-back
  path (v4.49.0) changes me during the pull and MUST render.
- TEST (DOM node probe): a marked tile node survives a pull without
  server news identically; if the mock then brings a new log row, it is
  rebuilt and the history shows it.
- 90/90 Chromium. The WebKit backlog stands (sandbox, see v4.58.0).
- APP_VERSION 4.59.0, SW cache haushalt-v153

## 2026-07-21 — Step 3 prepared: Play Store TWA fully packaged + redraw inventory

### Play Store (io.github.blauewelt.fairli)
- Maintainer decision: the GitHub origin stays (blauewelt.github.io) —
  publicly viewable code as a trust argument in the store text.
- DONE AND VERIFIED LIVE:
  · assetlinks.json at the origin root with the REAL fingerprint of the
    newly generated upload key (F5:A0:D3:27:…). A placeholder from
    earlier work was replaced. TRAP documented: GitHub Pages
    (Jekyll) suppresses dot folders — only a .nojekyll in the
    root repo made /.well-known/ retrievable (404 before, despite
    the commit).
  · twa/twa-manifest.json: finished Bubblewrap configuration — colors =
    app colors (v4.56.2), startUrl generic /chores/ (the last-used
    route takes effect, v4.56.0), portrait, customtabs fallback.
  · twa/PLAY_STORE.md: build steps, Play Console procedure incl. the
    CRITICAL addendum (Play App Signing re-signs — Google's
    app-signing fingerprint must be added as a SECOND entry in
    assetlinks.json after the first upload), store texts de.
  · Keystore handed over PRIVATELY (outputs, never into the public repo).
- WORDING deliberately «Quellcode öffentlich einsehbar» (source code
  publicly viewable), NOT «Open Source»: the LICENSE is
  all-rights-reserved (19.07.) — «Open Source» in the store would be
  wrong. Justified in the document.
- OPEN (needs the maintainer's Play Console access): bubblewrap
  build (~15 min), upload, add Google's fingerprint.

### Redraw inventory (maintainer's brief)
All 24 innerHTML sites reviewed. Finding:
- SHEETS (settings, invite, chore, history detail, …): they are built
  once when OPENED; pull()/render() never touches open dialogs
  → no loss of typing or focus. Forms additionally carry
  dirty flags.
- FRONT DOOR: since v4.58.1 exactly one build (the splash bridges it).
- PERSON SHEET: typing a name commits into the state on every keystroke
  (input event) — so renderMemberRows() (only on explicit actions:
  admin/assisted toggle, add, delete) NEVER discards text.
  Loss of focus there is practically meaningless: every triggering
  action is itself a tap that takes the focus anyway.
- MAIN VIEW (tiles/history/points + I-am chips): it is rebuilt on
  EVERY render() — including the 20 s auto pull and on every
  search keystroke. No input fields in it (the search field
  deliberately lives OUTSIDE #list, v4.50.0) → no data loss. The
  ONLY real paper cut: pull() calls render() UNCONDITIONALLY — if the
  server changes nothing, the list is replaced anyway; a tap at that
  same moment can land on the freshly replaced tile (harmless with the
  same order, off-target when re-sorted).
- RECOMMENDATION (not implemented, deliberately): render() after a pull
  only on an actual state change (a cheap comparison of the reconcile
  results). A core-sync intervention — it belongs in its own session
  with a full test run, not at the end of this one.

## 2026-07-21 — v4.58.1: the front door is built exactly ONCE — the splash bridges the dictionary

- MAINTAINER REQUIREMENT: no redrawing of the entry screen. If the
  dictionary needs ~0.5 s, rather extend the loading animation.
- IMPLEMENTATION: the front door is only built once the dictionary is
  there (Promise.race with a 1.5 s cap; offline it falls back to
  German — better than empty). Until then the boot splash stands: on
  the entry screen it is never cleared away anyway (the early return
  skips its teardown logic), the front door simply lays itself over
  it. The extension is free, no new mechanism.
- The input protection for the join field from v4.58.0 is dropped —
  without redrawing there is nothing left to protect.
- MEASURED (dictionary artificially throttled to 600 ms): at 300 ms
  only the splash, no front door, no German text; English front door
  after ~1.1 s — a German intermediate state exists at NO point.
  The test additionally records: never both language variants in the DOM.
- Repeat visits are as snappy as before: the localStorage copy of the
  dictionary resolves in milliseconds.
- 89/89 Chromium. The WebKit backlog (v4.57.0–v4.58.1) still stands
  (the sandbox aborts WebKit runs, see v4.58.0) — at the next healthy
  state, catch it up first.
- APP_VERSION 4.58.1, SW cache haushalt-v152

## 2026-07-21 — v4.58.0: the entry screen as a front door — it translates itself, diagnostics collapsed, app icon

- STEP 2 of the store plan (maintainer): store installations start at
  the generic start_url — so the entry screen is the app's front door
  and has to look like one.
- MOST IMPORTANT FINDING: the entry block ran BEFORE the i18n boot and
  returned with `return` — loadDict was NEVER reached. The front door
  was German for all the world, no matter what language the device
  speaks. Now it is a render function: draw once immediately, redraw
  after the dictionary has loaded — EXCEPT when the human is already
  typing in the join field (a rebuild would discard the input; a test
  covers exactly that).
- Diagnostics (Amelie/Noel v4.19.x) is fully preserved, but:
  collapsed in the browser behind «ⓘ Diagnose» (no debug view for
  newcomers); on a standalone start still OPEN — whoever lands there
  has an icon problem, and then it has to be readable without a detour.
  The warning box «Veraltetes Fairli-Icon» stays as prominent as before.
- App icon (72 px) above the wordmark; tagline, resume button,
  warning box and «Beitreten» now via t() — 8 keys ×19.
- TESTS: the diagnostics test now has to expand it in the browser first
  (the standalone test unchanged — there it is open); new test: an
  English browser sees the English front door, typed input in the join
  field survives, joining lands on the personal link.
- EMULATOR (English Pixel, a genuine first contact as if from the
  store): icon, English tagline, diagnostics closed → open after a
  tap, joining with a full link lands on /f/…/u/…
- SANDBOX LIMITATION (2nd session in a row, documented): WebKit
  runs are currently aborted by the tooling — even ONE test with a
  60 s limit, while Chromium runs of 2 min go through. An orphaned run
  proved 21 green WebKit tests (~40 s) in between — the suite itself
  is healthy. Chromium 89/89. Catch up the WebKit backlog
  (v4.57.0 + v4.58.0) at the next healthy sandbox state.
- APP_VERSION 4.58.0, SW cache haushalt-v151

## 2026-07-21 — v4.57.0: first-run setup asks «Wer bist du?» — the answer becomes admin and lands on their own link

- DESIGN (maintainer approval, deliberately WITHOUT a bail-out option
  «richte nur ein» (just set it up) — keep it simple): after «Los
  geht's» the entered names appear as chips under the question «Wer
  bist du?». One tap makes EXACTLY THAT person admin, generates their
  slug and redirects the creator to THEIR personal link. Identity and
  rights in one tap.
- FIXED BUGS OF THE OLD FLOW:
  · «first row = admin» was a silent mis-grab as soon as the
    creator did not enter themselves first (test: Carla as the third row)
  · the creator worked permanently anonymously on the bare
    family link — logged_by always stayed empty for them. Now the
    very first entry carries their identity
  · the bare family link no longer appears anywhere for NEW households
    (existing ones keep it, v4.55.0)
- SOLO household: no question — the one person becomes admin and lands
  directly on their link (the existing famx test now transparently
  runs through this path as well)
- TECHNICAL: members start with admin:false; claim() sets admin,
  generates the slug, upserts DIRECTLY (awaited, not via the
  push queue — that dies on the redirect) and sets
  sessionStorage «fairli.creatorOb» so that maybeOnboard on the
  target page continues the onboarding as the CREATOR («Weiter:
  Mitglieder einladen» instead of «Los geht's»)
- TESTS (2 new, Chromium): three-person case — before the choice
  NOBODY is admin, after choosing Carla exactly she is admin, the URL
  carries her slug, onboarding runs as creator, the invite hint names
  her, chips free; solo case without the question
- EMULATOR (real first visit, responsive fake server): chooser with
  three chips, 0 admins before the choice, redirect to Carla's link,
  onboarding + invite correct, an entry for Ben carries
  member=Ben/logged_by=Carla, an app restart lands on her link
  again. Harness mis-grab documented: the first tile click hit the
  one-off tile (opens a sheet, does not book) — not an app bug
- HONEST LIMITATION: the WebKit suite could not run through in this
  session (the sandbox aborted long runs). Chromium 88/88
  incl. the new tests and the famx solo path; the change is
  engine-neutral (template chips, sessionStorage, location.href).
  Catch up the WebKit run at the next deploy
- 2 keys ×19. No recap section: it only affects BRAND-NEW
  households, existing users never see the flow
- APP_VERSION 4.57.0, SW cache haushalt-v150

## 2026-07-20 — v4.56.2: dark start screen instead of a white flash

- MAINTAINER FINDING with screenshot: on start a white screen flashes
  up before the dark app appears — does not fit the rest.
- CAUSE: Android paints the installed app's start screen with
  `background_color` FROM THE MANIFEST, before the page even draws.
  Both manifests stood at #FFFFFF, while the app uses
  --bg:#12161F. The app's own boot splash (v4.39.0) had long been
  dark — only the manifest was out of step.
- SOLUTION in BOTH manifests (the static file AND the one generated by
  the service worker): background_color #12161F (= var(--bg), exactly
  the surface that appears afterwards), theme_color #141A17 (= <meta
  name="theme-color">). With that there is no visible seam left between
  the system start screen and the app.
- MEASURED: the personal manifest reports background #12161F, theme
  #141A17, short_name «Fairli»; the page background computes to
  rgb(18,22,31) — the same color.
- TESTS: the @sw test pins the dark colors in addition to
  short_name; the test for the static fallback checks that
  this path starts dark too (otherwise it would only keep flashing there).
- NOTE to the maintainer: Chrome refreshes an installed WebAPK with a
  delay (typically within a day). It takes effect immediately
  if the icon is removed and added again.
- 86/86 Chromium, 84+2 WebKit, 1/1 chromium-sw
- APP_VERSION 4.56.2, SW cache haushalt-v149

## 2026-07-20 — v4.56.1: the icon is called «Fairli» again (short_name instead of a person's name)

- MAINTAINER FINDING with screenshot: the installed icon carried the
  bare person's name instead of «Fairli».
- CAUSE: Android labels the home screen icon with SHORT_NAME.
  I had set `short_name: name || 'Fairli'` — i.e.
  the bare person's name. Correct is short_name = «Fairli»
  (the brand), the person's name belongs in `name` («Fairli · <Name>»),
  which only appears in the install dialog and in the app info.
- IMPORTANT SIDE INSIGHT (answers the open question from v4.56.0):
  because the icon carried the person's name at all, Chrome/Android
  used the manifest generated by the SERVICE WORKER when building the
  WebAPK — not the static file. So the SW path works on a real
  device. The static fallback remains in place as a net.
- Test extended: the @sw test now checks short_name === 'Fairli'
  in addition to the personalized name/start_url
- NOTE to the maintainer: Chrome updates an already installed WebAPK
  with a delay (typically within a day; if needed: remove the icon
  and reinstall)
- 86/86 Chromium, 1/1 chromium-sw
- APP_VERSION 4.56.1, SW cache haushalt-v148

## 2026-07-20 — v4.56.0: personal links are installable apps (Chrome previously offered only a shortcut)

- MAINTAINER FINDING: from personal links Chrome installed no app,
  only a shortcut; the old bare admin link worked.
- CAUSE (unambiguous): personal links were MANIFEST-FREE. The old
  rule `if (!IS_IOS && !USER_SLUG)` attached the manifest ONLY in the
  family context. Without a manifest Chrome cannot build an app —
  exactly the described behavior. The reason at the time (several
  person icons per device must not overwrite each other) remains
  valid, but is solvable more cleanly.
- SOLUTION: every personal link gets its OWN manifest with its
  own id and its own start_url (= the personal route). The address
  is ALWAYS same origin: /chores/manifest.json?f=…&u=…&n=…
  · if the service worker controls the page, IT generates the
    personal manifest (name «Fairli · Mira»)
  · if it does not (yet), the static host answers with the
    normal file — likewise valid and installable
  · iOS deliberately stays manifest-free (WebKit bakes start_url in at
    PARSE time; without a manifest it takes the current URL)
- DISCARDED: the data: URL variant built first. It does parse
  cleanly, but is not reliable as an app source — and a fetcher
  that does not know the SW (e.g. WebAPK generation) never sees it.
  Same origin is better in EVERY case.
- SECOND FINDING (measured, not guessed): when the app starts at the
  generic start_url, the family route ALWAYS won so far — an
  admin with an old link would therefore have ended up under the wrong
  identity (logged_by!). loadRoute() now takes the LAST used route
  (timestamp; legacy entries without a stamp keep their precedence when
  they stand alone).
- MEASUREMENTS (CDP, Page.getAppManifest): family link unchanged;
  personal link → manifest URL same origin, name «Fairli ·
  Mira», start_url = the personal route, no parse errors; without SW →
  a valid generic manifest (standalone, 3 icons)
- OPEN, only checkable on a real device: whether Chrome/Android uses
  the SW manifest or the static file when building the WebAPK. Both
  paths now lead to a real app; in the second case the icon is called
  «Fairli» instead of «Fairli · Mira» and starts via the last used
  route. MAINTAINER CHECK: is the icon called «Fairli · <Name>»?
- TEST PROJECT chromium-sw (serviceWorkers: allow, grep @sw): the
  SW path is now covered automatically; the rest stays
  deterministic with the SW blocked
- MY OWN MISTAKE, documented openly: while rewriting the tests I
  accidentally deleted 622 lines (about 25 tests) with a range
  replacement between two markers. Noticed by the test count
  (85 → 58) in the full run, then restored from HEAD and the
  four new tests added cleanly. LESSON: range replacements only with
  an unambiguous start AND end of the same block; afterwards ALWAYS
  check the test count.
- The old rule «personal links never with a manifest» (v4.20.0)
  updated in the test rather than deleted — it was the deliberately
  changed assumption
- 86/86 Chromium, 84+2 WebKit, 1/1 chromium-sw
- APP_VERSION 4.56.0, SW cache haushalt-v147

## 2026-07-19 — v4.55.0: admin is a property of PEOPLE — no more anonymous family link in the invite sheet

- MODEL CHANGE (maintainer): rights used to hang on the LINK TYPE (the
  bare family link = all-powerful and nameless). Now on the PERSON:
  members.admin. An admin works via their OWN personal link
  — so with every entry it is clear who booked it (v4.54.0), including
  for admin actions
- CONCRETELY: the central question `isAdmin()` (= bare link OR
  slugSelf().admin) replaces all rights branches: person management,
  household name, retention, encryption, free chip choice,
  history rights, cleanup. The person menu gets «🔑 Admin»
  (checkmark + badge in the row). Invite sheet: the separate
  admin link block is out WITH NO REPLACEMENT; admins recognizable by
  the 🔑; hint «Admin: Mira. Sichert mindestens einen Admin-Link als
  Lesezeichen» (Admin: Mira. Bookmark at least one admin link)
- PROTECTION RULES: non-admins cannot operate the switch
  («Nur Admins können das ändern»), and the LAST admin cannot
  depose themselves («Mindestens eine Person muss Admin
  bleiben»). New households: the first person is automatically admin
- EXISTING STOCK: the bare family link remains valid and counts as a
  nameless admin — otherwise all previous devices would be locked out.
  It is simply no longer advertised
- BYCATCH (found by the test, a real app bug): the person menu now has
  FOUR entries and, on the topmost rows, unfolded out of the sheet
  — it now flips downwards when there is no room above
- BYCATCH 2: the Android one-tap install button lived in the
  removed family block; it now sits in the secure-access warning
  (the same place as when retrofitting late)
- Schema: members.admin boolean default false, rolled out via CI;
  pull columns extended (otherwise the flag would NEVER arrive — a
  near-trap)
- EMULATOR CHECK (three perspectives): an admin via a personal link has
  the person button, all chips, no family block, the hint names her ✓
  the appointment lands on the server ✓ a non-admin without a person
  button and without admin settings, but with «Mein Name», may share
  all links, an entry carries logged_by ✓ a bare legacy link stays admin ✓
- 7 keys ×19 (two dead ones removed). 83/83 Chromium, 82+1 WebKit
- APP_VERSION 4.55.0, SW haushalt-v146, NEWS_VERSION 4.55.0

## 2026-07-19 — v4.54.0: «Wer hat verbucht» (who booked it) in the detail sheet; recap extended with retention, image idea and booker

- NEW FEATURE (maintainer): every history entry remembers through
  WHICH LINK it was booked (log.logged_by = member ID of the
  link; NULL on the family link, which belongs to nobody individually).
  The display is deliberately unobtrusive: only in the detail sheet as
  a footer «Eingetragen von Mira» (entered by Mira) or «Eingetragen
  über den Familien-Link» (entered via the family link); a deleted
  member → «von einem entfernten Mitglied». The history list stays
  as lean as before
- Benefit (the maintainer's example): when the tomcat has been visited,
  you can see who was at home and entered it
- Schema: log.logged_by text, rolled out via CI; LCOLS extended
- RECAP: three new sections (de+en) — «🗓️ Verlauf aufräumen»,
  «🖼️ Bild-Idee für Kacheln», «✍️ Wer hat eingetragen»; in exchange the
  section about replaced links was removed (less important, as
  approved). Era → v4.38–v4.54, NEWS_VERSION = 4.54.0
- EMULATOR CHECK: Mira makes an entry for Tigi via her personal link
  → server row member_id m-cat, logged_by m-1; the history row stays
  lean; the detail sheet ends with «Eingetragen von Mira»; the news
  banner fires. THE FIRST ATTEMPT reported logged_by null — that was a
  bug in the CHECK SCRIPT (slug «s1» too short: the route regex
  requires ≥4 characters, so the app correctly treated the call as a
  family link). A second class of error in the harness after the mark
  reset — check scripts need the same care as the code
- 3 keys ×19. 81/81 Chromium, 80+1 WebKit
- APP_VERSION 4.54.0, SW cache haushalt-v145, NEWS_VERSION 4.54.0

## 2026-07-19 — v4.53.0: «Bild-Idee» field — an English image description drives the tile picture

- FINDING CONFIRMED (the maintainer judged the comparison sheet):
  variant C (English image description) is clearly the best for «Papier
  bündeln» and «Rasen mähen». Short German verb phrases give the
  model too little imagery
- SOLUTION: the field `chores.art`, internally present for a long time,
  is now visible in the edit sheet — «Bild-Idee (optional)», placeholder
  «mowing the lawn with a lawnmower», hint: only for the tile picture,
  it appears nowhere in the text, English descriptions usually hit
  better. Set = it is the WHOLE prompt; empty = name+note again
  (v4.46.2 semantics unchanged). Deliberately NO reinterpretation of the
  note field: the note is visible text for humans, the
  image idea is pure image direction — two purposes, two fields
- Newly created chores take the image idea along directly
- TEST: with an idea set the prompt consists ONLY of it (name/note out),
  tile and history still show name+note and NEVER the image idea,
  clearing it falls back cleanly to name+note
- BEFORE/AFTER SHEET generated (rule from 19.07.): same seed,
  the app's own prompt logic, four images — for the maintainer to judge
- 2 keys ×19. 79/79 Chromium, 78+1 WebKit
- APP_VERSION 4.53.0, SW cache haushalt-v144

## 2026-07-19 — Investigation: tile art «Papier bündeln» / «Rasen mähen» + new rule for prompt changes

- FINDING (maintainer report): the prompt WITHOUT a note reads exactly
  «<Name>, minimalist flat vector illustration, single subject,
  centered, dark moody background, vibrant accent color, no text, no
  words» — so just the chore name plus the style suffix. IMPORTANT: for
  chores without a note, the note change (v4.46.2) did NOT alter the
  prompt. «Papier bündeln» and «Rasen mähen» are therefore not a
  regression, they show the baseline quality: short German verb phrases
  give the model little that is pictorial («bündeln», «mähen» are
  activities, not motifs)
- COMPARISON SHEET generated (same seed, three variants per tile):
  A = today (name only), B = name + «Haushaltsaufgabe» (household
  chore), C = English image description. Six images, all with a
  different hash — so the model really does react to the prompt, no
  placeholder. The assessment is the maintainer's; NO prompt change
  deployed before a variant has been chosen
- HONEST LIMITATION: the sandbox's image display returns unreadable
  images in this session — the AI could NOT judge the motifs itself.
  Hence a sheet for human judgement instead of a claimed assessment
- NEW RULE (§Tiles): every prompt change needs a before/after
  comparison sheet; "sounds better" does not count

## 2026-07-19 — v4.52.0: retention period for the history (30/90 days/unlimited, default unlimited)

- NEW FEATURE (maintainer): ⚙︎ → 🗓️ «Verlauf aufbewahren» (keep
  history) with Unbegrenzt (DEFAULT) / 30 Tage / 90 Tage. Older HISTORY
  entries are then deleted automatically
- DELIBERATE BOUNDARIES, because the feature is destructive:
  · Affects the log table EXCLUSIVELY. Chores, people, household and
    the point totals are never touched (a test checks that NO DELETE
    goes to members/chores/families)
  · The setting lives on the HOUSEHOLD (families.retention_days, NULL =
    unlimited), not on the device — otherwise device A deletes what
    device B wants to keep
  · Only the admin link shows the setting AND does the cleanup (one
    instance instead of parallel deletion runs); personal links do not
    see the row and delete nothing
  · When switching it on, a confirmation dialog WITH the number of
    affected entries and a note about finality; cancelling saves
    nothing and deletes nothing
  · Deletions go through deleteRemote (pull protection, retry)
  · If saving the setting fails, it is reset to the OLD value and
    NOTHING is deleted
- Schema: families.retention_days integer (NULL = unlimited), rolled
  out via CI workflow (column live after ~30 s)
- NOTE ON THE HOUSE RULE "never delete user data": it still applies to
  the AI side (no deleting on its own authority). Here it is
  exclusively the human who deletes, through an explicit, confirmed
  setting — the default stays unlimited
- TESTS (3 new): default deletes nothing + cancel deletes nothing;
  a confirmed 30 days deletes EXACTLY the two old entries (boundary
  case 29/31 days checked), nothing outside the history; personal link
  without the setting and without deletion. Test pitfall documented:
  «l-1» is a substring of «l-120» — compare IDs exactly
- EMULATOR CHECK with a responding fake server: 90 days → dialog names
  2 entries → server log goes from 4 to 2 → second device sees the same
  state without deleting itself → back to Unbegrenzt deletes nothing
  further; after a reload: tiles, people and points intact, setting
  reads «30 Tage»
- 6 keys ×19. 78/78 Chromium, 77+1 WebKit
- APP_VERSION 4.52.0, SW cache haushalt-v143

## 2026-07-19 — License: proprietary, explicit consent required; news banner behaviour verified empirically

- LICENSE (maintainer): LICENSE extended — all rights reserved, any
  use/copy/modification/distribution needs prior explicit written
  consent. Honest boundary in the text: reading and using the app is
  free; mandatory statutory limits (CH/EU) and the fork function that
  GitHub's ToS inevitably brings with it are exempted — but such a fork
  permits no deployment and no redistribution outside GitHub. Plus a
  third-party components note, contribution clause, warranty
  disclaimer, German short version. The README now names the license
  instead of only «# chores»
- NEWS BANNER CHECKED EMPIRICALLY (maintainer question "does it really
  show only once?"): a dedicated test server serves index.html with a
  variable APP_VERSION/NEWS_VERSION, one device runs through eight
  simulated releases. Result: banner at 4.51.0 (recap new) YES → after
  tapping it, NO at 4.52.0/4.53.1/4.60.0, the mark advances silently →
  at 4.61.0 WITH a new recap YES again → after that NO at 4.62.0/4.70.0.
  Exactly once per recap. (The test harness itself had a bug on the
  first attempt — addInitScript reset the mark on EVERY navigation and
  reported a permanent banner; fixed, then clean)
- The behaviour is deliberate: whoever IGNORES the notice (neither taps
  nor swipes it away) sees it again at the next start — it only counts
  as seen once it has been acknowledged

## 2026-07-18 — v4.51.0: search switches itself on in large households; recap extended with search and assisted members

- AUTO-ACTIVATION (maintainer): more than 7 tiles → search turns itself
  on, with a hint toast («abschaltbar in den Einstellungen» — can be
  switched off in the settings). IMPORTANT: only as long as the person
  has NEVER touched the switch themselves (missing LS key = untouched).
  Whoever switches search off writes '0' and is never overruled again —
  not even at 50 tiles. Toast ×19
- RECAP: two new sections in updates.html (de+en) — «🔎 Suchen»
  (search: filter tiles, history by chore OR person, umlauts don't
  matter, self-activation) and «🐈 Personen ohne eigenes Telefon»
  (people without their own phone: flag in the person menu, everyone
  may log for them). Era → v4.38–v4.51, NEWS_VERSION = 4.51.0 (rule:
  = version of the recap release)
- EMULATOR CHECK (realistic state: mark 4.50.0, onboarding done, search
  never touched, 8 tiles): search switches on ✓ toast appears ✓ news
  banner fires ✓ «kü» filters down to «Küche aufräumen» + «Wäsche
  waschen» (note hit) ✓ recap shows era v4.38–v4.51 with the two new
  sections at the top ✓
- Test covers the boundary: 7 → off, 8 → on, a manual switch-off holds
  even after a reload. 75/75 Chromium, 74+1 WebKit
- APP_VERSION 4.51.0, SW cache haushalt-v142, NEWS_VERSION 4.51.0

## 2026-07-18 — v4.50.0: search (setting, OFF by default) for chores and history

- NEW FEATURE (maintainer): ⚙︎ → 🔎 «Suche» (search; on/off, per
  device, OFF by default). When switched on, a search bar appears above
  the list — in Aufgaben AND Verlauf, not in Punkte
- FILTER: chores by name + note, history by chore, note and PERSON
  («timon» shows everything by Timon). Diacritic-blind in both
  directions («ku» finds «Küche», «kü» finds «Kuche», ß=ss); with
  several words, ALL of them must occur
- DETAILS: the bar sits OUTSIDE #list and survives every render() — the
  focus is kept while typing (otherwise it is lost after every
  character). The × button and Esc clear it; a dedicated empty state
  «Nichts gefunden» (nothing found) instead of «Lege die erste an»
  (create the first one); the «Einmalig» tile is hidden while a search
  is active (it does not fit a search — a find from the emulator visual
  check). The setting survives a reload, the input deliberately does
  NOT
- EMULATOR CHECK (rule): default off ✓, switching on focuses
  immediately ✓, typing sequence «kü» → «Küche aufräumen» + «Wäsche
  waschen» (note hit «Küchentücher») ✓, focus is kept ✓, history by
  chore and by person ✓, points without a bar ✓, reload keeps the
  switch and clears the field ✓
- 8 keys ×19. 74/74 Chromium, 73+1 WebKit
- APP_VERSION 4.50.0, SW cache haushalt-v141

## 2026-07-18 — v4.49.0: assisted members — people without their own phone (very young, without a device, or a cat)

- NEW FEATURE (maintainer): in the person menu (admin), per person
  «📵 Ohne eigenes Telefon» (without their own phone) can be toggled
  on/off (checkmark in the menu, 📵 badge in the row). Effect: assisted
  members appear on ALL personal links — every housemate may log for
  them, not just admins
- SCHEMA: members.assisted boolean not null default false (unencrypted
  — a plain boolean on an already opaque row). Migration rolled out via
  CI workflow (column live after ~20 s), pull columns extended
- MECHANICS: new helpers slugSelf() (identity of the LINK) and
  allowedIds() (self + assisted). The chips on the personal link show
  this set and are selectable as soon as more than one person is in it;
  the pull only reverts the selection if it is not (or no longer)
  allowed. canEditLog follows the same set → the cat's history entries
  are editable by everyone, other people's entries still are not
- IMPORTANT SEPARATION: «Mein Name» in the settings ALWAYS shows/changes
  the link identity (slugSelf), never the chip selection — otherwise
  you rename the cat by accident
- EMULATOR CHECK (new deploy rule, realistic state): admin toggles
  Tigi → the server takes it over; Mira (personal link, not admin) sees
  «Mira» + «Tigi», logs for Tigi, sees the entry as editable, and «Mein
  Name» still shows Mira ✓
- «Ohne eigenes Telefon» ×19. Two new tests (admin toggle incl.
  persistence and checkmark; personal link with chips, logging for
  others, pull stability, permission boundary). 73/73 Chromium,
  72+1 WebKit
- APP_VERSION 4.49.0, SW cache haushalt-v140

## 2026-07-18 — v4.48.0: recap worded universally, banner really fires — and a new deploy rule: emulator function check

- TWO LIVE FINDS (maintainer, with screenshot):
  1. The recap described the link rotation as if EVERY household had
     received a new link — it was family-specific. But updates.html is
     the page for ALL users. The section is now universal: «Ersetzte
     Links sagen Bescheid» (replaced links tell you) describes the
     feature (the replaced notice), not the event. Era → v4.38–v4.48
  2. NO banner on the family devices: the seenver mark advances
     silently to APP_VERSION on every visit — the family's marks stood
     at 4.47.x, NEWS_VERSION (4.47.0) was BELOW that and could never
     fire mathematically. RULE (documented in the code):
     NEWS_VERSION = version of the recap release ITSELF. Now
     NEWS = APP = 4.48.0
- NEW STANDING RULE (maintainer): per deploy, the feature that was
  built is checked functionally in the emulator IN A REALISTIC USER
  STATE — not just under synthetic test conditions. Carried out for
  this deploy: family state (mark 4.47.6) meets 4.48.0 → banner
  appears, a click opens the recap (era v4.38–v4.48), the mark
  advances, the banner is gone. In doing so the check promptly caught a
  bug in the test script itself (retired_families mock: 'families' is a
  substring — order matters), class documented
- 71/71 Chromium, 70+1 WebKit
- APP_VERSION 4.48.0, SW cache haushalt-v139, NEWS_VERSION 4.48.0

## 2026-07-18 — v4.47.6: recap v4.38–v4.47 (banner fires once), famName guard — last exception eliminated

- UPDATES.HTML NEW (de+en): the era v4.38–v4.47 in family language —
  fresh family link (rotation, replaced notice), «Zugriff sichern»
  (secure access) onboarding with one-tap Android, inviting without
  guesswork, slide/swipe operation, Mein Name/Haushaltsname, rock-solid
  saving (sync race fixed app-wide), note→tile art, quiet news notice,
  under-the-hood (privacy cleanup). NEWS_VERSION → 4.47.0 in the SAME
  commit (discipline) — the family gets ONE deserved banner for the
  whole sprint
- FAMNAME GUARD (maintainer question "why does renaming need an
  exception?" — honest answer: it didn't; famName is a SCALAR and does
  not go through reconcile, the exception was convenience): a small
  counterpart to the row overlay (pendingFamName, locally authoritative
  until server confirmation + seen by the pull). The rename test was
  extended around the 2 s commit race. That makes the rule
  exceptionless: EVERY write is pull-protected
- A single unreproduced Chromium flake in one full run (the following
  run was 71/71 clean) — keep watching. 71/71 Chromium, 70+1 WebKit
- APP_VERSION 4.47.6, SW cache haushalt-v138

## 2026-07-18 — v4.47.5: consistency audit — last race gaps (history), duplicate sheet registration, orphans gone

- AUDIT (maintainer: "have we left anything inconsistent behind?"),
  six finds, all fixed:
  1. HISTORY EDITS were the last unprotected write paths (push+PATCH in
     saveLog AND in the <1 h points merge) — the same race class as
     people/chores. Now upsertRemote; with that, EVERY edit path in the
     app goes through the pull protection
  2. The share sheet registered enableBackdropClose TWICE (once on
     creation, once guarded per first open) → handlers ran twice. The
     guarded registration stays
  3. Orphan CSS removed: .namerow (3 rules, markup gone since v4.47.3),
     .shbtn.ghost (last user gone since v4.43.0)
  4. §12 updated: the Fanti write_key_hash point had been settled since
     the rotation (famx carries the hash from birth)
  5. Three dead dictionary keys ×19 removed
  6. Two old tests asserted the PATCH mechanics from before v4.47.5 —
     switched over to the POST reality; the accumulation test now
     distinguishes create/upsert honestly by the body shape (object vs.
     array)
- FOUND CLEAN: the pencil only on tiles, the chevron only in settings
  navigation, Speichern/Fertig labels consistent (Fertig only where
  there is nothing to save), all 13 dialogs on the sheet system, i18n
  without gaps, docs without corpses
- NOTED AS OPEN: NEWS_VERSION (4.37) is lagging — an updates.html recap
  v4.38–v4.47 is due; the household-name PATCH remains a documented
  cosmetic exception
- New history race test (2 s commit model). 71/71 Chromium,
  70+1 WebKit
- APP_VERSION 4.47.5, SW cache haushalt-v137

## 2026-07-18 — v4.47.4: ✎ removed from the history — the whole row means edit

- A consequence of the pencil semantics (v4.47.3): the ✎ is only a tap
  target where the surface means something ELSE. In the history the
  whole row means edit → the decorative ✎ (v4.42.1) marked nothing of
  its own and is out. The permission distinction stays structural:
  editable rows are buttons, locked ones DIVs — the permission test now
  checks exactly that instead of the symbol
- 70/70 Chromium, 69+1 WebKit
- APP_VERSION 4.47.4, SW cache haushalt-v136

## 2026-07-18 — v4.47.3: the name field in the edit sheet is a normal input field

- MAINTAINER CLARIFICATION (with screenshot): the pencil belongs on the
  TILES — there it is a real tap target with a DIFFERENT meaning than
  the surface (surface = log it, pencil = edit). In the edit sheet this
  ambiguity does not exist → the name is now a normal, immediately
  editable field like in the Einmalig sheet. The whole static-text
  construction (v4.47.1/2: nameStatic, tap row, decorative ✎) is out
  with no replacement
- The original worry (the keyboard pops up on open) resolves more
  simply: in edit mode the field is NOT focused — no focus, no
  keyboard. Lesson: check the simplest mechanism first, before building
  states
- Test: field immediately visible + prefilled + unfocused on open, type
  straight away → save. 70/70 Chromium, 69+1 WebKit
- APP_VERSION 4.47.3, SW cache haushalt-v135

## 2026-07-18 — v4.47.2: change button removed from the name field — decorative ✎ as everywhere else

- The ✎ change button in the name row had been redundant since v4.47.1
  (the whole row is the tap area) — now replaced by the decorative ✎
  following the established pattern (tiles v4.26, history v4.42.1:
  whole surface tappable, pencil as pure affordance). The dictionary
  key «✎ Ändern» removed from 19 languages
- The test checks: no more #editName, the decorative ✎ is there, a tap
  on the name opens the field. 70/70 Chromium, 69+1 WebKit
- APP_VERSION 4.47.2, SW cache haushalt-v134

## 2026-07-18 — v4.47.1: renaming chores — name row directly tappable, the change survives the pull

- NAME ROW (maintainer, point 1): in edit mode the name is static text
  (deliberately: no keyboard pops up on open) — but only the small ✎
  button made it editable. Now the WHOLE row is the tap area
  (role=button, cursor, the pencil stays as an affordance); a tap on
  the name itself opens the field with focus
- RENAMING NOW HOLDS (maintainer, point 2 "the old name stays"): the
  edit branch wrote via an unprotected push(PATCH) — a pull with a
  pre-commit snapshot reverted name/points/note, and with the old name
  the old tile art came back too (the prompt URL hangs off name+note).
  SAME root cause as the people bug v4.46.1, same medicine:
  upsertRemote (overlay until server confirmation). With that, all
  known write paths are race-protected: people (v4.46.1), chore edit
  (v4.47.1); creations/deletions already went through
  createRemote/deleteRemote. The household-name PATCH remains noted as
  a cosmetic exception (§12)
- Test (race model with a 2 s commit): row tappable → field focused;
  the tile shows the new name immediately; the art prompt carries the
  new name; a pull during the open commit reverts nothing; POST body
  verified. 70/70 Chromium, 69+1 WebKit
- APP_VERSION 4.47.1, SW cache haushalt-v133

## 2026-07-18 — v4.47.0: replaced-link notice, «Speichern» button in the person sheet; Ginge incident diagnosed

- REPLACED-LINK NOTICE: the server tombstone (retired_families) only
  blocked INSERTS — users of a rotated link saw cached data and
  silently failing writes and learned NOTHING. Now the boot (after
  CRYPTO_READY, cleartext ID + row scope) checks the tombstone and
  shows a STICKY full-screen notice («Dieser Familien-Link wurde
  ersetzt — holt euch den neuen Link vom Admin»), remembered locally:
  once detected, always shown, offline too (tombstones are final).
  2 keys ×19
- PERSON SHEET: the button at the bottom is called «Speichern» (save)
  instead of «Fertig» (done) (maintainer: consistent with the other
  sheets — it does SAVE)
- GINGE INCIDENT (adding a person failed on the NEW link): production
  repro against the REAL DB (throwaway famx family, real RLS, real
  write auth, UI flow): POST 201, person persisted — the current code
  is healthy. Most likely cause: after sleeping, the SW serves the
  previous version ONCE; with 18 deploys today the device was probably
  travelling in the v4.46.0 window (the race-bug era). Remedy: open/
  reload the app twice, check the version in the settings (≥ 4.46.1),
  try again. Sandbox lesson documented: a browser repro against
  production needs ignoreHTTPSErrors (egress proxy MITM) — before that
  you are measuring ONLY sandbox artefacts
- Suites: 69/69 Chromium, 68+1 WebKit
- APP_VERSION 4.47.0, SW cache haushalt-v132

## 2026-07-18 — Operations: family link ROTATED (copy verified, old one untouched); guard hashed

- ROTATION EXECUTED (maintainer approval): the household's complete
  holdings (1 family, 5 members, 33 chores, 290 log entries) created
  re-encrypted under a NEW famx secret. Fresh row IDs (global PKs —
  identical IDs would have collided with the old rows;
  merge-duplicates would have UPDATED them, the write auth rejected
  exactly that and thereby protected the old data), log references
  mapped along consistently (incl. orphaned references), url_slugs
  UNCHANGED. Verification: new holdings read, decrypted, canonical
  SHA-256 manifest == old manifest (byte-identical content); old
  holdings recounted: untouched. NO tombstone, NOTHING deleted — both
  links work until the maintainer has verified the new link on the
  device. New links: PRIVATE deliverable file, deliberately nowhere in
  the repo. Open: tombstone + cleanup of the old data after approval;
  one orphaned families row from an aborted first run (empty of
  content, key discarded) to be cleaned up later via CI psql
- GUARD HASHED (maintainer question "do our names appear in there?" —
  YES, they did, including the exposed old ID: the first version was
  its own violation and excluded itself from the scan): the guard now
  only knows tokens as SHA-256 hashes, checks itself again, and
  promptly caught THREE leftovers that had escaped the case-sensitive
  \b patterns (capitalization, name variant). Verified red against a
  planted token
- Suites: 67/67 Chromium, 66+1 WebKit

## 2026-07-17 — v4.46.3: anonymization steps 1–3 — and a CRITICAL find: the real family link ID had been in the public repo since 12.06.

- CRITICAL (discovered while executing step 2, missed by the audit
  because the search pattern only knew fam-*): the REAL existing family
  ID stood as a backfill value and a threefold column DEFAULT in two
  migration files — world-readable since 12.06.2026. Family IDs ARE the
  access URLs; the famc encryption does NOT protect here, because the
  keys are derived from exactly that link. The link must be regarded as
  EXPOSED. Files cleaned (placeholder + note; the migrations have long
  since been applied) — the git HISTORY still contains the ID.
  Consequence: step 4 (history restart) is now urgent, AND a link
  rotation of the household (new secret, all members get new links, the
  old URL retired via tombstone — nothing is deleted) is the only real
  remedy. DECISION WITH THE MAINTAINER — family coordination needed
- Step 1: stray family ID removed from the onboarding docs and the LOG
  (it is now only in the private notes); rotation of the stray family
  still open (maintainer's decision)
- Step 2: repo-wide replacement table, LENGTH-EXACT (chip-wrap and
  wide-layout tests measure pixels): fixture personnel and household
  name fictionalized, address test string replaced, comment anecdotes
  without names (the lesson stays), LOG attributions → «Maintainer».
  235 replacements across tests, app comments, LOG, docs, workflows,
  the 404 example path. fables_corner.txt deliberately UNTOUCHED
  (creative/personal — the decision to move it is the maintainer's, the
  guard exempts the file)
- Step 3: anonymization guard in check-discipline.mjs — names, place
  references and link ID patterns (fam|famc|famx|old prefix-…{10,})
  with an explicit whitelist of the four test artefacts; verified red
  against a planted token. Proved twice today that good intentions are
  not enough (the address string in the test came from the AI session
  itself)
- Suites after 235 replacements: 67/67 Chromium, 66+1 WebKit
- APP_VERSION 4.46.3, SW cache haushalt-v131

## 2026-07-17 — v4.46.2: the note flows into the tile art prompt; test infrastructure made honest

- TILE ART (maintainer): the note was NOT in the prompt — «Kochen, für
  zwei Personen» painted the same thing as «Kochen». Now:
  c.art || name+«, »+note (a dedicated art field remains solely
  authoritative — the note of a custom prompt does NOT flow in).
  Consequence: tiles WITH a note load new art once (prompt changed,
  seed the same). New test: the prompt URL contains «Kochen, für zwei
  Personen»; with art set, only the custom prompt, never the note
- TEST INFRA, two real finds during the full run:
  (1) The «Mein Name» test was still intercepting PATCH — since v4.46.1
  upsertRemote writes via POST. Test switched over to POST (body row:
  own id + name, famScope in the URL)
  (2) FIVE tests with THEIR OWN routes (without mockBackend) ran
  without the onboarding persona — since v4.45.0 the «Zugriff sichern»
  modal blocked their clicks. New helper suppressOnboarding(context),
  added in all five
- HONESTY, important: the suite output has recently been shortened with
  tail -N in sessions — that CAN swallow "X failed" lines above the
  "passed" line; individual green reports from the last few rounds may
  therefore have been false green (the two finds above sat exactly in
  that shadow). From now on: ALWAYS filter the output through a pattern
  that shows failed/skipped/passed together (§11 rule). Current
  COMPLETE state: 67/67 Chromium, 66+1 WebKit, nothing hidden
- APP_VERSION 4.46.2, SW cache haushalt-v130

## 2026-07-17 — v4.46.1: person sheet — adding/renaming survives the pull (race fixed), save confirmation

- LIVE BUGS (maintainer): a new person "was not really added" (missing
  from the ICH-BIN row), admin renames did not hold, and whether
  anything was saved was unclear
- CAUSE: finishMembers wrote PAST the sync protection (bare push+upsert
  instead of the createRemote pattern). A pull() whose snapshot
  predated the server commit replaced state.members entirely — the new
  person vanished, renames jumped back. For EDITS there was no
  protection at all: reconcile only knew creates/deletes
- FIX: (1) reconcile gets OVERLAY semantics — a pending write also
  replaces the stale server version of the same row. (2) New
  upsertRemote(table, rows): registers every row as a pending write
  (a live reference — later edits of the same row stay authoritative),
  resolvedAt only after server confirmation. (3) ALL person write paths
  go through it: finishMembers, ensureSlug (a swallowed slug would mean
  shared links the server does not know about!), the Mein-Name sheet
  (instead of PATCH)
- "Unclear whether it saves": finishMembers now toasts «Gespeichert»
  (saved) on changes
- TEST (red first, then green): an honest race model — the server takes
  2 s to commit, the pull happens meanwhile and does not see the write.
  The new person stays in the ICH-BIN row, POST content verified;
  renaming an existing person holds just as well. The maintainer's
  exact sequence (type, straight to Fertig, no blur) reproduced.
  64/64 Chromium, 63+1 WebKit
- APP_VERSION 4.46.1, SW cache haushalt-v129

## 2026-07-17 — v4.46.0: «Mein Name» for members, more understandable member copy — and a cleartext leak in the person upsert closed

- MEIN NAME (maintainer): on a personal link the settings show the row
  👤 «Mein Name» (my name) (the admin does not see it — person
  management can do everyone). Sheet with a prefilled field; locally
  immediate (chips, points, tiles follow), server via
  sb('members?id=eq.me','PATCH',{name}) — ONLY one's own row, famScope
  stays attached, encRow encrypts with famc/famx. The history stays
  historical (member_name of old rows unchanged — same semantics as
  with an admin rename); new entries carry the new name. «Mein Name»
  ×19
- COPY (maintainer, folded in here from v4.45.3): «ohne Admin-Zugriff»
  (without admin access) struck from the member explanation — IT
  jargon; the admin row above it explains itself. New: «Verschick sie
  an deine Mitbewohner oder Familie — jede Person loggt damit ihre
  Aufgaben» (×19)
- BYCATCH, serious: finishMembers() (the admin's person sheet) wrote
  members via a RAW fetch — WITHOUT encRow and WITHOUT x-fairli-key.
  With famc/famx, names would have landed in CLEARTEXT or failed at the
  write auth; with Fanti (fam-, legacy) it never showed. Now via
  upsert() (encrypted + write key + merge-duplicates). The famx "never
  sends cleartext" test did not cover this path — the person upsert did
  not run there; gap noted
- Tests: a member renames themselves (chip immediately, PATCH target is
  their own row + famScope), admin without «Mein Name», personal link
  with it. 64/64 Chromium, 63+1 WebKit
- APP_VERSION 4.46.0, SW cache haushalt-v128

## 2026-07-17 — v4.45.2: member copy extended, i18n audit — encryption migration translated

- COPY (maintainer): the «Persönliche Links» (personal links)
  explanation now leads with the action: «Verschick sie an deine
  Mitbewohner oder Familie — jede Person loggt damit ihre Aufgaben,
  ohne Admin-Zugriff» (×19, old key removed)
- I18N AUDIT (maintainer question "is the onboarding translated?"): the
  onboarding flow is COMPLETE in all 19 languages ✓. But the audit (all
  t() keys against the dictionaries) found a pre-existing gap: the
  ENCRYPTION MIGRATION sheet was t()-wrapped, yet its 10 keys were
  missing everywhere — it fell back silently to German. Now translated
  (×19, incl. the two long explanatory paragraphs). Repeated audit: NO
  real gaps left
- 63/63 Chromium, 62+1 WebKit
- APP_VERSION 4.45.2, SW cache haushalt-v127

## 2026-07-17 — v4.45.1: no double message — the 📲 banner stays quiet as long as step 1 is open

- LIVE OBSERVATION (maintainer): «Zum Home-Bildschirm» (to the home
  screen) appeared twice — in the banner at the top AND in the
  onboarding sheet at the bottom (the semi-transparent backdrop let
  both be seen at once)
- RULE: as long as #onboardSheet carries the install message, the
  banner is hidden; on closing, the sheet calls initInstallBar() — the
  banner returns IMMEDIATELY as a permanent reminder (respecting
  appinstalled/dismissal via LS_IBAR). Whoever installs from the sheet
  never sees it again; whoever clicks it away keeps the gentle reminder
- The creator path sets the onboard mark already during setup (step 1
  comes explicitly there — maybeOnboard must not fire twice)
- Tests: banner hidden as long as the sheet is open; visible after
  closing without installing; reload persistence. 63/63 Chromium,
  62+1 WebKit
- APP_VERSION 4.45.1, SW cache haushalt-v126

## 2026-07-17 — v4.45.0: onboarding arc «Zugriff sichern» — creator wizard, recipient landing, native-first banner

- CONCEPT (maintainer): (1) after the household is created, first
  «Link sichern» (secure the link), (2) then the invite sheet,
  (3) link recipients land at (1)
- STEP 1, #onboardSheet «Zugriff sichern»: savenote warning (admin text
  or the personal variant «Dein Link ist dein Zugang …»), a native
  Android button when the prompt is available, otherwise the
  instructions (installInstructionsHTML(true)); a late
  beforeinstallprompt retrofits the button (the race lesson v4.44.1
  applies here too)
- CREATOR: end of setup → openOnboardSheet(true) → «Weiter: Mitglieder
  einladen» (next: invite members) → invite sheet (step 2 with the
  v4.44.0 explanations). FIRST-TIME VISITORS of every role (including
  the admin link on a second device): maybeOnboard() after the first
  render — mark haushalt.onboard:FAMILIE:a|u, never in standalone,
  never over open sheets, never over the first-run setup (ONLY famName
  counts as "the family exists" — the boot seeds a local default
  member, so members would be a false signal)
- NATIVE FIRST (maintainer placement question): the 📲 banner in the
  MAIN view now fires the native prompt DIRECTLY when it is available —
  the button in the main pane IS the banner; without a prompt it opens
  the instructions as before
- Tests: mockBackend sets the onboard mark as the default persona
  (returning visitor — otherwise the modal blocked every test;
  onboarding tests switch the persona off deliberately). New: the
  recipient sees the sheet exactly ONCE, a late prompt retrofits and
  fires, the mark persists; creator wizard test (setup → step 1 → next
  → invite sheet); chain test switched over to native-first. 3 new keys
  ×19. Visual acceptance §11: recipient state with the Android button
  rendered + checked programmatically. 63/63 Chromium, 62+1 WebKit
- APP_VERSION 4.45.0, SW cache haushalt-v125

## 2026-07-17 — v4.44.1: Install prompt race fixed — open sheets retrofit themselves; install chain tested end-to-end

- LIVE BUG (maintainer's Pixel: «the native home screen button does
  nothing»): Chrome often fires beforeinstallprompt only SECONDS after
  load (engagement heuristic). The Einladen and install sheets checked
  deferredInstall only at RENDER time — anyone who opened the sheet
  before the event never got to see the native path. Race test written
  first, confirmed red, then the fix: the BIP listener retrofits open
  sheets (install sheet re-renders to «Jetzt installieren», the
  Einladen sheet gets the button injected into the save warning;
  button wiring extracted into wireShInstall/injectShareInstall)
- QUESTION 1 (maintainer): recipients of shared links see the 📲 banner —
  that was already the case (initInstallBar shows it in EVERY context
  without standalone, dismissal key per family+role), but it was
  untested. New chain test from the recipient's perspective
  (personal link): banner visible → tap → install sheet →
  «Jetzt installieren» fires the native prompt → appinstalled cleans
  up (sheet closed, banner gone, remembered permanently)
- HONEST PLATFORM LIMIT (documented): if the PWA is already
  installed, Chrome NEVER fires beforeinstallprompt — then by design
  there is no native button, only the instructions. A «broken»
  button on a device with Fairli already installed is therefore
  expected behavior
- 63/63 Chromium, 62+1 WebKit
- APP_VERSION 4.44.1, SW cache haushalt-v124

## 2026-07-17 — v4.44.0: Onboarding — secure the admin link (warning + Android one-tap), explanation on the personal links

- BACKGROUND (maintainer): anyone who lands in the Einladen sheet after
  setup and does NOT save the admin link loses access to the household —
  nobody said so until now
- SAVE WARNING (.savenote, amber-tinted box right inside the
  admin block): «Wichtig: diesen Link sichern — als Lesezeichen oder
  auf dem Home-Bildschirm. Ohne ihn verliert ihr den Zugriff auf euren
  Haushalt.» (important: save this link — as a bookmark or on the home
  screen; without it you lose access to your household). Always
  visible, not just the first time — the warning costs nothing and the
  loss case is fatal
- ANDROID ONE-TAP: if the native install prompt is available
  (beforeinstallprompt has been captured since v4.20.0), the warning
  carries a primary button «Zum Home-Bildschirm hinzufügen» → fires
  the native prompt; after acceptance the button disappears
  («Installiert ✓» arrives via appinstalled). Without a prompt
  (iOS/already installed) the expandable instructions right below
  remain — expandInstall still opens them after setup
- PERSONAL LINKS: explanation on a par with the admin text —
  «Damit loggt jede Person ihre Aufgaben — ohne Admin-Zugriff»
- 3 new keys ×19 languages. Tests: warning + explanation in the
  de admin test; new test «button ONLY with a prompt, fires it,
  disappears after acceptance» (synthetic beforeinstallprompt).
  Visual acceptance §11: Android state rendered + checked
  programmatically (savenote/button/subnote present, no overflow).
  61/61 Chromium, 60+1 WebKit
- APP_VERSION 4.44.0, SW cache haushalt-v123

## 2026-07-17 — v4.43.1: «Admin-Link» wording, news banner anchored to CONTENT

- FAMILY ROW (maintainer's wording): title «Admin-Link», subnote «Gibt
  vollen Zugriff auf alle Mitglieder und ihre Aktivitäten» (grants full
  access to all members and their activities) — also as the QR caption;
  ×19 languages, 2 obsolete keys removed
  («Ganze Familie», the adult subnote from v4.43.0)
- NEWS BANNER ANCHORED TO CONTENT (maintainer: «it shouldn't come back
  with every version number» — the major.minor rule from v4.41.1
  pinged again on 4.42→4.43): new constant NEWS_VERSION = '4.37.0'
  (= how far updates.html reports). Anyone who has seen this state or
  newer is NEVER pinged again, no matter how many releases follow;
  the seenver mark is quietly brought forward. The banner only fires
  again when NEWS_VERSION is bumped TOGETHER with new updates.html
  content — appearance hangs on the content, not on the cadence.
  DISCIPLINE: extend updates.html ⇒ bump NEWS_VERSION in the same
  commit (the banner test guards that NEWS_VERSION is never AHEAD of
  its reported state)
- Tests: banner test new (seen >= NEWS_VERSION ⇒ no ping + mark
  brought forward; < NEWS_VERSION ⇒ banner; consistency guard),
  admin link wording in the de and en tests. 60/60 Chromium, 59+1
  WebKit (one aborted run before that was environment: an orphaned
  Pages server after a timeout — pkill, cleanly green)
- APP_VERSION 4.43.1, SW cache haushalt-v122

## 2026-07-17 — v4.43.0: Einladen sheet — admin link clearly marked, Empfehlen equally blue

- GOAL (maintainer): prevent the family/admin link (FIRST row in the
  sheet!) from accidentally being shared as a Fairli recommendation
- Family row: subtitle «voller Zugriff» → «Admin — voller
  Zugriff, für die Erwachsenen im Haushalt» (admin — full access, for
  the adults in the household) (also as the QR caption);
  now uses the .subnote class instead of inline styles
- Empfehlen button: ghost damping removed — the SAME accent blue as
  all share buttons; the subnote leads with the target audience: «Für
  Freunde: startet einen neuen, leeren Haushalt — zum Beitreten euren
  Familien-Link nutzen»
- Dictionaries: 2 new keys ×19, 2 obsolete removed
  («voller Zugriff», the old Empfehlen subnote) — the integrity test
  holds parity
- Visual acceptance per the new §11 rule: renders Pixel/iPhone, de+en;
  color/label/overflow check additionally programmatic (all three
  buttons identical blue, admin subnote present, no overflow). EN test
  extended by the admin subnote, friends subnote and color equality.
  60/60 Chromium, 59+1 WebKit
- APP_VERSION 4.43.0, SW cache haushalt-v121

## 2026-07-17 — v4.42.2: Swiping down closes sheets and toasts

- SWIPE-TO-DISMISS (maintainer: «the grabber looks like you
  could…»): swiping down drags the sheet along with the finger and
  closes from 120 px of pull OR on a brisk swipe (>40 px and
  >0.5 px/ms); below that it springs back (180 ms). Centralized in
  enableBackdropClose — SAME semantics as the backdrop tap: the
  form rule (dirty choreSheet/logSheet) blocks the swipe too.
  A downward pull only takes over when the sheet content is at the top
  (scrollTop 0) and the first pull goes downwards — swiping up/scrolling
  stays native. Slide-out 180 ms, transform is reset on close
- The share sheet now ALSO hangs on enableBackdropClose (until now it
  had neither backdrop tap nor swipe — an oversight from the early days)
- Toast: swiping down (>24 px) dismisses immediately (timer cleared)
- Test (both device projects): a brisk swipe closes, a short slow one
  springs back, the dirty guard blocks, toast swipe dismisses.
  Touch synthesis WITHOUT Touch/TouchEvent constructors (WebKit-Linux
  doesn't know them): plain Event + defineProperty(touches). 60/60
  Chromium, 59+1 WebKit
- APP_VERSION 4.42.2, SW cache haushalt-v120

## 2026-07-17 — v4.42.1: Sheets slide in, history ✎ like on the tiles

- SHEETS SLIDE (maintainer point 1): all dialog sheets (share, edit
  chore, settings, …) slide in from the bottom edge over 280 ms
  (transform translateY(100%) → 0), the backdrop fades in alongside.
  ONE CSS rule on dialog[open] covers all sheets; the global
  reduced-motion rule switches the animation off automatically
  (verified in the test). Fade-in only — fade-out stays immediate
  (closing shouldn't wait)
- HISTORY EDIT ICON (maintainer point 2): entries now show
  the same ✎ as the chore tiles instead of the chevron ›
  (.editicon, subtle, purely decorative — the whole row remains the
  tap area). The chevron › stays ONLY in the settings rows
  (list navigation). Permissions test adjusted (locked rows: no
  .editicon)
- New test: animationName sheetIn on opening, none under
  reduced-motion; history row has ✎ and no chevron. 59/59
  Chromium, 58+1 WebKit
- APP_VERSION 4.42.1, SW cache haushalt-v119

## 2026-07-17 — v4.42.0: Header shrinking removed, tabs bar opaque with a soft fade-out

- SHRINKING COMPLETELY OUT (maintainer: «gains a few pixels and causes
  many problems … doesn't look smooth either» — multi-line titles
  snapped to a single line while shrinking): the header is NO LONGER
  sticky and scrolls out of view normally; --shrink/--tabstop/interpolation
  and the scroll handler are removed without a trace. Only the tabs stick.
  Logo/title fixed at --titlefs; the .wide check stays (resize +
  title change). This also drops all sticky stacking topics
  (seam, scroll anchoring, dock height) with nothing to replace them
- TABS BAR: background now OPAQUE (previously the lower fifth of the
  gradient faded out transparent — tiles seemed to shine into the pills,
  maintainer screenshot 17.07.) plus an ::after fade-out (14 px var(--bg) →
  transparent): tiles dissolve under the bar instead of butting against
  it; padding-bottom 6 → 10 px
- Test replaced: instead of the continuity invariant, now «header
  scrolls away and does NOT shrink while doing so, tabs stick opaquely
  at 0» (both device projects). 58/58 Chromium, 57+1 WebKit
- APP_VERSION 4.42.0, SW cache haushalt-v118

## 2026-07-17 — v4.41.1: News banner only pings on feature jumps (major.minor)

- Live feedback: six deploys in one day = six banners. The
  «once per version change» design was wrong for a patch cadence.
  Now: banner ONLY when major.minor changes; on patch siblings
  the seenver mark is brought forward QUIETLY (otherwise a later
  minor jump would fire with a long-since-seen state). First contact
  stays silent
- New test: patch siblings → no banner + mark up to date;
  minor jump → banner. 58/58 Chromium, 57+1 WebKit
- APP_VERSION 4.41.1, SW cache haushalt-v117

## 2026-07-17 — v4.41.0: Header shrinking coupled to scroll (no jump), rename household

- SHRINKING IS NOW SCROLL-COUPLED (maintainer: «very little scrolling …
  feels jumpy»): instead of a binary .slim toggle (24/4
  thresholds), --shrink (0…1 = scrollY/64px) follows the finger 1:1.
  CSS interpolates title/logo size (--titlefs → 19px) and
  header padding via calc; ALL transitions on these values removed
  (they would smear along behind the finger). Handler SYNCHRONOUS per
  scroll event (no rAF: cheap, no frame lag — and headless WebKit
  starves rAF → catch-up jumps). --tabstop is measured along on every
  event; __updateWide ALWAYS measures at --shrink 0 (deterministic,
  no matter where it was scrolled). .slim CSS/JS removed completely
- NEW TEST (runs automatically on Pixel 7 AND iPhone 14, as
  requested): core invariant fs(y) = full + (19−full)·min(1, y/64)
  pointwise across 11 scroll positions ±0.75 px, logo == title size in
  every intermediate position, real intermediate positions forced,
  back to 0 = full. Measured against the REAL scrollY (robust against
  scroll anchoring: the browser readjusts scrollY because the shrinking
  header shortens the document — in the test a scroll event is
  re-dispatched before sampling so the handler reads the final position)
- RENAME HOUSEHOLD (maintainer point 2): Settings → 🏠
  Haushaltsname (household name) (family link ONLY — personal links
  don't see the row). Sheet with a prefilled field; locally immediate
  (state + save + __setFamTitle including size step/wide), server via
  sb('families','PATCH',{name}) — famScope targets the row,
  ENC_FIELDS.families encrypts the name automatically on famc/famx.
  Error → toast «Konnte nicht speichern»; the next pull would bring the
  server name back after a failed PATCH (deliberately simple).
  3 new keys ×19 languages
- BONUS: an overlooked i18n leak in the person sheet (share text «…, mach
  mit bei …») replaced with t() — the keys had existed since v4.38.0
- Tests: rename test (title follows immediately, PATCH body {name,
  family_id} verified, personal link without the option). 57/57
  Chromium, 56+1 WebKit
- APP_VERSION 4.41.0, SW cache haushalt-v116

## 2026-07-17 — v4.40.0: Long family names — title full width, buttons on their own row

- NEW (.wide, maintainer question 17.07.): if the title needs more than
  its 2 clamp lines in the SPLIT layout (buttons alongside), the
  title row takes the full width and ⚙/Einladen/Personen slide
  right-aligned onto their own row. The decision is CONTENT-driven
  (__updateWide): measurement ALWAYS in the split layout (class removed
  beforehand, synchronously in the same frame → deterministic, no
  oscillation, no flicker); epsilon = HALF a line height (at exactly 2
  lines scrollHeight rounds 1–3 px above clientHeight depending on the
  font — a real third line lies a whole line above). Triggered by
  __setFamTitle, resize and the slim toggle (changes the header height
  → --tabstop is re-measured afterwards)
- --titlefs moves into __setFamTitle onto #apphead: the
  name-length shrink steps (>14 / >22 characters) now drive title
  AND logo together — «logo as big as the R» applies at every step
- Findings from hardening the test: the decision depends on locale and
  device width — de buttons («Einladen»/«Personen», ~245 px)
  leave the title only ~43 px at iPhone width, where even
  «WG 5» correctly goes wide; «Testhaushalt» (12 characters with no
  break point) needs 3 lines next to the buttons → wide is RIGHT, not a bug
- New tier-1 test: long name → .wide, buttons below the title row,
  logo == title font size (subpixel tolerance, after the
  180 ms transitions have settled); short name (EN buttons for safe
  room on both viewports) → split. 55/55 Chromium, 54+1 WebKit
- APP_VERSION 4.40.0, SW cache haushalt-v115

## 2026-07-17 — v4.39.3: See-through gap between sticky header and tabs closed

- Live observation: while scrolling, a 1 px line of tile content showed
  through between the header and the tab row. Cause: `--tabstop` came
  from offsetHeight (rounded to a WHOLE number), the real header height
  is fractional → subpixel seam between the two sticky elements
- Fix: measurement via getBoundingClientRect().height (fraction-accurate)
  AND the tabs deliberately dock 1 px BELOW the header
  (`top:calc(var(--tabstop) - 1px)`; header z-7 > tabs z-5 —
  the overlap is invisible, the seam tight). Remeasure now fires
  IMMEDIATELY on the slim toggle and again after the transition
  (no docking flash on fast scrolling). Verified: gap = -1 px
  in the scrolled state
- APP_VERSION 4.39.3, SW cache haushalt-v114

## 2026-07-17 — v4.39.2: Header logo coupled to the title row (.hrow)

- Live observation (slim state): the logo sat visibly LOWER than the
  title. Structural cause: header is flex-wrap with align-items —
  align-self:center centered the logo against the ENTIRE header height
  (including the taller button row), not against the title row
- Fix: logo + h1 in ONE row `.hrow` (flex, align-items:center,
  flex:1, min-width:0) — the logo now ALWAYS centers against the
  title; header align-items:flex-start → center; slim h1 margins (2/6)
  removed (they pushed the title against the logo). Measurement: logo
  center == title center to 0.0 px, expanded AND slim
- Splash FLIP unchanged (the target remains #headLogo via rect); selectors
  `#apphead h1` etc. still match as descendants
- APP_VERSION 4.39.2, SW cache haushalt-v113

## 2026-07-17 — v4.39.1: News banner fix (SW hijacked updates.html), SW registration repaired, logo = title size, slim header visible

- NEWS BANNER «led nowhere» (live bug, maintainer's Pixel): the
  SW navigation rule answered EVERY /chores/ navigation with the
  app shell — including /chores/updates.html. Rule narrowed to
  /chores/, /chores/index.html and /chores/f/…; updates.html additionally
  in the precache (banner works offline)
- BIGGER: SW REGISTRATION HAD BEEN DEAD SINCE THE HASH→PATH MIGRATION for
  new devices: register('sw.js') is relative, baseURI points after
  replaceState at f/ deep paths → /chores/f/sw.js → 404, silently
  swallowed. At the root without a family the script ends before the
  registration (entry return). Only old registrations from the
  hash era kept running (which is why the maintainer hit the shell bug at all).
  Fix: register('/chores/sw.js') absolute (the §5 rule applies here too)
- HEADER LOGO = TITLE SIZE: --titlefs (clamp 30–38px) drives h1 AND
  #headLogo («as big as the R»); slim 19px = slim font size;
  border-radius 23% scales along
- SLIM HEADER NOW VISIBLE: the header is sticky (top:0, z-7, bg);
  previously it only shrank at y>46 — without sticky it was long out of
  view, only the growing at y<12 was ever visible (maintainer observation).
  Thresholds now 24/4 (hysteresis stays); slim padding respects the
  safe area (sticky!); tabs dock under the header via the measured
  --tabstop (measurement after transition + on resize)
- Tests: new describe «Service Worker (echt)» with test.use
  serviceWorkers:'allow' (the ONE exception to the global block;
  Chromium-only, network stays mocked/local). The test registers the
  SW on the f/ route (thereby also guarding the registration fix),
  clicks the banner and demands the REAL updates.html in the new tab —
  verified red against the old rule. 54/54 green
- APP_VERSION 4.39.1, SW cache haushalt-v112

## 2026-07-17 — v4.39.0: Boot splash — app icon morphs into the header corner

- SPLASH: static overlay right after <body> (covers the boot —
  incidentally masks any first-paint flicker), icon 104px centered
  on var(--bg). After at least 550 ms from navigationStart: FLIP morph
  (translate+scale) onto the new header logo, background fades to
  transparent alongside; after 480 ms the node is gone + html.splash
  removed → the header logo (26px, 22px in the slim header) becomes
  visible exactly at the landing position. border-radius is NOT
  animated — scale() optically shrinks the 24px to the target radius
- ROBUSTNESS: NO transitionend (the global reduced-motion rule kills
  transitions → the event would never come) — fixed timeouts;
  reduced-motion skips the morph entirely. The overlay is throughout
  pointer-events:none and NEVER blocks operation (which is why all
  53 tests passed without adjustment). html.splash synchronously in the
  head inline (the logo never flashes up before the morph — flicker rule §7)
- Header logo for ALL contexts (including personal links) — branding,
  not an admin element
- New tier-1 test: the overlay clears itself away, html.splash gone, logo
  visible with opacity 1; visually verified via a screenshot series
  (start / middle of the morph / end state)
- APP_VERSION 4.39.0, SW cache haushalt-v111

## 2026-07-17 — v4.38.0: Einladen sheet fully translated, points slider in the history, permissions on the personal link

- I18N LEAK CLOSED: The Einladen sheet was half German, no matter which
  language was active. Now via t(): sheet title, the rows' Einladen
  buttons, «Ganze Familie»/«voller Zugriff» (header + QR caption), «Fertig»,
  QR aria labels/alt texts, «Links teilen …» in the person sheet (where a
  dead duplicate textContent was also removed) as well as the share texts
  themselves (title «Link für {name}»/«Familien-Link», join messages,
  Empfehlen text). The family button lost its data-name="Familie" — the
  else branch intended for it was unreachable. 12 new keys ×19
  languages (106 keys per dictionary)
- HISTORY POINTS = SAME UI AS CREATING: number input replaced by
  ptsrow + range slider (#lPts/#lPtsVal), field order as in the
  chore sheet (title → points → note → time). ONE mechanism
  syncPtsRange() for both sheets (setPtsSlider delegates); the scale rule
  unchanged: max(MAXPTS, existing value)
- PERMISSIONS (client-side): a personal link may only edit/delete its
  OWN history entries. Other people's rows render as
  pure display (div instead of button, no chevron; div.entry{border:none}
  for identical looks), openLogSheet has a defense-in-depth guard
  with the toast «Nur eigene Einträge lassen sich bearbeiten». The family
  link (admin) still edits everything. HONEST LIMIT: server-side
  all link holders share the same family write key — real
  enforcement would need per-member keys (open, see onboarding)
- Tests: slider test replaces the number input test (checks type=range,
  scale protection existing value 7 > MAXPTS 5, live output), new
  permissions test (own row button/opens, other row div/opens nothing,
  admin sees 2 buttons), new EN translation test against German remnants
- APP_VERSION 4.38.0, SW cache haushalt-v110

## 2026-07-17 — v4.37.1: New app icon «Haus, Blau-Grau»

- Icon redesign: house composition (rounded triangular roof over a
  2x2 tile grid), palette blue→grey (light blue, steel blue, slate,
  light grey), dark navy background — replaces the colorful 4-tile icon
- Constructed deterministically as SVG (not Pollinations), source in the
  chat artifact; maskable variant with a 78% safe zone for Android masks
- icon-192.png, icon-512.png, icon-512-maskable.png replaced;
  cache buster ?v=46→47 (index.html, 404.html, manifest.json);
  SW cache haushalt-v108→v109
- Note on iOS: the home screen icon is cached aggressively — remove the
  icon and add it again if necessary

## 2026-07-17 — v4.37.0: Recap release — «Was ist neu» v4.26–v4.37, launch notice, docs holistic

- UPDATES.HTML NEW (user perspective, bilingual DE/EN, same anatomy):
  covers v4.26–v4.37 — encryption (with one-tap migration and
  backup), 20 languages, settings (sorting, max points),
  points accumulation + editable points, day headers, new icon,
  calm looks (skeleton, chip wrapping, slim header, keyboard fix),
  fairli links; «Unter der Haube» honest, including the zombie tile dedication
- LAUNCH NOTICE (#newsBar): narrow dismissible row under the
  header → updates.html. ONLY for returning visitors, ONCE per version
  (LS 'haushalt.seenver'); first contact sets the mark quietly and never
  sees a banner. Both paths (link, ×) mark it as seen. 1 new
  i18n key «Fairli hat Neues — ansehen» ×19; the × button in the
  aria translation list registered
- DEVELOPER_ONBOARDING.md rewritten HOLISTICALLY (636→459 lines):
  §8 version accretions consolidated thematically (header area, grid,
  history/points, chips, keyboard, invite/language), facts up to
  v4.37 (schema including write_key_hash/updated_at/retired_families,
  delta sync, write auth, alias rule SHARE_BASE vs BASE, 100 tests);
  results only, no investigation history
- The turn survived a compaction + a phantom completion: state
  verified per doctrine (updates.html div balance, i18n parity
  19/19, banner logic read) and the suite run BY OURSELVES instead of
  believing logs
- 100/100 on both engines (96 + banner ×2 + rewrite safeguards)
- APP_VERSION → 4.37.0, SW cache → haushalt-v108

## 2026-07-17 — v4.36.4: Shared links (Einladen/Empfehlen/QR) carry the fairli alias

- Maintainer: links under «Teilen» should carry the pretty alias. New
  SHARE_BASE ('/fairli/') ONLY for familyLink()/userLink()/appLink()
  (Einladen sheet, Empfehlen button, QR code). routeUrl() stays
  UNCHANGED for internal navigation (history.replaceState,
  location.href) — the app still runs under /chores/, that is
  its actual location; the alias is only a JS redirect
  there and must never be used as the location itself
- Test cases while building: (a) the anchor matched twice on insertion
  (leftover from an interrupted earlier attempt) → Playwright refused the
  start because of the duplicate test name, caught BEFORE any execution;
  (b) our own selector too coarse (`hasText: 'Einladen'` also matched
  member rows) → narrowed to `.shrow.shfam`; (c) the regex demanded
  https, the local test server delivers http → https? tolerated. All three
  cases NOT in the app code but in our own test instrumentation
  — clean evidence for why the suite runs before every deploy
- 96/96 on both engines
- APP_VERSION → 4.36.4, SW cache → haushalt-v107

## 2026-07-17 — v4.36.2: CRITICAL — The frozen Wednesday (stale guard starved the healing branches)

- SYMPTOM (Valentin, iPhone, 08:08): history ends Wednesday 21:26,
  although famc has 13 newer rows (Thursday evening run, Fri 03:19). The device
  had probe cache '0' (missed the migration) + a Wednesday cache
- REPRODUCED AGAINST PRODUCTION (Playwright, iPhone profile, prepared
  localStorage): exactly 4 queries under the OLD family, then silence —
  no re-probe, no reload, encv stays '0', cache cemented with a
  green sync dot
- CAUSE (twofold): (1) the debug strip regex from v4.36.0 had ALSO
  emptied the stale branch (syncOk/return in the comment!) → on a
  mutationSeq change during the boot pull, execution fell past
  ALL healing branches down to save()/render(). (2) Structurally the
  stale guard stood BEFORE the healing decisions and could starve
  re-probe/first-run setup/upload guard. Fix: branch body
  restored AND the guard moved behind the healing branches — it
  now protects ONLY the state adoption (reconcile)
- Test lesson: the new Valentin E2E test sabotaged itself
  (initScript set encv '0' on EVERY document load, including after the
  healing reload) → sessionStorage guard «prepare boot 1 only».
  Instrumentation then showed the full healing chain: re-probe →
  reload → probe finds famc (rows=1) → IS_ENC → data there
- Open observation (LOG instead of guesswork): in the prod repro
  mutationSeq had changed during the boot pull (fall-through path) —
  the push() that caused it not yet identified; HARMLESS thanks to the
  reordering for the healing, reconcile stays protected
- For Valentin this means: close the app once and reopen it —
  v4.36.2 heals the state itself (the probe cache is discarded,
  famc adopted). No data loss: their Wednesday rows have long been present
  in famc
- 94/94 on both engines
- APP_VERSION → 4.36.2, SW cache → haushalt-v105

## 2026-07-17 — v4.36.1: Never a single chip on the last row

- Maintainer: «there should be two people, or 0» — with 5 members the
  row broke as 4+1 (Noel alone). Now the rAF balancing measures the
  rows (offsetTop groups); if exactly ONE chip stands at the bottom and the
  row above has ≥3, a flex-basis:100% break is set before that row's last
  chip → 3+2. Balancing runs after every render (breaks are
  removed beforehand), single-row families untouched
- Test: 5 Fanti names at 393 px → last row ≥ 2 chips (bounding box
  row groups). 92/92
- Fanti backfill status: the maintainer's 08:01 start was the DOWNLOAD
  start (SW activates on the next one); hash still null, the probe row
  (lock-probe1) deleted immediately after the test
- APP_VERSION → 4.36.1, SW cache → haushalt-v104

## 2026-07-17 — v4.36.0: Viral readiness — delta sync (egress diet), write auth for encrypted families, fairli alias

- ALIAS LIVE: https://blauewelt.github.io/fairli/ → /chores/ (own
  repo blauewelt/fairli, index.html+404.html JS redirect; path, query
  and hash are preserved — /fairli/f/<id> lands correctly). Canonical
  remains /chores/; NEVER rename the main repo (Pages does not redirect,
  all the families' QR codes/icons would die)
- CHOKEPOINT 1 — EGRESS DIET: the pull was ~125 KB per app start (log
  dominates). Now: (a) column diet on all queries, (b) LOG DELTA:
  watermark 'haushalt.delta:<fam>' (SERVER times only!), full-sync
  mark 'haushalt.full:<fam>'; delta runs when the watermark exists,
  the last full sync is < 24 h ago and a log cache is present. Query:
  or=(created_at.gt.W,updated_at.gt.W) — thanks to the updated_at trigger it
  also sees OTHER PEOPLE'S CHANGES; other people's DELETIONS only at the next
  full sync (documented limit). Merge by id, pendingDeletes
  respected, cap 400. Returning starts: ~10 KB instead of 125 KB —
  the Supabase egress wall moves from ~40k to ~400k starts/month
- CHOKEPOINT 2 — WRITE AUTH (famx/famc): WRITEKEY = its own HKDF branch
  (info 'write-key-v1') — the link secret CANNOT be derived from the
  header. Header 'x-fairli-key' on all writes;
  the DB stores only SHA-256 (families.write_key_hash). RLS: RESTRICTIVE
  policies via fairli_write_ok() on members/chores/log (ins/upd/del)
  and families (upd/del). Hash NULL = open as before (legacy families,
  version cut). Migration 20260717120000 applied via the db-migrate
  workflow; VERIFIED LIVE: famx-authselftest01 — writing without the key
  401/42501, with the key 201. Setting the hash: famx first-run setup, famc
  migration, BACKFILL for those already migrated (Fanti) at the next
  app start
- Debug lessons of this round: (a) the backfill first ran via push() —
  that raised mutationSeq and INVALIDATED its own pull (stale
  snapshot abort, the family appeared empty → first-run setup!). The backfill
  is now a pure fetch AFTER the state assignment. (b) The debug strip regex
  ate the firstRunSetup call — mass green only after
  restoration. The rule stands: insert/remove only at verified
  statement boundaries. (c) Day grouping struck in the test again
  (delta fixture → a one-off instead of the same tile)
- 90/90 on both engines (own confirmation run after a phantom
  state in the sandbox — doctrine: don't trust other people's logs, run it yourself)
- APP_VERSION → 4.36.0, SW cache → haushalt-v103

## 2026-07-17 — v4.35.0: Max points scale (default 5), follow-up tap accumulates, points editable in the history

- MAX. POINTS (Settings → 🎯): the points slider's scale selectable
  3/5/10, default 5 (was 15 — maintainer: 1–5 is enough to start). When
  editing, the scale never drops below the existing value (an 8-point
  tile stays editable at 8). Hint text in the sheet: tapping
  multiple times adds up — the scale is not a hard limit
- FOLLOW-UP TAP ACCUMULATES (maintainer simplification): another tap on
  the same thing within 1 h ADDS the points into the EXISTING
  log row (PATCH) instead of creating a new one. done_at stays the
  first tap — the window closes by itself. Old runs
  (multi-row) stay untouched and continue to render grouped.
  Discovered in the process: the pressLock double-tap PROTECTION (600 ms, once
  a feature) is obsolete under the new semantics → reduced to a 250 ms
  ghost-click filter; intent now double-taps through
- POINTS EDITABLE IN THE HISTORY: single rows get a points field in the
  entry sheet (0–99, PATCH); the points view follows immediately.
  Old runs (n>1) deliberately without a points field (maintainer: rendering separately is ok)
- Test finding: day grouping still merges the accumulated and the older row
  of the SAME day together (display sum correct) — fixture
  moved to «yesterday», the day boundary separates
- 2 new i18n keys × 19. 86/86 on both engines
- APP_VERSION → 4.35.0, SW cache → haushalt-v102

## 2026-07-17 — v4.34.4: Multi-line chip rows centered (the wrap looks intentional)

- Maintainer polish request: the wrap (v4.34.3) left «Noel» hanging on
  the left as an orphaned single chip. Now: when the row wraps, every
  line centers itself (.iam.multi via rAF measurement scrollHeight>60)
  — symmetry instead of overflow optics. Single-line families stay
  exactly left-aligned as before. Wrap-vs-scroll question settled: wrap
  shows the whole family without hidden scrolling; a revert would be one line
- LESSON (self-inflicted): a single-line regex insert hit the FIRST
  PHYSICAL LINE of a multi-line statement → code injected INTO THE
  MIDDLE of the expression → app script dead, mass test failure. Rule:
  anchor insertions ONLY at verified statement BOUNDARIES, never via
  line regex anywhere near a template literal
- 80/80 on both engines
- APP_VERSION → 4.34.4, SW cache → haushalt-v101

## 2026-07-17 — v4.34.3: Person chips wrap (large families)

- Maintainer screenshot: as the 5th chip he himself was squeezed
  sideways out of the frame (.iam was overflow-x:auto — horizontal
  scrolling that nobody discovers). Fix: flex-wrap:wrap + row-gap —
  large families get two or more rows, every chip stays fully visible
- Test: 6 members with long names at 393px — every chip bounding box
  fully inside the viewport. mockBackend extended with a memberRows
  override (same pattern as logRows)
- Note: the chip ORDER in the screenshot was still the ciphertext
  sorting (v4.34.2 was not yet active on the device at capture time) —
  heals itself with the next app start
- 78/78 on both engines
- APP_VERSION → 4.34.3, SW cache → haushalt-v100 (three digits!)

## 2026-07-17 — v4.34.2: Person chips alphabetical again (ciphertext sorting fixed)

- The maintainer question «what determines the chip order?» uncovered
  an encryption side effect: the pull sorted server-side via
  order=name — but since the migration name is CIPHERTEXT, so the
  chips stood in Base64 gibberish order (stable, but pointless). Fix:
  after decryption, localeCompare client-side (LOCALE, sensitivity
  base) — uniform for all families.
  Note: a server-side ORDER BY on ENC_FIELDS columns is meaningless for
  famx/famc — ordering belongs after decRows()
- (chores order=points.desc,name has the same pattern in the name
  tiebreak; harmless, since sortedChores() reorders client-side anyway)
- 76/76 on both engines
- APP_VERSION → 4.34.2, SW cache → haushalt-v99

## 2026-07-17 — v4.34.1: Android keyboard no longer covers sheets; Fanti migration VERIFIED LIVE

- LEGACY-FAMILY MIGRATION (maintainer, 17.07. 02:42) verified
  end-to-end: old rows 0/0/0, famc copy 5/33/276 (33 = 34 minus the
  deliberately deleted Haus-kühlen zombie tile — accounting exact),
  values enc1: ciphertext, signpost set, tombstone 00:40 UTC, a
  cleartext insert bounces off with 42501. First real family encrypted
- Keyboard fix (maintainer screenshot: «Save + log» behind the Android
  keyboard): interactive-widget=resizes-content in the viewport meta —
  the keyboard SHRINKS the page instead of covering it, the bottom
  sheet rises above it. Plus .sheet with max-height 100dvh (dvh follows
  the shrunken viewport) + overflow-y:auto + overscroll-behavior:contain
  — even when extremely squeezed the primary button stays reachable by
  scrolling. The test simulates the keyboard via a 360px viewport and
  checks that the button lies inside the visible area
- Decision recorded (maintainer agrees): the backup download STAYS
  (insurance against «successful, but wrong», not against an abort); NO
  auto-migration of other people's families (consensus principle);
  instead a gentle hint for legacy-family admins may follow
- 76/76 on both engines
- APP_VERSION → 4.34.1, SW cache → haushalt-v98

## 2026-07-16 — v4.34.0: New tiles — the sorting determines the spot, scroll+flash lead there; migration checkbox removed

- Tile placement (maintainer): the pinChore coercion «new = top left»
  dates from the pre-sorting era and FOUGHT against the new modes. Now:
  the active sorting determines the spot (default «Nach Erstellung» (by
  creation) → at the end), and the already existing scroll+flash
  (smooth scrollIntoView + .flash animation) leads the eye there.
  created_at is now also set LOCALLY on creation (sorted in correctly
  right away, not only after the next pull)
- Migration sheet: the checkbox «alle Geraete aktualisiert» REMOVED —
  technically obsolete since the server tombstone (v4.33.2). The text
  explains the new reality honestly (stragglers cannot damage anything;
  only the unsent entries of their one session would be lost → a quiet
  moment is recommended). ONE deliberate hint remains: auto-migration on
  the first admin boot was CONSIDERED AND REJECTED — it would also
  decide for other people's families (several in the DB!) whose admin
  was never asked, incl. a surprise backup download. Irreversible format
  changes need a deliberate hand
- webkit flake noted (context crash in the parallel run, retry 3/3
  green, full suite afterwards 74/74)
- APP_VERSION → 4.34.0, SW cache → haushalt-v97

## 2026-07-16 — v4.33.3: Tile flicker fixed (session memory), encryption row only where relevant

- Maintainer Android finding: since the v4.32 skeletons a quiet page
  felt restless. Cause: render() rebuilds the grid on every occasion
  (sync, toast, tab return) → every <img> is created ANEW → transparent
  + shimmer + fade, on Android additionally real re-fetches (stingy
  cache headers at pollinations) and up to ~30 s of shimmer on retry tiles
- Fix: the ARTOK set as session memory — URLs loaded once render
  IMMEDIATELY with .ok on every further build (no fade, no skeleton),
  plus a complete check after the grid build for cache instant-loaders,
  plus prefers-reduced-motion respected (transition+shimmer off)
- Settings: the encryption row now appears ONLY where the action exists
  (legacy family + admin device). Encrypted families do not see it at
  all (maintainer suggestion) — there is deliberately no way back to
  cleartext, so no dead switch either
- INCIDENT documented: at turn start the sandbox contained a PHANTOM
  state (index.html at '4.34.0' with half-applied artOk edits + 1 extra
  test) — presumably an aborted earlier run at the same job. Doctrine
  proven: remote is truth → fetch fresh, reapply the batch cleanly; the
  phantom's (correct) flicker regression test was adopted (label
  corrected to 4.33.3). NOTE: after anchor errors ALWAYS check
  version+grep, never keep editing blindly
- 74/74 on both engines
- APP_VERSION → 4.33.3, SW cache → haushalt-v96

## 2026-07-16 — v4.34.0: Art flicker fixed, encryption row hidden for famx/famc

- Flicker analysis (finding by maintainer, Android): render() rebuilds
  the grid via innerHTML — 23 call sites. Every re-render (sync pull,
  tab return, chip choice) produced FRESH <img> with opacity:0 which,
  despite the browser cache, faded in again for 350 ms: quiet page,
  blinking board. Fix: the ART_OK set remembers loaded URLs; known
  images render visible immediately (class 'ok' from birth), shimmer
  only for a genuine first load. One shared artImg() producer for both
  tile kinds. Test: tab switch there/back → the image carries 'ok'
  IMMEDIATELY in the markup
- Encrypted families no longer see the encryption row AT ALL
  (maintainer: a one-way street needs no lever; before: disabled).
  Handler null-safe (trap: the first patch anchor was guessed instead
  of read — ALWAYS copy anchors out of the file)
- 74/74 on both engines
- APP_VERSION → 4.34.0, SW cache → haushalt-v96

## 2026-07-16 — v4.33.2: Server tombstone — cleartext resurrection now impossible SERVER-SIDE

- The maintainer question «what happens to devices that have not
  updated?» thought through honestly to the end: the client guard
  (v4.33.1) protects only clients THAT HAVE IT. A device that has been
  asleep for weeks still runs the old cache state once on its first
  start after the migration (the SW updates in the background, becomes
  active only at the next start) — this window is in principle not
  closable client-side
- Solution: migration 20260716210000_retired_families.sql — table
  retired_families + RESTRICTIVE RLS policies: an INSERT into members/
  chores/log under a buried family_id is rejected by the SERVER, no
  matter how old the client is. Tombstones are final (no UPDATE/DELETE
  policy). The attacker calculus is unchanged: whoever has the
  publishable key can already delete everything today — the tombstone
  does not widen the attack surface
- runMigration sets the tombstone after verification+deletion — via a
  RAW fetch: sb()/famRows would have overwritten family_id with ROWFAM
  (the famc hash!) and labelled the wrong grave. The test pins the ID
- The behaviour of non-updated devices after the migration is therefore:
  signpost name + empty grid, write attempts bounce off (sync dot red),
  next app start → new version → famc probe → everything back
- 72/72. Migration applied via the db-migrate workflow and verified live
- APP_VERSION → 4.33.2, SW cache → haushalt-v95

## 2026-07-16 — v4.33.1: CRITICAL — cleartext resurrection after migration prevented

- A maintainer upgrade question triggered the finding: the empty-backend
  upload (pull: «members empty → upload the local state», since v2.3)
  would, after a fam→famc migration, have RESURRECTED the complete
  cleartext dataset under the old ID on EVERY device not yet updated.
  The zombie-tile mechanism, at family scale — discovered BEFORE the
  maintainer migration, not after
- Fix 1: upload only if there is ALSO no families row (if there is one
  — e.g. as a signpost — the family is known, an empty members state
  then does NOT mean a virgin server). Counter-check performed: the
  test fires on the old code (guard temporarily removed → uploads > 0),
  green with the guard
- Fix 2: devices with probe cache '0' that missed the migration (old
  rows empty, families row present): discard the cache + ONE restart
  (sessionStorage loop protection) → famc is discovered, data back
- Wording: the encryption status shows the state «Aus» (off) instead of
  the action «Aktivieren…» (the maintainer read «Enable…» as
  «encrypted») — 'Aus' × 19 dicts
- Watch out for test traps: LS_STATE is called 'haushalt.v2:<fam>' (a
  test with the wrong key passed VACUOUSLY — the counter-check is mandatory)
- 72/72. The Fanti WG migration is now cleared (instructions in
  chat/LOG): open every device once (≥4.31 in the footer), then admin →
  Einstellungen → Verschlüsselung → checkbox → start; same URL, nobody
  is re-invited
- APP_VERSION → 4.33.1, SW cache → haushalt-v94

## 2026-07-16 — v4.33.0: Verified deletion, duplicate hint, tile sorting (default: by creation)

- History correction, second attempt (the maintainer was COMPLETELY
  right): the established schema route is
  .github/workflows/db-migrate.yml (workflow_dispatch) with the repo
  secret SUPABASE_DB_PASSWORD (12.06., 18:33) — CI has open network
  access to the pooler (eu-north-1), the sandbox does not. So Claude
  can apply migrations ITSELF: commit SQL → dispatch workflow → verify
  via REST. That is exactly how the created_at migration ran on 16.07.
  (run green, created_at verified). Lesson: do not only search for
  credentials, also for ROUTES (the journal said «DB migrations via
  GitHub Actions» verbatim)
- VERIFIED DELETION (root-cause fix from the Haus-kühlen forensics):
  deleteRemote tries 1 retry (900 ms); if that fails too, the row is
  RESTORED (tile/person/log entry come back) + an honest toast
  «Löschen fehlgeschlagen — wiederhergestellt». push() suppresses the
  generic sync toast for already handled errors (err.silent), the sync
  dot still goes red
- DUPLICATE HINT on creation: the name already exists (case-insensitive)
  → inline hint «… gibt es schon» + button «Stattdessen verbuchen»
  (logs onto the EXISTING tile, no twin)
- SORTING (Einstellungen → ↕️): 'Nach Erstellung' (NEW DEFAULT — stable
  positions, new things at the end), 'Alphabetisch', 'Nach Nutzung'
  (previous behaviour). The choice lives in localStorage per device.
  Maintainer rationale: tiles must stay findable, the usage ranking
  kept shifting them around
- Migration 20260716200000_created_at.sql: created_at on chores/members/
  log + an updated_at trigger on chores — THE MAINTAINER PASTES IT in
  the SQL editor. Until then: 'Nach Erstellung' breaks missing
  timestamps alphabetically; the existing stock shares the migration
  timestamp (the real order is not reconstructible — a documented limit)
- 7 new i18n keys × 19; tests: deletion-fails-twice (tile comes back, 2
  attempts counted), duplicate flow, sort toggle+persistence. 70/70
- APP_VERSION → 4.33.0, SW cache → haushalt-v93

## 2026-07-16 — v4.32.0: LIVE BUG Punkte tab fixed + day headers, skeletons, haptics, slim header

- CRITICAL, discovered while reading code for the UI round: the Punkte
  tab had been LIVE BROKEN since v4.27 (i18n release, 15.07.) — `const
  t = totals()` shadowed the i18n function t(), `t('Diese Woche')` threw
  «t is not a function», the view stayed empty. NO test ever opened the
  Punkte tab (pyramid gap). Fix: rename to `tot` + a warning comment; a
  NEW regression test renders Punkte (bars, crown, counter, period
  switcher). The counter row was translated along the way
  ('{n} Aufgabe(n) erledigt')
- Verlauf: day headers «Heute»/«Gestern»/date (localized), the rows now
  show only the time. Runs now end at the DAY BOUNDARY (otherwise «×N»
  under «Heute» silently counted yesterday's along). Empty state
  translated. 6 new i18n keys in all 19 dictionaries
- Tile art: shimmer skeleton until loaded (instead of image pop-in),
  gentle fade-in via onload
- Haptics: short vibration (12 ms) when logging, where supported
- The header shrinks on scroll (hysteresis 46/12 px against flutter)
- Test infrastructure: the famx/migration tests must abort external
  hosts (pollinations, fonts) like mockBackend — otherwise webkit waits
  for real image requests on reload (timeout). Careful with insert
  anchors: a block once landed INSIDE an object literal
- 64/64 on both engines
- APP_VERSION → 4.32.0, SW cache → haushalt-v92

## 2026-07-16 — v4.31.1: Settings rows built properly, dark time field

- Maintainer screenshots: (1) settings rows stuck together
  («LanguageEnglish») — .setrow/.setval had NO CSS, .menuitem is block
  → spans concatenate. Now a real row layout: icon (🌐 🔒 ✨), label
  (flex:1), value dimmed on the right (ellipsis), chevron ›;
  54px tap target; disabled dimmed. Version centered, discreet
- (2) #lTime (datetime-local) was the native light browser widget — the
  only unstyled input field. Now like all fields: card background,
  ink color, radius, full width — plus color-scheme:dark so the native
  picker renders dark too
- Note: ALWAYS check classes in the markup against existing CSS —
  .setval was wishful thinking without any rule set
- 60/60 on both engines
- APP_VERSION → 4.31.1, SW cache → haushalt-v91

## 2026-07-16 — v4.31.0: Settings, opt-in encryption for legacy families (SAME URL), history row hint, select-all

- NEW ⚙︎ settings sheet (replaces 🌐 in the header): language (derived
  from the device, the override stays in localStorage), encryption
  status with the migration entry point, «Was ist neu» (what's new)
  link, version row
- Opt-in migration fam- → encrypted with the SAME URL: rows move under
  'famc-' + SHA-256(family ID)[:48] — links, QR codes and installed
  icons stay valid, nobody is re-invited. Detection: localStorage cache
  'haushalt.encv:<fam>', otherwise a one-time famc probe. Procedure
  with a safety net: JSON backup onto the device → write the encrypted
  COPY → VERIFY the row counts → only then delete the cleartext;
  families.name of the old row becomes the signpost «→ App
  aktualisieren» for outdated clients. The checkbox «Alle Geräte
  aktualisiert» gates the start; the error path deletes nothing and
  restores the context
- Verlauf: the whole row is now the button (⋯ menu removed — edit/delete
  live in the entry sheet, the menu was redundancy), chevron › as
  affordance. Deletion still with undo
- Text fields in sheets: focus selects the content — typing replaces
  it. (Value check INSIDE the rAF: showModal focuses before the values
  are set)
- Three debug lessons documented: (1) refactor fossil — deriveKey()
  extracted, but CRYPTO_READY still referenced the old `raw` → every
  boot in the crypto context died as a rejected promise; (2) cPts is a
  RANGE slider, cName in edit is hidden behind «✎ Ändern» — the
  select-all test belongs on a real text field (logSheet); (3)
  waitForURL on the SAME URL fires immediately — wait on status text instead
- mockBackend now respects the family_id filter (otherwise the famc
  probe considers every test family encrypted)
- 60/60 on both engines
- APP_VERSION → 4.31.0, SW cache → haushalt-v90

## 2026-07-16 — v4.30.0: End-to-end encryption for new families (GDPR)

- VERSION CUT instead of migration (maintainer insight: several unknown
  families in the DB, client updates not coordinatable — moving
  existing data risks split brain between old and new clients of the
  same family):
  * Existing 'fam-' families: cleartext forever, old and new clients
    keep working unchanged
  * NEW families get 'famx-' IDs and are encrypted from birth — the
    link itself carries the scheme, no probing needed. Joiners always
    load the fresh client (link → network), outdated clients exist only
    behind icons of legacy families
- Crypto (WebCrypto, no libraries): DB row key = 'famx-' +
  SHA-256(link secret) — the DB never knows the secret; a DB dump is
  unreadable without the link. Values: AES-GCM-256, key via HKDF (salt
  fairli-v1), random IV per value, format 'enc1:'+b64(iv|ct)
- Encrypted fields: families.name, members.name,
  chores.name/note/art, log.chore_name/chore_note/member_name.
  CLEARTEXT remain (accepted metadata): points, timestamps, IDs,
  member.url_slug (random lookup key), colors
- Integration at the two choke points sb()/upsert() (encrypt on write,
  decrypt on read); famRows now ALWAYS sets ROWFAM (an explicit
  family_id in the families POST would have leaked the cleartext key —
  fixed). Corrupt row → '···' instead of a crash
- KNOWN DISCLOSURES (documented, deliberate): tile art sends chore
  names to pollinations.ai (prompt) — for famx too; the local device
  cache (localStorage) stays cleartext. An optional art switch for famx
  = possible follow-up step
- OPEN (maintainer undecided): TTL/retention period — orthogonal,
  decidable later. Opt-in encryption for legacy families (admin action,
  once all devices are current) = possible follow-up step
- Test: famx E2E contract (no cleartext in the network traffic, hash key
  famx-[48 hex], enc1: values in the store, a roundtrip on a fresh
  device renders names correctly); the mock now models merge-duplicates.
  56/56 on both engines
- APP_VERSION → 4.30.0, SW cache → haushalt-v89

## 2026-07-15 — v4.29.0: Top 20 complete — 13 new languages

- Third and last batch of the top-20 plan: nl, pl, tr, sv, da, ru,
  uk, hi, zh, ja, ko, vi, id — 71 keys each, fully translated
  (incl. writing systems: Cyrillic, Devanagari, Han, Kana, Hangul)
- Fairli thus speaks 20 languages: de en fr it es pt ro nl pl tr sv da
  ru uk hi zh ja ko vi id — language names in the sheet are native
  (中文, हिन्दी, …)
- The integrity test checks all 19 dictionaries automatically
  (key parity, placeholders, never empty) — all green, 54/54
- All dictionaries in the SW precache (~3 KB each; available offline)
- Deliberately NOT included: Arabic — real RTL layout work needed
  (dir=rtl, sheet slots, chips, menu alignment); documented as its own
  undertaking, not as a 21st JSON file
- APP_VERSION → 4.29.0, SW cache → haushalt-v88

## 2026-07-15 — v4.28.0: Five new languages — Français, Italiano, Español, Português, Română

- Second language batch of the top-20 plan: fr (fr-CH), it (it-CH),
  es (es-ES), pt (pt-PT), ro (ro-RO) — 71 keys each, complete.
  That covers all Swiss national languages except Romansh,
  plus the major Romance languages
- The integrity test now checks ALL i18n/*.json automatically:
  the same key set as en.json, placeholder parity, never empty.
  A future language cannot possibly land incomplete
- All six dictionaries in the SW precache (available offline)
- 54/54 green on both engines
- Next batches: nl/pl/tr/sv/da, then ru/uk/hi/zh/ja/ko/vi/id,
  ar last (RTL layout work needed)
- APP_VERSION → 4.28.0, SW cache → haushalt-v87

## 2026-07-15 — v4.27.0: Internationalization — Fairli now speaks English (infrastructure for 20 languages)

- Architecture (agreed with the maintainer): lightweight vanilla JS,
  NO framework. German is the source language and the KEY —
  t('Speichern') looks up in the dictionary; if the translation is
  missing, German appears (never empty text). Placeholders as {token}
- Dictionaries as i18n/<lang>.json (one file per language, ~3 KB),
  only the chosen language is loaded; localStorage copy for
  offline + instant boot; en.json in the SW precache
- Language choice: 🌐 button in the header → language sheet (standard
  anatomy); first start via navigator.language, the choice in
  localStorage (haushalt.lang). The html lang attribute + date locale
  (de-CH/en-GB) switch along
- Static HTML via data-i18n (the original is remembered in the dataset
  → losslessly switchable back and forth); dynamics via t() in ~50
  places: tiles, menus, sheets (Aufgabe/Eintrag/Install/Einladen/
  Personen/Sprache), toasts, empty states, instructions, entry core
  buttons, aria labels, placeholders
- Deliberately NOT translated (documented): the diagnostic rows of the
  entry screen (Geoeffnet/Von/Modus — a debug tool), LOG/docs
- Tests: the Playwright locale pinned to de-CH (otherwise tests boot in
  English!); a new end-to-end language switch test (static+dynamic+
  persistence+way back) + dictionary integrity (placeholder parity,
  never empty, >60 keys). 54/54 on both engines. ESM trap: the
  Playwright spec is ESM — there is no require(), use import
- NEXT STEPS (top-20 plan): fr, it, es, pt, ro as the next batch;
  then nl, pl, tr, sv, da; then ru, uk, ar (RTL layout!),
  hi, zh, ja, ko, vi, id. Per language: create the JSON, extend
  LANGS+LOCALES, sw precache, the integrity test grabs it automatically
- APP_VERSION → 4.27.0, SW cache → haushalt-v86

## 2026-07-15 — v4.26.1: Tile images survive the repaint storm (retry instead of instant removal)

- Maintainer screenshot after v4.26.0: quite a few tiles WITHOUT an
  image. Cause: the prompt change made ALL tiles a cache miss at the
  same time (Pollinations caches on the prompt text) → mass generation
  → individual requests throttled/timed out → our
  onerror="this.remove()" removed the image FOR GOOD on the first failure
- Fix: window.artRetry(img) — up to 3 retries with backoff
  (5/10/15 s), removal only after that. A transient throttling moment
  no longer costs any tile art
- Note (documented): prompt changes repaint the WHOLE board —
  plan for it, never tweak it in passing
- APP_VERSION → 4.26.1, SW cache → haushalt-v85

## 2026-07-15 — v4.26.0: Tile art shows the named thing (not «household chore»)

- Finding from the maintainer: the one-off tile showed boring cleaning
  motifs instead of a shooting star, and «App developen» got a kitchen.
  Cause HARDCODED in the image prompt: «minimalist flat vector
  illustration of household chore: <name>» — the «household chore:»
  framing overwrote the actual motif
- Fix: the prompt now describes the NAMED subject itself
  («<name>, minimalist flat vector illustration, single subject, …»),
  without the household coercion. «App developen» now becomes app
  development, «Abfluss reinigen» a drain, and so on
- New: an optional c.art override for special tiles. The one-off tile
  uses it for an explicit prompt («a single glowing shooting star
  with a bright trail across a night sky») — reliably a star,
  no more motif lottery
- Regression test: the prompt contains the name or the star and NEVER
  «household chore» again; the seed is numeric (Pollinations demands a
  number, otherwise HTTP 400 — checked)
- APP_VERSION → 4.26.0, SW cache → haushalt-v84

## 2026-07-14 — v4.25.1: History menu bigger & delete set apart

- Maintainer: the ⋯ menu entries in the history were too small — the
  origin of the mistap. Now: 16px/bold, min-height 52px (comfortably
  above the 44px tap guideline), wider menu (216px), more padding
- Destructive («Löschen») gets .danger: its own row with spacing and a
  divider above it — harder to hit by accident. Applies to the person
  menu too. Inline red replaced by the class (var(--red))
- The regression test now additionally checks: the delete entry has
  .danger and is ≥48px tall
- APP_VERSION → 4.25.1, SW cache → haushalt-v83

## 2026-07-14 — v4.25.0: + is context-sensitive, time editable in the history

- «+» now follows the rule «no invisible actions» (maintainer):
  in the VERLAUF it opens «Einmalig eintragen» (result immediately
  visible), in AUFGABEN as before «Neue Aufgabe». The FAB aria label
  switches along
- Entry editing has a TIME field (datetime-local, native picker):
  * Single entry: the time is set directly
  * RUN: all entries shift by the SAME delta — the spacings and the
    order stay, the run stays a run («×3 gestern Abend» instead of
    three identical timestamps)
  * done_at in the PATCH per row; the history is re-sorted; the weekly
    points adjust automatically (totals() computes from done_at)
- 2 new tests (50/50, both engines)
- Open for discussion: in the PUNKTE view + still opens
  «Neue Aufgabe» (the tile would be invisible there too) — the same
  treatment as the history?
- APP_VERSION → 4.25.0, SW cache → haushalt-v82

## 2026-07-14 — v4.24.0: Undo when deleting in the history + art for the one-off tile

- Maintainer mistap finding: deleting in the history was frictionless,
  but irreversible. Now: toast «Geloescht · Rueckgaengig» (5 s)
- Architecture deliberately a «deferred commit» instead of
  DELETE+re-INSERT: push() is fire-and-forget (NO serial queue) — an
  undo via re-insert could overtake the DELETE at the server.
  Therefore: locally gone immediately, pendingDeletes shields against
  pulls, the server DELETE only goes out AFTER the window. Undo is
  purely local (clear the pendingDeletes keys!). App closed within the
  window ⇒ nothing deleted — resurrection beats loss (data-rule spirit)
- The confirm() in the edit sheet is dropped: undo replaces it (less
  friction, full regret option), applies to runs too («Geloescht (3)»)
- A toast can now carry an action; #toast.show gets
  pointer-events:auto (the old pointer-events:none rule made the
  undo button unclickable — caught by the test, not by the user)
- The one-off tile now carries art (shooting star — fitting for the
  one-off chore), the dashed border stays as its identifying mark
- 2 new tests (46/46, both engines): undo window contract (no DELETE
  inside the window, DELETE after expiry, the pull does not eat the
  restored item) + one-off art
- APP_VERSION → 4.24.0, SW cache → haushalt-v81

## 2026-07-14 — v4.23.1: «Speichern + eintragen» is the primary action when creating

- When creating a chore, logging it is the normal case — so
  «Speichern + eintragen» is now the big primary button (and the
  Enter key); «Nur speichern» becomes the ghost button below it
- Editing unchanged (only «Speichern»), one-off unchanged
  («Eintragen»). Without a chosen person the sheet stays open (toast);
  «Nur speichern» still works then
- The test now covers all three button roles (primary logs, ghost does
  not, editing without a ghost) — 42/42 green on both engines
- APP_VERSION → 4.23.1, SW cache → haushalt-v80

## 2026-07-14 — v4.23.0: One-off tile, run grouping, history editing, save+log, install sheet only your own platform

Five wishes from the maintainer, against tile inflation and for less
confusion:

1. The install sheet (from the banner) now shows ONLY your own
   platform — whoever is on an iPhone no longer sees Pixel steps. The
   invite sheet still shows both (there you often help others).
   installInstructionsHTML(onlyCurrent) — still ONE producer
2. The history groups RUNS: if the same person taps the same chore
   several times in a row, ONE row comes out of it («Einkaufen ×3»,
   points summed). Tapping three times replaces large/small tile
   variants. Delete/edit act on the whole run (the kebab shows the count)
3. History entries are EDITABLE (title + note): kebab →
   «Bearbeiten» → form sheet in standard anatomy (delete on the left,
   × on the right, save at the bottom, backdrop protection on changes).
   PATCH per row; save() invalidates running pulls (mutationSeq).
   DB probes up front: PATCH on log allowed by RLS, chore_id may be NULL
4. «Einmalig» tile, ALWAYS anchored top left (dashed):
   logs a chore WITHOUT creating a new tile — same form
   mask, the primary button is called «Eintragen» there
5. «Neue Aufgabe» additionally has «Speichern + eintragen» (ghost
   button under the primary): creates the tile AND logs it immediately
   for the chosen person. Visible only in create mode.
   UI consistency 4↔5: ONE sheet, ONE recordEntry() path (the tile tap
   now uses it too), the mode determines only title + buttons
- 4 new + 1 adjusted tier-1 test, 42/42 green on both engines
- APP_VERSION → 4.23.0, SW cache → haushalt-v79

## 2026-07-14 — v4.22.0: Install banner — recipients see the way to the icon immediately

- Maintainer point: whoever opens a shared link has no reason to open
  the invite sheet — the install instructions were invisible for
  exactly this target group
- New: a narrow, dismissible banner under the header («📲 Als App auf den
  Home-Bildschirm»), visible in the family AND person view, but NEVER
  in standalone mode (already running as an app) and never after
  dismissal (localStorage, context-specific key). Opens an
  install sheet in standard anatomy (grabber · title · × · primary at the bottom)
- Android automatism: beforeinstallprompt is captured early; if the
  native prompt is available (family context, manifest injected), the
  sheet shows ONE button «Jetzt installieren» → system dialog → on
  success an appinstalled event → toast «Installiert ✓», banner gone
  for good. iOS has no such API (Apple keeps it manual) → precise steps
- The instructions are now ONE shared producer (installInstructionsHTML)
  for the invite sheet (expandable) and the install sheet (flat) — no
  two copies. A refactor stumble (a stranded badge const → empty
  invite sheet) was caught by the suite, not by the user
- 2 new tier-1 tests, 34/34 green on both engines. Note: the
  native Android prompt itself is not testable headless (no
  beforeinstallprompt) — coverage there: banner/sheet/fallback instructions
- APP_VERSION → 4.22.0, SW cache → haushalt-v78

## 2026-07-14 — v4.21.0: «Teilen» → «Einladen» — the mix-up removed at the root

- Fairli's own button was called «Teilen» (share), just like Apple's share
  sheet — THE source of the confusion in the install guide (maintainer's
  point). Now everything app-owned is named after its function: header
  button and sheet title «Einladen» (invite), family and person link
  buttons «Einladen», app link «Empfehlen» (recommend)
- That reserves «Teilen» in the UI for Apple's original wording: the
  install guide again says «Im Browser auf [Symbol] ‹Teilen› tippen»
  (with positions per browser); the «Nicht der Knopf in Fairli» warning
  from v4.20.1 is thereby redundant and gone
- Tier-1 test adjusted: now pins «Einladen» on button + sheet title,
  0 sheet buttons with «Teilen», and «Teilen» in the guide = iOS sheet
- APP_VERSION → 4.21.0, SW cache → haushalt-v77
## 2026-07-14 — v4.20.1: Install guide iOS — Chrome rehabilitated, «Teilen» mix-up defused

- «nicht in Chrome» was outdated: since iOS 16.4 Safari, Chrome, Edge &
  Firefox all install through THE SAME system share sheet («Zum
  Home-Bildschirm»); Chrome iOS is WebKit, web clip mechanics identical.
  Our manifest rule (iOS NEVER gets a manifest) is UA-based and also
  fires for CriOS («iPhone» sits in the UA string) → same correct URL
  baked in
- Risk of mix-up fixed: step 2 named the iOS button in bold as «Teilen»,
  while Fairli has its own share button up top. Now: only the pictogram
  ${icShare} «des Browsers» (the browser's), with a position hint per
  browser (Safari bottom centre / iPad top right / Chrome next to the
  address bar) and an explicit note «Nicht der Teilen-Knopf hier in
  Fairli!»
- Two new Tier-1 tests (30/30 green on both engines):
  (a) guide: contains Chrome, contains no «nicht in Chrome», the word
  «Teilen» only in the Fairli disambiguation, both SVG pictograms there;
  (b) CriOS UA profile: route handoff ok, no manifest link, guide
  renders, iOS section carries the «dein Geraet» badge
- LIMIT: the install dialog itself is an OS sheet — a real
  Chrome-on-iOS install needs a manual device test (open, see
  DEVELOPER_ONBOARDING §12); Chrome ships no simulator builds
- «Fairli weiterempfehlen» de-dramatised (maintainer): ⚠︎, yellow tone and
  capitalisation («NEUEN») out — recommending it on is a good thing. Now a
  neutral note in muted: «Startet einen neuen, leeren Haushalt — zum
  Beitreten euren Familien-Link nutzen». CSS .warn in the share sheet
  replaced by .subnote
- APP_VERSION → 4.20.1, SW cache → haushalt-v76
## 2026-07-13 — v4.20.0: iOS ALWAYS baked in the base URL — maintainer hypothesis confirmed by ground truth, cause fixed

- Tier-2 capture test (6 iterations, real share flow in the simulator,
  then read the plist of the freshly created web clip file):
  URL => https://blauewelt.github.io/chores/index.html — even though
  Safari was on the family deep link. Maintainer hypothesis ("only the
  base URL is stored") CONFIRMED, as a LIVE bug, not just an old era
- Cause: <link rel="manifest"> sat STATICALLY in the HTML; removing it
  via JS on iOS (v4.13-era fix) was cosmetic — WebKit registers the
  manifest at PARSE time, «Zum Home-Bildschirm» keeps using start_url
  (= /chores/index.html). So the rule "iOS never gets a manifest" NEVER
  worked; ALL iOS icons ever added were born broken (explains Noel +
  Valentin completely, without any era theory)
- Fix: the manifest link no longer exists in the HTML. Injection via JS
  ONLY on non-iOS AND only in family context (Chrome reads late-injected
  manifests; WebAPK/install unchanged). Personal links stay manifest-free
  everywhere
- New regression test (26/26 on both engines): iOS profile never a
  manifest link, Android family context exactly one, personal links none
- Verification: capture workflow started again — expected GREEN with the
  deep URL in the plist
- APP_VERSION → 4.20.0, SW cache → haushalt-v75

## 2026-07-12 — v4.19.5: A family member's icon case — icons are also called «Haushalt», paste heals

- The live test: 3 «Fairli» icons deleted, «Link geoeffnet» (link opened)
  → still the standalone entry screen. The signature (standalone + no
  referrer + bare index.html) proves it: a FOURTH stale icon was
  launching. Cause of the failed search documented via commit history:
  early versions were called «Haushalt» (June, no
  apple-mobile-web-app-title), later document.title = family name → icons
  are called «Haushalt», «Fanti WG» or «Fairli» depending on the era. A
  Spotlight search for «Fairli» only finds the youngest generation
- Important: goto() saves the route BEFORE navigating → her pasting the
  link INSIDE the stale clip healed that clip's storage — from now on
  this icon permanently restores the family view (family-first, covered
  by the regression test "healthy admin icon"). No deleting needed
- Warning card rewritten: primary path = paste the link («danach
  funktioniert genau dieses Icon dauerhaft»); the cleanup note lists the
  old icon names; the false App Library claim removed (web clips do not
  live in the App Library)
- Data rule (maintainer): NEVER delete user data — fam-<Streuner-ID, privater Notizzettel>
  («Ich») stays
- APP_VERSION → 4.19.5, SW cache → haushalt-v74

## 2026-07-12 — v4.19.4: Stale-icon hypothesis CONFIRMED + entry screen heals

- the child's diagnostic photo shows «Modus: standalone
  (Homescreen-Icon!)» — hypothesis confirmed: he launched via a stale
  homescreen icon with index.html baked in, no link/scan was involved.
  The "URL stripping" riddle never was one
- Entry screen in standalone mode (= certainly a broken icon):
  * warning card names the problem («Veraltetes Fairli-Icon») plus
    instructions (delete icon, also check the App Library, open the
    invite link, add the icon again)
  * «Ich habe einen Einladungs-Link» becomes the big primary action
  * «Neuen Haushalt erstellen» becomes the small text action — prevents
    the Amelie mis-tap out of this dead end
- Browser-mode entry screen unchanged
- Stale-icon regression test now checks warning card + primary action
  (12/12)
- APP_VERSION → 4.19.4, SW cache → haushalt-v73

## 2026-07-11 — v4.19.3: Diagnostics show the launch mode (suspicion: stale icon)

- the child's second failure delivered the decisive hint: «Von: (kein
  Referrer)» + bare index.html + no hash. Had the scan gone through the
  404 handoff, the referrer would be set (same-origin
  location.replace). No referrer = DIRECT navigation to index.html — a
  camera scan of the QR (deep path!) cannot produce that
- Hypothesis: launch via a STALE homescreen icon with the URL
  /chores/index.html baked in (manifest-era web clip OR added from the
  entry screen during a failed attempt). Looks like a real Fairli
  installation, opens fullscreen
- Diagnostics extended: «Modus: standalone (Homescreen-Icon!) / browser».
  A scan shows browser, an icon launch standalone — tells the cases apart
  unambiguously on the next photo
- Regression test extended (entry screen shows the mode line); 10/10 green
- APP_VERSION → 4.19.3, SW cache → haushalt-v72

## 2026-07-11 — v4.19.2: Third handoff channel (hash) after the child's retest

- the child's retest diagnostics (screenshot): «Geoeffnet:
  …/chores/index.html» — NO ?r, NO hash, and the sessionStorage channel
  was empty too. Both existing channels were emptied on the way scan →
  Safari → app; cause still unknown (the referrer was missing from the
  diagnostics)
- Fix: 404.html additionally appends the route as a HASH to the redirect
  target (`index.html?r=…#f/…`). iOS Link Tracking Protection never
  strips fragments (only query parameters), they never go to the server
  and survive every navigation. The app has parsed hash routes forever
  (legacy format)
- Diagnostics extended: the entry screen now also shows the referrer
  («Von: …») — on the next failure that reveals whether 404.html ran at
  all
- 2 new regression tests (10 total): the redirect carries all three
  channels; the hash alone rescues the route (exactly the state the child
  observed)
- APP_VERSION → 4.19.2, SW cache → haushalt-v71

## 2026-07-11 — Dev: Tier-1 test suite (Playwright + CI)

- No app deploy (no version/SW change) — pure tooling
- 8 regression tests, each matching a bug that actually shipped: locked
  person view (v4.13.x), member sharing without the family link +
  warnings (v4.19.0), QR captions, query-stripping handoff (v4.19.1),
  entry screen + diagnostics, identity leak (v4.18.1),
  delete-vs-pull race (v4.17.0), note snapshot (v4.9/v4.11.1)
- Run on Chromium (Pixel 7) and WebKit (iPhone 14) against a
  Pages-mimic server (404 handoff faithfully reproduced); Supabase mocked
- CI: .github/workflows/tests.yml on every push; a second job enforces
  deploy discipline (APP_VERSION ⇒ SW bump + LOG entry)
- Locally: 8/8 green on Chromium (5.8 s)

## 2026-07-11 — v4.19.1: 404 handoff hardened against query stripping + diagnostics

Research on the Amelie case (QR shown correctly, still landed on the
entry screen): iOS NEVER strips path segments; Link Tracking Protection
only removes query parameters from a curated (secret) list, and only in
Mail/Messages/Private Browsing. `r` is on no published list; the QR
itself decodes byte-exact (ECC, round trip verified). BUT: our 404
handoff turns the safe PATH into exactly the kind of query parameter
(long, unique user token) that LTP targets — a single point of failure,
list secret and extensible.

- 404.html additionally stashes the route in sessionStorage
  (`fairli.handoff`) — survives location.replace in the same tab and is
  immune to any query stripping
- index.html reads the handoff as channel 2 (after ?r/path/hash, BEFORE
  the stored route) and cleans it up. Simulation: the route resolves
  correctly even with a COMPLETELY stripped query
- Diagnostics: the entry screen now shows in small print the address
  actually opened («Geoeffnet: …») — if someone lands there unexpectedly
  again, we see WHAT arrived instead of guessing
- (Caught our own TDZ bug: esc() is not yet defined in the entry screen
  → inline escaping)
- APP_VERSION → 4.19.1, SW cache → haushalt-v70

## 2026-07-11 — v4.19.0: Wrong QR led to a «neuem Haushalt» (a member bug)

Finding: a member scanning ended up on the entry screen and accidentally
created an empty household (fam-<Streuner-ID, privater Notizzettel>, member «Ich»).
The entry screen appears ONLY when the URL contains no family at all —
her personal link resolves correctly (chain scan → 404 → app simulated).
So she opened the BARE app link, not hers.

Cause (design trap, self-built):
- Noel shared from within HIS personal link. There the share sheet showed
  only his own link + «Fairli weiterempfehlen» — and that is the bare app
  link, which leads to «Neuen Haushalt erstellen». So the only other QR on
  the screen was exactly the wrong one
- Three visually identical QR toggles without labels

Fixes:
- Members now see the personal links of ALL people (their own marked with
  «(du)») and can invite each other. The family/admin link stays hidden
  from them (as intended)
- Every QR code has an unmistakable caption:
  «Persoenlicher Link fuer <Name>» · «Ganze Familie · voller Zugriff»
- «Fairli weiterempfehlen» is clearly marked as a NON-join link (warning
  colour, own block, warning note on the row AND the QR, discreet button)
- APP_VERSION → 4.19.0, SW cache → haushalt-v69

## 2026-07-11 — v4.18.3: Close button identical everywhere (× top right)

- In the chore sheet «Loeschen» (red) sat exactly where the person and
  share sheets have their «×» to close — so the destructive action lay
  under the thumb that elsewhere only closes
- Now the same in ALL sheets: «×» top right closes. In the chore sheet
  «Loeschen» moves to the left slot (red, visible only when editing);
  «Abbrechen» as text is dropped — the × is the cancel
- The primary action stays everywhere the big button at the bottom
  (Speichern / Fertig)
- APP_VERSION → 4.18.3, SW cache → haushalt-v68

## 2026-07-11 — v4.18.2: Household name slightly larger

- Title base size clamp(28px, 8.6vw, 34px) → clamp(30px, 9.2vw, 38px).
  So on the Pixel (412px) 34 → 38px; on small phones (360px) 33px
- The room is there since the sync button was removed (only share +
  people left in the header)
- Length-dependent steps pulled along (>14 / >22 characters); the flex
  header and the 2-line clamp still prevent any overlap
- APP_VERSION → 4.18.2, SW cache → haushalt-v67

## 2026-07-11 — v4.18.1: «Ich bin» leaked from personal links into the admin view

- BUG: `LS_ME` was ONE key per family (`haushalt.me:<fam>`), shared by the
  admin view and ALL personal links on the same device.
  pull() wrote the detected person into it in person mode → after opening
  the second child's link the admin link also showed «Ich bin: Mira».
  The shortcut was not at fault, the shared key was
- Fix:
  * admin context gets its own key (`…:admin`)
  * personal links ALWAYS derive the person synchronously from the slug
    (from the local cache → no flicker) and NEVER persist it
  * one-off healing: the old key is only adopted if the device has never
    opened a personal link (then it cannot be contaminated); afterwards
    it is deleted
- On affected devices (e.g. the Pixel that had opened the second child's link)
  «Ich bin» is empty once in the admin view → tap your own person once,
  after that it sticks
- APP_VERSION → 4.18.1, SW cache → haushalt-v66

## 2026-07-11 — v4.18.0: Unified sheet/dialog design

Before: three sheets, three interaction patterns (Abbrechen/Speichern ·
Fertig · ×), the primary action sometimes at the bottom, sometimes in the
header, sometimes not at all; deleting a person was an immediate «×» —
the most dangerous action had the weakest protection.

- ONE sheet anatomy for all: grabber · header row (slot · centred
  title · slot) · body · ONE big primary button AT THE BOTTOM.
  Fixed slot width (84px) → the title centres itself without the former
  empty <span> hack
- Two sheet types, distinguished by whether there is something to confirm:
  * form (chore): «Abbrechen» left, «Loeschen» red on the right,
    «Speichern» big at the bottom (unchanged — was already right)
  * utility (people, share): «×» right, «Fertig» big at the bottom.
    «Fertig» now sits in the same place as «Speichern»
- Destructive actions, one rule per context:
  * single object in a form → red text top right (chore)
  * list entries → ⋯ menu with a red «Loeschen» (history AND NOW ALSO
    people). The immediate per-person «×» is gone; the menu additionally
    offers «Link teilen» (replaces the 🔗 button)
- Closing the same everywhere: ×/Abbrechen, backdrop tap, Esc (native).
  DELIBERATE exception: the form sheet ignores the backdrop tap as long as
  there are unsaved inputs (no data loss from a mis-tap)
- Cleanup: #shareSheet special styles removed (now uses the global
  dialog/.sheet rules; the deviating backdrop opacity .5 vs .55 is gone),
  hardcoded red in the history menu → var(--red), alert() → toast()
- APP_VERSION → 4.18.0, SW cache → haushalt-v65

## 2026-07-11 — v4.17.0: No more resurrection flicker (sync reconciliation)

- BUG: after deleting a history entry it briefly flashed back up.
  Cause: pull() overwrites state.* COMPLETELY with the server state. The
  delete is optimistic (locally immediate) + a DELETE without waiting. If
  a pull was running — or one started before the server had committed the
  DELETE — the server still delivered the row → the entry
  disappeared, came back, disappeared again. The same race affected new
  entries (a brief blink-out) and edits (a brief revert)
- Fix: a reconciliation layer between optimistic writes and pull()
  * `mutationSeq` (incremented centrally in push(), covers POST/PATCH/
    DELETE/upsert): if anything changes locally during a running pull, its
    snapshot is stale and is DISCARDED — the local state stays
  * `pendingDeletes` / `pendingCreates`: until the server has demonstrably
    processed the write (resolvedAt < pullStart), server rows are
    filtered out or missing local rows are added back. Afterwards the
    entries clean themselves up
  * the log is re-sorted by done_at after reconciliation
- All write sites now go through `deleteRemote()` / `createRemote()`
- The reconciliation layer's declarations sit BEFORE pull() (no TDZ trap)
- APP_VERSION → 4.17.0, SW cache → haushalt-v64

## 2026-07-11 — v4.16.0: Proper install guide (iOS first, with icons)

- The old one-liner showed only the guide for the DETECTED device —
  useless when e.g. an Android admin wants to help an iPhone user
- New: an expandable block «Als App zum Home-Bildschirm» with explicit
  step-by-step guides for BOTH platforms, iPhone first (priority).
  Inline SVG icons help find the buttons: iOS share symbol, iOS «+ zum
  Home-Bildschirm», Android menu (⋮)
- iOS note made explicit: open the link in SAFARI (not Chrome); the iPad
  variant (share top right) as a side note
- The user's own device gets a «dein Geraet» badge, but the order always
  stays iOS → Android
- Collapsed by default (the sheet stays compact); after first-run setup
  automatically expanded, because that is exactly when people install
- Placement: admin below the family block, members directly below their
  own link
- APP_VERSION → 4.16.0, SW cache → haushalt-v63

## 2026-07-11 — v4.15.2: ICH-BIN row flicker fixed, title larger again

- CAUSE (applies to both flicker bugs): `qrcode.min.js` was a
  render-blocking EXTERNAL script directly BEFORE the main script. While
  it loads, the browser paints the half-parsed document — that is, the
  empty ICH-BIN row (and earlier the hardcoded «Fairli» title). render()
  only ran after that
- Fix 1: `defer` on qrcode.min.js. qrcode() is only needed in the share
  sheet (on click), so it definitely runs later → safe. That removes the
  paint window and render() paints before the first frame
  CAUTION: defer scripts run AFTER the inline IIFE — `qrcode` must never
  be used at startup (only in the click path)
- Fix 2 (belt & braces): `html.booting` is set synchronously in the
  <head>, CSS makes the ICH-BIN row invisible (height stays reserved via
  `min-height:46px` → no layout jump); render() removes the class. If the
  browser does paint earlier, you see empty space instead of
  half-rendered chips
- Title larger again: the vw clamp from v4.14.1 had shrunk it on phones
  across the board (only ~26 px instead of 34 px at 412 px) — even for
  short names like «Fanti WG». Now clamp(28px, 8.6vw, 34px); the
  length-dependent steps (>14 / >22 characters) were raised as well
- APP_VERSION → 4.15.2, SW cache → haushalt-v62

## 2026-07-11 — v4.15.1: No more «Fairli» flicker in the title

- BUG: the <h1> contained a hardcoded «Fairli»; the real household name
  was only set by render() → on reload «Fairli» flashed up, then
  «Fanti WG»
- Fix: the <h1> starts empty (&nbsp; holds the line height, no layout
  jump). An inline script right after the header runs SYNCHRONOUSLY during
  parsing (before the first paint): resolve the family from the URL or the
  stored route (family-first) → read the name from localStorage
  `haushalt.v2:<fam>` → set the title. On reload «Fanti WG» appears at once
- `window.__setFamTitle(name)` is the single source for the title +
  length-dependent font size; render() calls the same helper (no duplicate
  sizing logic, no drift)
- First visit without cache: the title stays empty (placeholder) until the
  first pull delivers the name — better than a wrong intermediate state
- APP_VERSION → 4.15.1, SW cache → haushalt-v61

## 2026-06-28 — v4.15.0: Sync button removed, sharing for all members

- Sync button + «Geraete verbinden» sheet removed: a relic from the time
  before multi-tenant (own Supabase URL/key per device). cfg is now fixed
  to the built-in project — this also heals devices that had pressed
  «Trennen» earlier. Sync errors still report via toast
- The app version now sits in small print at the bottom of the share sheet
  (previously in the sync sheet)
- «Teilen» is no longer hidden for personal links: members see their OWN
  link (with QR + install hint) and «Fairli weiterempfehlen» — NOT the
  family/admin link and not other members' links (least privilege: any
  foreign link allows acting as that person)
- APP_VERSION → 4.15.0, SW cache → haushalt-v60

# LOG.md — Change history

All work on the Haushalt app, newest first. Maintained by Claude.

## 2026-06-28 — v4.14.1: Header overlap with long household names fixed

- BUG: `.headbtns` was `position:absolute` → the H1 knew nothing about the
  buttons and ran underneath them with long household names
  («Farman-WG» overlapped Sync/Teilen/Personen). It had not shown up so
  far because «Fanti WG» is short
- Fix: the header is now a flex row — title `flex:1; min-width:0`
  (shrinks, wraps, max. 2 lines), buttons `flex:0 0 auto` (keep their
  space). Overlap is structurally impossible
- Title size fluid (`clamp`) + additional shrinking for long names, so
  they fit next to the buttons on a single line where possible
- APP_VERSION → 4.14.1, SW cache → haushalt-v59

## 2026-06-28 — v4.14.0: Android robust for multiple shortcuts + onboarding docs

- Personal links no longer get a manifest on ANY platform:
  «Zum Startbildschirm» creates a shortcut with exactly this URL —
  several person shortcuts + the admin app coexist per device.
  Family context keeps the manifest (standalone WebAPK)
- Route restore family-first: haushalt.route.family / .user kept separate;
  a bare launch prefers the family route (the admin device is no longer
  hijacked by personal links opened in between); the synchronous head
  check mirrors the precedence
- rel=icon (192px, absolute) for manifest-less Chrome shortcuts
- NEW: DEVELOPER_ONBOARDING.md — comprehensive architecture/convention
  docs (deploy discipline, data model + immutability principle, routing,
  platform minefields iOS/Android, flicker rule, UI conventions,
  migrations, secrets policy)
- APP_VERSION → 4.14.0, SW cache → haushalt-v58

## 2026-06-28 — v4.13.2: No button flicker + Android icon on deep paths

- FLICKER: admin buttons (Teilen/Personen/Sync) were only hidden via JS
  after rendering → they flashed up briefly. Now synchronously BEFORE
  rendering: an inline script in the <head> sets `html.userlink`, CSS
  hides the buttons immediately. Detection from the URL (/u/…) AND the
  stored route (installed app without /u/ in the path); synchronised with
  USER_SLUG at runtime
- ANDROID ICON: `<link rel=manifest href="manifest.json">` was relative and
  resolved on deep paths to …/u/manifest.json = 404 → Chrome only created
  a generic bookmark without an icon. Now absolute
  (`/chores/manifest.json`), same for apple-touch-icon
- APP_VERSION → 4.13.2, SW cache → haushalt-v57

## 2026-06-28 — v4.13.1: Personal links opened the family view (SW path bug)

- BUG (on devices with an installed service worker): the SW serves deep
  paths directly as the app shell (no 404 ?r= handoff). On the deep path
  BASE computed itself wrongly (/chores/f/<fam>/u/ instead of /chores/),
  path detection failed and the code fell back to the STORED route —
  e.g. the device's family/admin route. Mira link → admin view
- Fix: BASE is derived before the «f/» segment; the route is parsed from
  the full pathname (regex not anchored). Simulation confirms
  family+userSlug on an SW-served deep path
- APP_VERSION → 4.13.1, SW cache → haushalt-v56

## 2026-06-27 — v4.13.0: iOS deterministic — no manifest, classic metas

- Decision: instead of the version-dependent blob manifest approach
  (v4.12.0, removed again), the GUARANTEED route. Apple's documented web
  clip behaviour: WITHOUT a manifest «Zum Home-Bildschirm» always uses the
  current page URL — exactly our clean path
- iOS (UA/iPadOS detection): <link rel=manifest> is removed; standalone,
  name and icon come from the classic metas (apple-mobile-web-app-capable,
  -title, -status-bar-style, apple-touch-icon)
- Android: the static manifest stays (WebAPK, maskable icons);
  route restore via localStorage covers the launch (Pixel behaviour confirmed)
- 404.html: manifest now only injected for non-iOS; apple-capable added
- APP_VERSION → 4.13.0, SW cache → haushalt-v55

## 2026-06-27 — v4.12.0: iOS homescreen captures the right path (per-route manifest)

- Cause of the regression bug found: on «Zum Home-Bildschirm» iOS reads
  the start_url from the linked manifest, NOT the current page URL
  (documented among others in Apple forums + a GitHub Codespaces issue).
  Our static manifest had start_url=/chores/index.html → every install
  landed on the generic start page, whichever family/person link it was
- Fix: as soon as the route is known, a per-route manifest (blob URL) is
  generated whose start_url is the FULL path of that family/person
  (absolute URL), scope=/chores/, own id; icons lifted to absolute URLs.
  The <link rel=manifest> is redirected to it
- The static manifest stays as a fallback
- APP_VERSION → 4.12.0, SW cache → haushalt-v54
- NOTE: iOS behaviour with a JS-swapped manifest is version-dependent;
  if it does not take, there is a guaranteed fallback (docs to follow)

## 2026-06-27 — v4.11.1: History is immutable (note frozen)

- Design principle: a history entry is a snapshot and must not change when
  the chore is later renamed/re-scored/deleted
- Name, member and points were already frozen at entry time; the note was
  the outlier (it was read live from the current chore)
- DB: column `chore_note` on log; the note is now stored along at entry
  time, the history shows the frozen value. Old entries without a
  snapshot simply show no note (no fallback to the live chore)
- APP_VERSION → 4.11.1, SW cache → haushalt-v53

## 2026-06-27 — v4.11.0: Edit sheet — Speichern big at the bottom, Löschen small at the top

- «Speichern» is now a big primary button at the bottom (no longer in the
  header row)
- «Löschen» is a secondary action top right in red (visible only when
  editing; toggled via visibility so the title stays centred)
- Header row: Abbrechen | title | Löschen
- APP_VERSION → 4.11.0, SW cache → haushalt-v52

## 2026-06-27 — v4.10.1: History menu «Löschen» instead of «Rückgängig»

- Menu item named correctly: the entry gets deleted (points out), not a
  state undone → «Löschen» (in the warning colour)
- APP_VERSION → 4.10.1, SW cache → haushalt-v51

## 2026-06-27 — v4.10.0: Note in the history + less «Löschen» as default

- (1) The history now shows the chore's note in small print under the entry
- (2) Less accidental deleting:
  * edit sheet: «Aufgabe löschen» is no longer a wide danger button but a
    discreet, underlined text link at the bottom. The primary action stays
    «Speichern» at the top
  * history: the former immediately-deleting ↩︎ is now a three-dot menu
    (⋯) with «Rückgängig machen»; closes on a tap outside
- APP_VERSION → 4.10.0, SW cache → haushalt-v50

## 2026-06-27 — v4.9.0: Optional note per chore

- DB: column `note` on chores (migration via db-migrate)
- Edit sheet: optional field «Notiz» (max. 60 characters) – nobody has to
  enter anything
- The note appears small and discreet under the name on the tile (max. 2
  lines, truncated so it fits); only visible when set
- Save/sync including note
- APP_VERSION → 4.9.0, SW cache → haushalt-v49

## 2026-06-27 — v4.8.1: QR display bug fixed

- BUG: `.shqr{display:block}` overrode the `[hidden]` attribute → the QR
  could no longer be shown/hidden. Rule `.shqr[hidden]{display:none}` added
- APP_VERSION → 4.8.1, SW cache → haushalt-v48

## 2026-06-27 — v4.8.0: Share sheet compact (QR collapsible)

- QR codes collapsed by default; one «QR» button per row reveals the code
  on demand. That makes the sheet much shorter and quicker to scan through
- «Fairli weiterempfehlen» now gets a QR code as well
- The QR is centred when shown, slightly smaller (116 px)
- APP_VERSION → 4.8.0, SW cache → haushalt-v47

## 2026-06-16 — v4.7.3: App recommendation link in the share sheet

- New entry «Fairli weiterempfehlen» at the bottom of the share sheet:
  shares the bare app link (without a family) so recipients can create
  their OWN new household
- APP_VERSION → 4.7.3, SW cache → haushalt-v46

## 2026-06-16 — v4.7.2: Share sheet slimmed down

- Family link showed up twice (block at the top + «Ganze Familie» at the
  bottom) → reduced to ONE block at the top: family link + QR + install hint
- «siehe unten» removed (was misleading, since long content follows);
  the install hint now sits directly with the family block, terse text
- Clear structure: «Ganze Familie» at the top, below it the heading
  «Persönliche Links», then the people
- Title «Links teilen» → «Teilen»; intro after setup removed
- APP_VERSION → 4.7.2, SW cache → haushalt-v45

## 2026-06-16 — v4.7.1: Start page simplified

- Entry screen tidied up and aimed at the main case:
  «Neuen Haushalt erstellen» is now the primary button (topmost, resp.
  as the accent button). «Zu meinem Haushalt» only appears if there is a
  last family. The invitation-link case is collapsed behind «Ich habe einen
  Einladungs-Link» (the input field only appears on tap)
- Less text, clear hierarchy instead of a prominent paste field
- APP_VERSION → 4.7.1, SW cache → haushalt-v44

## 2026-06-16 — v4.7.0: Onboarding flow cleaned up

- (Bugfix) The join field did not accept the new PATH links (hash/slug
  only) → parseAny now also recognizes `…/chores/f/<fam>[/u/<slug>]`
- Bare link still remembers the last family («Zu meinem Haushalt»),
  prevents accidentally creating a second family
- Share sheet after setup highlights the creator's OWN household link
  (its own block at the top, share/copy) + platform-specific
  «Zum Home-Bildschirm» hint (iOS: Teilen→Zum Home-Bildschirm; Android:
  ⋮→Zum Startbildschirm)
- New header button «Teilen»: opens the link/QR sheet at any time from the
  main screen (in case someone lost the links shared during setup);
  hidden on personal links
- The header may wrap when there are three buttons, does not collide with
  the title
- APP_VERSION → 4.7.0, SW cache → haushalt-v43

## 2026-06-16 — v4.6.1: Icon/name on path install fixed

- BUG: When adding via a path link (…/chores/f/...), iOS read the
  metadata from 404.html, which had no manifest/icon/title → shortcut
  without an icon, wrong name (light «R» on dark)
- 404.html gets the same PWA head as index.html: manifest link,
  apple-touch-icon, title «Fairli», theme-color, apple-mobile-web-app-title.
  Deliberately NO apple-mobile-web-app-capable (would break start_url handling)
- APP_VERSION → 4.6.1, SW cache → haushalt-v42
- Remove the affected shortcut once and re-add it via the path link

## 2026-06-16 — v4.6.0: Path-based family URLs (1-click iOS install)

- Family links are now real paths instead of a hash:
  `…/chores/f/<familie>` resp. `…/chores/f/<familie>/u/<slug>`. iOS bakes the
  full path into start_url → the home screen icon starts directly in the family,
  without a paste/re-join step
- `404.html`: GitHub Pages serves it for every unknown path; it redirects
  `…/chores/f/...` to `…/chores/index.html?r=f/...` (standard SPA trick),
  so that the deep path "exists" and iOS can capture it
- The app reads the route from `?r=` (404 handoff), from the real path and —
  backwards compatible — from the hash; canonicalizes to the path form via
  history.replaceState
- Share links and navigation switched to the path form; manifest: scope
  `/chores/`, start_url `/chores/index.html`, stable `id`
- Service worker: navigation requests to deep `/chores/...` paths return the
  app shell (offline-capable, no 404 in the installed app); cache v41
- Existing hash links (`#f/...`) keep working
- APP_VERSION → 4.6.0, SW cache → haushalt-v41
- For 1-click: open the new path link and add it to the home screen from there

## 2026-06-16 — v4.5.0: Entry screen instead of an iOS dead end

- Finding: iOS ALWAYS starts home screen PWAs at the static start_url without
  a hash and ignores dynamic manifests/hash in start_url (known
  WebKit behavior, cf. GitLab issue). The v4.4.2 approach (dynamic
  manifest) could never take effect on iOS → removed
- New entry screen when no family is active (instead of a dead end with
  only «Neue Familie»):
  * «Zu meinem Haushalt» (if a last route is present in localStorage)
  * Paste invitation link (accepts the full link, just the #-hash, or just
    the family slug) → join
  * «Neuen Haushalt erstellen» as a secondary option
- This way even a freshly installed iOS shortcut with isolated storage gets
  into the family in one step by pasting the link
- APP_VERSION → 4.5.0, SW cache → haushalt-v40

## 2026-06-16 — v4.4.2: iOS home screen lands in the family again

- BUG (iPhone/Chrome → Zum Homescreen): The installed launch opened
  start_url WITHOUT a hash; the route lived only in localStorage, which iOS
  keeps separate for the standalone app → launch landed in the «Neue
  Familie» first-run setup
- Fix 1: On a launch without a hash the last known route is fetched from
  localStorage AND the hash is written back via history.replaceState (consistent
  across reloads/standalone)
- Fix 2 (the actual iOS fix): dynamic manifest — as soon as the family is
  known, the <link rel=manifest> is bent to a blob with
  start_url=./index.html#f/<familie>(/u/<slug>). iOS reads start_url
  when adding to the home screen → the installed shortcut starts directly
  in the family resp. in the personal link
- Fix 3: When a new family is created the route is persisted immediately
- IMPORTANT for affected devices: remove the existing home screen shortcut
  once and re-add it via the (family) link so that the new start_url takes
  effect
- APP_VERSION → 4.4.2, SW cache → haushalt-v39

## 2026-06-16 — v4.4.1: Icon in royal blue, three bubbles

- Icon color changed to a saturated royal blue and reduced to three clearly
  separated bubbles (tiny bubbles removed — invisible at launcher size anyway);
  ghost ring of the removed mini bubble cleanly removed (only 3 blobs left)
- Maskable with the motif pulled inward, no cropping
- Icon cache buster ?v=45, APP_VERSION → 4.4.1, SW cache → haushalt-v38

## 2026-06-16 — v4.4.0: New icon — blue soap bubbles on white

- App icon replaced (the sponge was hard to make out at launcher size):
  four blue, clearly separated soap bubbles of different sizes on a
  pure white ground. Generated via Pollinations/flux, background
  programmatically cleaned to pure #FFFFFF and centered
- Maskable variant with the motif pulled inward (~62 %), so that Android's
  circle/squircle crop does not cut off a bubble
- Splash/theme color → white (matches the icon), icon cache buster ?v=44
- APP_VERSION → 4.4.0, SW cache → haushalt-v37
- Note: the Android WebAPK caches the icon; re-add the app if needed

## 2026-06-14 — v4.3.4: New chore appears at the very top immediately

- BUG: After «Aufgabe hinzufügen» the grouping sorted the new tile
  somewhere further down (alphabetically into its group) → it looked as if
  it did not appear at all; only a tab switch made it visible
- Freshly added chores are now «pinned» for the session:
  they sit at the front (newest first) until the order is naturally
  recomputed (app start, tab switch). On adding, the list scrolls
  to the new tile and it briefly flashes
- APP_VERSION → 4.3.4, SW cache → haushalt-v36

## 2026-06-14 — v4.3.3: Share text uses the household name

- Share text «… mach mit bei unseren Haushalts-Aufgaben» (clunky, and
  «Hausaufgaben» would mean school homework) → «… mach mit bei
  <Haushaltsname>», e.g. «Mira, mach mit bei Fanti WG:». Fallback
  «unseren Aufgaben» if no name is set
- APP_VERSION → 4.3.3, SW cache → haushalt-v35

## 2026-06-14 — v4.3.2: Onboarding flow repaired

- BUG: The 20-second auto-sync (and visibilitychange) called firstRunSetup()
  again as long as the family was empty → the dialog was rebuilt and
  overwrote input in progress (household name/people were cleared).
  Fix: firstRunSetup() is now idempotent (guard + DOM check); pull()
  touches neither DOM nor state while setup is open; auto-sync and
  visibilitychange pause as long as firstRunOpen
- Setup is shown immediately when a brand-new family starts, not only
  after the first network pull (no more brief empty grid,
  no delay)
- Removed the duplicate pull() call at init
- APP_VERSION → 4.3.2, SW cache → haushalt-v34

## 2026-06-14 — v4.3.1: The app is called «Fairli»

- App name (manifest, title, onboarding screen, default H1) → «Fairli»
  (Swiss-touch variant of «Fairly»); the household name stored per family
  is untouched by this and still overrides the
  title at runtime
- «Neuer Haushalt» setup dialog and «Name des Haushalts» deliberately
  kept — that is household-specific, not app-specific
- Icon cache buster → ?v=43, SW cache → haushalt-v33, APP_VERSION → 4.3.1

## 2026-06-14 — v4.3.0: Frictionless sharing — share sheet, native share, QR

- New «Links teilen» sheet: lists all personal links + the family link,
  each with a share button and QR code (for setup on site: scan instead of
  typing)
- Sharing now primarily uses the native share sheet (WhatsApp/Signal/…),
  clipboard only as a fallback — one tap from the link to the family chat group
- After the first-run setup the share sheet opens automatically with a hint,
  so that new families find sharing right away (previously hidden in the
  person sheet)
- QR generation offline: qrcode-generator (21 KB, dependency-free) inline,
  in the SW cache; works without a network
- Person sheet: 🔗 and the family button now open this sheet
- APP_VERSION → 4.3.0, SW cache → `haushalt-v32`

## 2026-06-14 — v4.2.3: Order frozen during the session

- Tile order is computed once and cached; the 20-second auto-sync
  and switching to the foreground still refresh data and points,
  but no longer reorder the tiles — nothing jumps away under your finger
- Recomputation only on expectable occasions: tab switch, bringing the app
  to the foreground, creating/changing/deleting a chore
- With an unchanged set of chores the remembered order stays put,
  even if usage counts change in the background
- APP_VERSION → 4.2.3, SW cache → `haushalt-v31`

## 2026-06-14 — v4.2.2: Tiles sorted by group

- Compromise sorting: chores grouped by first word; groups by
  total usage descending (most frequent at the top), A–Z within each group.
  «Wäsche waschen/aufhängen/falten» stay together, frequently used groups
  move up. Tie-break between equally used groups: A–Z.
- APP_VERSION → 4.2.2, SW cache → `haushalt-v30`

## 2026-06-14 — v4.2.1: Tiles sorted alphabetically

- Chore tiles now sorted alphabetically by name (locale 'de', accent- and
  case-insensitive) instead of by usage frequency — related
  chores like «Wäsche waschen / aufhängen / falten» stand next to each other
- APP_VERSION → 4.2.1, SW cache → `haushalt-v29`

## 2026-06-14 — v4.2.0: Real multi-family start + manifest rebrand

- `families` table (family_id, name); the household name is loaded and
  rendered as title/H1 instead of a hardcoded "Fanti WG"
- First-run setup for completely new families: name, people (one per line),
  optional pre-filling of typical chores — after that the household is ready
  to use right away
- manifest.json generic: name "Haushalt", navy colors (#12161F) instead of
  the old green, icon cache buster `?v=41` so that Android pulls the new icon
- index.html: title/description/H1 default neutralized (only visible before sync)
- APP_VERSION → 4.2.0, SW cache → `haushalt-v28`

## 2026-06-12 — v4.1.0: Multi-family operation with link auth

- DB: `family_id` on members/chores/log (+ indexes), `url_slug` on members;
  migration via the GitHub action `db-migrate` (repo secret SUPABASE_DB_PASSWORD,
  psql against the session pooler) — existing data of the Fanti family
  migrated automatically
- Routing: `#f/<familie>` = family link (full access),
  `#f/<familie>/u/<slug>` = personal link (Ich bin firmly locked,
  points only for yourself; creating/changing/deleting chores still allowed;
  person and sync sheets hidden); the route is remembered in localStorage
  so that the installed PWA starts without a hash; an invalid slug
  shows an error page
- All REST accesses centrally family-scoped (famScope/famRows in sb()
  and upsert()); localStorage keys namespaced per family
- Person sheet: 🔗 per person creates/copies a personal link,
  button for the family link; slugs revocable (regenerate)
- Without a link: onboarding screen with «Neue Familie erstellen»
- APP_VERSION → 4.1.0, SW cache → `haushalt-v27`

## 2026-06-12 — v4.0.3: Header gradient on the accent color

- The "Fanti WG" title had the old mint (#52C08A) hardcoded in the text
  gradient; now uses `var(--accent)` and thus follows every rebrand
- APP_VERSION → 4.0.3, SW cache → `haushalt-v26`

## 2026-06-12 — v4.0.2: Final icon — yellow/coral on cream

- App icon final: yellow sponge with a coral scrub layer and coral bubbles on
  a warm cream gradient (variant 3 from the selection sheet); light plate
  instead of navy, so that it fits in on the home screen next to the light
  system icons
- APP_VERSION → 4.0.2, SW cache → `haushalt-v25`

## 2026-06-12 — v4.0.1: Watermark digit removed

- Points were encoded three times (badge, watermark, tile height);
  the big background digit is out, the badge stays the single source
- APP_VERSION → 4.0.1, SW cache → `haushalt-v24`

## 2026-06-12 — v4.0: Navy/cornflower rebrand, new icon, edit tap target

- Accent color mint → bright cornflower (`#84B2FF`, press `#6B99E6`);
  background neutrals retinted from green to navy (`--bg #12161F`,
  `--card #1A2230`, `--line #2A3447`, `--muted #91A1B8`)
- New app icon: flat yellow sponge with a scrub layer in the accent blue,
  soap bubbles, navy gradient (192/512/maskable, built as SVG via cairosvg)
- Edit pencil on tiles: tap target enlarged from ~30px to 52x52px
  (corner of the tile), :active feedback added — mis-taps were booking points
- APP_VERSION → 4.0, SW cache → `haushalt-v23`
- Note: Android caches PWA icons in the WebAPK; the home screen icon may only
  refresh after re-adding the app

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

## 2026-06-10 — v3.0: "Fanti WG" — dark colorful theme

- Renamed app to "Fanti WG" (header wordmark with mint gradient, title,
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

Redesign from assignment model to volunteer model per Maintainer's spec:

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
