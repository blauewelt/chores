# Fairli — Tier 2 test strategy (emulators & real devices)

Tier 1 (Playwright, `tests/`) covers the web layer. Tier 2 covers what
exists ONLY on an (emulated) operating system: home-screen install, icon
launch, standalone mode, browser↔OS handoffs. Trigger for this strategy:
two field failures (one member, Noel) whose causes lay — and lie — in
exactly this layer.

## What emulators can do — and what they cannot (honest limits)

| Capability | iOS Simulator | Android Emulator |
|---|---|---|
| Safari/Chrome with a real engine | ✓ | ✓ |
| Open deep link (`simctl openurl` / `adb am start -d`) | ✓ | ✓ |
| Automate «Zum Home-Bildschirm» (add to home screen) | ✓ (XCUITest/Appium: share sheet + Springboard) | ✓ (UiAutomator: Chrome menu) |
| Launch web clip/shortcut from the home screen | ✓ | ✓ |
| WebAPK minting (real Android PWA) | — | ⚠ Play Store images only, flaky |
| Camera / real QR scan | ✗ (no camera stack) | ✗ (virtual scene only) |
| iOS Link Tracking Protection realistically | ⚠ partly (no Mail/Messages context) | n/a |

Camera scanning stays untestable in principle → the faithful equivalent is
"open the decoded URL" (QR byte exactness is proven by an ECC round trip,
see LOG 2026-07-11). Real LTP/WebAPK behaviour needs real devices
(Tier 2b).

## Scenarios (in priority order)

All scenarios run against ONE fixed, dedicated test household in the
production DB (`fam-e2e-fairli01`, member «Testperson», slug
`e2etest0001`) — never against Fanti WG. The household was created ONCE
and is only reused; the runs are strictly READING (open links, assert the
view — taps only go to browser dialogs/Springboard, never to app elements
that would write). NOTHING is created per run, so there is nothing to
clean up either. An automatic "reset via REST in the workflow setup" was
planned but has NEVER been implemented — this line here replaces the
earlier false claim.

MAINTENANCE NOTE: the family link is (deliberately) in the public repo —
anyone could open the test household and e.g. rename it; then the
assertions break («Testperson»). Restore WITHOUT deleting: in the app,
via the family link, reset the household name or rename the member back
to «Testperson» (upsert semantics; delete nothing — standing rule). No
automation, deliberately: a reset script with write permissions would be
more risk than the rare manual step is worth.

- **S1 — scan equivalent iOS:** `xcrun simctl openurl booted <PERSONAL_URL>`
  → Safari → assertion: locked view («Testperson» visible, no
  «Personen» button). Covers: handoff chain end-to-end on real WebKit
  including HTTP 404 behaviour.
- **S2 — iOS install:** Appium (XCUITest): share sheet → «Zum
  Home-Bildschirm» → Add → tap the Springboard icon «Fairli» →
  assertion: locked view AND `Modus: standalone` NOT on the entry
  screen. Covers: web-clip URL capture (our oldest bug).
- **S3 — stale-icon trap (Noel scenario):** deliberately add the web clip
  from the ENTRY SCREEN → launch the icon → assertion: diagnostics show
  `Modus: standalone (Homescreen-Icon!)`. Documents the trap and
  verifies that the diagnostics name it.
- **S4 — Android Chrome:** `adb shell am start -a android.intent.action.VIEW
  -d <PERSONAL_URL>` → UiAutomator dump → assertion «Testperson». Then
  Chrome menu → «Zum Startbildschirm» → launch the icon → assert the view.
  (Shortcut path, deterministic; for WebAPK see S5.)
- **S5 — WebAPK (best effort):** Play Store image, install the family
  link, launch the icon. Mark as `continue-on-error` — minting on
  emulators is known to be flaky; red runs here block nothing, green
  ones are signal.

## Infrastructure

- **iOS (S1–S3):** GitHub Actions `macos-14` runner (free for public
  repos). `xcrun simctl` for booting/openurl; Appium with the XCUITest
  driver for share sheet/Springboard. Two simulator versions (current
  iOS + predecessor), because LTP behaviour changes between versions.
- **Android (S4–S5):** `ubuntu-latest` + `reactivecircus/android-emulator-runner`;
  S4 with the `google_apis` image, S5 with `google_apis_playstore`.
- **Trigger:** `workflow_dispatch` + nightly `schedule` — NOT per push
  (10–20 min runtime, flakiness risk; Tier 1 remains the push gate).
- **Artifacts:** upload screenshots + UiAutomator dumps/simulator logs on
  every run — field failures are best compared against a known-good
  reference image.

## Tier 2b — real devices (before «production»)

BrowserStack App Live / AWS Device Farm with real iPhones/Pixels:
BrowserStack has a free open-source plan (application with a repo link).
Additionally there: real camera scan (manual, documented script), real
LTP in Mail/Messages (send the link via iMessage!), real WebAPK minting.
Frequency: before releases, not nightly.

## Status (11.07.2026)

- **S4 GREEN** (run 2): real Chrome, emulator api-34, full production
  handoff, UiAutomator assertion. Learned: the emulator-runner executes
  `script:` line by line via `sh -c` → the scenario lives in
  `scripts/tier2-s4.sh`.
- **S1 implemented** (OCR assertion via tesseract): run 1 proved the full
  chain in real iOS Safari (members view rendered), it only failed on an
  OCR-unsuitable assertion (small chip text) → switched to the large
  title. Runtime ~18 min (macos-14, brew tesseract).
- Both nightly (03:07/03:17 UTC) + workflow_dispatch.
- **S3 pulled forward into Tier 1** (12 tests): stale-icon trap as a
  Playwright test via a `navigator.standalone` shim — standalone + a bare
  index.html ⇒ diagnostics show «Homescreen-Icon!»; plus the counter-case
  (healthy admin icon ⇒ family-first restore). Runs per push on both
  engines. The REAL Springboard web-clip scenario (S2/S3 via Appium)
  remains the next Tier 2 expansion. Learned: CDP display-mode emulation
  does not take effect in the headless shell; the navigator signal is the
  right test object (it is what the app checks).
- Diagnostic value cashed in immediately: the chain that the child's
  phone fails on works on clean devices of both platforms — supports the
  stale-icon hypothesis.

### S2/S3 on the real simulator: web-clip injection (implemented)

Workflow `tier2-ios-webclip.yml` (nightly 03:27 UTC + dispatch), approach
WITHOUT Appium: web clips on the simulator are plain files
(`data/Library/WebClips/<Name>.webclip/Info.plist` with Title/URL/FullScreen).
The workflow injects two clips while the simulator is shut down, boots,
taps the Springboard icons via `idb ui tap` (search by AXLabel,
`scripts/idb-find-tap.py`, defensively parsed, swipes further if needed)
and checks via screenshot OCR:
- **S3a «FairliOK»** (personal E2E URL): expects the members view.
- **S3b «FairliStale»** (bare index.html — the child's-phone trap):
  expects the entry screen; the mode diagnostics via OCR are a bonus
  (10.5px possibly too small).
What is tested is the LAUNCH semantics of installed icons (URL baked in,
FullScreen).

**Status: S3a + S3b GREEN (run 3, 11.07.).** The S3a screenshot shows the
members view WITHOUT the Safari URL bar ⇒ FullScreen/standalone works.
S3b reproduces the child's-phone stale-icon trap nightly on real iOS.
Runner drift lessons (14.07., first nightly failure): (0) The macOS
runner image is drifting under us — symptoms: freshly booted sims now
show a LOCK SCREEN (large clock in describe-all = the signal; fix:
swipe up + HOME before the first icon tap), and iOS 18.x Springboards
IGNORE filesystem-injected web clips (plists survive on disk, icons
never appear). Fix: pin your own device to iOS 17.x via `simctl create`
instead of a regex over runner defaults. If 17.x drops out of the
images: rework clip creation onto the capture flow (share sheet) — that
works on every runtime. Iteration lessons: (1) newer Homebrew requires
`brew trust facebook/fb` for third-party taps; (2) fb-idb is
incompatible with brew Python 3.14 (asyncio.get_event_loop removed) →
use the system Python: `/usr/bin/python3 -m pip install --user fb-idb`,
USERBIN in GITHUB_PATH. (3) The mode diagnostics line (10.5px) is too
small for OCR — base assertions on large UI elements. **Capture
semantics test (tier2-ios-capture.yml, 12.07., dispatch):** checks the
maintainer hypothesis ("when adding, only the base URL gets baked in")
EMPIRICALLY: a real share flow in Safari (idb: Share → Add to Home
Screen → Add, `scripts/idb-share-flow.py` with sheet scrolling), after
which the truth is read directly out of the generated web clip
(`data/Library/WebClips/*.webclip/Info.plist`, field URL) — no OCR, no
interpretation. The result is in the log under «EINGEBACKENE URL».
Share-sheet CAPTURE ("does iOS bake in the current URL when adding?")
remains the last open expansion — it needs UI automation of the share
dialog (idb taps on the Safari UI, or Appium).

### Share-sheet capture (core of S2): COMPLETED, nightly

`tier2-ios-capture.yml` (03:37 UTC): real share flow (coordinate tap
Share → OCR tap «Add to Home Screen» → OCR tap «Add», word-exact/top
right) → reads the plist of the freshly generated web clip. 13.07.: bug
proven by ground truth (URL => index.html despite a deep link in Safari;
cause: the static manifest is registered at parse time, removing it via
JS has no effect) and fix v4.20.0 verified (URL => full family path).
Lessons: tesseract lines merge navbars → exact matches WORD by word, top
right wins; HOMEBREW_NO_AUTO_UPDATE=1 saves ~10 min; screenshot→OCR→tap
is our standard mechanism for system UI that the accessibility tree does
not expose.

## Implementation order

1. S4 (Android Chrome deep link) — least effort, immediate value.
2. S1 (iOS openurl) — the entry point to the macOS runner, still without
   Appium.
3. S2/S3 (Appium + Springboard) — the actual win, but the most
   maintenance; only build it once S1 runs stably.
4. S5 + Tier 2b before any real production claim.

Carry over the principle from Tier 1: every scenario references the real
incident it prevents. No scenario without a story.

## Limit: Chrome on iOS (status 14.07.2026, v4.20.1)

The Chrome-on-iOS install flow is NOT Tier 2 automatable — actively
verified on 14.07.: chromium-browser-snapshots contains no iOS artifacts
(bucket listing empty), Chrome for Testing knows no iOS, App Store IPAs
are FairPlay-encrypted (the simulator refuses them), a Chromium source
build takes 7–9 h / ~120 GB and blows past the 6 h job limit. Possible
proxy: Firefox iOS from source (~30 min build, same system share sheet
since 16.4) — an experimental run is needed, since the «Zum
Home-Bildschirm» action depends on the web-browser entitlement. Coverage
instead in three stages:
1. Tier 1 pins the CriOS UA profile (no manifest, handoff, instructions)
   and the wording of the instructions (Chrome allowed, no bare
   «Teilen»).
2. Mechanical equivalence: since iOS 16.4 all browsers use the same
   system share sheet/web clip as Safari (S2/S3 cover the mechanics).
3. A manual device test (or Tier 2b/BrowserStack real device) remains
   open — see DEVELOPER_ONBOARDING §12.
