-- Household display names, keyed by family slug
create table if not exists families (
  family_id text primary key,
  name text not null default 'Haushalt',
  created_at timestamptz not null default now()
);
-- Backfill des Bestands-Haushalts: WURDE mit der echten ID out-of-band
-- ausgefuehrt (12.06.2026, angewandt). Familien-IDs sind Zugangs-URLs
-- und gehoeren NIE ins Repo — die urspruengliche Zeile stand hier bis
-- 17.07.2026 und gilt als exponiert (siehe LOG v4.46.3).
insert into families (family_id, name) values ('PLACEHOLDER-nie-ausfuehren', 'Beispiel')
  on conflict (family_id) do nothing;
