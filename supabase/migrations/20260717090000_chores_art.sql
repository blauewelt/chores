-- v4.36.3: Die Spalten-Diaet (v4.36.0) selektierte chores.art — die Spalte
-- existierte aber nie: der Kunst-Override (v4.26) lebte nur im localStorage
-- des jeweiligen Geraets. Folge: JEDER Pull antwortete 400, alle Geraete
-- zeigten ihren Cache. Spalte anlegen repariert den Pull UND laesst
-- Kunst-Overrides endlich zwischen Geraeten synchronisieren.
alter table chores add column if not exists art text;
