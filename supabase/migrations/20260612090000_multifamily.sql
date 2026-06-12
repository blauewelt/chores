-- Multi-family support: partition all tables by family_id,
-- existing Rossi data inherits the default slug.
alter table members add column if not exists family_id text not null default 'rossi-4zbnalj41l';
alter table chores  add column if not exists family_id text not null default 'rossi-4zbnalj41l';
alter table log     add column if not exists family_id text not null default 'rossi-4zbnalj41l';
alter table members add column if not exists url_slug text;
create index if not exists members_family_idx on members(family_id);
create index if not exists chores_family_idx  on chores(family_id);
create index if not exists log_family_idx     on log(family_id, done_at desc);
