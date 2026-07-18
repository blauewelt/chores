-- Betreute Mitglieder (v4.49.0): Personen ohne eigenes Telefon (sehr jung,
-- ohne Geraet, oder eine Katze). Flag ist unverschluesselt (reiner Boolean
-- auf einer ohnehin opaken Zeile; verraet nichts Inhaltliches).
-- Wirkung rein clientseitig: betreute Mitglieder erscheinen auf ALLEN
-- persoenlichen Links und duerfen von allen eingetragen werden.
alter table members add column if not exists assisted boolean not null default false;
