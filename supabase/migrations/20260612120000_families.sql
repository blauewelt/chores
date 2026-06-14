-- Household display names, keyed by family slug
create table if not exists families (
  family_id text primary key,
  name text not null default 'Haushalt',
  created_at timestamptz not null default now()
);
-- Backfill the Rossi household name
insert into families (family_id, name) values ('rossi-4zbnalj41l', 'Rossi WG')
  on conflict (family_id) do nothing;
