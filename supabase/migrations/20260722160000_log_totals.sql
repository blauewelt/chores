-- Gesamt-Punkte SERVERSEITIG (v4.65.0). Vorfall 22.07.: die betroffene Familie
-- ueberschritt 353 Log-Zeilen — der Client holt aber nur die neuesten 300
-- (Egress-Diaet v4.36) und rechnete «Gesamt» AUS DIESEM FENSTER. Folge:
-- Alltime-Punkte SINKEN scheinbar, sobald alte Eintraege aus dem Fenster
-- fallen — am staerksten bei frueh aktiven Personen. Niemand hat etwas
-- geloescht; die Daten waren stets vollstaendig auf dem Server.
-- Die Summe gehoert dorthin, wo ALLE Zeilen liegen. points und member_id
-- sind auch in famx-Haushalten Klartext — die Aggregation braucht keine
-- Entschluesselung. security_invoker: die RLS der log-Tabelle gilt
-- unveraendert auch fuer die Sicht.
-- REPLAY-FALLE (26.07.): der Migrations-Runner spielt bei jedem Lauf ALLE
-- Dateien; «create or replace view» kann Spalten aber nicht ENTFERNEN.
-- Als 20260726120000 die Sicht um first_done erweiterte, scheiterte der
-- Replay DIESER aelteren Datei (4-Spalten-Definition ueber 5-Spalten-Sicht:
-- «cannot drop columns from view»). Regel ab jetzt: erweitert eine spaetere
-- Migration eine Sicht, wird die aeltere Datei auf dieselbe Definition
-- nachgezogen — die spaetere wird dadurch zum harmlosen No-op.
create or replace view log_totals
  with (security_invoker = true) as
  select family_id,
         member_id,
         coalesce(sum(points), 0)::int as pts,
         count(*)::int as n,
         min(done_at) as first_done
    from log
   where deleted_at is null
   group by family_id, member_id;

grant select on log_totals to anon, authenticated;
