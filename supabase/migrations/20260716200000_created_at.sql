-- Zeitstempel für Forensik & «Nach Erstellung»-Sortierung (v4.33.0).
-- Bestehende Zeilen erhalten den Zeitpunkt DIESER Migration (kein echter
-- Erstellungszeitpunkt rekonstruierbar) — die App bricht Gleichstände
-- deshalb alphabetisch. Neue Zeilen bekommen echte Zeitstempel.
alter table chores  add column if not exists created_at timestamptz not null default now();
alter table members add column if not exists created_at timestamptz not null default now();
alter table log     add column if not exists created_at timestamptz not null default now();
alter table chores  add column if not exists updated_at timestamptz;
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists chores_touch on chores;
create trigger chores_touch before update on chores
  for each row execute function touch_updated_at();
