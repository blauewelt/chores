# Fairli — What's New

**Versions 4.18 – 4.25.1** · 11–14 July 2026

A busy week. The biggest piece was invisible — a stubborn bug in setting up the
app icon, finally tracked down and fixed. Alongside it came a number of
improvements that make everyday use noticeably nicer, many of them straight from
your feedback.

---

## 🏠 The app icon now works reliably

For weeks, some of you ended up on the start page ("Create new household")
instead of in your household when opening the Fairli icon. The cause has been
found and fixed:

- **When adding to the home screen,** the correct address is now guaranteed to
  be saved. Previously, in certain cases, iPhone only saved the "empty" start
  page — hence the confusion.
- **Older, broken icons heal themselves:** just open and tap your invitation
  link once — from then on, that exact icon works permanently.
- **If you do land on the start page,** the app now tells you directly what to do
  (delete the old icon, open the link) instead of letting you accidentally
  create a new household.

## 📲 Easier to install & invite

- **New prompt bar** at the top: anyone opening an invitation link immediately
  sees "Add as an app to the home screen" — no digging through menus. Dismiss it
  once and it stays gone.
- **On Android it's one tap:** tapping "Install now" opens the system dialog —
  done. (On iPhone, Apple only allows this manually — there the app guides you
  step by step.)
- The install instructions now show **only your own device** — no confusing
  Pixel steps on an iPhone, and vice versa.
- **"Share" is now called "Invite".** Fairli's button had the same name as
  Apple's own Share button — which caused mix-ups during installation. Now it's
  clearly separated what belongs to Fairli and what belongs to the browser.
- The invitation link now opens cleanly in Safari **and** Chrome (it previously
  said, incorrectly, "not in Chrome").

## ✅ Logging tasks — more flexible

- **"One-off" tile** (always top left): done something that doesn't need its own
  permanent tile? Log it once, without filling the screen with tiles.
- **When creating a task,** "Save + log" is now the main button — the task is
  created **and** logged right away. Just want the tile? That's "Save only".
- **The "+" is context-aware:** in the history it opens "Log one-off" instead of
  creating an invisible tile.

## 📜 History — tidier and correctable

- **Runs are grouped:** three "Groceries" entries in a row now appear as a single
  line, "Groceries ×3", with the points added up — instead of three separate
  entries. (Handy: instead of a "big" and a "small" tile, just tap the same tile
  several times.)
- **Edit entries:** title, note **and time** can be changed afterwards. For a
  run, changing the time shifts all entries together. Editing never changes the
  associated tile.
- **Deleted by accident? "Undo".** After deleting, an "Undo" button appears for
  five seconds — no entry gets lost to a mistap anymore.
- **Larger menu items:** the "⋯" menus are bigger and "Delete" is clearly set
  apart — so you don't hit it by accident.

## ✨ Small things

- The household name at the top is slightly larger.
- More consistent controls across all dialogs: close always with "×" at the top
  right, main action always as a large button at the bottom.
- The "one-off" tile now has its own picture too.
- Various flicker and display improvements when opening personal links.

---

## 🛠 Under the hood (for the curious)

- **Automated tests:** Fairli now has a two-tier test pyramid — every change runs
  50 regression tests (in Chrome **and** Safari), plus nightly tests on real
  iPhone and Android simulators. Each test corresponds to a bug that happened
  exactly once and shouldn't come back.
- The icon bug above wasn't guessed but **proven**: an automated test read out
  directly which address iPhone saves when installing — the wrong one before the
  fix, the right one after.

*Thanks for testing and for your feedback — a large part of this week came
straight from it.*
