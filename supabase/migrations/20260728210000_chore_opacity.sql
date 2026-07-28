-- v4.95.0: Pro-Kachel-Deckkraft des Kachelbildes. Eine Zahl 0..1 (wie points
-- ein Klartext-Wert, NICHT in ENC_FIELDS). NULL = Standard 0.55 (bisheriges
-- Verhalten) — Bestandskacheln aendern sich also nicht. Der Client selektiert
-- die Spalte im Delta-Pull (Spalten-Diaet), darum MUSS sie existieren, bevor
-- der v4.95.0-Client live geht (sonst 400 auf jeden chores-Pull/Write).
alter table chores add column if not exists opacity real;
