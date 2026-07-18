-- Snapshot the chore note into the log at completion time, so history is immutable
alter table log add column if not exists chore_note text;
