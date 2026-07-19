-- Aufbewahrungsdauer fuer VERLAUFS-Eintraege (v4.52.0), pro Haushalt.
-- NULL = unbegrenzt (Standard, bewusst): es wird nichts geloescht, solange
-- ein Mensch das nicht ausdruecklich einstellt.
-- Betrifft AUSSCHLIESSLICH die Tabelle log — Aufgaben, Personen und der
-- Haushalt selbst werden von dieser Funktion NIE angefasst.
alter table families add column if not exists retention_days integer;
