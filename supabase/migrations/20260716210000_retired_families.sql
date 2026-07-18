-- Grabstein für migrierte Familien (v4.33.2): Nach fam→famc-Migration darf
-- KEIN Client mehr Klartext-Zeilen unter der alten ID einfügen — auch nicht
-- ein veralteter Cache-Stand, der die Client-Guards von v4.33.1 nicht hat.
-- (Der SW liefert nach langem Schlaf IMMER einmal die alte Version aus —
-- clientseitig ist dieses Fenster prinzipiell nicht schliessbar.)
create table if not exists retired_families (
  family_id text primary key,
  retired_at timestamptz not null default now()
);
alter table retired_families enable row level security;
drop policy if exists "open_retired_select" on retired_families;
create policy "open_retired_select" on retired_families for select using (true);
drop policy if exists "open_retired_insert" on retired_families;
create policy "open_retired_insert" on retired_families for insert with check (true);
-- kein UPDATE/DELETE-Policy: Grabsteine sind endgültig (mit dem publishable key)

-- RESTRIKTIV: Einfügen unter beerdigter family_id wird abgelehnt —
-- unabhängig von den bestehenden offenen Policies (AND-Verknüpfung).
drop policy if exists "no_resurrect_members" on members;
create policy "no_resurrect_members" on members as restrictive for insert
  with check (family_id not in (select family_id from retired_families));
drop policy if exists "no_resurrect_chores" on chores;
create policy "no_resurrect_chores" on chores as restrictive for insert
  with check (family_id not in (select family_id from retired_families));
drop policy if exists "no_resurrect_log" on log;
create policy "no_resurrect_log" on log as restrictive for insert
  with check (family_id not in (select family_id from retired_families));
