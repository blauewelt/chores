-- Fairli — GDPR v4.64: schließt die weltweit lesbare Datenbank.
-- =====================================================================
-- BEFORE: "open_*" SELECT-Policies (using(true)) erlauben JEDEM mit dem
--   publishable key, ALLE Zeilen ALLER Haushalte zu lesen (Enumeration).
-- AFTER:  Lesen von members/chores/log ist an denselben Familien-Schlüssel
--   gebunden, der Schreibzugriff bereits absichert (fairli_write_ok /
--   Header 'x-fairli-key'). Verschlüsselte Haushalte (mit write_key_hash)
--   sind damit NICHT mehr ohne Schlüssel lesbar.
--
-- WICHTIG — Reihenfolge des Rollouts (sonst brechen Lesezugriffe!):
--   1) ZUERST den gepatchten Client deployen (sendet 'x-fairli-key' auch
--      auf GET). Unter der alten Policy ist das folgenlos.
--   2) Ein paar Tage Verbreitung abwarten (famx-Clients laden den frischen
--      Client ohnehin per Link→Netz).
--   3) DANN dieses Skript im Supabase SQL-Editor ausführen.
--   Rollback: siehe unten (open_* wiederherstellen).
--
-- Designtreue: verschlüsselte Haushalte werden geschützt; Alt-Haushalte
-- OHNE write_key_hash bleiben lesbar wie bisher (die "Versions-Schnitt"-
-- Philosophie — Alt-Clients sind nicht koordiniert aktualisierbar). Alt-
-- Klartext-Haushalte gehören RETIRED/MIGRIERT (separates Skript), da RLS
-- sie nicht rückwirkend schützen kann, ohne ihre Clients auszusperren.
-- =====================================================================

-- Lese-Prüfung: teilt exakt die Logik von fairli_write_ok.
--   - keine families-Zeile         -> true  (Erst-Upload/Altbestand: offen)
--   - write_key_hash IS NULL       -> true  (Alt-Haushalt: unverändert)
--   - write_key_hash == sha256(hdr)-> true  (verschlüsselt + korrekter Key)
--   - sonst                        -> false (kein/falscher Key: gesperrt)
create or replace function fairli_read_ok(fam text) returns boolean
language sql stable as $$
  select coalesce(
    (select f.write_key_hash is null
         or f.write_key_hash = encode(digest(
              coalesce(current_setting('request.headers', true)::json->>'x-fairli-key', ''),
              'sha256'), 'hex')
       from families f where f.family_id = fam),
    true)   -- keine families-Zeile: offen (wie fairli_write_ok)
$$;

-- Restriktive SELECT-Policies (UND-verknüpft mit den bestehenden open_*).
-- members
drop policy if exists "auth_sel_members" on members;
create policy "auth_sel_members" on members as restrictive
  for select using (fairli_read_ok(family_id));
-- chores
drop policy if exists "auth_sel_chores" on chores;
create policy "auth_sel_chores" on chores as restrictive
  for select using (fairli_read_ok(family_id));
-- log
drop policy if exists "auth_sel_log" on log;
create policy "auth_sel_log" on log as restrictive
  for select using (fairli_read_ok(family_id));

-- HINWEIS zu 'families':
--   Die families-Tabelle bleibt bewusst lesbar (nur family_id + Anzeigename;
--   bei famx ist der Name verschlüsselt). Grund: der Client prüft die
--   Migration/Existenz per families-Lookup BEVOR der Schlüssel bereitsteht.
--   Der Anzeigename von ALT-Haushalten ist Klartext — deshalb Alt-Haushalte
--   retiren/migrieren (siehe 20260726_retire_legacy.sql).

-- =====================================================================
-- ROLLBACK (falls nötig): Lesesperre wieder entfernen —
--   drop policy if exists "auth_sel_members" on members;
--   drop policy if exists "auth_sel_chores"  on chores;
--   drop policy if exists "auth_sel_log"     on log;
--   (die open_* Policies erlauben dann wieder uneingeschränktes SELECT)
-- =====================================================================

-- OPTIONAL (empfohlen, NACH dem Retiren aller Alt-Haushalte):
-- Wenn keine write_key_hash-losen Haushalte mehr existieren, kann die
-- "offen bei fehlender families-Zeile / fehlendem Hash"-Kulanz entfernt
-- werden, indem fairli_read_ok auf strikt umgestellt wird:
--   create or replace function fairli_read_ok(fam text) returns boolean
--   language sql stable as $$
--     select exists (
--       select 1 from families f
--       where f.family_id = fam
--         and f.write_key_hash is not null
--         and f.write_key_hash = encode(digest(
--               coalesce(current_setting('request.headers', true)::json->>'x-fairli-key',''),
--               'sha256'),'hex'));
--   $$;
-- Dann ist ALLES ohne gültigen Schlüssel unlesbar. Erst umstellen, wenn
-- wirklich keine Alt-Haushalte mehr aktiv sind!
