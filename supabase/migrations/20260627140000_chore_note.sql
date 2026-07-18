-- Optional free-text note per chore (small clarifying comment on the tile)
alter table chores add column if not exists note text;
