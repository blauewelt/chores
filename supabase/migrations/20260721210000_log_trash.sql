-- Papierkorb (v4.63.0): Loeschen wird ein Grabstein (deleted_at/deleted_by)
-- statt eines DELETE. Nebeneffekt und eigentlicher Clou: der bestehende
-- BEFORE-UPDATE-Trigger log_touch stempelt updated_at — der Grabstein reist
-- damit im normalen Delta-Abgleich binnen 20 s zu ALLEN Geraeten. Vorher
-- war eine harte Loeschung fuer andere Geraete bis zu 24 h unsichtbar
-- (Delta sieht nur neue/geaenderte Zeilen; pendingDeletes schirmt nur das
-- loeschende Geraet). deleted_by ist eine Member-ID (nie ein Name) und
-- bleibt darum auch in verschluesselten famx-Haushalten unbedenklich.
-- Endgueltige Entfernung: 30 Tage nach deleted_at durch den Admin-Client
-- (gleicher Pfad wie die Aufbewahrungs-Bereinigung v4.52.0).
alter table log add column if not exists deleted_at timestamptz;
alter table log add column if not exists deleted_by text;
