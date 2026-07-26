-- Wochen-Balken im Pro-Person-Sheet (v4.69.0, Beta): Punkte je Person und
-- Woche. Braucht den Server aus demselben Grund wie log_totals: das
-- Client-Fenster (300 Zeilen) reicht bei aktiven Familien nur ~2 Wochen
-- zurueck. date_trunc('week') = ISO-Montag in UTC; der Client rechnet
-- Wochen ab LOKALEM Montag — Eintraege der Sonntagnacht koennen dadurch
-- am Wochenrand in die Nachbarwoche rutschen. Fuer eine Statistik-Grafik
-- bewusst akzeptiert (Familien-Zeitzone kennt der Server nicht).
create or replace view log_weekly
  with (security_invoker = true) as
  select family_id,
         member_id,
         date_trunc('week', done_at)::date as week_start,
         coalesce(sum(points), 0)::int as pts,
         count(*)::int as n
    from log
   where deleted_at is null
   group by family_id, member_id, date_trunc('week', done_at);

grant select on log_weekly to anon, authenticated;
