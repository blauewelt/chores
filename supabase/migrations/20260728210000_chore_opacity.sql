-- v4.95.0: Pro-Kachel-ABDUNKELUNG. Semantik (Maintainer praezisiert 28.07.):
-- Die Kacheln waren manchen zu DUNKEL — die Daempfung kommt vom Gradient-
-- Overlay (.chore::after), das Bild selbst rendert voll deckend. Der Wert
-- hier steuert darum die DECKKRAFT DES DUNKEL-OVERLAYS: 1.0 = heutiger
-- Look (Standard), 0.0 = kein Abdunkeln (Bild voll hell). NULL = Standard.
-- Klartext wie points (NICHT in ENC_FIELDS). Spaltenname "opacity" =
-- Overlay-Deckkraft. Der Client selektiert die Spalte im Delta-Pull,
-- darum MUSS sie existieren, bevor der v4.95.0-Client live geht.
alter table chores add column if not exists opacity real;
