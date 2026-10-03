# Fairli as a store app — notifications and voice logging

Design doc. Status: **DRAFT for maintainer review**, 3 October 2026.
Nothing here is built yet. Code anchors refer to v4.113.1.

Decided so far (3 October 2026): no Play test has been started yet; Fairli
moves to the maintainer's own domain `blueworld.li` before anything is
uploaded to a store (§6.3).

Fairli today is a web app that can be installed to the home screen (a
Progressive Web App, PWA). For Google Play it is packaged as a Trusted Web
Activity (TWA: a thin Android app that shows the web app full-screen through
Chrome). There is no iOS App Store app. This document plans the step to
"real" store apps on both platforms, led by two features:

1. **Notifications** — when someone in the household logs something, the
   others hear about it, with a delay so that a burst of taps becomes one
   notification.
2. **Voice logging** — a mic button: say what you did, a language model
   (Gemini or another) turns it into entries, Fairli logs them. Ideally
   also reachable from the phone's own assistant.

---

## 1. Summary of the plan

- **Build both features in the web app first.** Standard Web Push and a
  mic button work in the browser PWA, in the Android store app (TWA) and in
  the iOS home-screen PWA at the same time. One implementation, three
  surfaces, no native code.
- **Android stays a Trusted Web Activity.** It already supports real
  notifications under Fairli's own name and icon; it needs one config
  switch and a rebuild. Moving to a native wrapper would lose every
  installed household's stored link and gain nothing we need yet.
- **iOS needs a real wrapper** (Capacitor) with Swift code for push and
  Siri. Web Push does not work inside an iOS app's web view, and Apple
  rejects plain website wrappers. This is the expensive part and a separate
  go/no-go.
- **"Speak to the built-in Gemini" is not open to us yet.** The Android
  mechanism (App Functions) is a private preview; the old one (App Actions)
  is ignored by Gemini. On iOS, classic Siri can trigger "Log in Fairli"
  today, in German. So: in-app mic first, assistant hooks when the
  platforms allow.
- **Two things break the "server sees only ciphertext" promise if done
  carelessly.** Notifications are designed so the promise holds. Voice
  logging cannot hold it — speech and chore names must reach a language
  model — so it is opt-in per household and says so.

## 2. Phases

| Phase | What | Surfaces it reaches | Size |
|---|---|---|---|
| 0 | Decisions (§8); Play developer account | — | maintainer |
| 0b | Move the app to its own address on `blueworld.li` (§6.3), then build the Android bundle against it and start the Play closed test | all | medium |
| 1 | Notifications over Web Push | browser PWA, Android store app, iOS home-screen PWA | medium |
| 2 | Voice logging, in-app mic, behind a household flag | all | medium |
| 3 | Play Store release 1.1.0 with notifications on | Android | small (after the 14-day gate) |
| 4 | iOS App Store app: Capacitor shell, Apple push, Siri shortcut | iOS | large |
| 5 | Assistant integrations (Gemini App Functions, Siri AI) | Android, iOS | when available |

Phases 1 and 2 are independent of each other and of the stores, but both
come after the move (push subscriptions are bound to the address). Phase 0b
contains the one long wait: Google requires new personal developer accounts
to run a closed test with 12 testers for 14 days before production.

---

## 3. Notifications

### 3.1 Behaviour

- A notification names the person and what they did:
  title «Alex», body «Küche geputzt · Müll rausgebracht · +7».
- **Debounce:** the first entry starts a 3-minute timer; every further
  entry by the same person restarts it; it fires at the latest 10 minutes
  after the first entry. One notification per person per burst.
- The person who logged does not get one. Entries logged for an assisted
  member (a child without a phone) count as the logging adult's burst.
- Opt-in **per device**, default off, switched on in Einstellungen (same
  row pattern as `#setLogart`). The permission prompt appears only on that
  tap — iOS requires a user gesture anyway.
- A later burst by the same person replaces their earlier notification
  (notification `tag` per person) instead of stacking.
- Tapping it opens Fairli on Verlauf.
- Deletions, edits and trash restores never notify. Only new entries and
  point increases from the 1-hour merge do.

Not in the first version: quiet hours, per-person muting, weekly summaries,
goal-reached notifications. The plumbing below supports them later.

### 3.2 The constraint: the server cannot read names

Chore and member names are end-to-end encrypted (`ENC_FIELDS`). A server
cannot write «Alex: Küche geputzt». Three ways around it:

- **A. Content-free notifications** («Neue Einträge in Fairli»). Simple and
  nearly useless.
- **B. The sending phone encrypts a summary** and the server relays it.
  Needs burst bookkeeping on every sender, a new write path, and does
  nothing for senders on old versions or future non-web writers (Siri).
- **C. The server sends a pointer; the receiving device fetches and
  decrypts.** The push carries only what the server already sees in
  cleartext (family row id, member id, timestamp, count, points). The
  receiver's service worker reads the matching log rows and decrypts them
  locally. **Chosen.**

C keeps the encryption promise exactly as it is today, works for entries
written by any client version, and reflects the 1-hour merge automatically.
Its cost is one small fetch on the receiving device; if that fails (no
network, key missing) the notification falls back to the generic text with
the points, which the server may know.

### 3.3 Architecture

```
tap ─► log row written (as today)
          │  Postgres trigger on log
          ▼
   push_outbox  (one row per family + person; notify_after = now + 3 min,
          │      capped at first_event_at + 10 min)
          │  Supabase Cron, every minute, only acts if rows are due
          ▼
   Edge Function "push-send"  ──►  Web Push to every subscription of the
          │                        family except the actor's own
          ▼
   receiving service worker: fetch rows since first_event_at ─► decrypt
          ─► showNotification
```

**New tables** (idempotent migrations, the usual `db-migrate` path):

- `push_subscriptions`: `device_id` (primary key, the existing
  `haushalt.device` id), `family_id`, `member_id`, `kind`
  (`webpush` now; `fcm`/`apns` later), `endpoint`, `p256dh`, `auth`,
  `updated_at`. Row Level Security like `devices`: insert, update and
  delete gated by the family write key (`fairli_write_ok`), **no select
  policy** — clients can never read each other's endpoints.
- `push_outbox`: `family_id`, `actor` (= `coalesce(logged_by, member_id)`),
  `first_event_at`, `notify_after`, `rows`, `points`. Written only by the
  trigger, read only by the Edge Function (service role). No client access.

**Trigger** on `log`, after insert or update: acts when the row is not
tombstoned (`deleted_at is null`) and it is an insert or `points` rose;
does nothing if the family has no subscriptions. It upserts the outbox row
and pushes `notify_after` forward within the cap.

**Sender:** a Supabase Edge Function (server-side TypeScript on Deno) using
the `web-push` library with VAPID keys (the standard key pair that
identifies a Web Push sender; private half stored as a function secret).
Subscriptions answering 404 or 410 are expired and get deleted. Supabase
Cron (pg_cron) calls the function once a minute only when due rows exist,
so an idle minute costs one SQL query.

**Payload**, well under the 4 KB limit, no personal content (a sketch —
confirm the exact placement of `mutable` and `data` against the W3C Push
API spec when building):

```json
{ "web_push": 8030,
  "mutable": true,
  "notification": {
    "title": "Fairli", "body": "+7",
    "navigate": "https://…/chores/",
    "data": { "f": "<family row id>", "a": "<member id>",
              "s": "<first_event_at>", "n": 2, "p": 7 } } }
```

The outer shape is "Declarative Web Push" (iOS 18.4+): iOS shows the
generic notification by itself and, because `mutable` is true, still lets
the service worker replace it with the decrypted one. Chrome ignores the
declarative part and runs the service worker as usual. Either way a
notification is always shown — both browsers penalise silent pushes, and
Safari revokes the subscription.

**Client changes:**

- `sw.js` gains `push` and `notificationclick` handlers (today: install,
  activate, fetch, message only).
- **The key must move where the service worker can read it.** Service
  workers cannot read `localStorage`, and today nothing uses IndexedDB. On
  enabling notifications the page stores, per family row id: the AES key as
  a non-extractable `CryptoKey`, and the write key header value. This is
  the project's first IndexedDB use; it holds nothing the origin's
  `localStorage` does not already imply. Disabling notifications deletes it.
- Subscribe/unsubscribe in Einstellungen; re-upsert the subscription from
  `deviceBeat()` so a changed `me` or a rotated endpoint heals daily.
- No translation work in the service worker: title is the person's name,
  body is chore names and a number.

**Android store app:** set `enableNotifications: true` in
`twa/twa-manifest.json`, add a monochrome notification icon, rebuild with
Bubblewrap 1.25 (targets Android 16, which Play now requires). Chrome then
hands notifications to the app, so they appear as Fairli's. To verify on a
real device: there are open reports of the permission dialog appearing as
Chrome's instead of Android's on first request.

**iOS, before any App Store app:** households that installed Fairli to the
home screen get the same notifications (iOS 16.4+). Not in a Safari tab.

### 3.4 Tests

- Trigger and debounce: SQL-level test in CI (burst of 5 rows → one outbox
  row; cap respected; tombstone and edit produce nothing).
- Service worker: Chromium can deliver a synthetic push through the
  DevTools protocol; tests cover decrypt-and-show, fetch failure →
  generic text, missing key → generic text, and that a famx household's
  payload contains no name material.
- Red-first as always: the tests are written against the current
  `sw.js` and must fail.

---

## 4. Voice logging

### 4.1 Behaviour

- A mic button on Aufgaben. Hold or tap to record, up to 20 seconds:
  «Ich habe die Küche geputzt und zweimal den Müll rausgebracht, und Sam
  hat gesaugt.»
- Fairli shows what it understood as a short list — matched tile, person,
  count, points — with one button «Buchen». Unmatched things appear as
  one-off entries with editable name and points.
- On confirm, each line goes through the existing `recordEntry()` funnel,
  so the 1-hour merge, sync, toast and the notification pipeline of §3
  apply unchanged.
- People: only the ones this device may log for (`allowedIds()`).

**First version always asks for confirmation.** Auto-booking with an undo
toast can follow once we have seen how often the list is right.

### 4.2 Architecture

```
MediaRecorder (audio, ≤ 20 s)
   + decrypted chore list (id, name, points) + allowed member names + language
        │   POST, with the family write key header
        ▼
Edge Function "voice-parse"  ──►  language model with audio input,
        │                          structured JSON output
        ▼
[{ chore_id | null, name, member_id, count, points }]  + transcript
        │
        ▼
confirmation sheet ─► recordEntry() per line
```

- **A proxy is unavoidable.** The app is public and static; a provider key
  cannot live in it. The Edge Function holds the key, checks the write key
  against the family (same rule as `fairli_write_ok`), enforces a
  per-family daily quota and a global cap, stores nothing and logs no
  content.
- **The endpoint takes audio or text.** Text makes the same parser usable
  from a typed box, a deep link (`/chores/?say=…`), Android's share sheet,
  and later Siri or Gemini — one parser, many entrances (§5).
- **Provider-neutral.** The function returns one fixed JSON shape; which
  model sits behind it is a secret and a few lines of code.
- **Flag:** `families.beta` is taken by the brand trial. Voice gets its own
  household flag (new column, e.g. `families.voice`), switched on by an
  admin after reading the privacy note, and tried in the maintainer's
  household first.

### 4.3 Privacy — said plainly

To match «Küche», the model must see the household's chore names, the
names of its people, and the voice recording. For an encrypted household
this is a real exception to "the server sees only ciphertext". The same
exception already exists for tile art (the image service sees tile names).

Therefore: off by default; an admin enables it per household with a clear
sentence about what leaves the device and to whom; a paid API tier only
(no training on the data); nothing stored by our proxy; `privacy.html` and
the Play data-safety form updated before release.

### 4.4 Which model

Cost is not the question — one utterance is about a tenth of a cent with
any candidate. Accuracy on Swiss German and the terms are.

| Candidate | Audio in + structured out | Price per minute of audio | Note |
|---|---|---|---|
| Google `gemini-3.5-flash-lite` | yes (to confirm in a spike) | ≈ $0.0006 | Terms forbid apps "likely to be accessed by individuals under 18"; paid tier mandatory in Switzerland/EU |
| Mistral `voxtral-small-2507` | yes, function calling | ≈ $0.004 | EU-hosted |
| OpenAI `gpt-4o-mini-transcribe` + a small text model | two steps | ≈ $0.003 | — |
| Anthropic Claude | no audio input | — | only as the text step |

The under-18 clause in the Gemini API terms matters for a family app and
needs a decision (§8). Nobody publishes Swiss German accuracy for these
models; the spike is ten real household recordings through the first two
candidates.

On-device recognition is not an option on the web yet: Chrome's on-device
speech and its built-in model are desktop-only. On iOS a native app could
do the whole thing on device (Apple's speech API plus the Foundation Models
framework, German supported, iPhone 15 Pro and newer) — an attractive
phase-4 option that removes the privacy exception for those phones.

---

## 5. Talking to the phone's assistant — what is possible today

| Route | State, October 2026 | For Fairli |
|---|---|---|
| Android **App Functions** (apps expose functions Gemini can call) | Android 16+, library in alpha; Gemini only calls them for trusted testers in a private preview | Register for early access; build when it opens. Needs native code in the Android project |
| Android **App Actions** (old Assistant shortcuts) | Gemini replaced Assistant on 28 Sep 2026 and ignores them | Dead end |
| Gemini **custom connectors** (Model Context Protocol) | US only, English, adults | Not usable in Switzerland |
| Android **share sheet → Fairli** | Works in a TWA through the web manifest's share target | Cheap interim entrance: share or dictate text into Fairli |
| iOS **App Shortcut** («Log in Fairli») with classic Siri | Works today, German included; Siri asks «Was hast du gemacht?» as a second step | Phase 4; needs Swift |
| iOS **Siri AI** (iOS 27) | Beta, English only, not on iPhones in the EU; available in Switzerland with English device language | Same App Intent serves it later |

One consequence for iOS: a Siri intent runs natively, without the web app.
It must derive the keys and write the encrypted row itself, so the
household secret has to live in the iOS Keychain, not only in the web
view. The notification extension (§6.2) needs the same. The text-accepting
`voice-parse` endpoint keeps that Swift code small.

---

## 6. The store apps themselves

### 6.1 Android — stay a Trusted Web Activity

| | TWA (keep) | Capacitor (native wrapper) |
|---|---|---|
| Notifications | Web Push, shown as Fairli's | Needs Firebase Cloud Messaging and a second server path |
| Stored household link | Shared with Chrome — existing installs keep working | New origin, every household re-links |
| Updates | Every web deploy is live at once | Bundled files; store release per change, or an extra live-update layer |
| Native code (App Functions) | Possible by adding Kotlin to the generated project | Yes |

Release 1.1.0 = new host and package id (§6.3), notifications on,
monochrome icon, Android 16 target. Native
code is added only when App Functions become callable.

### 6.2 iOS — a real project

What it takes:

- Apple Developer Program (USD 99 a year) and a Mac or cloud Mac for Xcode
  26 builds.
- **Capacitor 8** shell. Web Push does not exist inside an iOS app's web
  view, so push goes through Apple's push service: the app registers a
  device token, `push-send` gains a second sender (most likely via
  Firebase as relay — sending to Apple directly from Supabase's runtime is
  unverified), and a **Notification Service Extension** (a small Swift
  component iOS runs for about 30 seconds per push) does the fetch and
  decrypt of §3.2.
- The household secret in the Keychain, shared between app, extension and
  Siri intent. Getting it there: a Universal Link on the household URL
  (needs an `apple-app-site-association` file on the site root), QR scan,
  or paste. **Storage is not shared** with Safari or the home-screen PWA —
  every iOS user links once.
- An App Shortcut for Siri.
- Review risk: guideline 4.2 rejects repackaged websites. Decrypted push,
  Siri logging and offline use are the usual arguments that it is not one.
- **Open design question, to settle in a spike before committing:** how
  the web code gets into the app. Capacitor expects files bundled in the
  app; Fairli ships several web releases a week and assumes the `/chores/`
  path, its service worker and `404.html` routing. Bundling means a store
  update per release or a live-update layer; loading the live site is what
  Capacitor calls "not intended for production" and what reviewers like
  least. Not researched yet: Apple's exact position on live updates of web
  code.
- Paperwork: privacy manifest, privacy label, EU Digital Services Act
  trader declaration (a no-revenue hobby app may declare non-trader).

Until then, iOS households are served by the home-screen PWA, which gets
phases 1 and 2 in full.

### 6.3 The move to blueworld.li — before any store upload

**Decided 3 October 2026:** Fairli gets its own address on the maintainer's
domain. Proposed: **`fairli.blueworld.li`**, app at the root path.

Why a subdomain of its own and not `blueworld.li/fairli`: stored household
links, the service worker, push subscriptions, the Android asset-links
proof and iOS Universal Links are all scoped to the origin (scheme + host).
A dedicated host keeps Fairli's storage apart from the other blauewelt
apps, gives it its own `/.well-known/` (today the Android proof lives in a
different repo), and leaves the bare domain free — it currently forwards to
the earth app.

Why now: everything above binds to the address. Moving after launch would
drop every notification subscription and unlink every store install. Before
launch it costs each existing household one re-install of the home-screen
icon and nothing else — the data is on the server and the link carries the
key.

**How (proposal, to be detailed before building):**

- **Run both addresses in parallel; never hard-switch.** Pointing GitHub
  Pages' custom-domain setting at the new host would turn the old address
  into an HTTP redirect. Installed apps would then be stuck on their cached
  old version forever (a service worker refuses a redirected update), with
  their stored link unreachable. Instead the new address is served
  separately from the same `main` branch — the earlier "option D"
  (Cloudflare Pages) fits; to verify — and the old address stays alive.
- **The app must run under both `/chores/` and `/`.** `BASE` is already
  derived at runtime, but about 15 places in `index.html`, 7 in `sw.js`,
  plus `404.html`, `manifest.json` and the tests hardcode `/chores/`.
- **The old address becomes a forwarder that carries the household along.**
  A release on the old origin reads the stored route and sends the device
  to the same route on the new host, where it is saved again; the user is
  then asked to install the icon from there. Stays in place for months.
  Shared links and QR codes (`/fairli/…` alias repo, `/chores/f/…`) keep
  working through the same forwarder.
- **Android package name:** nothing is uploaded yet, so the permanent
  package id can still follow the domain: `li.blueworld.fairli` instead of
  `io.github.blauewelt.fairli`. The asset-links file moves to
  `fairli.blueworld.li/.well-known/` inside this repo.
- Supabase needs no change (no origin restriction on the publishable key —
  to confirm).

Needed from the maintainer: confirm the host name, and one DNS record for
it at the domain's registrar (the name servers are Infomaniak's).

---

## 7. Next steps

**Phase 0 — maintainer**

1. Answer the decisions in §8.
2. Play developer account (USD 25, identity verification can take days).
   The upload itself waits for phase 0b.
3. Register for the App Functions early-access programme (free, no
   commitment).

**Phase 0b — the move, then the Play test**

1. Detailed migration plan and tests for §6.3; app runs under both paths.
2. New address live in parallel; forwarder release on the old one;
   maintainer's household moves first.
3. Android bundle 1.1.0 built against the new host, new package id,
   notifications enabled in the shell, Android 16 target. Upload to closed
   testing, 12 testers, 14 days. Add Google's app-signing fingerprint to
   the asset-links file.

**Phase 1 — notifications** (one intent-board claim: `push`)

1. Migration: `push_subscriptions`, `push_outbox`, trigger, cron job.
   First use of `supabase/functions/` and of function secrets in this repo
   — add the deploy step to CI and document it in DEVELOPER_ONBOARDING §4.
2. Edge Function `push-send` + VAPID key pair (private key never in the
   repo).
3. Client: IndexedDB key store, subscribe toggle, `sw.js` handlers, tests
   red-first.
4. Roll out behind the toggle (default off), maintainer's household first.
5. TWA 1.1.0 build; verify the permission dialog on a real Android device.

**Phase 2 — voice**

1. Spike: ten real recordings through two models; pick one.
2. Edge Function `voice-parse` with quota; `families.voice` flag.
3. Client: mic button, confirmation sheet, privacy sentence, translations
   for the new strings (19 files), tests.
4. Share target and `?say=` deep link.

**Phase 4 — iOS**, only after a go: spike the bundling question, then
shell → Keychain linking → push extension → Siri shortcut → review.

## 8. Decisions needed

1. **Notification defaults.** Proposed: opt-in per device, 3-minute
   debounce capped at 10, names and chores in the text.
2. **Voice provider and the under-18 clause.** Proposed: provider-neutral
   proxy, decide after the spike; if Gemini wins, either restrict the mic
   to households whose admin confirms adult use or go through Google Cloud
   terms instead.
3. **iOS go/no-go.** USD 99 a year, a Mac build path, review risk, and the
   largest piece of work in this document. Proposed: decide after phases 1
   and 2 are live — they are what makes the app defensible in review.
4. ~~Domain~~ — decided: move to `blueworld.li` (§6.3). Open: confirm the
   host name `fairli.blueworld.li` and the package id `li.blueworld.fairli`.
5. ~~Play Console status~~ — answered: no test started yet.

## 9. Sources

Checked 3 October 2026. Items marked unverified in the text: Swiss German
accuracy of any model; structured output together with audio on
`gemini-3.5-flash-lite`; direct Apple push from Supabase's runtime; Play
reviewers' view of Web Push in a TWA; Apple's position on live web-code
updates.

- [Bubblewrap (TWA build tool)](https://github.com/GoogleChromeLabs/bubblewrap)
- [android-browser-helper: notification delegation](https://github.com/GoogleChrome/android-browser-helper)
- [Open issue: permission dialog shown as Chrome's](https://github.com/GoogleChrome/android-browser-helper/issues/563)
- [Play: testing requirement for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Play: target API level](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [Android App Functions overview](https://developer.android.com/ai/appfunctions)
- [Gemini replaces Assistant, 28 Sep 2026](https://9to5google.com/2026/09/28/google-assistant-gemini-android/)
- [Gemini custom connected apps](https://support.google.com/gemini/answer/17209137?hl=en&co=GENIE.Platform%3DAndroid)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [WebKit: Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)
- [W3C Push API](https://w3c.github.io/push-api/)
- [Apple forums: no Web Push in WKWebView](https://developer.apple.com/forums/thread/760767)
- [Apple: modifying newly delivered notifications](https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications)
- [Apple: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple forums: text parameters in App Shortcut phrases](https://developer.apple.com/forums/thread/778519)
- [Apple: Siri AI delayed in the EU](https://www.apple.com/newsroom/2026/06/due-to-dma-siri-ai-delayed-in-eu-for-ios-27-and-ipados-27/)
- [Apple: Foundation Models framework](https://www.apple.com/newsroom/2025/09/apples-foundation-models-framework-unlocks-new-intelligent-app-experiences/)
- [Apple: EU Digital Services Act trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
- [Capacitor config (server.url warning)](https://capacitorjs.com/docs/config)
- [Capacitor push notifications](https://capacitorjs.com/docs/apis/push-notifications)
- [Capacitor storage guide](https://capacitorjs.com/docs/guides/storage)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase push example](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/functions/examples/push-notifications.mdx)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API audio understanding](https://ai.google.dev/gemini-api/docs/audio)
- [Gemini API terms](https://ai.google.dev/gemini-api/terms)
- [Mistral Voxtral Small](https://docs.mistral.ai/models/voxtral-small-25-07)
- [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create.md)
