# PROMPT.md — Rossi WG App Specification

> Living spec for the "Rossi WG" chores PWA at https://blauewelt.github.io/chores/.
> Maintained by Claude; updated with every change to the app. Last updated: 2026-06-10 (v3.2).

## Concept

A household chores tracker built on **volunteering, not assignment**. Chores are
standing buttons with a point value. Whoever does a chore presses its button and
earns the points. A scoreboard ranks household members. The incentive replaces
the rota.

## Platform

- Progressive Web App (single `index.html`, vanilla JS, no build step)
- Hosted on GitHub Pages from `blauewelt/chores`, branch `main`, root
- Installable on Android via Chrome ("Zum Startbildschirm hinzufügen")
- Offline-capable via service worker (`sw.js`, cache-first app shell)
- UI language: German (de-CH date/time formats)

## Data model

```
members: { id, name, color }
chores:  { id, name, points }            // points: 0–15 via slider, editable by anyone
log:     { id, chore_id, chore_name,     // names denormalized so history survives deletions
           member_id, member_name,
           points, done_at }             // append-only; undo = delete entry
```

## Points design decision

Each chore has **one point value**, set by whoever creates it and editable by
anyone — chosen over per-member estimation (max/average) for simplicity.
Average-of-estimates is a possible v3 if the household wants negotiation
mechanics.

## Features (v2.1)

- **Aufgaben** tab: grid of chore buttons showing name and `+N` points; tap to
  log a completion for the active person; ✎ to edit/delete; FAB to add
- **Sheet UX:** action buttons (Abbrechen/Speichern/Fertig) live in a top bar
  so the soft keyboard never covers them; points use a 0–15 slider (no
  keyboard); delete is a full-width danger button at the sheet bottom. When
  editing, the name is static text behind an "✎ Ändern" button so the keyboard
  never opens unless renaming; new chores show the input directly.
- **"Ich bin"** selector: per-device active person (localStorage, not synced)
- **Punkte** tab: scoreboard with totals and completion counts; periods
  "Diese Woche" (Monday start) and "Gesamt"; 👑 for the leader; bars scaled to max
- **Verlauf** tab: reverse-chronological log with undo (↩︎)
- **Personen** sheet: add/rename/recolor/remove members (min. 1); removing a
  person keeps their logged points
- Double-tap protection (600 ms lock), toast feedback (`+N für X`)

## Sync

- **Backend:** Supabase (free tier), three tables per `supabase-setup.sql`
  (RLS enabled with open policies — household-trust security model;
  the anon key + obscure URL are the only gate)
- **Config:** project URL + publishable key are **hardcoded** (`DEFAULT_SYNC`
  in index.html) so all devices sync with zero setup — a deliberate trade-off:
  the key is public in the repo, gating only trivially sensitive data. The
  in-app Sync sheet can override per device; "Trennen" is an explicit opt-out.
- **Seeding:** if a pull finds an empty backend (no members), the device
  uploads its local state via upsert instead of adopting the empty remote.
- **Strategy:** optimistic local writes pushed via Supabase REST
  (`POST`/`PATCH`/`DELETE`); full pull on app load, on visibility change, and
  **every 20 s while visible** (polling, no websockets). Last-write-wins; no
  offline queue. Member edits upsert via `Prefer: resolution=merge-duplicates`.
- **First device** to connect with an empty backend uploads its local state as
  the seed; later devices adopt the remote state.
- Sync status dot in header: grey = local only, green = connected,
  red = last sync failed.

## Visual design

- **Dark theme** (v3.0): background `#141A17`, cards `#1D2521`, text `#EAF1EB`,
  mint accent `#52C08A`; gradient wordmark "Rossi WG"
- **Per-chore colors:** each chore's hue is derived deterministically from its
  id (djb2-style hash into a 10-color vivid palette) — identical on every
  device, no schema change, no user step. Tiles tint face, border, shadow,
  watermark, and points pill via `color-mix` with a per-tile `--c` variable.
- Type: Bricolage Grotesque (display, via Google Fonts) + system stack (body)
- **Signature element:** chore tiles styled as physical pressable keys —
  gradient face, hard 6px drop shadow compressing on :active, oversized point
  watermark; ≥10-point chores get a ★ before their points
- Type scale: body 17px, h1 34px, tile names 18px, score numbers 34px
- Bottom sheets (`<dialog>`), pill chips, FAB; respects `prefers-reduced-motion`

## Constraints & conventions

- No frameworks, no build step, no browser-storage APIs beyond localStorage
- All user text rendered via `textContent`/escaping (no HTML injection)
- Service worker cache name **must be bumped** (`haushalt-vN`) on every
  `index.html` change, or installed clients won't update
- Direct quotes of user data never exceed the structures above; no PII beyond
  first names and colors

## Deployment

Push to `main` → GitHub Pages auto-deploys. Installed PWAs pick up changes
after the service worker updates (close/reopen the app, possibly twice).

## Backlog / ideas

- Per-member point estimation (max or average) instead of single value
- Weekly summary / streaks; "Wochensieger" history
- Supabase Realtime (websockets) instead of polling
- Offline write queue with replay
