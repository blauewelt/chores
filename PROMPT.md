# PROMPT.md — Haushalt App Specification

> Living spec for the "Haushalt" chores PWA at https://blauewelt.github.io/chores/.
> Maintained by Claude; updated with every change to the app. Last updated: 2026-06-09 (v2.1).

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
chores:  { id, name, points }            // points: 1–100, set at creation, editable by anyone
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
- **Config:** in-app Sync sheet; project URL + anon key stored per device in
  localStorage. No keys in the repo. App works purely locally if unconfigured.
- **Strategy:** optimistic local writes pushed via Supabase REST
  (`POST`/`PATCH`/`DELETE`); full pull on app load, on visibility change, and
  **every 20 s while visible** (polling, no websockets). Last-write-wins; no
  offline queue. Member edits upsert via `Prefer: resolution=merge-duplicates`.
- **First device** to connect with an empty backend uploads its local state as
  the seed; later devices adopt the remote state.
- Sync status dot in header: grey = local only, green = connected,
  red = last sync failed.

## Visual design

- Palette: sage-tinted background `#F1F3EF`, ink `#21302A`, spruce `#2F6B4F`
  (primary), gold `#B8860B`, red `#B23A2E` (errors/danger)
- Type: Bricolage Grotesque (display, via Google Fonts) + system stack (body)
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
