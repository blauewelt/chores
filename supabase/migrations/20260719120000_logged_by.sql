-- Wer hat den Eintrag verbucht? (v4.54.0)
-- Nur die Mitglieds-ID des LINKS, ueber den eingetragen wurde — NULL, wenn
-- ueber den Familien-Link gearbeitet wurde (der gehoert niemandem einzeln).
-- IDs sind wie member_id unverschluesselt; der Name wird erst beim Anzeigen
-- aufgeloest.
alter table log add column if not exists logged_by text;
