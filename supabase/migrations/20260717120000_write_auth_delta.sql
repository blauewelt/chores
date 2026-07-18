-- Chokepoints 1+2 (v4.36.0):
-- (1) updated_at auf log/members — Grundlage fuer Delta-Sync (Egress-Diaet)
-- (2) Schreib-Authentifizierung pro Familie: Clients verschluesselter
--     Familien senden einen abgeleiteten Write-Key (HKDF, info 'write-key-v1'
--     — NICHT das Link-Geheimnis selbst); die DB speichert nur dessen
--     SHA-256. Familien OHNE write_key_hash bleiben offen wie bisher
--     (Versions-Schnitt-Philosophie: Alt-Clients nicht aussperrbar).
alter table log     add column if not exists updated_at timestamptz;
alter table members add column if not exists updated_at timestamptz;
drop trigger if exists log_touch on log;
create trigger log_touch before update on log
  for each row execute function touch_updated_at();
drop trigger if exists members_touch on members;
create trigger members_touch before update on members
  for each row execute function touch_updated_at();

create extension if not exists pgcrypto;
alter table families add column if not exists write_key_hash text;

create or replace function fairli_write_ok(fam text) returns boolean
language sql stable as $$
  select coalesce(
    (select f.write_key_hash is null
         or f.write_key_hash = encode(digest(
              coalesce(current_setting('request.headers', true)::json->>'x-fairli-key', ''),
              'sha256'), 'hex')
       from families f where f.family_id = fam),
    true)  -- keine families-Zeile (Erst-Upload): offen
$$;

-- RESTRIKTIV (UND-verknuepft mit den offenen Policies):
drop policy if exists "auth_ins_members" on members;
create policy "auth_ins_members" on members as restrictive for insert with check (fairli_write_ok(family_id));
drop policy if exists "auth_upd_members" on members;
create policy "auth_upd_members" on members as restrictive for update using (fairli_write_ok(family_id));
drop policy if exists "auth_del_members" on members;
create policy "auth_del_members" on members as restrictive for delete using (fairli_write_ok(family_id));

drop policy if exists "auth_ins_chores" on chores;
create policy "auth_ins_chores" on chores as restrictive for insert with check (fairli_write_ok(family_id));
drop policy if exists "auth_upd_chores" on chores;
create policy "auth_upd_chores" on chores as restrictive for update using (fairli_write_ok(family_id));
drop policy if exists "auth_del_chores" on chores;
create policy "auth_del_chores" on chores as restrictive for delete using (fairli_write_ok(family_id));

drop policy if exists "auth_ins_log" on log;
create policy "auth_ins_log" on log as restrictive for insert with check (fairli_write_ok(family_id));
drop policy if exists "auth_upd_log" on log;
create policy "auth_upd_log" on log as restrictive for update using (fairli_write_ok(family_id));
drop policy if exists "auth_del_log" on log;
create policy "auth_del_log" on log as restrictive for delete using (fairli_write_ok(family_id));

-- families-Zeile selbst: Aendern/Loeschen nur mit Key (Anlegen bleibt offen)
drop policy if exists "auth_upd_families" on families;
create policy "auth_upd_families" on families as restrictive for update using (fairli_write_ok(family_id));
drop policy if exists "auth_del_families" on families;
create policy "auth_del_families" on families as restrictive for delete using (fairli_write_ok(family_id));
