-- Haushalt-App: einmalig im Supabase SQL-Editor ausführen
create table if not exists members (
  id text primary key, name text not null, color text not null
);
create table if not exists chores (
  id text primary key, name text not null, points int not null default 1
);
create table if not exists log (
  id text primary key,
  chore_id text, chore_name text not null,
  member_id text, member_name text not null,
  points int not null,
  done_at timestamptz not null default now()
);
alter table members enable row level security;
alter table chores  enable row level security;
alter table log     enable row level security;
create policy "open_members" on members for all using (true) with check (true);
create policy "open_chores"  on chores  for all using (true) with check (true);
create policy "open_log"     on log     for all using (true) with check (true);
