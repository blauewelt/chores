## 2026-07-18 — v4.47.0: Ersetzter-Link-Hinweis, Personen-Knopf «Speichern»; Ginge-Vorfall diagnostiziert

- ERSETZTER-LINK-HINWEIS: der Server-Grabstein (retired_families)
  blockte nur INSERTS — Nutzer eines rotierten Links sahen Cache-Daten
  und still scheiternde Schreibungen und erfuhren NICHTS. Jetzt prüft
  der Boot (nach CRYPTO_READY, Klartext-ID + Zeilen-Scope) den
  Grabstein und zeigt einen KLEBRIGEN Vollbild-Hinweis («Dieser
  Familien-Link wurde ersetzt — holt euch den neuen Link vom Admin»),
  lokal gemerkt: einmal erkannt, immer angezeigt, auch offline
  (Grabsteine sind endgültig). 2 Schlüssel ×19
- PERSONEN-SHEET: Knopf unten heisst «Speichern» statt «Fertig»
  (Maintainer: konsistent mit den übrigen Sheets — er SPEICHERT ja)
- GINGE-VORFALL (Person hinzufügen scheiterte am NEUEN Link):
  Produktions-Repro gegen die ECHTE DB (Wegwerf-famx-Familie, echtes
  RLS, echte Write-Auth, UI-Flow): POST 201, Person persistiert —
  der aktuelle Code ist gesund. Wahrscheinlichste Ursache: der SW
  liefert nach Schlaf EINMAL die Vorversion aus; bei 18 Deploys heute
  war das Gerät vermutlich im v4.46.0-Fenster (Race-Bug-Ära) unterwegs.
  Abhilfe: App zweimal öffnen/neu laden, Version in den Einstellungen
  prüfen (≥ 4.46.1), erneut versuchen. Sandbox-Lehre dokumentiert:
  Browser-Repro gegen Produktion braucht ignoreHTTPSErrors (Egress-
  Proxy-MITM) — vorher misst man NUR Sandbox-Artefakte
- Suiten: 69/69 Chromium, 68+1 WebKit
- APP_VERSION 4.47.0, SW-Cache haushalt-v132

## 2026-07-18 — Betrieb: Familien-Link ROTIERT (Kopie verifiziert, Alt unangetastet); Wache gehasht

- ROTATION AUSGEFÜHRT (Maintainer-Freigabe): kompletter Bestand des
  Haushalts (1 Familie, 5 Mitglieder, 33 Aufgaben, 290 Log-Einträge)
  unter einem NEUEN famx-Geheimnis re-verschlüsselt angelegt. Frische
  Zeilen-IDs (globale PKs — gleiche IDs kollidierten mit den
  Alt-Zeilen; merge-duplicates hätte sie UPDATET, die Write-Auth wies
  genau das ab und schützte damit die Alt-Daten), log-Referenzen
  konsistent mitgemappt (inkl. verwaister Referenzen), url_slugs
  UNVERÄNDERT. Verifikation: Neu-Bestand gelesen, entschlüsselt,
  kanonisches SHA-256-Manifest == Alt-Manifest (byte-identischer
  Inhalt); Alt-Bestand nachgezählt: unangetastet. KEIN Tombstone,
  NICHTS gelöscht — beide Links funktionieren, bis der Maintainer den
  Neu-Link auf dem Gerät verifiziert hat. Neue Links: PRIVATE
  Deliverable-Datei, bewusst nirgends im Repo. Offen: Tombstone +
  Alt-Aufräumen nach Freigabe; eine verwaiste families-Zeile aus einem
  abgebrochenen ersten Lauf (inhaltsleer, Schlüssel verworfen) später
  per CI-psql räumen
- WACHE GEHASHT (Maintainer-Frage «stehen da unsere Namen drin?» — JA,
  stand sie, samt der exponierten Alt-ID: die erste Fassung war ihr
  eigener Verstoss und nahm sich selbst vom Scan aus): die Wache kennt
  Tokens nur noch als SHA-256-Hashes, prüft sich wieder selbst, und
  fing prompt DREI Reste, die den case-sensitiven \b-Mustern entgangen
  waren (Grossschreibung, Namensvariante). Gegen gepflanztes Token rot
  verifiziert
- Suiten: 67/67 Chromium, 66+1 WebKit

## 2026-07-17 — v4.46.3: Anonymisierung Schritte 1–3 — und ein KRITISCHER Fund: die echte Familien-Link-ID stand seit 12.06. im öffentlichen Repo

- KRITISCH (beim Ausführen von Schritt 2 entdeckt, dem Audit entgangen,
  weil das Suchmuster nur fam-* kannte): die ECHTE Bestands-Familien-ID
  stand als Backfill-Wert und dreifacher Spalten-DEFAULT in zwei
  Migrationsdateien — seit 12.06.2026 weltlesbar. Familien-IDs SIND die
  Zugangs-URLs; die famc-Verschlüsselung schützt hier NICHT, weil die
  Schlüssel aus genau diesem Link abgeleitet werden. Der Link ist als
  EXPONIERT zu betrachten. Dateien bereinigt (Platzhalter + Hinweis;
  Migrationen sind längst angewandt) — die Git-HISTORIE enthält die ID
  weiterhin. Konsequenz: Schritt 4 (Historien-Neustart) ist jetzt
  dringend, UND eine Link-Rotation des Haushalts (neues Geheimnis, alle
  Mitglieder erhalten neue Links, alte URL via Tombstone stillgelegt —
  nichts wird gelöscht) ist die einzige echte Abhilfe. ENTSCHEID BEIM
  MAINTAINER — Familien-Koordination nötig
- Schritt 1: Streuner-Familien-ID aus Onboarding-Doku und LOG entfernt
  (steht nur noch im privaten Notizzettel); Rotation der Streuner-
  Familie weiter offen (Entscheid Maintainer)
- Schritt 2: repo-weite Ersetzungstabelle, LÄNGEN-EXAKT (Chip-Wrap- und
  Wide-Layout-Tests messen Pixel): Fixture-Personal und Haushaltsname
  fiktionalisiert, Adress-Teststring ersetzt, Kommentar-Anekdoten ohne
  Namen (Lehre bleibt), LOG-Attributionen → «Maintainer». 235
  Ersetzungen über Tests, App-Kommentare, LOG, Doku, Workflows,
  404-Beispielpfad. fables_corner.txt bewusst UNBERÜHRT (kreativ/
  persönlich — Umzugs-Entscheid beim Maintainer, Wache nimmt die Datei
  aus)
- Schritt 3: Anonymisierungs-Wache in check-discipline.mjs — Namen,
  Ortsbezüge und Link-ID-Muster (fam|famc|famx|rossi-…{10,}) mit
  expliziter Whitelist der vier Test-Artefakte; gegen geplantes Token
  rot verifiziert. Heute zweimal bewiesen, dass guter Wille nicht
  reicht (Adress-String im Test kam von der KI-Session selbst)
- Suiten nach 235 Ersetzungen: 67/67 Chromium, 66+1 WebKit
- APP_VERSION 4.46.3, SW-Cache haushalt-v131

## 2026-07-17 — v4.46.2: Notiz fliesst in den Kachel-Kunst-Prompt; Test-Infrastruktur ehrlich gemacht

- KACHEL-KUNST (Maintainer): die Notiz war NICHT im Prompt — «Kochen, für
  zwei Personen» malte dasselbe wie «Kochen». Jetzt:
  c.art || name+«, »+note (ein eigenes art-Feld bleibt allein
  massgeblich — die Notiz eines Custom-Prompts fliesst NICHT ein).
  Folge: Kacheln MIT Notiz laden einmalig neue Kunst (Prompt geaendert,
  Seed gleich). Neuer Test: Prompt-URL enthaelt «Kochen, für zwei
  Personen»; bei gesetztem art nur den Custom-Prompt, nie die Notiz
- TEST-INFRA, zwei echte Funde beim Volllauf:
  (1) Der «Mein Name»-Test fing noch PATCH ab — seit v4.46.1 schreibt
  upsertRemote per POST. Test auf POST umgestellt (Body-Zeile: eigene
  id + Name, famScope in der URL)
  (2) FUENF Tests mit EIGENEN Routen (ohne mockBackend) liefen ohne
  die Onboarding-Persona — seit v4.45.0 blockierte ihnen das «Zugriff
  sichern»-Modal die Klicks. Neuer Helfer suppressOnboarding(context),
  in allen fuenf ergaenzt
- EHRLICHKEIT, wichtig: die Suite-Ausgabe wurde in Sessions zuletzt
  mit tail-N gekuerzt — das KANN «X failed»-Zeilen oberhalb der
  «passed»-Zeile verschlucken; einzelne Gruen-Meldungen der letzten
  Runden waren dadurch moeglicherweise falsch-gruen (die beiden Funde
  oben sassen genau in diesem Schatten). Ab jetzt: Ausgabe IMMER ueber
  ein Muster filtern, das failed/skipped/passed gemeinsam zeigt
  (§11-Regel). Aktueller VOLLSTAENDIGER Stand: 67/67 Chromium,
  66+1 WebKit, null versteckt
- APP_VERSION 4.46.2, SW-Cache haushalt-v130

## 2026-07-17 — v4.46.1: Personen-Sheet — Hinzufügen/Umbenennen überlebt den Pull (Race behoben), Speichern-Bestätigung

- LIVE-BUGS (Maintainer): neue Person «wurde nicht wirklich hinzugefügt»
  (fehlte in der ICH-BIN-Zeile), Admin-Umbenennungen hielten nicht,
  und ob gespeichert wird, war unklar
- URSACHE: finishMembers schrieb am Abgleich-Schutz VORBEI (bare
  push+upsert statt createRemote-Muster). Ein pull(), dessen Snapshot
  vor dem Server-Commit lag, ersetzte state.members komplett — die
  neue Person verschwand, Umbenennungen sprangen zurück. Für EDITS gab
  es überhaupt keinen Schutz: reconcile kannte nur Creates/Deletes
- FIX: (1) reconcile bekommt OVERLAY-Semantik — eine pendente
  Schreibung ersetzt auch die veraltete Serverfassung derselben Zeile.
  (2) Neues upsertRemote(table, rows): registriert jede Zeile als
  pendente Schreibung (lebende Referenz — spätere Edits derselben
  Zeile bleiben massgeblich), resolvedAt erst nach Server-Bestätigung.
  (3) ALLE Personen-Schreibpfade darüber: finishMembers, ensureSlug
  (ein geschluckter Slug hiesse geteilte Links, die der Server nicht
  kennt!), Mein-Name-Sheet (statt PATCH)
- «Unklar, ob es speichert»: finishMembers toastet jetzt «Gespeichert»
  bei Änderungen
- TEST (erst rot, dann grün): ehrliches Race-Modell — Server braucht
  2 s bis zum Commit, der Pull passiert währenddessen und sieht die
  Schreibung nicht. Neue Person bleibt in der ICH-BIN-Zeile,
  POST-Inhalt verifiziert; Umbenennung bestehender Person hält
  ebenso. Maintainer-exakter Ablauf (tippen, direkt Fertig, kein blur)
  nachgestellt. 64/64 Chromium, 63+1 WebKit
- APP_VERSION 4.46.1, SW-Cache haushalt-v129

## 2026-07-17 — v4.46.0: «Mein Name» für Mitglieder, verständlichere Mitglieder-Copy — und ein Klartext-Leck im Personen-Upsert geschlossen

- MEIN NAME (Maintainer): Einstellungen zeigen am persönlichen Link die
  Zeile 👤 «Mein Name» (Admin sieht sie nicht — die Personen-Verwaltung
  kann alle). Sheet mit vorbefülltem Feld; lokal sofort (Chips, Punkte,
  Kacheln folgen), Server via sb('members?id=eq.me','PATCH',{name}) —
  NUR die eigene Zeile, famScope bleibt dran, encRow verschlüsselt bei
  famc/famx. Verlauf bleibt historisch (member_name alter Zeilen
  unverändert — gleiche Semantik wie beim Admin-Umbenennen); neue
  Einträge tragen den neuen Namen. «Mein Name» ×19
- COPY (Maintainer, aus v4.45.3 hierher gefaltet): «ohne Admin-Zugriff» aus
  der Mitglieder-Erklärung gestrichen — IT-Jargon; die Admin-Zeile
  darüber erklärt sich selbst. Neu: «Verschick sie an deine Mitbewohner
  oder Familie — jede Person loggt damit ihre Aufgaben» (×19)
- BEIFANG, ernst: finishMembers() (Personen-Sheet des Admins) schrieb
  Mitglieder per ROH-Fetch — OHNE encRow und OHNE x-fairli-key. Bei
  famc/famx wären Namen im KLARTEXT gelandet bzw. an der Write-Auth
  gescheitert; bei Fanti (fam-, Legacy) fiel es nie auf. Jetzt über
  upsert() (verschlüsselt + Write-Key + merge-duplicates). Der
  famx-«sendet NIE Klartext»-Test deckte diesen Pfad nicht ab — der
  Personen-Upsert lief dort nicht; Lücke notiert
- Tests: Mitglied benennt sich um (Chip sofort, PATCH-Ziel eigene
  Zeile + famScope), Admin ohne «Mein Name», persönlicher Link mit.
  64/64 Chromium, 63+1 WebKit
- APP_VERSION 4.46.0, SW-Cache haushalt-v128

## 2026-07-17 — v4.45.2: Mitglieder-Copy erweitert, i18n-Audit — Verschlüsselungs-Migration übersetzt

- COPY (Maintainer): «Persönliche Links»-Erklärung führt jetzt mit der
  Handlung: «Verschick sie an deine Mitbewohner oder Familie — jede
  Person loggt damit ihre Aufgaben, ohne Admin-Zugriff» (×19, alter
  Schlüssel entfernt)
- I18N-AUDIT (Maintainer-Frage «ist das Onboarding übersetzt?»):
  Onboarding-Flow VOLLSTÄNDIG in allen 19 Sprachen ✓. Der Audit
  (alle t()-Schlüssel gegen die Wörterbücher) fand aber eine
  vorbestehende Lücke: das VERSCHLÜSSELUNGS-MIGRATIONS-Sheet war
  t()-verpackt, seine 10 Schlüssel fehlten jedoch überall — es fiel
  still auf Deutsch zurück. Jetzt übersetzt (×19, inkl. der beiden
  langen Erklärungs-Absätze). Wiederholter Audit: KEINE echten Lücken
  mehr
- 63/63 Chromium, 62+1 WebKit
- APP_VERSION 4.45.2, SW-Cache haushalt-v127

## 2026-07-17 — v4.45.1: Keine Doppel-Botschaft — 📲-Banner schweigt, solange Schritt 1 offen ist

- LIVE-BEOBACHTUNG (Maintainer): «Zum Home-Bildschirm» erschien doppelt —
  im Banner oben UND im Onboarding-Sheet unten (der halbtransparente
  Backdrop liess beide gleichzeitig sehen)
- REGEL: solange #onboardSheet die Install-Botschaft trägt, ist der
  Banner versteckt; beim Schliessen ruft das Sheet initInstallBar() —
  der Banner kehrt SOFORT als Dauer-Erinnerung zurück (respektiert
  appinstalled/Dismissal via LS_IBAR). Wer im Sheet installiert, sieht
  ihn nie wieder; wer es wegklickt, behält die sanfte Erinnerung
- Ersteller-Pfad setzt die Onboard-Marke bereits beim Setup (Schritt 1
  kommt dort explizit — maybeOnboard soll nicht doppelt zünden)
- Tests: Banner hidden solange Sheet offen; nach Schliessen ohne
  Installation sichtbar; Reload-Persistenz. 63/63 Chromium, 62+1 WebKit
- APP_VERSION 4.45.1, SW-Cache haushalt-v126

## 2026-07-17 — v4.45.0: Onboarding-Bogen «Zugriff sichern» — Ersteller-Wizard, Empfänger-Landung, Nativ-zuerst-Banner

- KONZEPT (Maintainer): (1) nach der Haushalts-Erstellung zuerst «Link
  sichern», (2) dann das Einladen-Sheet, (3) Link-Empfänger landen
  bei (1)
- SCHRITT 1, #onboardSheet «Zugriff sichern»: Savenote-Warnung
  (Admin-Text bzw. persönliche Variante «Dein Link ist dein Zugang …»),
  nativer Android-Knopf wenn Prompt verfügbar, sonst die Anleitungen
  (installInstructionsHTML(true)); spätes beforeinstallprompt rüstet
  den Knopf nach (Race-Lektion v4.44.1 gilt auch hier)
- ERSTELLER: Setup-Abschluss → openOnboardSheet(true) →
  «Weiter: Mitglieder einladen» → Einladen-Sheet (Schritt 2 mit den
  v4.44.0-Erklärungen). ERSTBESUCHER jeder Rolle (auch Admin-Link auf
  Zweitgerät): maybeOnboard() nach dem ersten Render — Marke
  haushalt.onboard:FAMILIE:a|u, nie im Standalone, nie über offenen
  Sheets, nie über der Ersteinrichtung (NUR famName zählt als «Familie
  steht» — der Boot-Sät ein lokales Standard-Mitglied, members wäre
  ein Fehlsignal)
- NATIV-ZUERST (Maintainer-Platzierungsfrage): der 📲-Banner in der
  HAUPT-Ansicht feuert das native Prompt jetzt DIREKT, wenn es
  verfügbar ist — der Knopf im Haupt-Pane IST der Banner; ohne Prompt
  öffnet er wie bisher die Anleitungen
- Tests: mockBackend setzt die Onboard-Marke als Standard-Persona
  (Wiederkehrer — sonst blockierte das Modal jeden Test;
  Onboarding-Tests schalten die Persona gezielt ab). Neu: Empfänger
  sieht das Sheet genau EINMAL, spätes Prompt rüstet nach und feuert,
  Marke persistiert; Ersteller-Wizard-Test (Setup → Schritt 1 →
  Weiter → Einladen-Sheet); Kette-Test auf Nativ-zuerst umgestellt.
  3 neue Schlüssel ×19. Visuelle Abnahme §11: Empfänger-Zustand mit
  Android-Knopf gerendert + programmatisch geprüft. 63/63 Chromium,
  62+1 WebKit
- APP_VERSION 4.45.0, SW-Cache haushalt-v125

## 2026-07-17 — v4.44.1: Install-Prompt-Race behoben — offene Sheets rüsten nach; Install-Kette End-to-End getestet

- LIVE-BUG (Maintainer-Pixel: «der native Home-Bildschirm-Knopf tut
  nichts»): Chrome feuert beforeinstallprompt oft erst SEKUNDEN nach
  dem Laden (Engagement-Heuristik). Einladen- und Install-Sheet prüften
  deferredInstall nur beim RENDERN — wer das Sheet vor dem Event
  öffnete, bekam den nativen Weg nie zu sehen. Race-Test zuerst
  geschrieben, rot bestätigt, dann Fix: der BIP-Listener rüstet offene
  Sheets nach (Install-Sheet re-rendert auf «Jetzt installieren»,
  Einladen-Sheet bekommt den Button in die Sichern-Warnung injiziert;
  Button-Verkabelung in wireShInstall/injectShareInstall extrahiert)
- FRAGE 1 (Maintainer): Empfänger geteilter Links sehen den 📲-Banner —
  das galt schon (initInstallBar zeigt ihn in JEDEM Kontext ohne
  Standalone, Dismissal-Schlüssel pro Familie+Rolle), war aber
  ungetestet. Neuer Kette-Test aus Empfänger-Perspektive
  (persönlicher Link): Banner sichtbar → Tap → Install-Sheet →
  «Jetzt installieren» feuert das native Prompt → appinstalled räumt
  auf (Sheet zu, Banner weg, dauerhaft gemerkt)
- EHRLICHE PLATTFORM-GRENZE (dokumentiert): ist die PWA bereits
  installiert, feuert Chrome beforeinstallprompt NIE — dann gibt es
  by design keinen nativen Knopf, nur die Anleitungen. Ein «kaputter»
  Knopf auf einem Gerät mit bereits installierter Fairli ist also
  erwartetes Verhalten
- 63/63 Chromium, 62+1 WebKit
- APP_VERSION 4.44.1, SW-Cache haushalt-v124

## 2026-07-17 — v4.44.0: Onboarding — Admin-Link sichern (Warnung + Android-Ein-Tipp), Erklärung an den persönlichen Links

- HINTERGRUND (Maintainer): wer nach dem Setup im Einladen-Sheet landet und
  den Admin-Link NICHT sichert, verliert den Zugriff auf den Haushalt —
  das sagte bisher niemand
- SICHERN-WARNUNG (.savenote, bernstein-getönte Box direkt im
  Admin-Block): «Wichtig: diesen Link sichern — als Lesezeichen oder
  auf dem Home-Bildschirm. Ohne ihn verliert ihr den Zugriff auf euren
  Haushalt.» Immer sichtbar, nicht nur beim ersten Mal — die Warnung
  kostet nichts und der Verlustfall ist fatal
- ANDROID-EIN-TIPP: ist das native Install-Prompt verfügbar
  (beforeinstallprompt wird seit v4.20.0 eingefangen), steht in der
  Warnung ein Primär-Button «Zum Home-Bildschirm hinzufügen» → feuert
  das native Prompt; nach Annahme verschwindet der Button
  («Installiert ✓» kommt via appinstalled). Ohne Prompt (iOS/bereits
  installiert) bleiben die aufklappbaren Anleitungen direkt darunter —
  expandInstall öffnet sie nach dem Setup weiterhin
- PERSÖNLICHE LINKS: Erklärung auf Augenhöhe mit dem Admin-Text —
  «Damit loggt jede Person ihre Aufgaben — ohne Admin-Zugriff»
- 3 neue Schlüssel ×19 Sprachen. Tests: Warnung + Erklärung im
  de-Admin-Test; neuer Test «Button NUR mit Prompt, feuert ihn,
  verschwindet nach Annahme» (synthetisches beforeinstallprompt).
  Visuelle Abnahme §11: Android-Zustand gerendert + programmatisch
  geprüft (savenote/Button/Subnote da, kein Overflow). 61/61 Chromium,
  60+1 WebKit
- APP_VERSION 4.44.0, SW-Cache haushalt-v123

## 2026-07-17 — v4.43.1: «Admin-Link»-Wortlaut, News-Banner INHALTS-verankert

- FAMILIEN-ZEILE (Maintainer-Wortlaut): Titel «Admin-Link», Subnote «Gibt
  vollen Zugriff auf alle Mitglieder und ihre Aktivitäten» — auch als
  QR-Caption; ×19 Sprachen, 2 obsolete Schluessel entfernt
  («Ganze Familie», die Erwachsenen-Subnote aus v4.43.0)
- NEWS-BANNER INHALTS-VERANKERT (Maintainer: «soll nicht mit jeder
  Versionsnummer wiederkommen» — die major.minor-Regel aus v4.41.1
  pingte bei 4.42→4.43 erneut): neue Konstante NEWS_VERSION = '4.37.0'
  (= bis wohin updates.html berichtet). Wer diesen Stand oder neuer
  gesehen hat, wird NIE wieder gepingt, egal wie viele Releases folgen;
  die seenver-Marke wird still nachgezogen. Der Banner zuendet erst
  wieder, wenn NEWS_VERSION ZUSAMMEN mit neuem updates.html-Inhalt
  gebumpt wird — Appearance haengt am Inhalt, nicht an der Kadenz.
  DISZIPLIN: updates.html erweitern ⇒ NEWS_VERSION im selben Commit
  bumpen (der Banner-Test wacht, dass NEWS_VERSION nie VOR ihrem
  Berichtstand liegt)
- Tests: Banner-Test neu (gesehen >= NEWS_VERSION ⇒ kein Ping + Marke
  nachgezogen; < NEWS_VERSION ⇒ Banner; Konsistenz-Wache), Admin-Link-
  Wortlaut in de- und en-Tests. 60/60 Chromium, 59+1 WebKit (ein
  Lauf-Abbruch davor war Umgebung: verwaister Pages-Server nach
  Timeout — pkill, sauber gruen)
- APP_VERSION 4.43.1, SW-Cache haushalt-v122

## 2026-07-17 — v4.43.0: Einladen-Sheet — Admin-Link klar markiert, Empfehlen gleichwertig blau

- ZIEL (Maintainer): verhindern, dass der Familien-/Admin-Link (ERSTE Zeile
  im Sheet!) versehentlich als Fairli-Empfehlung geteilt wird
- Familien-Zeile: Untertitel «voller Zugriff» → «Admin — voller
  Zugriff, für die Erwachsenen im Haushalt» (auch als QR-Caption);
  nutzt jetzt die .subnote-Klasse statt Inline-Styles
- Empfehlen-Knopf: ghost-Daempfung entfernt — GLEICHES Akzent-Blau wie
  alle Teilen-Knoepfe; Subnote fuehrt mit der Zielgruppe: «Für Freunde:
  startet einen neuen, leeren Haushalt — zum Beitreten euren
  Familien-Link nutzen»
- Woerterbuecher: 2 neue Schluessel ×19, 2 obsolete entfernt
  («voller Zugriff», alte Empfehlen-Subnote) — Integritaets-Test
  haelt die Paritaet
- Visuelle Abnahme nach neuer §11-Regel: Renders Pixel/iPhone, de+en;
  Farb-/Label-/Overflow-Pruefung zusaetzlich programmatisch (alle drei
  Knoepfe identisches Blau, Admin-Subnote da, kein Overflow). EN-Test
  um Admin-Subnote, Freunde-Subnote und Farbgleichheit erweitert.
  60/60 Chromium, 59+1 WebKit
- APP_VERSION 4.43.0, SW-Cache haushalt-v121

## 2026-07-17 — v4.42.2: Runterwischen schliesst Sheets und Toasts

- SWIPE-TO-DISMISS (Maintainer: «der Grabber sieht so aus, als koennte
  man…»): Runterwischen zieht das Sheet mit dem Finger mit und
  schliesst ab 120 px Zug ODER bei zuegigem Wisch (>40 px und
  >0.5 px/ms); darunter federt es zurueck (180 ms). Zentral in
  enableBackdropClose — GLEICHE Semantik wie der Backdrop-Tipp: die
  Formular-Regel (dirty choreSheet/logSheet) blockt auch den Swipe.
  Zug nach unten uebernimmt nur, wenn der Sheet-Inhalt oben steht
  (scrollTop 0) und der erste Zug abwaerts geht — Hochwischen/Scrollen
  bleibt nativ. Slide-out 180 ms, transform wird bei close geresettet
- Share-Sheet haengt jetzt AUCH an enableBackdropClose (hatte bisher
  weder Backdrop-Tipp noch Swipe — Versehen aus der Anfangszeit)
- Toast: Runterwischen (>24 px) verwirft sofort (Timer geraeumt)
- Test (beide Geraete-Projekte): zuegiger Wisch schliesst, kurzer
  langsamer federt zurueck, dirty-Guard blockt, Toast-Wisch verwirft.
  Touch-Synthese OHNE Touch/TouchEvent-Konstruktoren (WebKit-Linux
  kennt sie nicht): plain Event + defineProperty(touches). 60/60
  Chromium, 59+1 WebKit
- APP_VERSION 4.42.2, SW-Cache haushalt-v120

## 2026-07-17 — v4.42.1: Sheets gleiten herein, Verlauf-✎ wie auf den Kacheln

- SHEETS SLIDEN (Maintainer-Punkt 1): alle dialog-Sheets (Teilen, Aufgabe
  bearbeiten, Einstellungen, …) gleiten mit 280 ms aus dem unteren Rand
  herein (transform translateY(100%) → 0), der Backdrop blendet parallel
  ein. EINE CSS-Regel auf dialog[open] deckt saemtliche Sheets ab; die
  globale reduced-motion-Regel schaltet die Animation automatisch ab
  (im Test verifiziert). Nur Einblenden — Ausblenden bleibt sofort
  (Schliessen soll nicht warten)
- VERLAUF-BEARBEITEN-SYMBOL (Maintainer-Punkt 2): Eintraege zeigen jetzt
  dasselbe ✎ wie die Aufgaben-Kacheln statt des Chevrons ›
  (.editicon, dezent, rein dekorativ — die ganze Zeile bleibt der
  Tap-Bereich). Chevron › bleibt NUR in den Einstellungs-Zeilen
  (Listen-Navigation). Rechte-Test angepasst (gesperrte Zeilen: kein
  .editicon)
- Neuer Test: animationName sheetIn beim Oeffnen, none unter
  reduced-motion; Verlaufszeile hat ✎ und keinen Chevron. 59/59
  Chromium, 58+1 WebKit
- APP_VERSION 4.42.1, SW-Cache haushalt-v119

## 2026-07-17 — v4.42.0: Kopf-Schrumpfen entfernt, Tabs-Leiste deckend mit weichem Auslauf

- SCHRUMPFEN KOMPLETT RAUS (Maintainer: «bringt ein paar Pixel und macht
  viele Probleme … sieht auch nicht smooth aus» — mehrzeilige Titel
  klappten beim Kleinerwerden einzeilig um): der Kopf ist NICHT mehr
  sticky und scrollt normal aus dem Bild; --shrink/--tabstop/Interpolation
  und der Scroll-Handler sind restlos entfernt. Nur die Tabs kleben.
  Logo/Titel fest auf --titlefs; .wide-Pruefung bleibt (Resize +
  Titelwechsel). Damit entfallen auch alle Sticky-Stacking-Themen
  (Naht, Scroll-Anchoring, Andockhoehe) ersatzlos
- TABS-LEISTE: Hintergrund jetzt DECKEND (vorher lief das untere
  Gradient-Fuenftel transparent aus — Kacheln schienen in die Pills,
  Maintainer-Screenshot 17.07.) plus ::after-Auslauf (14 px var(--bg) →
  transparent): Kacheln loesen sich unter der Leiste auf statt
  anzustossen; padding-bottom 6 → 10 px
- Test ersetzt: statt Kontinuitaets-Invariante jetzt «Kopf scrollt weg
  und schrumpft dabei NICHT, Tabs kleben deckend bei 0» (beide
  Geraete-Projekte). 58/58 Chromium, 57+1 WebKit
- APP_VERSION 4.42.0, SW-Cache haushalt-v118

## 2026-07-17 — v4.41.1: News-Banner pingt nur noch bei Feature-Sprüngen (major.minor)

- Live-Feedback: sechs Deploys an einem Tag = sechs Banner. Das
  «einmal pro Versionswechsel»-Design war für Patch-Kadenz falsch.
  Jetzt: Banner NUR wenn major.minor sich ändert; bei Patch-Geschwistern
  wird die seenver-Marke STILL nachgezogen (sonst zündete ein späterer
  Minor-Sprung mit längst gesehenem Stand). Erstkontakt bleibt still
- Neuer Test: Patch-Geschwister → kein Banner + Marke aktuell;
  Minor-Sprung → Banner. 58/58 Chromium, 57+1 WebKit
- APP_VERSION 4.41.1, SW-Cache haushalt-v117

## 2026-07-17 — v4.41.0: Kopf-Schrumpfen scroll-gekoppelt (kein Sprung), Haushalt umbenennen

- SCHRUMPFEN IST JETZT SCROLL-GEKOPPELT (Maintainer: «sehr wenig Scrollen …
  fühlt sich springend an»): statt binärem .slim-Umschalten (24/4-
  Schwellen) folgt --shrink (0…1 = scrollY/64px) dem Finger 1:1.
  CSS interpoliert Titel-/Logo-Größe (--titlefs → 19px) und
  Kopf-Padding per calc; ALLE Transitions auf diesen Werten entfernt
  (würden dem Finger hinterherschmieren). Handler SYNCHRON pro
  Scroll-Event (kein rAF: billig, kein Frame-Lag — und Headless-WebKit
  lässt rAF verhungern → Nachhol-Sprünge). --tabstop wird jeden Event
  mitgemessen; __updateWide misst IMMER bei --shrink 0 (deterministisch,
  egal wo gescrollt). .slim-CSS/JS komplett entfernt
- NEUER TEST (läuft automatisch auf Pixel 7 UND iPhone 14, wie
  gewünscht): Kern-Invariante fs(y) = voll + (19−voll)·min(1, y/64)
  punktweise über 11 Scroll-Lagen ±0.75 px, Logo == Titelgröße in jeder
  Zwischenlage, echte Zwischenlagen erzwungen, zurück auf 0 = voll.
  Gemessen gegen die ECHTE scrollY (robust gegen Scroll-Anchoring:
  der Browser justiert scrollY nach, weil der schrumpfende Kopf das
  Dokument verkürzt — im Test wird vor dem Sampling ein Scroll-Event
  nachdispatcht, damit der Handler die finale Position liest)
- HAUSHALT UMBENENNEN (Maintainer-Punkt 2): Einstellungen → 🏠
  Haushaltsname (NUR Familien-Link — persönliche Links sehen die Zeile
  nicht). Sheet mit vorbefülltem Feld; lokal sofort (state + save +
  __setFamTitle inkl. Größenstufe/wide), Server via
  sb('families','PATCH',{name}) — famScope zielt auf die Zeile,
  ENC_FIELDS.families verschlüsselt den Namen bei famc/famx automatisch.
  Fehler → Toast «Konnte nicht speichern»; nächster Pull würde bei
  fehlgeschlagenem PATCH den Servernamen zurückbringen (bewusst simpel).
  3 neue Schlüssel ×19 Sprachen
- BONUS: übersehenes i18n-Leck im Personen-Sheet (Share-Text «…, mach
  mit bei …») durch t() ersetzt — Schlüssel existierten seit v4.38.0
- Tests: Umbenennen-Test (Titel folgt sofort, PATCH-Body {name,
  family_id} verifiziert, persönlicher Link ohne Option). 57/57
  Chromium, 56+1 WebKit
- APP_VERSION 4.41.0, SW-Cache haushalt-v116

## 2026-07-17 — v4.40.0: Lange Familiennamen — Titel volle Breite, Buttons in eigener Zeile

- NEU (.wide, Maintainer-Frage 17.07.): braucht der Titel im GETEILTEN
  Layout (Buttons daneben) mehr als seine 2 Clamp-Zeilen, nimmt die
  Titelzeile die volle Breite und ⚙/Einladen/Personen rutschen
  rechtsbündig in eine eigene Zeile. Entscheidung INHALTS-getrieben
  (__updateWide): Messung IMMER im geteilten Layout (Klasse vorher
  runter, synchron im selben Frame → deterministisch, kein Oszillieren,
  kein Flackern); Epsilon = HALBE Zeilenhöhe (bei exakt 2 Zeilen rundet
  scrollHeight je Font 1–3 px über clientHeight — eine echte dritte
  Zeile liegt eine ganze Zeile drüber). Getriggert von __setFamTitle,
  Resize und Slim-Umschalten (ändert die Header-Höhe → --tabstop wird
  danach neu gemessen)
- --titlefs wandert in __setFamTitle ans #apphead: die
  Namenslängen-Schrumpfstufen (>14 / >22 Zeichen) treiben jetzt Titel
  UND Logo gemeinsam — «Logo so gross wie das R» gilt für jede Stufe
- Erkenntnisse aus dem Test-Härten: die Entscheidung ist locale- und
  gerätebreiten-abhängig — de-Buttons («Einladen»/«Personen», ~245 px)
  lassen auf iPhone-Breite dem Titel nur ~43 px, dort geht selbst
  «WG 5» korrekt wide; «Testhaushalt» (12 Zeichen ohne Bruchstelle)
  braucht neben Buttons 3 Zeilen → wide ist RICHTIG, kein Bug
- Neuer Tier-1-Test: langer Name → .wide, Buttons unter der Titelzeile,
  Logo == Titel-Schriftgröße (Subpixel-Toleranz, nach Ausklingen der
  180-ms-Transitions); kurzer Name (EN-Buttons für sicheren Platz auf
  beiden Viewports) → geteilt. 55/55 Chromium, 54+1 WebKit
- APP_VERSION 4.40.0, SW-Cache haushalt-v115

## 2026-07-17 — v4.39.3: Durchschein-Spalt zwischen Sticky-Header und Tabs geschlossen

- Live-Beobachtung: beim Scrollen schien eine 1-px-Zeile Kachel-Inhalt
  zwischen Kopf und Tab-Zeile durch. Ursache: `--tabstop` kam aus
  offsetHeight (GANZZAHLIG gerundet), die echte Header-Hoehe ist
  fraktional → Subpixel-Naht zwischen den beiden Sticky-Elementen
- Fix: Messung via getBoundingClientRect().height (bruchteil-genau)
  UND Tabs docken bewusst 1 px UNTER dem Header an
  (`top:calc(var(--tabstop) - 1px)`; Header z-7 > Tabs z-5 —
  der Überlapp ist unsichtbar, die Naht dicht). Remeasure feuert
  jetzt SOFORT beim Slim-Umschalten und nochmals nach der Transition
  (kein Andock-Blitzer bei schnellem Scrollen). Verifiziert: gap = -1 px
  im gescrollten Zustand
- APP_VERSION 4.39.3, SW-Cache haushalt-v114

## 2026-07-17 — v4.39.2: Kopf-Logo an die Titelzeile gekoppelt (.hrow)

- Live-Beobachtung (Slim-Zustand): das Logo sass sichtbar TIEFER als der
  Titel. Ursache strukturell: header ist flex-wrap mit align-items —
  align-self:center zentrierte das Logo gegen die GESAMTE Header-Hoehe
  (inkl. der hoeheren Button-Zeile), nicht gegen die Titelzeile
- Fix: Logo + h1 in EINER Zeile `.hrow` (flex, align-items:center,
  flex:1, min-width:0) — das Logo zentriert sich jetzt IMMER gegen den
  Titel; header align-items:flex-start → center; Slim-h1-Margins (2/6)
  entfernt (schoben den Titel gegen das Logo). Messung: Logo-Mitte ==
  Titel-Mitte auf 0.0 px, expanded UND slim
- Splash-FLIP unveraendert (Ziel bleibt #headLogo per Rect); Selektoren
  `#apphead h1` etc. matchen als Nachfahren weiter
- APP_VERSION 4.39.2, SW-Cache haushalt-v113

## 2026-07-17 — v4.39.1: News-Banner-Fix (SW kaperte updates.html), SW-Registrierung repariert, Logo = Titelgröße, Slim-Header sichtbar

- NEWS-BANNER «führte nirgendwohin» (Live-Bug, Maintainer-Pixel): die
  SW-Navigationsregel beantwortete JEDE /chores/-Navigation mit der
  App-Shell — auch /chores/updates.html. Regel eingegrenzt auf
  /chores/, /chores/index.html und /chores/f/…; updates.html zusätzlich
  im Precache (Banner funktioniert offline)
- GRÖSSER: SW-REGISTRIERUNG WAR SEIT DER HASH→PFAD-MIGRATION TOT für
  Neu-Geräte: register('sw.js') ist relativ, baseURI zeigt nach
  replaceState auf f/-Tiefpfade → /chores/f/sw.js → 404, still
  verschluckt. Auf der Wurzel ohne Familie endet das Skript vor der
  Registrierung (Entry-Return). Nur Alt-Registrierungen aus der
  Hash-Ära liefen weiter (deshalb traf Maintainer der Shell-Bug überhaupt).
  Fix: register('/chores/sw.js') absolut (§5-Regel gilt auch hier)
- KOPF-LOGO = TITELGRÖSSE: --titlefs (clamp 30–38px) treibt h1 UND
  #headLogo («so gross wie das R»); Slim 19px = Slim-Schriftgröße;
  border-radius 23% skaliert mit
- SLIM-HEADER JETZT SICHTBAR: Header ist sticky (top:0, z-7, bg);
  vorher schrumpfte er erst bei y>46 — ohne sticky längst aus dem
  Bild, nur das Wachsen bei y<12 war je sichtbar (Maintainer-Beobachtung).
  Schwellen jetzt 24/4 (Hysterese bleibt); Slim-Padding respektiert
  safe-area (sticky!); Tabs docken per gemessenem --tabstop unter dem
  Header an (Messung nach Transition + bei Resize)
- Tests: neues describe «Service Worker (echt)» mit test.use
  serviceWorkers:'allow' (die EINE Ausnahme vom globalen Block;
  Chromium-only, Netz bleibt gemockt/lokal). Der Test registriert den
  SW auf der f/-Route (wacht damit auch über den Registrierungs-Fix),
  klickt den Banner und verlangt die ECHTE updates.html im neuen Tab —
  gegen die alte Regel verifiziert rot. 54/54 grün
- APP_VERSION 4.39.1, SW-Cache haushalt-v112

## 2026-07-17 — v4.39.0: Boot-Splash — App-Icon morpht in die Kopf-Ecke

- SPLASH: statisches Overlay direkt nach <body> (deckt den Boot ab —
  kaschiert nebenbei jedes Erst-Paint-Flackern), Icon 104px zentriert
  auf var(--bg). Nach min. 550 ms ab navigationStart: FLIP-Morph
  (translate+scale) auf das neue Kopf-Logo, Hintergrund blendet parallel
  auf transparent; nach 480 ms Knoten weg + html.splash entfernt →
  Kopf-Logo (26px, im Slim-Header 22px) wird exakt an der Landeposition
  sichtbar. border-radius wird NICHT animiert — scale() verkleinert die
  24px optisch auf den Ziel-Radius
- ROBUSTHEIT: KEIN transitionend (globale reduced-motion-Regel toetet
  Transitions → Event kaeme nie) — feste Timeouts; reduced-motion
  ueberspringt den Morph ganz. Overlay ist durchgehend
  pointer-events:none und blockiert NIE Bedienung (deshalb liefen alle
  53 Tests ohne Anpassung durch). html.splash synchron im Head-Inline
  (Logo blitzt vor dem Morph nie auf — Flicker-Regel §7)
- Kopf-Logo fuer ALLE Kontexte (auch persoenliche Links) — Branding,
  kein Admin-Element
- Neuer Tier-1-Test: Overlay raeumt sich weg, html.splash weg, Logo
  sichtbar mit opacity 1; visuell per Screenshot-Serie verifiziert
  (Start / Mitte des Morphs / Endzustand)
- APP_VERSION 4.39.0, SW-Cache haushalt-v111

## 2026-07-17 — v4.38.0: Einladen-Sheet komplett übersetzt, Punkte-Slider im Verlauf, Rechte am persönlichen Link

- I18N-LECK GESCHLOSSEN: Das Einladen-Sheet war halb deutsch, egal welche
  Sprache aktiv war. Jetzt via t(): Sheet-Titel, Einladen-Knoepfe der
  Zeilen, «Ganze Familie»/«voller Zugriff» (Kopf + QR-Caption), «Fertig»,
  QR-Aria-Labels/Alt-Texte, «Links teilen …» im Personen-Sheet (dort auch
  toten Doppel-textContent entfernt) sowie die Share-Texte selbst
  (Titel «Link für {name}»/«Familien-Link», Mach-mit-Botschaften,
  Empfehlen-Text). Familien-Knopf verlor sein data-name="Familie" — der
  dafuer gedachte else-Zweig war unerreichbar. 12 neue Schluessel ×19
  Sprachen (106 Keys je Woerterbuch)
- VERLAUF-PUNKTE = GLEICHE UI WIE ANLEGEN: number-Input ersetzt durch
  ptsrow + range-Slider (#lPts/#lPtsVal), Feldordnung wie im
  Aufgaben-Sheet (Titel → Punkte → Notiz → Zeit). EINE Mechanik
  syncPtsRange() fuer beide Sheets (setPtsSlider delegiert); Skala-Regel
  unveraendert: max(MAXPTS, Bestand)
- RECHTE (Client-seitig): persoenlicher Link darf nur EIGENE
  Verlaufs-Eintraege bearbeiten/loeschen. Fremde Zeilen rendern als
  reine Anzeige (div statt button, kein Chevron; div.entry{border:none}
  fuer identische Optik), openLogSheet hat eine Defense-in-Depth-Wache
  mit Toast «Nur eigene Einträge lassen sich bearbeiten». Familien-Link
  (Admin) bearbeitet weiterhin alles. EHRLICHE GRENZE: serverseitig
  teilen alle Link-Inhaber denselben Familien-Write-Key — echte
  Durchsetzung braeuchte Pro-Mitglied-Schluessel (offen, s. Onboarding)
- Tests: Slider-Test ersetzt Number-Input-Test (prueft type=range,
  Skalen-Schutz Bestand 7 > MAXPTS 5, Live-Output), neuer Rechte-Test
  (eigene Zeile Button/oeffnet, fremde Zeile div/oeffnet nichts, Admin
  sieht 2 Buttons), neuer EN-Uebersetzungstest gegen deutsche Reste
- APP_VERSION 4.38.0, SW-Cache haushalt-v110

## 2026-07-17 — v4.37.1: Neues App-Icon «Haus, Blau-Grau»

- Icon-Neugestaltung: Haus-Komposition (abgerundetes Dreieck-Dach ueber
  2x2-Kachel-Raster), Palette Blau→Grau (hellblau, stahlblau, schiefer,
  hellgrau), dunkler Navy-Hintergrund — ersetzt das bunte 4-Kachel-Icon
- Deterministisch als SVG konstruiert (nicht Pollinations), Quelle im
  Chat-Artefakt; Maskable-Variante mit 78%-Safe-Zone fuer Android-Masken
- icon-192.png, icon-512.png, icon-512-maskable.png ersetzt;
  Cache-Buster ?v=46→47 (index.html, 404.html, manifest.json);
  SW-Cache haushalt-v108→v109
- Hinweis iOS: Homescreen-Icon wird aggressiv gecacht — ggf. Icon
  entfernen und neu hinzufuegen

## 2026-07-17 — v4.37.0: Recap-Release — «Was ist neu» v4.26–v4.37, Launch-Hinweis, Doku holistisch

- UPDATES.HTML NEU (Nutzer-Sicht, bilingual DE/EN, gleiche Anatomie):
  deckt v4.26–v4.37 ab — Verschluesselung (mit Ein-Tipp-Migration und
  Backup), 20 Sprachen, Einstellungen (Sortierung, Max-Punkte),
  Punkte-Akkumulation + editierbare Punkte, Tages-Koepfe, neues Icon,
  ruhige Optik (Skeleton, Chips-Umbruch, Slim-Header, Tastatur-Fix),
  fairli-Links; «Unter der Haube» ehrlich inkl. Zombie-Kachel-Widmung
- LAUNCH-HINWEIS (#newsBar): schmale dismissbare Zeile unter dem
  Header → updates.html. NUR fuer Wiederkehrer, EINMAL pro Version
  (LS 'haushalt.seenver'); Erstkontakt setzt die Marke still und sieht
  nie ein Banner. Beide Wege (Link, ×) markieren gesehen. 1 neuer
  i18n-Schluessel «Fairli hat Neues — ansehen» ×19; ×-Knopf in der
  Aria-Uebersetzungsliste registriert
- DEVELOPER_ONBOARDING.md HOLISTISCH neu geschrieben (636→459 Zeilen):
  §8-Versions-Akkretionen thematisch konsolidiert (Kopfbereich, Grid,
  Verlauf/Punkte, Chips, Tastatur, Einladen/Sprache), Fakten auf Stand
  v4.37 (Schema inkl. write_key_hash/updated_at/retired_families,
  Delta-Sync, Schreib-Auth, Alias-Regel SHARE_BASE vs BASE, 100 Tests);
  nur Ergebnisse, keine Untersuchungs-Historie
- Turn ueberlebte eine Kompaktierung + Phantom-Vollendung: Zustand
  nach Doktrin verifiziert (updates.html div-Balance, i18n-Paritaet
  19/19, Banner-Logik gelesen) und Suite SELBST gerannt statt Logs
  zu glauben
- 100/100 auf beiden Engines (96 + Banner ×2 + Rewrite-Absicherungen)
- APP_VERSION → 4.37.0, SW cache → haushalt-v108

## 2026-07-17 — v4.36.4: Geteilte Links (Einladen/Empfehlen/QR) zeigen fairli-Alias

- Maintainer: Links unter «Teilen» sollten den huebschen Alias tragen. Neue
  SHARE_BASE ('/fairli/') NUR fuer familyLink()/userLink()/appLink()
  (Einladen-Sheet, Empfehlen-Knopf, QR-Code). routeUrl() bleibt
  UNVERAENDERT fuer interne Navigation (history.replaceState,
  location.href) — die App laeuft weiterhin unter /chores/, das ist
  ihr tatsaechlicher Standort; der Alias ist nur eine JS-Weiterleitung
  dorthin und darf nie als Standort selbst verwendet werden
- Test-Faelle beim Bauen: (a) Anker traf beim Einfuegen zweimal (Rest
  eines unterbrochenen frueheren Anlaufs) → Playwright verweigerte den
  Start wegen doppeltem Testnamen, VOR jeder Ausfuehrung entdeckt;
  (b) eigener Selektor zu grob (`hasText: 'Einladen'` traf auch
  Mitglieder-Zeilen) → auf `.shrow.shfam` verengt; (c) Regex verlangte
  https, lokaler Testserver liefert http → https? toleriert. Alle drei
  Faelle NICHT im App-Code, sondern in der eigenen Testinstrumentierung
  — sauberer Beleg, warum die Suite vor jedem Deploy laeuft
- 96/96 auf beiden Engines
- APP_VERSION → 4.36.4, SW cache → haushalt-v107

## 2026-07-17 — v4.36.2: KRITISCH — Der eingefrorene Mittwoch (Stale-Guard hungerte Heil-Zweige aus)

- SYMPTOM (Valentin, iPhone, 08:08): Verlauf endet Mittwoch 21:26,
  obwohl famc 13 neuere Zeilen hat (Do-Abend-Serie, Fr 03:19). Geraet
  hatte Probe-Cache '0' (Migration verpasst) + Mittwoch-Cache
- REPRODUZIERT GEGEN PRODUKTION (Playwright, iPhone-Profil, praeparierter
  localStorage): genau 4 Queries unter der ALTEN Familie, dann Stille —
  kein Re-Probe, kein Reload, encv bleibt '0', Cache zementiert bei
  gruenem Sync-Punkt
- URSACHE (zweifach): (1) Der Debug-Strip-Regex von v4.36.0 hatte AUCH
  den Stale-Zweig entleert (syncOk/return im Kommentar!) → bei
  mutationSeq-Aenderung waehrend des Boot-Pulls fiel die Ausfuehrung an
  ALLEN Heil-Zweigen vorbei bis save()/render(). (2) Strukturell stand
  der Stale-Guard VOR den Heil-Entscheidungen und konnte Re-Probe/
  Ersteinrichtung/Upload-Wache aushungern. Fix: Zweig-Koerper
  wiederhergestellt UND Guard hinter die Heil-Zweige verschoben — er
  schuetzt jetzt NUR die Zustands-Uebernahme (reconcile)
- Test-Lehrstunde: der neue Valentin-E2E-Test sabotierte sich selbst
  (initScript setzte encv '0' bei JEDEM Dokument-Load, auch nach dem
  Heil-Reload) → sessionStorage-Guard «nur Boot 1 praeparieren».
  Instrumentierung zeigte danach die volle Heilungskette: Re-Probe →
  Reload → Probe findet famc (rows=1) → IS_ENC → Daten da
- Offene Beobachtung (LOG statt Vermutung): in der Prod-Repro war
  mutationSeq waehrend des Boot-Pulls veraendert (Fall-through-Pfad) —
  Verursacher-push() noch nicht identifiziert; durch die Neuordnung
  fuer die Heilung UNSCHAEDLICH, reconcile bleibt geschuetzt
- Fuer Valentin heisst das: App einmal schliessen und neu oeffnen —
  v4.36.2 heilt den Zustand selbst (Probe-Cache wird verworfen,
  famc uebernommen). Kein Datenverlust: ihre Mittwoch-Zeilen sind in
  famc laengst vorhanden
- 94/94 auf beiden Engines
- APP_VERSION → 4.36.2, SW cache → haushalt-v105

## 2026-07-17 — v4.36.1: Nie ein einzelner Chip auf der letzten Zeile

- Maintainer: «there should be two people, or 0» — bei 5 Mitgliedern brach
  die Reihe als 4+1 um (Noel allein). Jetzt misst der rAF-Ausgleich die
  Zeilen (offsetTop-Gruppen); steht unten genau EIN Chip und die Zeile
  darueber hat ≥3, wird ein flex-basis:100%-Umbruch vor deren letzten
  Chip gesetzt → 3+2. Ausgleich laeuft nach jedem Render (Brueche werden
  vorher entfernt), einzeilige Familien unberuehrt
- Test: 5 Fanti-Namen auf 393 px → letzte Zeile ≥ 2 Chips (Boundingbox-
  Zeilengruppen). 92/92
- Fanti-Backfill-Status: Maintainer-08:01-Start war der DOWNLOAD-Start
  (SW aktiviert beim naechsten); Hash noch null, Probe-Zeile
  (lock-probe1) nach Test sofort geloescht
- APP_VERSION → 4.36.1, SW cache → haushalt-v104

## 2026-07-17 — v4.36.0: Viral-Bereitschaft — Delta-Sync (Egress-Diät), Schreib-Auth für verschlüsselte Familien, fairli-Alias

- ALIAS LIVE: https://blauewelt.github.io/fairli/ → /chores/ (eigenes
  Repo blauewelt/fairli, index.html+404.html-JS-Redirect; Pfad, Query
  und Hash bleiben erhalten — /fairli/f/<id> landet korrekt). Kanonisch
  bleibt /chores/; NIE das Haupt-Repo umbenennen (Pages leitet nicht um,
  alle QR-Codes/Icons der Familien stuerben)
- CHOKEPOINT 1 — EGRESS-DIAET: Pull war ~125 KB pro App-Start (Log
  dominiert). Jetzt: (a) Spalten-Diaet auf allen Queries, (b) LOG-DELTA:
  Wasserzeichen 'haushalt.delta:<fam>' (nur SERVER-Zeiten!), Vollabgleich-
  Marke 'haushalt.full:<fam>'; Delta laeuft, wenn Wasserzeichen existiert,
  der letzte Vollabgleich < 24 h her ist und ein Log-Cache da ist. Query:
  or=(created_at.gt.W,updated_at.gt.W) — sieht dank updated_at-Trigger
  auch FREMDE AENDERUNGEN; fremde LOESCHUNGEN erst beim naechsten
  Vollabgleich (dokumentierte Grenze). Merge by id, pendingDeletes
  respektiert, Cap 400. Wiederkehrende Starts: ~10 KB statt 125 KB —
  Supabase-Egress-Wand rueckt von ~40k auf ~400k Starts/Monat
- CHOKEPOINT 2 — SCHREIB-AUTH (famx/famc): WRITEKEY = eigener HKDF-Ast
  (info 'write-key-v1') — aus dem Header laesst sich das Link-Geheimnis
  NICHT gewinnen. Header 'x-fairli-key' auf allen Schreibzugriffen;
  DB speichert nur SHA-256 (families.write_key_hash). RLS: RESTRIKTIVE
  Policies via fairli_write_ok() auf members/chores/log (ins/upd/del)
  und families (upd/del). Hash NULL = offen wie bisher (Alt-Familien,
  Versions-Schnitt). Migration 20260717120000 via db-migrate-Workflow
  angewandt; LIVE VERIFIZIERT: famx-authselftest01 — Schreiben ohne Key
  401/42501, mit Key 201. Hash-Setzen: famx-Ersteinrichtung, famc-
  Migration, BACKFILL fuer bereits Migrierte (Fanti) beim naechsten
  App-Start
- Debug-Lehrstunden dieser Runde: (a) Backfill lief zuerst via push() —
  das erhoehte mutationSeq und ENTWERTETE den eigenen pull (Stale-
  Snapshot-Abbruch, Familie schien leer → Ersteinrichtung!). Backfill
  jetzt als reiner Fetch NACH state-Zuweisung. (b) Debug-Strip-Regex
  frass den firstRunSetup-Aufruf — Massen-Gruen erst nach Wieder-
  herstellung. Regel bleibt: Einfuegen/Entfernen nur an verifizierten
  Statement-Grenzen. (c) Tages-Buendelung schlug wieder im Test zu
  (Delta-Fixture → Einmaliges statt gleicher Kachel)
- 90/90 auf beiden Engines (eigener Bestaetigungslauf nach Phantom-
  Zustand im Sandbox — Doktrin: fremden Logs nicht trauen, selbst rennen)
- APP_VERSION → 4.36.0, SW cache → haushalt-v103

## 2026-07-17 — v4.35.0: Max-Punkte-Skala (Standard 5), Folge-Tipp akkumuliert, Punkte im Verlauf editierbar

- MAX. PUNKTE (Einstellungen → 🎯): Skala des Punkte-Sliders waehlbar
  3/5/10, Standard 5 (war 15 — Maintainer: 1–5 reicht zum Start). Beim
  Bearbeiten weicht die Skala nie unter den Bestandswert (8-Punkte-
  Kachel bleibt bei 8 editierbar). Hinweistext im Sheet: Mehrfach-
  Tippen addiert — die Skala ist keine harte Grenze
- FOLGE-TIPP AKKUMULIERT (Maintainer-Vereinfachung): erneuter Tipp auf
  dieselbe Sache innerhalb 1 h ADDIERT die Punkte in die BESTEHENDE
  Log-Zeile (PATCH) statt eine neue anzulegen. done_at bleibt der
  erste Tipp — das Fenster schliesst sich von selbst. Alt-Serien
  (mehrzeilig) bleiben unangetastet und rendern weiter gebuendelt.
  Dabei entdeckt: der pressLock-Doppeltipp-SCHUTZ (600 ms, einst
  Feature) ist unter der neuen Semantik obsolet → auf 250 ms
  Geister-Klick-Filter reduziert; Absicht doppelt-tippt jetzt durch
- PUNKTE IM VERLAUF EDITIERBAR: Einzelzeilen bekommen im Eintrag-Sheet
  ein Punkte-Feld (0–99, PATCH); Punkte-Ansicht folgt sofort.
  Alt-Serien (n>1) bewusst ohne Punkte-Feld (Maintainer: separat rendern ok)
- Test-Erkenntnis: Tages-Buendelung fasst akkumulierte + aeltere Zeile
  DESSELBEN Tages weiter zusammen (Anzeige-Summe korrekt) — Fixture
  auf «gestern» gelegt, Tagesgrenze trennt
- 2 neue i18n-Schluessel × 19. 86/86 auf beiden Engines
- APP_VERSION → 4.35.0, SW cache → haushalt-v102

## 2026-07-17 — v4.34.4: Mehrzeilige Chip-Reihen zentriert (Umbruch wirkt gewollt)

- Maintainer-Feinschliff-Wunsch: der Umbruch (v4.34.3) liess «Noel» als
  verwaisten Einzel-Chip links haengen. Jetzt: bricht die Reihe um,
  zentriert sich jede Zeile (.iam.multi via rAF-Messung scrollHeight>60)
  — Symmetrie statt Ueberlauf-Optik. Einzeilige Familien bleiben exakt
  wie bisher linksbuendig. Wrap-vs-Scroll-Frage entschieden: Wrap zeigt
  die ganze Familie ohne verstecktes Scrollen; Revert waere eine Zeile
- LEHRSTUNDE (selbstverschuldet): einzeiliger Regex-Insert traf die
  ERSTE PHYSISCHE ZEILE eines mehrzeiligen Statements → Code MITTEN in
  den Ausdruck injiziert → App-Skript tot, Massen-Testversagen. Regel:
  Einfuegungen NUR an verifizierten Statement-GRENZEN ankern, nie per
  Zeilen-Regex in Template-Literal-Naehe
- 80/80 auf beiden Engines
- APP_VERSION → 4.34.4, SW cache → haushalt-v101

## 2026-07-17 — v4.34.3: Personen-Chips brechen um (grosse Familien)

- Maintainer-Screenshot: als 5. Chip wurde er selbst seitlich aus dem Bild
  gequetscht (.iam war overflow-x:auto — horizontales Scrollen, das
  niemand entdeckt). Fix: flex-wrap:wrap + row-gap — grosse Familien
  bekommen zwei oder mehr Zeilen, jeder Chip bleibt vollstaendig sichtbar
- Test: 6 Mitglieder mit langen Namen auf 393px — jede Chip-Boundingbox
  vollstaendig im Viewport. mockBackend um memberRows-Override erweitert
  (gleiches Muster wie logRows)
- Hinweis: Chip-REIHENFOLGE im Screenshot war noch die Chiffrat-Sortierung
  (v4.34.2 war beim Aufnahmezeitpunkt noch nicht aktiv auf dem Geraet) —
  heilt sich mit dem naechsten App-Start von selbst
- 78/78 auf beiden Engines
- APP_VERSION → 4.34.3, SW cache → haushalt-v100 (dreistellig!)

## 2026-07-17 — v4.34.2: Personen-Chips wieder alphabetisch (Chiffrat-Sortierung behoben)

- Maintainer-Frage «was bestimmt die Chip-Reihenfolge?» deckte einen
  Verschluesselungs-Nebeneffekt auf: der Pull sortierte serverseitig
  per order=name — seit der Migration ist name aber CHIFFRAT, die
  Chips standen also in Base64-Kauderwelsch-Reihenfolge (stabil, aber
  sinnlos). Fix: nach dem Entschluesseln clientseitig localeCompare
  (LOCALE, sensitivity base) — einheitlich fuer alle Familien.
  Merke: serverseitige ORDER BY auf ENC_FIELDS-Spalten ist fuer
  famx/famc bedeutungslos — Ordnung gehoert hinter decRows()
- (chores order=points.desc,name hat dasselbe Muster im Namens-Tiebreak;
  folgenlos, da sortedChores() clientseitig ohnehin neu ordnet)
- 76/76 auf beiden Engines
- APP_VERSION → 4.34.2, SW cache → haushalt-v99

## 2026-07-17 — v4.34.1: Android-Tastatur überdeckt Sheets nicht mehr; Fanti-Migration LIVE VERIFIZIERT

- ROSSI-WG-MIGRATION (Maintainer, 17.07. 02:42) end-to-end verifiziert:
  Alt-Zeilen 0/0/0, famc-Kopie 5/33/276 (33 = 34 minus die bewusst
  geloeschte Haus-kühlen-Zombie-Kachel — Buchhaltung exakt), Werte
  enc1:-Chiffrat, Wegweiser gesetzt, Grabstein 00:40 UTC, Klartext-
  Einfuegung prallt mit 42501 ab. Erste echte Familie verschluesselt
- Tastatur-Fix (Maintainer-Screenshot: «Save + log» hinter der Android-
  Tastatur): interactive-widget=resizes-content im Viewport-Meta —
  die Tastatur VERKLEINERT die Seite statt sie zu ueberdecken, das
  Bottom-Sheet steigt darueber. Dazu .sheet mit max-height 100dvh
  (dvh folgt dem geschrumpften Viewport) + overflow-y:auto +
  overscroll-behavior:contain — auch extrem eingequetscht bleibt der
  Primaerknopf per Scroll erreichbar. Test simuliert Tastatur via
  360px-Viewport und prueft, dass der Knopf im sichtbaren Bereich liegt
- Entscheidung festgehalten (Maintainer einverstanden): Backup-Download
  BLEIBT (Versicherung gegen «erfolgreich, aber falsch», nicht gegen
  Abbruch); KEINE Auto-Migration fremder Familien (Konsens-Prinzip);
  stattdessen kommt ggf. ein sanfter Hinweis fuer Alt-Familien-Admins
- 76/76 auf beiden Engines
- APP_VERSION → 4.34.1, SW cache → haushalt-v98

## 2026-07-16 — v4.34.0: Neue Kacheln — Sortierung bestimmt den Platz, Scroll+Flash führen hin; Migrations-Checkbox entfernt

- Kachel-Platzierung (Maintainer): der pinChore-Zwang «neu = oben links»
  stammt aus der Vor-Sortier-Zeit und KAEMPFTE gegen die neuen Modi.
  Jetzt: die aktive Sortierung bestimmt den Platz (Standard «Nach
  Erstellung» → hinten), der bereits existierende Scroll+Flash
  (smooth scrollIntoView + .flash-Animation) fuehrt das Auge hin.
  created_at wird beim Anlegen auch LOKAL gesetzt (sofort korrekt
  einsortiert, nicht erst nach dem naechsten Pull)
- Migrations-Sheet: Checkbox «alle Geraete aktualisiert» ENTFERNT —
  seit dem Server-Grabstein (v4.33.2) technisch obsolet. Text erklaert
  die neue Realitaet ehrlich (Nachzuegler koennen nichts beschaedigen;
  nur ungesendete Eintraege ihrer einen Sitzung gingen verloren →
  ruhiger Moment empfohlen). EIN bewusster Tipp bleibt: Auto-Migration
  beim ersten Admin-Boot wurde ERWOGEN UND VERWORFEN — sie wuerde auch
  fuer fremde Familien entscheiden (mehrere in der DB!), deren Admin
  nie gefragt wurde, inkl. Ueberraschungs-Backup-Download. Irreversible
  Formatwechsel brauchen eine bewusste Hand
- webkit-Flake notiert (Kontext-Crash im Parallellauf, Wiederholung
  3/3 gruen, Vollsuite danach 74/74)
- APP_VERSION → 4.34.0, SW cache → haushalt-v97

## 2026-07-16 — v4.33.3: Kachel-Flackern behoben (Sitzungs-Gedächtnis), Verschlüsselungs-Zeile nur wo relevant

- Maintainer-Android-Befund: seit den v4.32-Skeletons wirkte eine ruhige
  Seite unruhig. Ursache: render() baut das Grid bei jedem Anlass neu
  (Sync, Toast, Tab-Rueckkehr) → jedes <img> entsteht NEU → transparent
  + Schimmer + Fade, auf Android zusaetzlich echte Re-Fetches (knauserige
  Cache-Header bei pollinations) und bis zu ~30 s Schimmer auf Retry-Kacheln
- Fix: ARTOK-Set als Sitzungs-Gedaechtnis — einmal geladene URLs rendern
  bei jedem weiteren Aufbau SOFORT mit .ok (kein Fade, kein Skeleton),
  plus complete-Check nach dem Grid-Aufbau fuer Cache-Sofortlader,
  plus prefers-reduced-motion respektiert (Transition+Schimmer aus)
- Einstellungen: Verschluesselungs-Zeile erscheint NUR noch, wo die
  Handlung existiert (Alt-Familie + Admin-Geraet). Verschluesselte
  Familien sehen sie gar nicht (Maintainer-Vorschlag) — einen Rueckweg zu
  Klartext gibt es bewusst nicht, also auch keinen toten Schalter
- VORFALL dokumentiert: Sandbox enthielt beim Turn-Start einen
  PHANTOM-Zustand (index.html auf '4.34.0' mit halben artOk-Edits +
  1 Extra-Test) — mutmasslich abgebrochener frueherer Anlauf desselben
  Auftrags. Doktrin bewaehrt: Remote ist Wahrheit → frisch fetchen,
  Batch sauber neu anwenden; den (korrekten) Flacker-Regressionstest
  des Phantoms uebernommen (Label auf 4.33.3 korrigiert). MERKE: nach
  Anker-Fehlern IMMER Version+grep pruefen, nie blind weitereditieren
- 74/74 auf beiden Engines
- APP_VERSION → 4.33.3, SW cache → haushalt-v96

## 2026-07-16 — v4.34.0: Kunst-Flackern behoben, Verschlüsselungs-Zeile für famx/famc ausgeblendet

- Flacker-Analyse (Befund Maintainer, Android): render() baut das Grid per
  innerHTML neu — 23 Aufrufstellen. Jeder Re-Render (Sync-Pull, Tab-
  Rueckkehr, Chip-Wahl) erzeugte FRISCHE <img> mit opacity:0, die trotz
  Browser-Cache erneut 350 ms einfaedelten: ruhige Seite, blinkendes
  Board. Fix: ART_OK-Set merkt geladene URLs; bekannte Bilder rendern
  sofort sichtbar (Klasse 'ok' ab Geburt), Shimmer nur fuer echtes
  Erst-Laden. Ein gemeinsamer artImg()-Erzeuger fuer beide Kachel-Arten.
  Test: Tab-Wechsel hin/zurueck → Bild traegt 'ok' SOFORT im Markup
- Verschluesselte Familien sehen die Verschluesselungs-Zeile GAR NICHT
  mehr (Maintainer: Einbahnstrasse braucht keinen Hebel; vorher: disabled).
  Handler null-sicher (Falle: erster Patch-Anker war geraten statt
  gelesen — Anker IMMER aus der Datei kopieren)
- 74/74 auf beiden Engines
- APP_VERSION → 4.34.0, SW cache → haushalt-v96

## 2026-07-16 — v4.33.2: Server-Grabstein — Klartext-Auferstehung jetzt SERVERSEITIG unmöglich

- Maintainer-Frage «was passiert mit nicht-aktualisierten Geraeten?» ehrlich
  zu Ende gedacht: der Client-Guard (v4.33.1) schuetzt nur Clients, DIE
  IHN HABEN. Ein Geraet, das seit Wochen schlief, fuehrt beim ersten
  Start nach der Migration IMMER noch einmal den alten Cache-Stand aus
  (SW aktualisiert im Hintergrund, aktiv erst beim naechsten Start) —
  dieses Fenster ist clientseitig prinzipiell nicht schliessbar
- Loesung: Migration 20260716210000_retired_families.sql — Tabelle
  retired_families + RESTRIKTIVE RLS-Policies: INSERT in members/chores/
  log unter beerdigter family_id wird vom SERVER abgelehnt, egal wie alt
  der Client ist. Grabsteine sind endgueltig (keine UPDATE/DELETE-Policy).
  Angreifer-Kalkuel unveraendert: wer den publishable key hat, kann heute
  schon alles loeschen — der Grabstein erweitert keine Angriffsflaeche
- runMigration setzt den Grabstein nach Verifikation+Loeschung — per
  ROH-Fetch: sb()/famRows haette family_id mit ROWFAM (famc-Hash!)
  ueberschrieben und das falsche Grab beschriftet. Test pinnt die ID
- Verhalten nicht-aktualisierter Geraete nach Migration damit: Wegweiser-
  Name + leeres Grid, Schreibversuche prallen ab (Sync-Punkt rot),
  naechster App-Start → neue Version → famc-Probe → alles wieder da
- 72/72. Migration via db-migrate-Workflow angewandt und live verifiziert
- APP_VERSION → 4.33.2, SW cache → haushalt-v95

## 2026-07-16 — v4.33.1: KRITISCH — Klartext-Auferstehung nach Migration verhindert

- Maintainer-Upgrade-Frage loeste den Befund aus: Der Leere-Backend-Upload
  (pull: «members leer → lokalen Stand hochladen», seit v2.3) haette
  nach einer fam→famc-Migration auf JEDEM noch nicht aktualisierten
  Geraet den kompletten Klartext-Datensatz unter der alten ID
  WIEDERAUFERSTEHEN lassen. Der Zombie-Kachel-Mechanismus, in
  Familiengroesse — entdeckt VOR Maintainer-Migration, nicht danach
- Fix 1: Upload nur noch, wenn AUCH keine families-Zeile existiert
  (existiert sie — z. B. als Wegweiser — ist die Familie bekannt,
  leerer members-Stand heisst dann NICHT jungfraeulicher Server).
  Gegenprobe gefuehrt: Test schlaegt auf dem alten Code an (Guard
  temporaer entfernt → uploads > 0), mit Guard gruen
- Fix 2: Geraete mit Probe-Cache '0', die die Migration verpasst haben
  (Alt-Zeilen leer, families-Zeile da): Cache verwerfen + EIN Neustart
  (sessionStorage-Schleifenschutz) → famc wird entdeckt, Daten wieder da
- Wording: Verschluesselungs-Status zeigt Zustand «Aus» statt Handlung
  «Aktivieren…» (Maintainer las «Enable…» als «encrypted») — 'Aus' × 19 Dicts
- Achtung Testfallen: LS_STATE heisst 'haushalt.v2:<fam>' (Test mit
  falschem Schluessel bestand VAKUOS — Gegenprobe ist Pflicht)
- 72/72. Fanti-WG-Migration jetzt freigegeben (Anleitung in Chat/LOG):
  alle Geraete einmal oeffnen (≥4.31 im Footer), dann Admin →
  Einstellungen → Verschluesselung → Checkbox → Start; gleiche URL,
  niemand wird neu eingeladen
- APP_VERSION → 4.33.1, SW cache → haushalt-v94

## 2026-07-16 — v4.33.0: Verifiziertes Löschen, Duplikat-Hinweis, Kachel-Sortierung (Standard: nach Erstellung)

- Historien-Korrektur, zweiter Anlauf (Maintainer hatte VOLLSTAENDIG recht):
  Der etablierte Schema-Weg ist .github/workflows/db-migrate.yml
  (workflow_dispatch) mit Repo-Secret SUPABASE_DB_PASSWORD (12.06.,
  18:33) — CI hat offenes Netz zum Pooler (eu-north-1), die Sandbox
  nicht. Claude kann Migrationen also SELBST anwenden: SQL committen →
  Workflow dispatchen → via REST verifizieren. Genau so lief die
  created_at-Migration am 16.07. (Run gruen, created_at verifiziert).
  Lehre: nicht nur nach Credentials suchen, auch nach WEGEN (das
  Journal nannte «DB migrations via GitHub Actions» woertlich)
- VERIFIZIERTES LÖSCHEN (Root-Cause-Fix der Haus-kühlen-Forensik):
  deleteRemote versucht 1 Wiederholung (900 ms); scheitert auch die,
  wird die Zeile WIEDERHERGESTELLT (Kachel/Person/Log-Eintrag kehren
  zurueck) + ehrlicher Toast «Löschen fehlgeschlagen — wiederhergestellt».
  push() unterdrueckt den generischen Sync-Toast fuer bereits behandelte
  Fehler (err.silent), Sync-Punkt wird trotzdem rot
- DUPLIKAT-HINWEIS beim Anlegen: Name existiert schon (case-insensitiv)
  → Inline-Hinweis «… gibt es schon» + Knopf «Stattdessen verbuchen»
  (verbucht auf der BESTEHENDEN Kachel, kein Zwilling)
- SORTIERUNG (Einstellungen → ↕️): 'Nach Erstellung' (NEUER STANDARD —
  stabile Positionen, Neues hinten), 'Alphabetisch', 'Nach Nutzung'
  (bisheriges Verhalten). Wahl in localStorage pro Geraet.
  Maintainer-Begruendung: Kacheln muessen auffindbar bleiben, das
  Nutzungs-Ranking verschob sie staendig
- Migration 20260716200000_created_at.sql: created_at auf chores/members/
  log + updated_at-Trigger auf chores — DER MAINTAINER PASTET SIE im SQL-Editor.
  Bis dahin: 'Nach Erstellung' bricht fehlende Zeitstempel alphabetisch;
  Altbestand teilt sich den Migrations-Zeitpunkt (echte Reihenfolge
  nicht rekonstruierbar — dokumentierte Grenze)
- 7 neue i18n-Schluessel × 19; Tests: Loeschung-scheitert-zweimal
  (Kachel kehrt zurueck, 2 Versuche gezaehlt), Duplikat-Fluss,
  Sortier-Umschaltung+Persistenz. 70/70
- APP_VERSION → 4.33.0, SW cache → haushalt-v93

## 2026-07-16 — v4.32.0: LIVE-BUG Punkte-Tab behoben + Tages-Köpfe, Skeletons, Haptik, schlanker Kopf

- KRITISCH, beim Code-Lesen fuer die UI-Runde entdeckt: der Punkte-Tab
  war seit v4.27 (i18n-Release, 15.07.) LIVE KAPUTT — `const t = totals()`
  schattete die i18n-Funktion t(), `t('Diese Woche')` warf «t is not a
  function», die Ansicht blieb leer. KEIN Test oeffnete je den Punkte-Tab
  (Pyramiden-Luecke). Fix: Umbenennung in `tot` + Warnkommentar; NEUER
  Regressionstest rendert Punkte (Balken, Krone, Zaehler, Perioden-
  Umschalter). Zaehler-Zeile dabei uebersetzt ('{n} Aufgabe(n) erledigt')
- Verlauf: Tages-Koepfe «Heute»/«Gestern»/Datum (lokalisiert), Zeilen
  zeigen nur noch die Zeit. Serien enden jetzt an der TAGESGRENZE
  (sonst zaehlte «×N» unter «Heute» stillschweigend gestrige mit).
  Leer-Zustand uebersetzt. 6 neue i18n-Schluessel in allen 19 Woerterbuechern
- Kachel-Kunst: Shimmer-Skeleton bis zum Laden (statt Bild-Pop-in),
  sanftes Einblenden via onload
- Haptik: kurzes Vibrieren (12 ms) beim Verbuchen, wo unterstuetzt
- Kopf schrumpft beim Scrollen (Hysterese 46/12 px gegen Flattern)
- Testinfrastruktur: famx-/Migrations-Test muessen externe Hosts
  (pollinations, fonts) abbrechen wie mockBackend — webkit wartet beim
  reload sonst auf echte Bild-Requests (Timeout). Vorsicht bei
  Einfuege-Ankern: Block landete einmal IN einem Objekt-Literal
- 64/64 auf beiden Engines
- APP_VERSION → 4.32.0, SW cache → haushalt-v92

## 2026-07-16 — v4.31.1: Einstellungen-Zeilen richtig gebaut, dunkles Zeit-Feld

- Maintainer-Screenshots: (1) Einstellungen-Zeilen klebten zusammen
  («LanguageEnglish») — .setrow/.setval hatten KEIN CSS, .menuitem ist
  block → Spans konkatenieren. Jetzt echtes Zeilen-Layout: Icon (🌐 🔒 ✨),
  Label (flex:1), Wert gedimmt rechts (ellipsis), Chevron ›;
  54px Tap-Ziel; disabled gedimmt. Version zentriert dezent
- (2) #lTime (datetime-local) war das native helle Browser-Widget —
  einziges ungestyltes Eingabefeld. Jetzt wie alle Felder: card-Hintergrund,
  ink-Farbe, Radius, volle Breite — plus color-scheme:dark, damit auch
  der native Picker dunkel rendert
- Merke: Klassen im Markup IMMER gegen existierendes CSS pruefen —
  .setval war Wunschdenken ohne Regelwerk
- 60/60 auf beiden Engines
- APP_VERSION → 4.31.1, SW cache → haushalt-v91

## 2026-07-16 — v4.31.0: Einstellungen, Opt-in-Verschlüsselung für Alt-Familien (GLEICHE URL), Verlauf-Zeilen-Tipp, Select-all

- NEU ⚙︎ Einstellungen-Sheet (ersetzt 🌐 im Kopf): Sprache (vom Geraet
  abgeleitet, Override bleibt in localStorage), Verschluesselungs-Status
  mit Migrationseinstieg, «Was ist neu»-Link, Versionszeile
- Opt-in-Migration fam- → verschluesselt mit GLEICHER URL: Zeilen ziehen
  unter 'famc-' + SHA-256(Familien-ID)[:48] um — Links, QR-Codes und
  installierte Icons bleiben gueltig, niemand wird neu eingeladen.
  Erkennung: localStorage-Cache 'haushalt.encv:<fam>', sonst einmalige
  famc-Probe. Ablauf mit Sicherheitsnetz: JSON-Backup aufs Geraet →
  verschluesselte KOPIE schreiben → Zeilenzahlen VERIFIZIEREN → erst
  dann Klartext loeschen; families.name der alten Zeile wird zum
  Wegweiser «→ App aktualisieren» fuer veraltete Clients. Checkbox
  «Alle Geraete aktualisiert» gated den Start; Fehlerpfad loescht
  nichts und stellt den Kontext zurueck
- Verlauf: ganze Zeile ist jetzt der Knopf (⋯-Menue entfernt — Bearbeiten/
  Loeschen wohnen im Eintrag-Sheet, das Menue war Redundanz), Chevron ›
  als Affordance. Loeschen weiterhin mit Undo
- Textfelder in Sheets: Fokus markiert den Inhalt — Tippen ersetzt.
  (Wert-Pruefung INNERHALB des rAF: showModal fokussiert bevor Werte
  gesetzt sind)
- Drei Debug-Lektionen dokumentiert: (1) Refactor-Fossil — deriveKey()
  extrahiert, aber CRYPTO_READY referenzierte noch das alte `raw` →
  jeder Boot im Krypto-Kontext starb als rejected Promise; (2) cPts ist
  ein RANGE-Slider, cName in Bearbeiten hinter «✎ Ändern» versteckt —
  Select-all-Test gehoert auf ein echtes Textfeld (logSheet); (3)
  waitForURL auf die SELBE URL loest sofort aus — auf Status-Text warten
- mockBackend respektiert jetzt family_id-Filter (sonst haelt die
  famc-Probe jede Testfamilie fuer verschluesselt)
- 60/60 auf beiden Engines
- APP_VERSION → 4.31.0, SW cache → haushalt-v90

## 2026-07-16 — v4.30.0: Ende-zu-Ende-Verschlüsselung für neue Familien (GDPR)

- VERSIONS-SCHNITT statt Migration (Maintainer-Einsicht: mehrere unbekannte
  Familien in der DB, Client-Updates nicht koordinierbar — ein Umzug
  bestehender Daten riskiert Split-Brain zwischen alten und neuen
  Clients derselben Familie):
  * Bestehende 'fam-'-Familien: fuer immer Klartext, alte wie neue
    Clients funktionieren unveraendert
  * NEUE Familien bekommen 'famx-'-IDs und sind ab Geburt verschluesselt
    — der Link selbst traegt das Schema, kein Probing noetig. Beitretende
    laden immer den frischen Client (Link → Netz), veraltete Clients
    existieren nur hinter Icons von Alt-Familien
- Krypto (WebCrypto, keine Libraries): DB-Zeilenschluessel = 'famx-' +
  SHA-256(Link-Geheimnis) — die DB kennt das Geheimnis nie; ein
  DB-Dump ist ohne Link unlesbar. Werte: AES-GCM-256, Schluessel per
  HKDF (salt fairli-v1), Zufalls-IV pro Wert, Format 'enc1:'+b64(iv|ct)
- Verschluesselte Felder: families.name, members.name,
  chores.name/note/art, log.chore_name/chore_note/member_name.
  KLARTEXT bleiben (akzeptierte Metadaten): Punkte, Zeitstempel, IDs,
  member.url_slug (Zufalls-Lookup-Schluessel), Farben
- Integration an den zwei Choke-Points sb()/upsert() (encrypt on write,
  decrypt on read); famRows setzt jetzt IMMER ROWFAM (explizites
  family_id im families-POST haette den Klartext-Schluessel geleakt —
  behoben). Korrupte Zeile → '···' statt Absturz
- BEKANNTE OFFENLEGUNGEN (dokumentiert, bewusst): Kachel-Kunst sendet
  Aufgaben-Namen an pollinations.ai (Prompt) — auch bei famx; lokaler
  Geraete-Cache (localStorage) bleibt Klartext. Optionaler Kunst-Schalter
  fuer famx = moeglicher Folgeschritt
- OFFEN (Maintainer unentschieden): TTL/Aufbewahrungsfrist — orthogonal,
  spaeter entscheidbar. Opt-in-Verschluesselung fuer Alt-Familien
  (Admin-Aktion, wenn alle Geraete aktuell) = moeglicher Folgeschritt
- Test: famx-E2E-Vertrag (kein Klartext im Netzverkehr, Hash-Schluessel
  famx-[48 hex], enc1:-Werte im Store, Roundtrip auf frischem Geraet
  rendert Namen korrekt); Mock bildet jetzt merge-duplicates ab.
  56/56 auf beiden Engines
- APP_VERSION → 4.30.0, SW cache → haushalt-v89

## 2026-07-15 — v4.29.0: Top 20 komplett — 13 neue Sprachen

- Dritte und letzte Charge des Top-20-Plans: nl, pl, tr, sv, da, ru,
  uk, hi, zh, ja, ko, vi, id — je 71 Schluessel, vollstaendig uebersetzt
  (inkl. Schrift-Systeme: Kyrillisch, Devanagari, Han, Kana, Hangul)
- Fairli spricht damit 20 Sprachen: de en fr it es pt ro nl pl tr sv da
  ru uk hi zh ja ko vi id — Sprachnamen im Sheet nativ (中文, हिन्दी, …)
- Der Integritaets-Test prueft alle 19 Woerterbuecher automatisch
  (Schluessel-Paritaet, Platzhalter, nie leer) — alle gruen, 54/54
- Alle Woerterbuecher im SW-Precache (je ~3 KB; offline verfuegbar)
- Bewusst NICHT dabei: Arabisch — echte RTL-Layoutarbeit noetig
  (dir=rtl, Sheet-Slots, Chips, Menue-Ausrichtung); als eigenes
  Vorhaben dokumentiert, nicht als 21. JSON-Datei
- APP_VERSION → 4.29.0, SW cache → haushalt-v88

## 2026-07-15 — v4.28.0: Fünf neue Sprachen — Français, Italiano, Español, Português, Română

- Zweite Sprach-Charge des Top-20-Plans: fr (fr-CH), it (it-CH),
  es (es-ES), pt (pt-PT), ro (ro-RO) — je 71 Schluessel, vollstaendig.
  Damit sind alle Schweizer Landessprachen ausser Raetoromanisch da,
  plus die grossen romanischen Sprachen
- Der Integritaets-Test prueft jetzt ALLE i18n/*.json automatisch:
  identische Schluesselmenge wie en.json, Platzhalter-Paritaet, nie
  leer. Eine kuenftige Sprache kann gar nicht unvollstaendig landen
- Alle sechs Woerterbuecher im SW-Precache (offline verfuegbar)
- 54/54 gruen auf beiden Engines
- Naechste Chargen: nl/pl/tr/sv/da, dann ru/uk/hi/zh/ja/ko/vi/id,
  ar zuletzt (RTL-Layoutarbeit noetig)
- APP_VERSION → 4.28.0, SW cache → haushalt-v87

## 2026-07-15 — v4.27.0: Internationalisierung — Fairli spricht jetzt Englisch (Infrastruktur fuer 20 Sprachen)

- Architektur (mit Maintainer abgestimmt): leichtgewichtiges Vanilla-JS,
  KEIN Framework. Deutsch ist die Quellsprache und der SCHLUESSEL —
  t('Speichern') schlaegt im Woerterbuch nach; fehlt die Uebersetzung,
  erscheint Deutsch (nie leerer Text). Platzhalter als {token}
- Woerterbuecher als i18n/<lang>.json (eine Datei pro Sprache, ~3 KB),
  nur die gewaehlte Sprache wird geladen; localStorage-Kopie fuer
  Offline + Instant-Boot; en.json im SW-Precache
- Sprachwahl: 🌐-Knopf im Kopf → Sprach-Sheet (Standard-Anatomie);
  Erststart per navigator.language, Wahl in localStorage
  (haushalt.lang). html-lang-Attribut + Datums-Locale (de-CH/en-GB)
  wechseln mit
- Statisches HTML via data-i18n (Original wird in dataset gemerkt →
  verlustfrei hin- und herschaltbar); Dynamik via t() an ~50 Stellen:
  Kacheln, Menues, Sheets (Aufgabe/Eintrag/Install/Einladen/Personen/
  Sprache), Toasts, Empty-States, Anleitung, Entry-Kernknoepfe,
  Aria-Labels, Platzhalter
- Bewusst NICHT uebersetzt (dokumentiert): Diagnose-Zeilen der
  Einstiegsseite (Geoeffnet/Von/Modus — Debug-Werkzeug), LOG/Doku
- Tests: Playwright-Locale auf de-CH gepinnt (sonst booten Tests
  englisch!); neuer End-to-End-Sprachwechsel-Test (Statik+Dynamik+
  Persistenz+Rueckweg) + Woerterbuch-Integritaet (Platzhalter-Paritaet,
  nie leer, >60 Schluessel). 54/54 auf beiden Engines. ESM-Falle:
  Playwright-Spec ist ESM — require() gibt es nicht, import nutzen
- NAECHSTE SCHRITTE (Top-20-Plan): fr, it, es, pt, ro als naechste
  Charge; dann nl, pl, tr, sv, da; dann ru, uk, ar (RTL-Layout!),
  hi, zh, ja, ko, vi, id. Pro Sprache: JSON anlegen, LANGS+LOCALES
  ergaenzen, sw-Precache, Integritaets-Test greift automatisch
- APP_VERSION → 4.27.0, SW cache → haushalt-v86

## 2026-07-15 — v4.26.1: Kachelbilder überstehen den Repaint-Sturm (Retry statt Sofort-Entfernen)

- Maintainer-Screenshot nach v4.26.0: etliche Kacheln OHNE Bild. Ursache:
  der Prompt-Wechsel machte ALLE Kacheln gleichzeitig zum Cache-Miss
  (Pollinations cached auf dem Prompt-Text) → Massen-Generierung →
  einzelne Requests gedrosselt/timeout → unser onerror="this.remove()"
  entfernte das Bild ENDGUELTIG beim ersten Fehlversuch
- Fix: window.artRetry(img) — bis zu 3 Wiederholungsversuche mit Backoff
  (5/10/15 s), erst danach entfernen. Ein transienter Drossel-Moment
  kostet keine Kachelkunst mehr
- Merke (dokumentiert): Prompt-Aenderungen repainten das GANZE Board —
  einplanen, nie beilaeufig tweaken
- APP_VERSION → 4.26.1, SW cache → haushalt-v85

## 2026-07-15 — v4.26.0: Kachel-Kunst zeigt das genannte Ding (nicht «household chore»)

- Befund von Maintainer: Die Einmalig-Kachel zeigte langweilige Putz-Motive
  statt einer Sternschnuppe, und «App developen» bekam eine Kueche.
  Ursache HARDCODED im Bild-Prompt: «minimalist flat vector illustration
  of household chore: <name>» — das «household chore:»-Framing ueberschrieb
  das eigentliche Motiv
- Fix: Prompt beschreibt jetzt das GENANNTE Subjekt selbst
  («<name>, minimalist flat vector illustration, single subject, …»),
  ohne Haushalts-Zwang. «App developen» wird jetzt App-Entwicklung,
  «Abfluss reinigen» ein Abfluss usw.
- Neu: optionaler c.art-Override fuer Spezialkacheln. Die Einmalig-Kachel
  nutzt ihn fuer einen expliziten Prompt («a single glowing shooting star
  with a bright trail across a night sky») — verlaesslich ein Stern,
  keine Motiv-Lotterie mehr
- Regressionstest: Prompt enthaelt den Namen bzw. den Stern und NIE mehr
  «household chore»; Seed ist numerisch (Pollinations verlangt eine Zahl,
  sonst HTTP 400 — geprueft)
- APP_VERSION → 4.26.0, SW cache → haushalt-v84

## 2026-07-14 — v4.25.1: Verlauf-Menü grösser & Löschen abgesetzt

- Maintainer: die ⋯-Menüeinträge im Verlauf waren zu klein — Ursprung des
  Fehltipps. Jetzt: 16px/fett, min-height 52px (komfortabel über der
  44px-Tap-Richtlinie), breiteres Menü (216px), mehr Innenabstand
- Destruktives («Löschen») bekommt .danger: eigene Zeile mit Abstand und
  Trennlinie darüber — schwerer versehentlich zu treffen. Gilt auch fürs
  Personen-Menü. Inline-Rot durch die Klasse ersetzt (var(--red))
- Regressionstest prüft jetzt zusätzlich: Löschen-Eintrag hat .danger und
  ist ≥48px hoch
- APP_VERSION → 4.25.1, SW cache → haushalt-v83

## 2026-07-14 — v4.25.0: + ist kontextsensitiv, Zeit im Verlauf bearbeitbar

- «+» folgt jetzt der Regel «keine unsichtbaren Aktionen» (Maintainer):
  im VERLAUF oeffnet es «Einmalig eintragen» (Ergebnis sofort sichtbar),
  in AUFGABEN wie bisher «Neue Aufgabe». FAB-Aria-Label wechselt mit
- Eintrag-Bearbeiten hat ein ZEIT-Feld (datetime-local, native Picker):
  * Einzeleintrag: Zeit wird direkt gesetzt
  * SERIE: alle Eintraege verschieben sich um DASSELBE Delta — Abstaende
    und Reihenfolge bleiben, die Serie bleibt eine Serie («×3 gestern
    Abend» statt drei identischer Zeitstempel)
  * done_at im PATCH pro Zeile; Verlauf wird neu sortiert; Wochen-Punkte
    passen sich automatisch an (totals() rechnet ab done_at)
- 2 neue Tests (50/50, beide Engines)
- Offen zur Diskussion: In der PUNKTE-Ansicht oeffnet + weiterhin
  «Neue Aufgabe» (auch dort waere die Kachel unsichtbar) — gleiche
  Behandlung wie Verlauf?
- APP_VERSION → 4.25.0, SW cache → haushalt-v82

## 2026-07-14 — v4.24.0: Undo beim Verlauf-Löschen + Kunst für die Einmalig-Kachel

- Maintainer-Fehltipp-Befund: Loeschen im Verlauf war reibungslos, aber
  unumkehrbar. Jetzt: Toast «Geloescht · Rueckgaengig» (5 s)
- Architektur bewusst «verzoegerter Commit» statt DELETE+Re-INSERT:
  push() ist fire-and-forget (KEINE serielle Queue) — ein Undo per
  Wieder-Einfuegen koennte das DELETE am Server ueberholen. Deshalb:
  lokal sofort weg, pendingDeletes schirmt gegen Pulls ab, der
  Server-DELETE geht erst NACH dem Fenster raus. Undo ist rein lokal
  (pendingDeletes-Keys raeumen!). App im Fenster geschlossen ⇒ nichts
  geloescht — Wiederauferstehung schlaegt Verlust (Datenregel-Geist)
- confirm() im Bearbeiten-Sheet entfaellt: Undo ersetzt es (weniger
  Reibung, volle Reue-Option), gilt auch fuer Serien («Geloescht (3)»)
- Toast kann jetzt eine Aktion tragen; #toast.show bekommt
  pointer-events:auto (die alte pointer-events:none-Regel machte den
  Rueckgaengig-Knopf unklickbar — vom Test gefangen, nicht vom Nutzer)
- Einmalig-Kachel traegt jetzt Kunst (Sternschnuppe — passend fuer die
  einmalige Aufgabe), gestrichelter Rahmen bleibt als Erkennungszeichen
- 2 neue Tests (46/46, beide Engines): Undo-Fenster-Vertrag (kein DELETE
  im Fenster, DELETE nach Ablauf, Pull frisst Wiederhergestelltes nicht)
  + Einmalig-Kunst
- APP_VERSION → 4.24.0, SW cache → haushalt-v81

## 2026-07-14 — v4.23.1: «Speichern + eintragen» ist beim Anlegen die Primäraktion

- Beim Anlegen einer Aufgabe ist Verbuchen der Normalfall — also ist
  «Speichern + eintragen» jetzt der grosse Primaerknopf (und die
  Enter-Taste); «Nur speichern» wird zum Ghost-Knopf darunter
- Bearbeiten unveraendert (nur «Speichern»), Einmalig unveraendert
  («Eintragen»). Ohne gewaehlte Person bleibt das Sheet offen (Toast);
  «Nur speichern» funktioniert dann weiterhin
- Test deckt jetzt alle drei Knopfrollen ab (Primaer bucht, Ghost nicht,
  Bearbeiten ohne Ghost) — 42/42 gruen auf beiden Engines
- APP_VERSION → 4.23.1, SW cache → haushalt-v80

## 2026-07-14 — v4.23.0: Einmalig-Kachel, Serien-Buendelung, Verlauf-Bearbeiten, Speichern+Eintragen, Install-Sheet nur eigene Plattform

Fuenf Wuensche von Maintainer, gegen die Kachel-Inflation und fuer weniger
Verwirrung:

1. Install-Sheet (vom Banner) zeigt NUR noch die eigene Plattform —
   wer auf dem iPhone steht, sieht keine Pixel-Schritte mehr. Das
   Einladen-Sheet zeigt weiterhin beide (dort hilft man oft anderen).
   installInstructionsHTML(onlyCurrent) — weiterhin EIN Erzeuger
2. Verlauf buendelt SERIEN: tippt dieselbe Person dieselbe Aufgabe
   mehrmals in Folge, wird EINE Zeile daraus («Einkaufen ×3», Punkte
   summiert). Dreimal tippen ersetzt Gross/Klein-Kachel-Varianten.
   Loeschen/Bearbeiten wirken auf die ganze Serie (Kebab zeigt Anzahl)
3. Verlauf-Eintraege sind BEARBEITBAR (Titel + Notiz): Kebab →
   «Bearbeiten» → Form-Sheet in Standard-Anatomie (Loeschen links,
   × rechts, Speichern unten, Backdrop-Schutz bei Aenderungen).
   PATCH pro Zeile; save() entwertet laufende Pulls (mutationSeq).
   DB-Proben vorab: PATCH auf log von RLS erlaubt, chore_id darf NULL
4. «Einmalig»-Kachel, IMMER oben links verankert (gestrichelt):
   verbucht eine Aufgabe OHNE neue Kachel anzulegen — gleiche
   Formular-Maske, Primaerknopf heisst dort «Eintragen»
5. «Neue Aufgabe» hat zusaetzlich «Speichern + eintragen» (Ghost-Knopf
   unter dem Primaer): legt die Kachel an UND verbucht sie sofort fuer
   die gewaehlte Person. Nur im Anlege-Modus sichtbar.
   UI-Konsistenz 4↔5: EIN Sheet, EIN recordEntry()-Pfad (auch der
   Kachel-Tipp nutzt ihn jetzt), Modus bestimmt nur Titel + Knoepfe
- 4 neue + 1 angepasster Tier-1-Test, 42/42 gruen auf beiden Engines
- APP_VERSION → 4.23.0, SW cache → haushalt-v79

## 2026-07-14 — v4.22.0: Install-Banner — Empfaenger sehen den Weg zum Icon sofort

- Maintainer-Punkt: Wer einen geteilten Link oeffnet, hat keinen Grund, das
  Einladen-Sheet zu oeffnen — die Install-Anleitung war fuer genau diese
  Zielgruppe unsichtbar
- Neu: schmaler, wegklickbarer Banner unter dem Kopf («📲 Als App auf den
  Home-Bildschirm»), sichtbar in Familien- UND Personen-Sicht, aber NIE
  im Standalone-Modus (laeuft schon als App) und nie nach Dismiss
  (localStorage, kontext-spezifischer Schluessel). Oeffnet ein
  Install-Sheet in Standard-Anatomie (Grabber · Titel · × · Primaer unten)
- Android-Automatik: beforeinstallprompt wird frueh eingefangen; ist das
  native Prompt verfuegbar (Familien-Kontext, Manifest injiziert), zeigt
  das Sheet EINEN Knopf «Jetzt installieren» → System-Dialog → bei Erfolg
  appinstalled-Event → Toast «Installiert ✓», Banner dauerhaft weg.
  iOS hat keine solche API (Apple haelt das manuell) → praezise Schritte
- Anleitung ist jetzt EIN geteilter Erzeuger (installInstructionsHTML)
  fuer Einladen-Sheet (aufklappbar) und Install-Sheet (flach) — keine
  zwei Kopien. Refactor-Stolperer (gestrandetes badge-const → leeres
  Einladen-Sheet) von der Suite gefangen, nicht vom Nutzer
- 2 neue Tier-1-Tests, 34/34 gruen auf beiden Engines. Hinweis: der
  native Android-Prompt selbst ist headless nicht testbar (kein
  beforeinstallprompt) — Abdeckung dort: Banner/Sheet/Fallback-Anleitung
- APP_VERSION → 4.22.0, SW cache → haushalt-v78

## 2026-07-14 — v4.21.0: «Teilen» → «Einladen» — die Verwechslung an der Wurzel beseitigt

- Fairlis eigener Knopf hiess «Teilen» wie Apples Share-Sheet — DIE Quelle
  der Verwirrung in der Install-Anleitung (Maintainer-Punkt). Neu heisst alles
  App-Eigene nach seiner Funktion: Kopf-Knopf und Sheet-Titel «Einladen»,
  Familien- und Personen-Link-Knoepfe «Einladen», App-Link «Empfehlen»
- Damit ist «Teilen» im UI reserviert fuer Apples Original-Wortlaut: die
  Install-Anleitung sagt wieder «Im Browser auf [Symbol] ‹Teilen› tippen»
  (mit Positionen je Browser); der «Nicht der Knopf in Fairli»-Warnhinweis
  aus v4.20.1 ist damit ueberfluessig und raus
- Tier-1-Test angepasst: pinnt jetzt «Einladen» auf Knopf + Sheet-Titel,
  0 Sheet-Buttons mit «Teilen», und «Teilen» in der Anleitung = iOS-Sheet
- APP_VERSION → 4.21.0, SW cache → haushalt-v77
## 2026-07-14 — v4.20.1: Install-Anleitung iOS — Chrome rehabilitiert, «Teilen»-Verwechslung entschärft

- «nicht in Chrome» war veraltet: seit iOS 16.4 installieren Safari, Chrome,
  Edge & Firefox über DASSELBE System-Share-Sheet («Zum Home-Bildschirm»);
  Chrome iOS ist WebKit, Web-Clip-Mechanik identisch. Unsere Manifest-Regel
  (iOS bekommt NIE ein Manifest) ist UA-basiert und greift auch bei CriOS
  («iPhone» steckt im UA-String) → gleiche korrekte URL-Einbackung
- Verwechslungsgefahr behoben: Schritt 2 nannte den iOS-Knopf fett «Teilen»,
  während Fairli oben einen eigenen Teilen-Knopf hat. Neu: nur noch das
  Piktogramm ${icShare} «des Browsers», mit Positionsangabe je Browser
  (Safari unten Mitte / iPad oben rechts / Chrome neben der Adressleiste)
  und explizitem Hinweis «Nicht der Teilen-Knopf hier in Fairli!»
- Zwei neue Tier-1-Tests (30/30 gruen auf beiden Engines):
  (a) Anleitung: enthaelt Chrome, enthaelt kein «nicht in Chrome», das Wort
  «Teilen» nur noch in der Fairli-Abgrenzung, beide SVG-Piktogramme da;
  (b) CriOS-UA-Profil: Route-Handoff ok, kein Manifest-Link, Anleitung
  rendert, iOS-Sektion traegt das «dein Geraet»-Badge
- GRENZE: der Install-Dialog selbst ist ein OS-Sheet — echter
  Chrome-auf-iOS-Install braucht einen manuellen Geraetetest (offen, s.
  DEVELOPER_ONBOARDING §12); Chrome liefert keine Simulator-Builds
- «Fairli weiterempfehlen» entdramatisiert (Maintainer): ⚠︎, Gelbton und
  Grossschreibung («NEUEN») raus — Weiterempfehlen ist etwas Gutes. Neu
  neutraler Hinweis in muted: «Startet einen neuen, leeren Haushalt — zum
  Beitreten euren Familien-Link nutzen». CSS .warn im Share-Sheet durch
  .subnote ersetzt
- APP_VERSION → 4.20.1, SW cache → haushalt-v76
## 2026-07-13 — v4.20.0: iOS backte IMMER die Basis-URL ein — Maintainer-Hypothese per Ground Truth bestaetigt, Ursache behoben

- Tier-2-Capture-Test (6 Iterationen, echter Share-Flow im Simulator, dann
  plist der frisch erzeugten Web-Clip-Datei gelesen):
  URL => https://blauewelt.github.io/chores/index.html — obwohl Safari auf
  dem Familien-Deep-Link stand. Maintainer-Hypothese («nur die Basis-URL wird
  gespeichert») BESTAETIGT, als LIVE-Bug, nicht nur Alt-Aera
- Ursache: <link rel="manifest"> stand STATISCH im HTML; das JS-Entfernen
  auf iOS (v4.13-Aera-Fix) war kosmetisch — WebKit registriert das Manifest
  beim PARSEN, «Zum Home-Bildschirm» nutzt weiterhin start_url
  (= /chores/index.html). Die Regel «iOS bekommt nie ein Manifest» hat also
  NIE funktioniert; ALLE je hinzugefuegten iOS-Icons waren kaputt geboren
  (erklaert Noel + Valentin vollstaendig, ohne Aera-Theorie)
- Fix: Manifest-Link existiert nicht mehr im HTML. Injektion per JS NUR auf
  Nicht-iOS UND nur im Familien-Kontext (Chrome liest spaet injizierte
  Manifeste; WebAPK/Install unveraendert). Persoenliche Links bleiben
  ueberall manifest-frei
- Neuer Regressionstest (26/26 auf beiden Engines): iOS-Profil nie ein
  Manifest-Link, Android-Familienkontext genau einer, persoenliche Links
  keiner
- Verifikation: Capture-Workflow erneut gestartet — erwartet GRUEN mit
  Deep-URL im plist
- APP_VERSION → 4.20.0, SW cache → haushalt-v75

## 2026-07-12 — v4.19.5: Christinas Fall — Icons heissen auch «Haushalt», Paste heilt

- Christinas Test: 3 «Fairli»-Icons geloescht, «Link geoeffnet» → trotzdem
  Standalone-Einstiegsseite. Signatur (standalone + kein Referrer + blanke
  index.html) beweist: ein VIERTES veraltetes Icon startete. Ursache des
  Such-Fehlschlags per Commit-Historie belegt: fruehe Versionen hiessen
  «Haushalt» (Juni, kein apple-mobile-web-app-title), spaeter wurde
  document.title = Familienname → Icons heissen je nach Aera «Haushalt»,
  «Fanti WG» oder «Fairli». Spotlight-Suche nach «Fairli» findet nur die
  juengste Generation
- Wichtig: goto() speichert die Route VOR der Navigation → Christinas
  Link-Einfuegen IM veralteten Clip hat dessen Storage geheilt — dieses
  Icon restauriert ab jetzt dauerhaft die Familien-Sicht (family-first,
  durch Regressionstest «gesundes Admin-Icon» abgedeckt). Kein Loeschen
  noetig
- Warnkarte umgeschrieben: Primaerweg = Link einfuegen («danach
  funktioniert genau dieses Icon dauerhaft»); Aufraeumhinweis nennt die
  alten Icon-Namen; falsche App-Mediathek-Behauptung entfernt (Web Clips
  liegen nicht in der App-Mediathek)
- Datenregel (Maintainer): NIEMALS Nutzerdaten loeschen — fam-<Streuner-ID, privater Notizzettel>
  («Ich») bleibt bestehen
- APP_VERSION → 4.19.5, SW cache → haushalt-v74

## 2026-07-12 — v4.19.4: Stale-Icon-Hypothese BESTAETIGT + Einstiegsseite heilt

- Mikas Diagnose-Foto zeigt «Modus: standalone (Homescreen-Icon!)» —
  Hypothese bestaetigt: Er startete ueber ein veraltetes Homescreen-Icon
  mit eingebackener index.html, kein Link/Scan war beteiligt. Das
  «URL-Stripping»-Raetsel war nie eines
- Einstiegsseite im Standalone-Modus (= sicher ein kaputtes Icon):
  * Warnkarte benennt das Problem («Veraltetes Fairli-Icon») samt Anleitung
    (Icon loeschen, auch App-Mediathek pruefen, Einladungs-Link oeffnen,
    Icon neu hinzufuegen)
  * «Ich habe einen Einladungs-Link» wird zur grossen Primaeraktion
  * «Neuen Haushalt erstellen» wird zur kleinen Textaktion — verhindert
    den Amelie-Fehlgriff aus dieser Sackgasse heraus
- Browser-Modus-Einstiegsseite unveraendert
- Stale-Icon-Regressionstest pruefft jetzt Warnkarte + Primaeraktion (12/12)
- APP_VERSION → 4.19.4, SW cache → haushalt-v73

## 2026-07-11 — v4.19.3: Diagnose zeigt Startmodus (Verdacht: veraltetes Icon)

- Mikas zweiter Fehlschlag lieferte den entscheidenden Hinweis:
  «Von: (kein Referrer)» + blanke index.html + kein Hash. Haette der Scan
  den 404-Handoff durchlaufen, waere der Referrer gesetzt (same-origin
  location.replace). Kein Referrer = DIREKTE Navigation zu index.html —
  ein Kamera-Scan des QR (tiefer Pfad!) kann das nicht erzeugen
- Hypothese: Start ueber ein VERALTETES Homescreen-Icon mit eingebackener
  URL /chores/index.html (Manifest-Aera-WebClip ODER waehrend eines
  Fehlversuchs von der Einstiegsseite aus hinzugefuegt). Sieht aus wie eine
  echte Fairli-Installation, oeffnet Vollbild
- Diagnose erweitert: «Modus: standalone (Homescreen-Icon!) / browser».
  Ein Scan zeigt browser, ein Icon-Start standalone — unterscheidet die
  Faelle beim naechsten Foto eindeutig
- Regressionstest erweitert (Einstiegsseite zeigt Modus-Zeile); 10/10 gruen
- APP_VERSION → 4.19.3, SW cache → haushalt-v72

## 2026-07-11 — v4.19.2: Dritter Handoff-Kanal (Hash) nach Mikas Retest

- Mikas Retest-Diagnose (Screenshot): «Geoeffnet: …/chores/index.html» —
  KEIN ?r, KEIN Hash, und auch der sessionStorage-Kanal war leer. Beide
  bisherigen Kanaele wurden auf dem Weg Scan → Safari → App geleert;
  Ursache noch unbekannt (Referrer fehlte in der Diagnose)
- Fix: 404.html haengt die Route zusaetzlich als HASH an das Redirect-Ziel
  (`index.html?r=…#f/…`). Fragmente strippt iOS Link Tracking Protection
  nie (nur Query-Parameter), sie gehen nie an den Server und ueberleben
  jede Navigation. Die App parst Hash-Routen seit je (Legacy-Format)
- Diagnose erweitert: Einstiegsseite zeigt jetzt auch den Referrer
  («Von: …») — verraet beim naechsten Fehlschlag, ob 404.html ueberhaupt
  lief
- 2 neue Regressionstests (10 gesamt): Redirect traegt alle drei Kanaele;
  Hash allein rettet die Route (exakt Mikas beobachteter Zustand)
- APP_VERSION → 4.19.2, SW cache → haushalt-v71

## 2026-07-11 — Dev: Tier-1-Testsuite (Playwright + CI)

- Kein App-Deploy (keine Version/SW-Aenderung) — reines Tooling
- 8 Regressionstests, jeder entspricht einem real ausgelieferten Bug:
  verriegelte Personen-Sicht (v4.13.x), Mitglieder-Teilen ohne Familien-Link
  + Warnungen (v4.19.0), QR-Captions, Query-Stripping-Handoff (v4.19.1),
  Einstiegsseite + Diagnose, Identitaets-Leck (v4.18.1),
  Loeschen-vs-Pull-Race (v4.17.0), Notiz-Snapshot (v4.9/v4.11.1)
- Laufen auf Chromium (Pixel 7) und WebKit (iPhone 14) gegen einen
  Pages-Mimic-Server (404-Handoff originalgetreu); Supabase gemockt
- CI: .github/workflows/tests.yml bei jedem Push; zweiter Job erzwingt die
  Deploy-Disziplin (APP_VERSION ⇒ SW-Bump + LOG-Eintrag)
- Lokal: 8/8 gruen auf Chromium (5.8 s)

## 2026-07-11 — v4.19.1: 404-Handoff gegen Query-Stripping gehaertet + Diagnose

Recherche zum Amelie-Fall (QR korrekt gezeigt, landete trotzdem auf der
Einstiegsseite): iOS strippt NIE Pfad-Segmente; Link Tracking Protection
entfernt nur Query-Parameter von einer kuratierten (geheimen) Liste, und nur
in Mail/Messages/Private Browsing. `r` steht auf keiner veroeffentlichten
Liste; der QR selbst dekodiert byte-exakt (ECC, Round-Trip verifiziert).
ABER: unser 404-Handoff verwandelt den sicheren PFAD in genau die Sorte
Query-Parameter (langes, eindeutiges Nutzer-Token), auf die LTP zielt —
ein Single Point of Failure, Liste geheim und erweiterbar.

- 404.html stasht die Route zusaetzlich in sessionStorage
  (`fairli.handoff`) — ueberlebt location.replace im selben Tab und ist
  gegen jedes Query-Stripping immun
- index.html liest den Handoff als Kanal 2 (nach ?r/Pfad/Hash, VOR der
  gespeicherten Route) und raeumt ihn auf. Simulation: Route loest auch bei
  KOMPLETT gestrippter Query korrekt auf
- Diagnose: Die Einstiegsseite zeigt jetzt klein die tatsaechlich
  geoeffnete Adresse («Geoeffnet: …») — landet dort wieder jemand
  unerwartet, sehen wir WAS ankam, statt zu raten
- (Eigenen TDZ-Bug abgefangen: esc() ist im Entry-Screen noch nicht
  definiert → Inline-Escaping)
- APP_VERSION → 4.19.1, SW cache → haushalt-v70

## 2026-07-11 — v4.19.0: Falscher QR fuehrte zu «neuem Haushalt» (ein Mitglied-Bug)

Befund: ein Mitglied landete beim Scannen auf der Einstiegsseite und legte
versehentlich einen leeren Haushalt an (fam-<Streuner-ID, privater Notizzettel>, Mitglied «Ich»).
Die Einstiegsseite erscheint NUR, wenn die URL gar keine Familie enthaelt —
ihr persoenlicher Link loest korrekt auf (Kette Scan → 404 → App simuliert).
Sie hat also den BLANKEN App-Link geoeffnet, nicht ihren.

Ursache (Design-Falle, selbst gebaut):
- Noel teilte aus SEINEM persoenlichen Link heraus. Dort zeigte das
  Teilen-Sheet nur seinen eigenen Link + «Fairli weiterempfehlen» — und das
  ist der blanke App-Link, der zu «Neuen Haushalt erstellen» fuehrt. Der
  einzige andere QR auf dem Schirm war also genau der falsche
- Drei optisch identische QR-Umschalter ohne Beschriftung

Fixes:
- Mitglieder sehen jetzt die persoenlichen Links ALLER Personen (eigener mit
  «(du)» markiert) und koennen einander einladen. Der Familien-/Admin-Link
  bleibt fuer sie weiterhin verborgen (wie gewuenscht)
- Jeder QR-Code hat eine unmissverstaendliche Bildunterschrift:
  «Persoenlicher Link fuer <Name>» · «Ganze Familie · voller Zugriff»
- «Fairli weiterempfehlen» ist deutlich als NICHT-Beitritts-Link markiert
  (Warnfarbe, eigener Block, Warnhinweis an Zeile UND QR, dezenter Button)
- APP_VERSION → 4.19.0, SW cache → haushalt-v69

## 2026-07-11 — v4.18.3: Schliessen-Knopf ueberall identisch (× oben rechts)

- Im Aufgaben-Sheet sass «Loeschen» (rot) genau dort, wo Personen und Teilen
  ihr «×» zum Schliessen haben — die destruktive Aktion lag also unter dem
  Daumen, der anderswo nur schliesst
- Jetzt in ALLEN Sheets gleich: «×» oben rechts schliesst. Im Aufgaben-Sheet
  wandert «Loeschen» in den linken Slot (rot, nur beim Bearbeiten sichtbar);
  «Abbrechen» als Text entfaellt — das × ist das Abbrechen
- Primaeraktion bleibt ueberall der grosse Button unten (Speichern / Fertig)
- APP_VERSION → 4.18.3, SW cache → haushalt-v68

## 2026-07-11 — v4.18.2: Haushaltsname etwas groesser

- Titel-Basisgroesse clamp(28px, 8.6vw, 34px) → clamp(30px, 9.2vw, 38px).
  Auf dem Pixel (412px) also 34 → 38px; auf kleinen Handys (360px) 33px
- Platz ist da, seit der Sync-Button entfernt wurde (nur noch Teilen +
  Personen im Kopf)
- Laengenabhaengige Stufen mitgezogen (>14 / >22 Zeichen); der Flex-Header
  und der 2-Zeilen-Clamp verhindern weiterhin jede Ueberlappung
- APP_VERSION → 4.18.2, SW cache → haushalt-v67

## 2026-07-11 — v4.18.1: «Ich bin» leckte von persoenlichen Links in die Admin-Ansicht

- BUG: `LS_ME` war EIN Schluessel pro Familie (`haushalt.me:<fam>`), den sich
  die Admin-Ansicht und ALLE persoenlichen Links auf demselben Geraet teilten.
  pull() schrieb im Personen-Modus die erkannte Person hinein → nach dem
  Oeffnen von Janas Link zeigte auch der Admin-Link «Ich bin: Mira».
  Nicht der Shortcut war schuld, sondern der geteilte Schluessel
- Fix:
  * Admin-Kontext bekommt einen eigenen Schluessel (`…:admin`)
  * Persoenliche Links leiten die Person IMMER synchron aus dem Slug ab
    (aus dem lokalen Cache → kein Flackern) und PERSISTIEREN sie nie
  * Einmalige Heilung: der alte Schluessel wird nur uebernommen, wenn das
    Geraet nie einen persoenlichen Link geoeffnet hat (dann kann er nicht
    verunreinigt sein); danach wird er geloescht
- Auf betroffenen Geraeten (z. B. dem Pixel, das Janas Link geoeffnet hatte)
  ist «Ich bin» in der Admin-Ansicht einmalig leer → einmal die eigene Person
  antippen, danach bleibt sie
- APP_VERSION → 4.18.1, SW cache → haushalt-v66

## 2026-07-11 — v4.18.0: Einheitliches Sheet-/Dialog-Design

Vorher: drei Sheets, drei Bedienmuster (Abbrechen/Speichern · Fertig · ×),
Primaeraktion mal unten, mal im Kopf, mal gar nicht; Personen-Loeschen war
ein sofortiges «×» — die gefaehrlichste Aktion hatte den schwaechsten Schutz.

- EINE Sheet-Anatomie fuer alle: Grabber · Kopfzeile (Slot · zentrierter
  Titel · Slot) · Body · EIN grosser Primaer-Button UNTEN.
  Feste Slot-Breite (84px) → Titel zentriert sich ohne den frueheren
  leeren <span>-Hack
- Zwei Sheet-Typen, unterschieden danach, ob etwas zu bestaetigen ist:
  * Formular (Aufgabe): «Abbrechen» links, «Loeschen» rot rechts,
    «Speichern» gross unten (unveraendert — war schon richtig)
  * Utility (Personen, Teilen): «×» rechts, «Fertig» gross unten.
    «Fertig» sitzt jetzt an derselben Stelle wie «Speichern»
- Destruktive Aktionen, eine Regel je Kontext:
  * einzelnes Objekt im Formular → roter Text oben rechts (Aufgabe)
  * Listeneintraege → ⋯-Menue mit rotem «Loeschen» (Verlauf UND JETZT AUCH
    Personen). Das sofortige «×» pro Person ist weg; das Menue bietet
    zusaetzlich «Link teilen» (ersetzt den 🔗-Knopf)
- Schliessen ueberall gleich: ×/Abbrechen, Backdrop-Tipp, Esc (nativ).
  BEWUSSTE Ausnahme: das Formular-Sheet ignoriert den Backdrop-Tipp, solange
  ungespeicherte Eingaben da sind (kein Datenverlust durch Fehltipp)
- Aufraeumen: #shareSheet-Sonderstyles entfernt (nutzt jetzt die globalen
  dialog/.sheet-Regeln; die abweichende Backdrop-Deckkraft .5 vs .55 ist weg),
  hartkodiertes Rot im Verlauf-Menue → var(--red), alert() → toast()
- APP_VERSION → 4.18.0, SW cache → haushalt-v65

## 2026-07-11 — v4.17.0: Kein Wiederauferstehungs-Flackern mehr (Sync-Abgleich)

- BUG: Nach dem Loeschen eines Verlaufs-Eintrags blitzte er kurz wieder auf.
  Ursache: pull() ueberschreibt state.* KOMPLETT mit dem Serverstand. Das
  Loeschen ist optimistisch (lokal sofort) + ein DELETE ohne Warten. Lief
  gerade ein pull — oder startete einer, bevor der Server das DELETE
  committet hatte — lieferte der Server die Zeile noch mit → Eintrag
  verschwand, kam zurueck, verschwand wieder. Dieselbe Race betraf neue
  Eintraege (kurzes Wegblinken) und Bearbeitungen (kurzes Zuruecksetzen)
- Fix: Abgleich-Schicht zwischen optimistischen Schreibungen und pull()
  * `mutationSeq` (in push() zentral hochgezaehlt, deckt POST/PATCH/DELETE/
    upsert ab): aendert sich waehrend eines laufenden pull etwas lokal, ist
    dessen Snapshot veraltet und wird VERWORFEN — der lokale Stand bleibt
  * `pendingDeletes` / `pendingCreates`: bis der Server die Schreibung
    nachweislich verarbeitet hat (resolvedAt < pullStart), werden Serverzeilen
    gefiltert bzw. fehlende lokale Zeilen ergaenzt. Danach raeumen sich die
    Eintraege selbst auf
  * Log wird nach dem Abgleich wieder nach done_at sortiert
- Alle Schreibstellen laufen jetzt ueber `deleteRemote()` / `createRemote()`
- Deklarationen der Abgleich-Schicht stehen VOR pull() (keine TDZ-Falle)
- APP_VERSION → 4.17.0, SW cache → haushalt-v64

## 2026-07-11 — v4.16.0: Richtige Installations-Anleitung (iOS zuerst, mit Icons)

- Der alte Einzeiler zeigte nur die Anleitung fuer das ERKANNTE Geraet —
  nutzlos, wenn z. B. ein Android-Admin einem iPhone-Nutzer helfen will
- Neu: aufklappbarer Block «Als App zum Home-Bildschirm» mit expliziten
  Schritt-fuer-Schritt-Anleitungen fuer BEIDE Plattformen, iPhone zuerst
  (Prioritaet). Inline-SVG-Icons helfen beim Finden der Knoepfe:
  iOS-Teilen-Symbol, iOS «+ zum Home-Bildschirm», Android-Menue (⋮)
- iOS-Hinweis explizit: Link in SAFARI oeffnen (nicht Chrome); iPad-Variante
  (Teilen oben rechts) als Randnotiz
- Das eigene Geraet bekommt ein «dein Geraet»-Badge, die Reihenfolge bleibt
  aber immer iOS → Android
- Standardmaessig eingeklappt (Sheet bleibt kompakt); nach dem Ersteinrichten
  automatisch aufgeklappt, weil genau dann installiert wird
- Platzierung: Admin unter dem Familien-Block, Mitglieder direkt unter dem
  eigenen Link
- APP_VERSION → 4.16.0, SW cache → haushalt-v63

## 2026-07-11 — v4.15.2: Flackern der ICH-BIN-Zeile behoben, Titel wieder groesser

- URSACHE (gilt fuer beide Flacker-Bugs): `qrcode.min.js` war ein
  render-blockierendes EXTERNES Skript direkt VOR dem Haupt-Skript. Waehrend
  es laedt, malt der Browser das halb geparste Dokument — also die leere
  ICH-BIN-Zeile (und frueher den hartcodierten «Fairli»-Titel). render()
  lief erst danach
- Fix 1: `defer` auf qrcode.min.js. qrcode() wird nur im Teilen-Sheet (Klick)
  gebraucht, laeuft also garantiert spaeter → sicher. Damit faellt das
  Paint-Fenster weg und render() malt vor dem ersten Frame
  ACHTUNG: defer-Skripte laufen NACH dem Inline-IIFE — `qrcode` darf nie
  beim Start (nur im Klick-Pfad) benutzt werden
- Fix 2 (Guertel & Hosentraeger): `html.booting` wird synchron im <head>
  gesetzt, CSS macht die ICH-BIN-Zeile unsichtbar (Hoehe bleibt via
  `min-height:46px` reserviert → kein Layout-Sprung); render() entfernt die
  Klasse. Malt der Browser doch frueher, sieht man leeren Platz statt
  halb gerenderter Chips
- Titel wieder groesser: die vw-Klammer aus v4.14.1 hatte ihn auf Handys
  generell verkleinert (auf 412 px nur ~26 px statt 34 px) — auch bei kurzen
  Namen wie «Fanti WG». Jetzt clamp(28px, 8.6vw, 34px); die laengenabhaengigen
  Stufen (>14 / >22 Zeichen) wurden ebenfalls angehoben
- APP_VERSION → 4.15.2, SW cache → haushalt-v62

## 2026-07-11 — v4.15.1: Kein «Fairli»-Flackern im Titel mehr

- BUG: Der <h1> enthielt hartcodiert «Fairli»; der echte Haushaltsname wurde
  erst von render() gesetzt → beim Neuladen blitzte «Fairli» auf, dann
  «Fanti WG»
- Fix: <h1> startet leer (&nbsp; haelt die Zeilenhoehe, kein Layout-Sprung).
  Ein Inline-Skript direkt nach dem Header laeuft SYNCHRON waehrend des
  Parsens (vor dem ersten Paint): Familie aus URL bzw. gespeicherter Route
  (family-first) aufloesen → Namen aus localStorage `haushalt.v2:<fam>` lesen
  → Titel setzen. Beim Reload erscheint sofort «Fanti WG»
- `window.__setFamTitle(name)` ist die einzige Quelle fuer Titel + laengen-
  abhaengige Schriftgroesse; render() ruft denselben Helper (keine doppelte
  Groessenlogik, kein Drift)
- Erstbesuch ohne Cache: Titel bleibt leer (Platzhalter) bis der erste Pull
  den Namen liefert — besser als ein falscher Zwischenzustand
- APP_VERSION → 4.15.1, SW cache → haushalt-v61

## 2026-06-28 — v4.15.0: Sync-Button entfernt, Teilen fuer alle Mitglieder

- Sync-Button + «Geraete verbinden»-Sheet entfernt: Relikt aus der Zeit vor
  Multi-Tenant (eigene Supabase-URL/Key pro Geraet). cfg ist jetzt fest das
  eingebaute Projekt — heilt auch Geraete, die frueher «Trennen» gedrueckt
  hatten. Sync-Fehler melden sich weiterhin per Toast
- App-Version steht jetzt klein unten im Teilen-Sheet (vorher im Sync-Sheet)
- «Teilen» ist fuer persoenliche Links nicht mehr ausgeblendet: Mitglieder
  sehen ihren EIGENEN Link (mit QR + Install-Hinweis) und «Fairli
  weiterempfehlen» — NICHT den Familien-/Admin-Link und nicht die Links
  anderer Mitglieder (least privilege: jeder fremde Link erlaubt Handeln
  als diese Person)
- APP_VERSION → 4.15.0, SW cache → haushalt-v60

# LOG.md — Change history

All work on the Haushalt app, newest first. Maintained by Claude.

## 2026-06-28 — v4.14.1: Header-Overlap bei langen Haushaltsnamen behoben

- BUG: `.headbtns` war `position:absolute` → der H1 wusste nichts von den
  Buttons und lief bei langen Haushaltsnamen darunter durch
  («Farman-WG» ueberlappte Sync/Teilen/Personen). Fiel bisher nicht auf,
  weil «Fanti WG» kurz ist
- Fix: Header ist jetzt ein Flex-Row — Titel `flex:1; min-width:0` (schrumpft,
  bricht, max. 2 Zeilen), Buttons `flex:0 0 auto` (behalten ihren Platz).
  Overlap ist strukturell unmoeglich
- Titelgroesse fluid (`clamp`) + zusaetzliche Verkleinerung bei langen Namen,
  damit sie moeglichst einzeilig neben die Buttons passen
- APP_VERSION → 4.14.1, SW cache → haushalt-v59

## 2026-06-28 — v4.14.0: Android robust fuer mehrere Shortcuts + Onboarding-Doku

- Persoenliche Links bekommen auf KEINER Plattform mehr ein Manifest:
  «Zum Startbildschirm» erzeugt einen Shortcut mit exakt dieser URL —
  mehrere Personen-Shortcuts + Admin-App koexistieren pro Geraet.
  Familien-Kontext behaelt das Manifest (Standalone-WebAPK)
- Routen-Restore family-first: haushalt.route.family / .user getrennt;
  Bare-Launch bevorzugt die Familien-Route (Admin-Geraet wird nicht mehr
  von zwischendurch geoeffneten persoenlichen Links gekapert); der
  synchrone Head-Check spiegelt die Praezedenz
- rel=icon (192px, absolut) fuer manifest-lose Chrome-Shortcuts
- NEU: DEVELOPER_ONBOARDING.md — umfassende Architektur-/Konventions-Doku
  (Deploy-Disziplin, Datenmodell + Unveraenderlichkeits-Prinzip, Routing,
  Plattform-Minenfelder iOS/Android, Flicker-Regel, UI-Konventionen,
  Migrationen, Secrets-Policy)
- APP_VERSION → 4.14.0, SW cache → haushalt-v58

## 2026-06-28 — v4.13.2: Kein Button-Flackern + Android-Icon auf Deep-Path

- FLICKER: Admin-Buttons (Teilen/Personen/Sync) wurden erst nach dem Rendern
  per JS versteckt → blitzten kurz auf. Jetzt synchron VOR dem Rendern: ein
  Inline-Skript im <head> setzt `html.userlink`, CSS blendet die Buttons
  sofort aus. Erkennung aus URL (/u/…) UND gespeicherter Route (installierte
  App ohne /u/ im Pfad); zur Laufzeit mit USER_SLUG synchronisiert
- ANDROID-ICON: `<link rel=manifest href="manifest.json">` war relativ und
  löste auf tiefen Pfaden zu …/u/manifest.json = 404 auf → Chrome legte nur
  ein generisches Lesezeichen ohne Icon an. Jetzt absolut
  (`/chores/manifest.json`), ebenso apple-touch-icon
- APP_VERSION → 4.13.2, SW cache → haushalt-v57

## 2026-06-28 — v4.13.1: Persönliche Links öffneten Familien-Ansicht (SW-Pfad-Bug)

- BUG (auf Geräten mit installiertem Service Worker): Der SW liefert tiefe
  Pfade direkt als App-Shell aus (kein 404-?r=-Handoff). Auf dem tiefen Pfad
  berechnete BASE sich falsch (/chores/f/<fam>/u/ statt /chores/), die
  Pfad-Erkennung schlug fehl und der Code fiel auf die GESPEICHERTE Route
  zurück — z. B. die Familien-/Admin-Route des Geräts. Mira-Link → Admin-Sicht
- Fix: BASE wird vor dem «f/»-Segment abgeleitet; Route wird aus dem vollen
  pathname geparst (Regex nicht verankert). Simulation bestätigt
  family+userSlug auf SW-serviertem Deep-Path
- APP_VERSION → 4.13.1, SW cache → haushalt-v56

## 2026-06-27 — v4.13.0: iOS deterministisch — kein Manifest, klassische Metas

- Entscheidung: statt des versionsabhängigen Blob-Manifest-Ansatzes (v4.12.0,
  wieder entfernt) der GARANTIERTE Weg. Apples dokumentiertes
  Web-Clip-Verhalten: OHNE Manifest nutzt «Zum Home-Bildschirm» immer die
  aktuelle Seiten-URL — genau unser sauberer Pfad
- iOS (UA/iPadOS-Erkennung): <link rel=manifest> wird entfernt; Standalone,
  Name und Icon kommen aus den klassischen Metas (apple-mobile-web-app-capable,
  -title, -status-bar-style, apple-touch-icon)
- Android: statisches Manifest bleibt (WebAPK, maskable Icons);
  Route-Restore via localStorage deckt den Start ab (Pixel-Verhalten bestätigt)
- 404.html: Manifest nur noch für Nicht-iOS injiziert; apple-capable ergänzt
- APP_VERSION → 4.13.0, SW cache → haushalt-v55

## 2026-06-27 — v4.12.0: iOS-Homescreen erfasst den richtigen Pfad (per-Route-Manifest)

- Ursache des Regressions-Bugs gefunden: iOS liest beim «Zum Home-Bildschirm»
  die start_url aus dem verlinkten Manifest, NICHT die aktuelle Seiten-URL
  (belegt u. a. Apple-Foren + GitHub-Codespaces-Issue). Unser statisches
  Manifest hatte start_url=/chores/index.html → jede Installation landete auf
  der generischen Startseite, egal welcher Familien-/Personen-Link
- Fix: Sobald die Route bekannt ist, wird ein per-Route-Manifest (Blob-URL)
  erzeugt, dessen start_url der VOLLE Pfad dieser Familie/Person ist
  (absolute URL), scope=/chores/, eigene id; Icons auf absolute URLs gehoben.
  Das <link rel=manifest> wird darauf umgebogen
- Statisches Manifest bleibt als Fallback
- APP_VERSION → 4.12.0, SW cache → haushalt-v54
- HINWEIS: iOS-Verhalten bei JS-gewechseltem Manifest ist versionsabhängig;
  falls es nicht greift, gibt es einen garantierten Fallback (Doku folgt)

## 2026-06-27 — v4.11.1: Verlauf ist unveränderlich (Notiz eingefroren)

- Designprinzip: Ein Verlaufseintrag ist ein Schnappschuss und darf sich nicht
  ändern, wenn die Aufgabe später umbenannt/umbewertet/gelöscht wird
- Name, Mitglied und Punkte wurden bereits beim Eintragen eingefroren; die
  Notiz war der Ausreisser (wurde live aus der aktuellen Aufgabe gelesen)
- DB: Spalte `chore_note` auf log; Notiz wird jetzt beim Eintragen
  mitgespeichert, Verlauf zeigt den eingefrorenen Wert. Alte Einträge ohne
  Snapshot zeigen einfach keine Notiz (kein Rückgriff auf die Live-Aufgabe)
- APP_VERSION → 4.11.1, SW cache → haushalt-v53

## 2026-06-27 — v4.11.0: Bearbeiten-Sheet — Speichern gross unten, Löschen klein oben

- «Speichern» ist jetzt ein grosser Primär-Button unten (nicht mehr in der
  Kopfzeile)
- «Löschen» ist eine Nebenaktion oben rechts in Rot (nur beim Bearbeiten
  sichtbar; per visibility umgeschaltet, damit der Titel zentriert bleibt)
- Kopfzeile: Abbrechen | Titel | Löschen
- APP_VERSION → 4.11.0, SW cache → haushalt-v52

## 2026-06-27 — v4.10.1: Verlauf-Menü «Löschen» statt «Rückgängig»

- Menüpunkt korrekt benannt: der Eintrag wird gelöscht (Punkte raus), nicht
  ein Zustand rückgängig gemacht → «Löschen» (in Warnfarbe)
- APP_VERSION → 4.10.1, SW cache → haushalt-v51

## 2026-06-27 — v4.10.0: Notiz im Verlauf + weniger «Löschen» als Default

- (1) Verlauf zeigt jetzt die Notiz der Aufgabe klein unter dem Eintrag
- (2) Weniger versehentliches Löschen:
  * Bearbeiten-Sheet: «Aufgabe löschen» ist kein breiter Danger-Button mehr,
    sondern ein dezenter, unterstrichener Textlink unten. Primäraktion bleibt
    «Speichern» oben
  * Verlauf: das frühere sofort-löschende ↩︎ ist jetzt ein Drei-Punkte-Menü
    (⋯) mit «Rückgängig machen»; schließt bei Tap außerhalb
- APP_VERSION → 4.10.0, SW cache → haushalt-v50

## 2026-06-27 — v4.9.0: Optionale Notiz pro Aufgabe

- DB: Spalte `note` auf chores (Migration via db-migrate)
- Bearbeiten-Sheet: optionales Feld «Notiz» (max. 60 Zeichen) – niemand muss
  etwas eintragen
- Notiz erscheint klein und dezent unter dem Namen auf der Kachel (max. 2
  Zeilen, abgeschnitten, damit sie passt); nur sichtbar wenn gesetzt
- Speichern/Sync inkl. note
- APP_VERSION → 4.9.0, SW cache → haushalt-v49

## 2026-06-27 — v4.8.1: QR-Anzeige-Bug behoben

- BUG: `.shqr{display:block}` überschrieb das `[hidden]`-Attribut → QR ließ
  sich nicht mehr ein-/ausblenden. Regel `.shqr[hidden]{display:none}` ergänzt
- APP_VERSION → 4.8.1, SW cache → haushalt-v48

## 2026-06-27 — v4.8.0: Teilen-Sheet kompakt (QR einklappbar)

- QR-Codes standardmäßig eingeklappt; pro Zeile ein «QR»-Knopf blendet den
  Code bei Bedarf ein. Sheet ist dadurch viel kürzer und scannt sich schneller
- «Fairli weiterempfehlen» bekommt jetzt ebenfalls einen QR-Code
- QR beim Anzeigen zentriert, etwas kleiner (116 px)
- APP_VERSION → 4.8.0, SW cache → haushalt-v47

## 2026-06-16 — v4.7.3: App-Empfehlungslink im Teilen-Sheet

- Neuer Eintrag «Fairli weiterempfehlen» unten im Teilen-Sheet: teilt den
  blanken App-Link (ohne Familie), sodass Empfänger einen EIGENEN neuen
  Haushalt erstellen können
- APP_VERSION → 4.7.3, SW cache → haushalt-v46

## 2026-06-16 — v4.7.2: Teilen-Sheet entschlackt

- Familien-Link erschien doppelt (oben Block + unten «Ganze Familie») →
  auf EINEN Block oben reduziert: Familien-Link + QR + Installationshinweis
- «siehe unten» entfernt (war irreführend, da langer Inhalt folgt);
  Installationshinweis sitzt jetzt direkt beim Familien-Block, knapper Text
- Klare Gliederung: «Ganze Familie» oben, darunter Überschrift
  «Persönliche Links», dann die Personen
- Titel «Links teilen» → «Teilen»; Intro nach Setup entfernt
- APP_VERSION → 4.7.2, SW cache → haushalt-v45

## 2026-06-16 — v4.7.1: Startseite vereinfacht

- Einstiegs-Screen aufgeräumt und auf den Hauptfall ausgerichtet:
  «Neuen Haushalt erstellen» ist jetzt der primäre Button (zuoberst bzw.
  als Akzent-Button). «Zu meinem Haushalt» erscheint nur bei vorhandener
  letzter Familie. Der Einladungs-Link-Fall ist hinter «Ich habe einen
  Einladungs-Link» eingeklappt (Eingabefeld erscheint erst auf Tippen)
- Weniger Text, klare Hierarchie statt prominentem Paste-Feld
- APP_VERSION → 4.7.1, SW cache → haushalt-v44

## 2026-06-16 — v4.7.0: Onboarding-Flow aufgeräumt

- (Bugfix) Beitreten-Feld akzeptierte die neuen PFAD-Links nicht (nur Hash/
  Slug) → parseAny erkennt jetzt auch `…/chores/f/<fam>[/u/<slug>]`
- Bare-Link merkt die letzte Familie weiterhin («Zu meinem Haushalt»),
  verhindert versehentliches Anlegen einer zweiten Familie
- Share-Sheet nach Setup hebt den EIGENEN Haushalts-Link des Erstellers
  hervor (eigener Block oben, Teilen/Kopieren) + plattformspezifischer
  «Zum Home-Bildschirm»-Hinweis (iOS: Teilen→Zum Home-Bildschirm; Android:
  ⋮→Zum Startbildschirm)
- Neuer Header-Button «Teilen»: öffnet das Link-/QR-Sheet jederzeit vom
  Hauptscreen (falls jemand die beim Setup geteilten Links vergessen hat);
  bei persönlichen Links ausgeblendet
- Header darf bei drei Buttons umbrechen, kollidiert nicht mit dem Titel
- APP_VERSION → 4.7.0, SW cache → haushalt-v43

## 2026-06-16 — v4.6.1: Icon/Name beim Pfad-Install korrigiert

- BUG: Beim Hinzufügen über einen Pfad-Link (…/chores/f/...) las iOS die
  Metadaten aus 404.html, die kein Manifest/Icon/Titel hatte → Verknüpfung
  ohne Icon, falscher Name (heller «R» auf dunkel)
- 404.html bekommt denselben PWA-Kopf wie index.html: Manifest-Link,
  apple-touch-icon, Titel «Fairli», theme-color, apple-mobile-web-app-title.
  Bewusst KEIN apple-mobile-web-app-capable (würde start_url-Handling brechen)
- APP_VERSION → 4.6.1, SW cache → haushalt-v42
- Betroffene Verknüpfung einmal entfernen und über den Pfad-Link neu hinzufügen

## 2026-06-16 — v4.6.0: Pfad-basierte Familien-URLs (1-Klick-iOS-Install)

- Familien-Links sind jetzt echte Pfade statt Hash:
  `…/chores/f/<familie>` bzw. `…/chores/f/<familie>/u/<slug>`. iOS bäckt den
  vollen Pfad in start_url ein → Homescreen-Icon startet direkt in der Familie,
  ohne Einfüge-/Wiederbeitreten-Schritt
- `404.html`: GitHub Pages liefert es für jeden unbekannten Pfad; es leitet
  `…/chores/f/...` auf `…/chores/index.html?r=f/...` um (Standard-SPA-Trick),
  damit der tiefe Pfad „existiert" und iOS ihn erfassen kann
- App liest Route aus `?r=` (404-Handoff), echtem Pfad und — abwärtskompatibel
  — aus dem Hash; kanonisiert per history.replaceState auf die Pfadform
- Teilen-Links und Navigation auf Pfadform umgestellt; Manifest: scope
  `/chores/`, start_url `/chores/index.html`, stabile `id`
- Service Worker: Navigationsanfragen auf tiefe `/chores/...`-Pfade liefern die
  App-Shell (offline-fähig, kein 404 in der installierten App); Cache v41
- Bestehende Hash-Links (`#f/...`) funktionieren weiterhin
- APP_VERSION → 4.6.0, SW cache → haushalt-v41
- Für 1-Klick: neuen Pfad-Link öffnen und damit zum Homescreen hinzufügen

## 2026-06-16 — v4.5.0: Einstiegs-Screen statt iOS-Sackgasse

- Erkenntnis: iOS startet Homescreen-PWAs IMMER am statischen start_url ohne
  Hash und ignoriert dynamische Manifeste/Hash im start_url (bekanntes
  WebKit-Verhalten, vgl. GitLab-Issue). Der v4.4.2-Ansatz (dynamisches
  Manifest) konnte auf iOS nie greifen → entfernt
- Neuer Einstiegs-Screen, wenn keine Familie aktiv ist (statt Sackgasse mit
  nur «Neue Familie»):
  * «Zu meinem Haushalt» (falls letzte Route in localStorage vorhanden)
  * Einladungs-Link einfügen (akzeptiert vollen Link, nur #-Hash, oder nur
    den Familien-Slug) → Beitreten
  * «Neuen Haushalt erstellen» als nachrangige Option
- Damit kommt auch eine frisch installierte iOS-Verknüpfung mit isoliertem
  Storage per Link-Einfügen in einem Schritt in die Familie
- APP_VERSION → 4.5.0, SW cache → haushalt-v40

## 2026-06-16 — v4.4.2: iOS-Homescreen landet wieder in der Familie

- BUG (iPhone/Chrome → Zum Homescreen): Der installierte Start öffnete
  start_url OHNE Hash; die Route lag nur in localStorage, das iOS für die
  Standalone-App separat hält → Start landete in der «Neue Familie»-Ersteinrichtung
- Fix 1: Beim Start ohne Hash wird die letzte bekannte Route aus localStorage
  geholt UND der Hash via history.replaceState zurückgeschrieben (konsistent
  über Reloads/Standalone)
- Fix 2 (eigentlicher iOS-Fix): dynamisches Manifest — sobald die Familie
  bekannt ist, wird das <link rel=manifest> auf ein Blob mit
  start_url=./index.html#f/<familie>(/u/<slug>) umgebogen. iOS liest start_url
  beim Hinzufügen zum Homescreen → installierte Verknüpfung startet direkt
  in der Familie bzw. im persönlichen Link
- Fix 3: Beim Anlegen einer neuen Familie wird die Route sofort persistiert
- WICHTIG für betroffene Geräte: bestehende Homescreen-Verknüpfung einmal
  entfernen und über den (Familien-)Link neu hinzufügen, damit das neue
  start_url greift
- APP_VERSION → 4.4.2, SW cache → haushalt-v39

## 2026-06-16 — v4.4.1: Icon in Royalblau, drei Blasen

- Icon-Farbe auf sattes Royalblau und auf drei klar getrennte Blasen reduziert
  (winzige Blasen entfernt — bei Launcher-Grösse ohnehin unsichtbar);
  Geistre-Ring der entfernten Mini-Blase sauber entfernt (nur 3 Blobs übrig)
- Maskable mit nach innen gezogenem Motiv, kein Beschnitt
- Icon-Cache-Buster ?v=45, APP_VERSION → 4.4.1, SW cache → haushalt-v38

## 2026-06-16 — v4.4.0: Neues Icon — blaue Seifenblasen auf Weiss

- App-Icon ersetzt (Schwamm war bei Launcher-Grösse schlecht erkennbar):
  vier blaue, klar getrennte Seifenblasen unterschiedlicher Grösse auf
  reinweissem Grund. Per Pollinations/flux generiert, Hintergrund
  programmatisch auf reines #FFFFFF bereinigt und zentriert
- Maskable-Variante mit nach innen gezogenem Motiv (~62 %), damit Androids
  Kreis-/Squircle-Zuschnitt keine Blase abschneidet
- Splash/Theme-Farbe → Weiss (passt zum Icon), Icon-Cache-Buster ?v=44
- APP_VERSION → 4.4.0, SW cache → haushalt-v37
- Hinweis: Android-WebAPK cached das Icon; ggf. App neu hinzufügen

## 2026-06-14 — v4.3.4: Neue Aufgabe erscheint sofort ganz oben

- BUG: Nach «Aufgabe hinzufügen» sortierte die Gruppierung die neue Kachel
  irgendwo nach unten (alphabetisch in ihre Gruppe) → wirkte, als erschiene
  sie gar nicht; erst ein Tab-Wechsel machte sie sichtbar
- Frisch hinzugefügte Aufgaben werden jetzt für die Sitzung «angepinnt»:
  sie stehen vorne (neueste zuerst), bis die Reihenfolge natürlich neu
  berechnet wird (App-Start, Tab-Wechsel). Beim Hinzufügen scrollt die Liste
  zur neuen Kachel und sie blinkt kurz auf
- APP_VERSION → 4.3.4, SW cache → haushalt-v36

## 2026-06-14 — v4.3.3: Share-Text nutzt Haushaltsnamen

- Teilen-Text «… mach mit bei unseren Haushalts-Aufgaben» (klobig, und
  «Hausaufgaben» hiesse Schulaufgaben) → «… mach mit bei <Haushaltsname>»,
  z. B. «Mira, mach mit bei Fanti WG:». Fallback «unseren Aufgaben», falls
  kein Name gesetzt
- APP_VERSION → 4.3.3, SW cache → haushalt-v35

## 2026-06-14 — v4.3.2: Onboarding-Flow repariert

- BUG: Der 20-Sekunden-Auto-Sync (und visibilitychange) rief firstRunSetup()
  erneut auf, solange die Familie leer war → Dialog wurde neu aufgebaut und
  überschrieb laufende Eingaben (Haushaltsname/Personen wurden gelöscht).
  Fix: firstRunSetup() ist jetzt idempotent (Guard + DOM-Check); pull()
  fasst während offener Einrichtung weder DOM noch State an; Auto-Sync und
  visibilitychange pausieren, solange firstRunOpen
- Einrichtung wird beim Start einer brandneuen Familie sofort gezeigt, nicht
  erst nach dem ersten Netzwerk-Pull (kein kurzes leeres Raster mehr,
  keine Verzögerung)
- Doppelten pull()-Aufruf bei Init entfernt
- APP_VERSION → 4.3.2, SW cache → haushalt-v34

## 2026-06-14 — v4.3.1: App heisst «Fairli»

- App-Name (Manifest, Titel, Onboarding-Screen, Default-H1) → «Fairli»
  (Swiss-Touch-Variante von «Fairly»); der pro-Familie gespeicherte
  Haushaltsname bleibt davon unberührt und überschreibt weiterhin den
  Titel im laufenden Betrieb
- «Neuer Haushalt»-Einrichtungsdialog und «Name des Haushalts» bewusst
  beibehalten — das ist haushalt-, nicht app-spezifisch
- Icon-Cache-Buster → ?v=43, SW cache → haushalt-v33, APP_VERSION → 4.3.1

## 2026-06-14 — v4.3.0: Reibungsloses Teilen — Share-Sheet, Native Share, QR

- Neues «Links teilen»-Sheet: listet alle persönlichen Links + Familien-Link,
  je mit Teilen-Button und QR-Code (für Einrichtung vor Ort: scannen statt
  tippen)
- Teilen nutzt jetzt primär das native Share-Sheet (WhatsApp/Signal/…),
  Clipboard nur als Fallback — ein Tipp vom Link zur Familien-Chatgruppe
- Nach der Ersteinrichtung öffnet sich das Share-Sheet automatisch mit Hinweis,
  damit neue Familien das Teilen sofort finden (vorher versteckt im
  Personen-Sheet)
- QR-Generierung offline: qrcode-generator (21 KB, dependency-free) inline,
  im SW-Cache; funktioniert ohne Netz
- Personen-Sheet: 🔗 und Familien-Button öffnen jetzt dieses Sheet
- APP_VERSION → 4.3.0, SW cache → `haushalt-v32`

## 2026-06-14 — v4.2.3: Reihenfolge waehrend der Sitzung eingefroren

- Kachel-Reihenfolge wird einmal berechnet und gecacht; 20-Sekunden-Auto-Sync
  und Wechsel in den Vordergrund aktualisieren weiterhin Daten und Punkte,
  ordnen die Kacheln aber NICHT mehr um — nichts springt unter dem Finger weg
- Neuberechnung nur bei erwartbaren Anlaessen: Tab-Wechsel, App in den
  Vordergrund holen, Aufgabe anlegen/aendern/loeschen
- Bei gleicher Aufgaben-Menge bleibt die gemerkte Reihenfolge bestehen,
  auch wenn sich Nutzungszahlen im Hintergrund aendern
- APP_VERSION → 4.2.3, SW cache → `haushalt-v31`

## 2026-06-14 — v4.2.2: Kacheln nach Gruppe sortiert

- Kompromiss-Sortierung: Aufgaben nach erstem Wort gruppiert; Gruppen nach
  Gesamtnutzung absteigend (haeufigste oben), innerhalb jeder Gruppe A–Z.
  «Wäsche waschen/aufhängen/falten» bleiben zusammen, oft genutzte Gruppen
  wandern nach oben. Tie-Break zwischen gleich genutzten Gruppen: A–Z.
- APP_VERSION → 4.2.2, SW cache → `haushalt-v30`

## 2026-06-14 — v4.2.1: Kacheln alphabetisch sortiert

- Aufgaben-Kacheln jetzt alphabetisch nach Name (locale 'de', akzent-/
  grossschreibungsunabhaengig) statt nach Nutzungshaeufigkeit — verwandte
  Aufgaben wie «Wäsche waschen / aufhängen / falten» stehen beieinander
- APP_VERSION → 4.2.1, SW cache → `haushalt-v29`

## 2026-06-14 — v4.2.0: Echter Mehrfamilien-Start + Manifest-Rebrand

- `families`-Tabelle (family_id, name); Haushaltsname wird geladen und als
  Titel/H1 gerendert statt hartem "Fanti WG"
- Ersteinrichtung für komplett neue Familien: Name, Personen (eine pro Zeile),
  optionales Vorausfüllen typischer Aufgaben — danach ist der Haushalt sofort
  bespielbar
- manifest.json generisch: Name "Haushalt", Navy-Farben (#12161F) statt
  altem Gruen, Icon-Cache-Buster `?v=41` damit Android das neue Icon zieht
- index.html: Titel/Description/H1-Default neutralisiert (nur vor Sync sichtbar)
- APP_VERSION → 4.2.0, SW cache → `haushalt-v28`

## 2026-06-12 — v4.1.0: Mehrfamilien-Betrieb mit Link-Auth

- DB: `family_id` auf members/chores/log (+ Indizes), `url_slug` auf members;
  Migration via GitHub-Action `db-migrate` (Repo-Secret SUPABASE_DB_PASSWORD,
  psql gegen Session-Pooler) — bestehende Daten der Fanti-Familie automatisch
  migriert
- Routing: `#f/<familie>` = Familien-Link (voller Zugriff),
  `#f/<familie>/u/<slug>` = persönlicher Link (Ich-bin fest verriegelt,
  Punkte nur für sich; Aufgaben anlegen/ändern/löschen weiterhin erlaubt;
  Personen- und Sync-Sheet ausgeblendet); Route wird in localStorage
  gemerkt, damit die installierte PWA ohne Hash startet; ungültiger Slug
  zeigt eine Fehlerseite
- Alle REST-Zugriffe zentral familien-skopiert (famScope/famRows in sb()
  und upsert()); localStorage-Keys pro Familie namespaced
- Personen-Sheet: 🔗 pro Person erzeugt/kopiert persönlichen Link,
  Button für Familien-Link; Slugs revozierbar (neu generieren)
- Ohne Link: Onboarding-Screen mit «Neue Familie erstellen»
- APP_VERSION → 4.1.0, SW cache → `haushalt-v27`

## 2026-06-12 — v4.0.3: Header-Gradient auf Akzentfarbe

- "Fanti WG"-Titel hatte das alte Mint (#52C08A) hart im Textgradient
  kodiert; nutzt jetzt `var(--accent)` und folgt damit jedem Rebrand
- APP_VERSION → 4.0.3, SW cache → `haushalt-v26`

## 2026-06-12 — v4.0.2: Finales Icon — Gelb/Koralle auf Creme

- App-Icon final: gelber Schwamm mit Koralle-Scrubschicht und -Blasen auf
  warmem Creme-Verlauf (Variante 3 aus dem Auswahlbogen); helle Platte
  statt Navy, damit es sich auf dem Homescreen neben den hellen
  System-Icons einreiht
- APP_VERSION → 4.0.2, SW cache → `haushalt-v25`

## 2026-06-12 — v4.0.1: Wasserzeichen-Ziffer entfernt

- Punkte waren dreifach kodiert (Badge, Wasserzeichen, Kachelhoehe);
  die grosse Hintergrund-Ziffer ist raus, Badge bleibt die eine Quelle
- APP_VERSION → 4.0.1, SW cache → `haushalt-v24`

## 2026-06-12 — v4.0: Navy/Kornblume rebrand, neues Icon, Edit-Tap-Target

- Akzentfarbe Mint → Kornblume leuchtend (`#84B2FF`, press `#6B99E6`);
  Hintergrund-Neutrals von gruen- auf navy-getoent (`--bg #12161F`,
  `--card #1A2230`, `--line #2A3447`, `--muted #91A1B8`)
- Neues App-Icon: flacher gelber Schwamm mit Scrubschicht im Akzentblau,
  Seifenblasen, Navy-Verlauf (192/512/maskable, als SVG via cairosvg gebaut)
- Edit-Stift auf Kacheln: Tap-Target von ~30px auf 52x52px vergroessert
  (Ecke der Kachel), :active-Feedback ergaenzt — Fehltipps buchten Punkte
- APP_VERSION → 4.0, SW cache → `haushalt-v23`
- Hinweis: Android cached PWA-Icons im WebAPK; Homescreen-Icon erneuert sich
  ggf. erst nach Re-Add der App

## 2026-06-10 — v3.9.2: SW shell cache bypasses HTTP cache

- GitHub Pages serves assets with `max-age=600`; the SW's install step was
  pre-caching `index.html` from the browser's HTTP cache, so rapid successive
  deploys installed new SWs containing stale HTML
- Install now fetches the shell with `{cache: 'reload'}` so every new SW
  caches truly fresh files
- SW cache → `haushalt-v22`

## 2026-06-10 — v3.9.1: Fix stale version display

- `APP_VERSION` constant had been left at 3.6 through v3.7–3.9; now 3.9.
  Reminder for future changes: bump `APP_VERSION` alongside the SW cache name
- SW cache → `haushalt-v21`

## 2026-06-10 — v3.9: Logarithmic tile sizing

- Tile height now `104 + 34 * log2(points + 1)` px (was linear `104 + 9p`);
  `+1` guards the zero-points case
- Same overall range (104–240px for 0–15 points), but low-value chores
  differentiate more and high values compress
- SW cache → `haushalt-v20`

## 2026-06-10 — v3.8: Flat tiles

- Removed the solid 6px bottom ledge (3D "sticking out" effect) from chore
  tiles; soft drop shadow retained
- Press feedback softened to a 2px sink to match the flat look
- SW cache → `haushalt-v19`

## 2026-06-10 — v3.7: Pollinations tile art live

- Added a Pollinations publishable key (`pk_s3BNDnxTvRHULT3z`, scoped to the
  `flux` model, 50 Pollen budget) to the `choreArt` image URL — tile art now
  authenticates against the migrated gen.pollinations.ai API
- Key is client-safe by design (publishable type); the secret key stays out
  of the repo
- SW cache → `haushalt-v18`

## 2026-06-10 — v3.6: Worth-sized masonry tiles

- Aufgaben view is now a two-column masonry flow (CSS multi-column,
  break-inside:avoid): tiles flow down the columns at natural heights
- Tile height scales with point value (104 + 9·points px) — high-worth chores
  are visually and physically bigger tap targets
- Order is by usage count derived from the completion log (most-used first),
  then points, then name; reorders live as habits change

## 2026-06-10 — v3.5: Tile art moved to new Pollinations gateway

- Tile art was failing: Pollinations migrated from the legacy keyless
  `image.pollinations.ai/prompt/` to `gen.pollinations.ai/image/` with API
  keys + pollen billing; switched to the new endpoint on the anonymous tier
- SW fix: cross-origin images are opaque responses (ok=false), which the
  cache condition rejected — art is now cached despite opacity
- Open risk: anonymous tier limits are opaque too; if tiles stay blank, the
  options are a free pk_ key from enter.pollinations.ai, an OpenAI image API
  behind a Supabase Edge Function, or emoji-based tile art
- Not the cause: prompt language (German chore nouns are fine for Flux)
- SW cache → `haushalt-v16`

## 2026-06-10 — v3.4: AI tile art

- Each chore tile gets an AI-generated illustration via Pollinations.ai
  (keyless, free): URL built deterministically from chore name + id-derived
  seed, so all devices fetch the identical image; nothing stored in the DB
- Art renders at 55% opacity under a dark legibility gradient; text gets a
  subtle shadow; graceful fallback to the plain colored tile if the image
  fails to load (onerror removes the img)
- SW now caches pollinations images (immutable per URL — safe, unlike the
  v3.0.1 API-caching bug) for offline tiles and snappy reloads
- Trade-off accepted: chore names are sent to a third-party service; free
  tier means occasional slowness. SW cache → `haushalt-v14`

## 2026-06-10 — v3.3: Self-updating app

- App now reloads itself once when a new service worker takes control
  (controllerchange listener, guarded against first-install and reload loops)
  and checks for SW updates every time it returns to the foreground.
  Ends the "close and reopen twice" ritual: from this version on, updates
  apply on the next foreground at the latest.
- Context: user's installed PWA was stuck on v3.0.x because swiping an app
  from Android recents doesn't reliably kill it; force-stop required once.
- SW cache → `haushalt-v12`

## 2026-06-10 — v3.2: Rename behind an edit button

- In the edit sheet the chore name now renders as static text with an
  "✎ Ändern" button; the input (and thus the keyboard) only appears on demand.
  Fixes the dialog auto-focusing the text field on open — slider, save, and
  delete are all visible immediately. New chores still open with the input
  active.
- SW cache → `haushalt-v11`

## 2026-06-10 — v3.1: Slider + keyboard-safe sheets

- Points input replaced with a 0–15 slider (filled track, large live value);
  editing points no longer opens the keyboard at all
- Sheets restructured: Abbrechen/Speichern (chore) and Fertig (members) moved
  to a top action bar that stays visible above the soft keyboard; "Aufgabe
  löschen" is now a full-width danger button at the sheet bottom
- SW cache → `haushalt-v10`

## 2026-06-10 — v3.0.1: Critical sync bugfix

- **Bug:** the service worker's cache-first fetch handler cached Supabase REST
  GET responses, so after the first pull every subsequent "refresh" returned a
  stale snapshot from the device cache — edits (e.g. chore points) appeared to
  revert, although the PATCH had succeeded server-side
- **Fix:** SW now only intercepts same-origin requests and Google Fonts; all
  API traffic goes straight to the network. Cache bump to `haushalt-v9`
  purges the poisoned caches on update
- Lesson recorded: never let an app-shell SW cache dynamic API endpoints

## 2026-06-10 — v3.0: "Fanti WG" — dark colorful theme

- Renamed app to "Fanti WG" (header wordmark with mint gradient, title,
  manifest name/short_name); regenerated icons in dark/mint
- Full dark theme: bg `#141A17`, cards `#1D2521`, mint accent `#52C08A`
- Per-chore colors: hue derived deterministically from the chore id (hash into
  a 10-color palette), applied to tile face/border/shadow/watermark/points via
  CSS `color-mix` — consistent across devices with zero setup
- Gold tier replaced by a ★ marker on 10+ point chores (color is now per-chore)
- SW cache → `haushalt-v8`

## 2026-06-09 — v2.5: Visual refresh

- Chore tiles redesigned as pressable 3D "keys": gradient face, hard drop
  shadow that compresses on press (translateY), giant point-number watermark
  in the display face; chores worth 10+ points get a gold finish
- Typography scaled up: body 17px, header 34px, tile names 18px, scoreboard
  numbers 34px with larger avatars and thicker bars; bigger tabs, FAB, log
- v2.4 (earlier today): Sync sheet shows app version, prefills built-in
  defaults, and gained "Auf Standard zurücksetzen" to clear local overrides
- SW cache → `haushalt-v7`

## 2026-06-09 — v2.3: Zero-config sync

- Hardcoded the household's Supabase URL + publishable key as `DEFAULT_SYNC`;
  devices now sync automatically with no setup (key is public by design)
- Empty-backend seeding moved into `pull()` so the first device to launch
  uploads its local state (previously only the manual connect flow seeded);
  also prevents an empty backend from wiping local chores
- v2.2 (earlier today): `DEFAULT_SYNC` scaffolding, "Trennen" became an
  explicit opt-out stored as `{"off":true}`
- SW cache → `haushalt-v5`

## 2026-06-09 — v2.1: Auto-sync + repo documentation

- Added automatic background sync: full pull every 20 s while the app is
  visible, in addition to pull on load and on returning to the foreground
- Added `PROMPT.md` (living app specification) and this `LOG.md` to the repo
- Service worker cache bumped to `haushalt-v3`
- Supabase project setup itself remains a user step: Claude's sandbox can reach
  only an allowlist of domains (GitHub, package registries — not supabase.com),
  and account creation requires an OAuth/email signup Claude cannot perform.
  In-app Sync settings mean no code changes are needed once the project exists.

## 2026-06-09 — v2: Points economy, shared chores

Redesign from assignment model to volunteer model per Maintainer's spec:

- Chores are standing buttons with a point value (1–100); no assignees, no due
  dates, no recurrence — pressing the button logs the completion
- Per-device "Ich bin" person selector; tap a chore → points credited, toast
  `+N für X`, double-tap protection, undo in Verlauf
- Punkte tab: weekly (Monday reset) and all-time scoreboard with bars and 👑
- Verlauf tab: append-only log, denormalized names so deleting a chore or
  person preserves history
- Design decision: one editable point value per chore instead of per-member
  max/average estimation (simpler; estimation flow listed as possible v3)
- Optional Supabase sync (REST, optimistic writes, pull on load/foreground),
  configured in-app per device; first device seeds an empty backend; app
  remains fully functional locally without sync
- Added `supabase-setup.sql` (tables + open RLS policies)
- v1 members migrated automatically on first run; SW cache → `haushalt-v2`

## 2026-06-09 — Deployment to GitHub Pages

- Pushed v1 files to `blauewelt/chores` via the GitHub Contents API using a
  user-provided fine-grained PAT (after iterating on token scope: repo access,
  then Contents/Pages read-write permissions)
- Repo had to be made public: GitHub free plan doesn't serve Pages from
  private repos
- Enabled Pages (branch `main`, root); site live at
  https://blauewelt.github.io/chores/
- Notes: Google Drive ruled out (connector is read-only; Drive no longer hosts
  static sites). Passkeys clarified as unusable for API auth.

## 2026-06-09 — v1: Initial PWA

- Task tracker with assignment model: tasks with assignee, due date,
  recurrence (täglich/wöchentlich/alle 2 Wochen/monatlich); Heute/Alle/Erledigt
  tabs; member management with color chips; overdue highlighting
- localStorage persistence (per device), offline via service worker
- German UI, de-CH formats; sage/spruce visual identity, Bricolage Grotesque
- Generated icons (192/512/maskable) with Pillow; delivered as zip
