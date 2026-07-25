-- Gesamt-Punkte SERVERSEITIG (v4.65.0). Vorfall 22.07.: Rossi WG
-- ueberschritt 353 Log-Zeilen — der Client holt aber nur die neuesten 300
-- (Egress-Diaet v4.36) und rechnete «Gesamt» AUS DIESEM FENSTER. Folge:
-- Alltime-Punkte SINKEN scheinbar, sobald alte Eintraege aus dem Fenster
-- fallen — am staerksten bei frueh aktiven Personen. Niemand hat etwas
-- geloescht; die Daten waren stets vollstaendig auf dem Server.
-- Die Summe gehoert dorthin, wo ALLE Zeilen liegen. points und member_id
-- sind auch in famx-Haushalten Klartext — die Aggregation braucht keine
-- Entschluesselung. security_invoker: die RLS der log-Tabelle gilt
-- unveraendert auch fuer die Sicht.
create or replace view log_totals
  with (security_invoker = true) as
  select family_id,
         member_id,
         coalesce(sum(points), 0)::int as pts,
         count(*)::int as n
    from log
   where deleted_at is null
   group by family_id, member_id;

grant select on log_totals to anon, authenticated;
