-- Ø Punkte/Woche (v4.68.0, Beta): Wochenziele setzt man leichter, wenn man
-- weiss, was eine Person BISHER pro Woche geschafft hat. Der Durchschnitt
-- braucht das Datum des ERSTEN Eintrags — und das kennt nur der Server:
-- der Client sieht bloss die neuesten 300 Zeilen (Egress-Diaet), aeltere
-- Ersteintraege sind aus seinem Fenster laengst herausgefallen
-- (dieselbe Falle wie beim Gesamt-Vorfall vom 22.07.).
-- create or replace: Sicht bekommt EINE Spalte dazu; der v4.65-Client
-- selektiert explizit (member_id,pts,n) und bleibt unberuehrt.
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
