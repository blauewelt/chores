# LOG.md — Change history

All work on the Haushalt app, newest first. Maintained by Claude.

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
