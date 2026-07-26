-- Wochenziel als BETA (v4.67.0). Zwei additive, nullbare Spalten:
--
-- families.beta  — Feature-Schalter PRO FAMILIE. Nur Haushalte mit beta=true
--   sehen die Wochenziel-Bedienung. Der Schalter liegt bewusst am Haushalt
--   und nicht am Geraet: so bekommt die ganze Familie (auch das Kind-Telefon
--   und die assistierten Personen) dieselbe Sicht, ohne dass jemand eine
--   geheime Geste kennen muss. families?select=* holt ihn ohne Client-Aenderung.
--
-- members.goal — Wochenziel in Punkten, NULL = kein Ziel. Ohne gesetztes Ziel
--   rendert die Punkte-Ansicht exakt wie bisher; die Spalte allein aendert
--   fuer niemanden etwas. Klartext-Zahl, also auch in famx-Haushalten
--   unbedenklich (wie points/member_id).
alter table families add column if not exists beta boolean;
alter table members  add column if not exists goal int;
