-- Admin-Recht liegt jetzt bei PERSONEN, nicht mehr an einem anonymen Link
-- (v4.55.0). Der blanke Familien-Link funktioniert aus Bestandsgruenden
-- weiterhin als (namenloser) Admin-Zugang.
alter table members add column if not exists admin boolean not null default false;
