-- HINWEIS 17.07.2026: die urspruenglichen DEFAULT-Werte trugen die echte
-- Bestands-Familien-ID und standen bis heute im oeffentlichen Repo (gilt
-- als exponiert, siehe LOG v4.46.3). Migration ist laengst angewandt; die
-- Platzhalter hier sind nur fuer die Historie-Lesbarkeit.
-- Multi-family support: partition all tables by family_id,
-- existing legacy household data inherits the default slug.
alter table members add column if not exists family_id text not null default 'LEGACY-DEFAULT-siehe-Kommentar';
alter table chores  add column if not exists family_id text not null default 'LEGACY-DEFAULT-siehe-Kommentar';
alter table log     add column if not exists family_id text not null default 'LEGACY-DEFAULT-siehe-Kommentar';
alter table members add column if not exists url_slug text;
create index if not exists members_family_idx on members(family_id);
create index if not exists chores_family_idx  on chores(family_id);
create index if not exists log_family_idx     on log(family_id, done_at desc);
