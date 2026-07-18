# Fairli — Tier-2-Teststrategie (Emulatoren & echte Geräte)

Tier 1 (Playwright, `tests/`) deckt die Web-Schicht ab. Tier 2 deckt das ab,
was NUR auf einem (emulierten) Betriebssystem existiert: Homescreen-Install,
Icon-Start, Standalone-Modus, Browser↔OS-Übergaben. Auslöser dieser
Strategie: zwei Feld-Fehlschläge (ein Mitglied, Noel), deren Ursachen in genau
dieser Schicht lagen bzw. liegen.

## Was Emulatoren können — und was nicht (ehrliche Grenzen)

| Fähigkeit | iOS Simulator | Android Emulator |
|---|---|---|
| Safari/Chrome mit echter Engine | ✓ | ✓ |
| Deep-Link öffnen (`simctl openurl` / `adb am start -d`) | ✓ | ✓ |
| «Zum Home-Bildschirm» automatisieren | ✓ (XCUITest/Appium: Share-Sheet + Springboard) | ✓ (UiAutomator: Chrome-Menü) |
| Web-Clip/Shortcut vom Homescreen starten | ✓ | ✓ |
| WebAPK-Minting (echte Android-PWA) | — | ⚠ nur Play-Store-Images, flaky |
| Kamera / echter QR-Scan | ✗ (kein Kamera-Stack) | ✗ (nur virtuelle Szene) |
| iOS Link Tracking Protection realistisch | ⚠ teilweise (kein Mail/Messages-Kontext) | n/a |

Kamera-Scan bleibt prinzipiell untestbar → das treue Äquivalent ist
«dekodierte URL öffnen» (QR-Byte-Exaktheit ist per ECC-Round-Trip bewiesen,
siehe LOG 2026-07-11). Echte LTP-/WebAPK-Verhalten brauchen echte Geräte
(Tier 2b).

## Szenarien (Prioritätsreihenfolge)

Alle Szenarien laufen gegen EINEN festen, dedizierten Test-Haushalt in der
Produktions-DB (`fam-e2e-fairli01`, Mitglied «Testperson», Slug
`e2etest0001`) — niemals gegen Fanti WG. Der Haushalt wurde EINMAL angelegt
und wird nur wiederverwendet; die Läufe sind strikt LESEND (Links öffnen,
Sicht assertieren — getippt wird nur auf Browser-Dialoge/Springboard, nie
auf App-Elemente, die schreiben würden). Es entsteht pro Lauf NICHTS, also
ist auch nichts aufzuräumen. Ein automatisches «Zurücksetzen per REST im
Workflow-Setup» war geplant, ist aber NIE implementiert worden — diese
Zeile hier ersetzt die frühere Falschbehauptung.

WARTUNGS-HINWEIS: der Familien-Link steht (bewusst) im öffentlichen Repo —
jeder könnte den Test-Haushalt öffnen und z. B. umbenennen; dann brechen
die Assertions («Testperson»). Wiederherstellen OHNE Löschen: in der App
über den Familien-Link den Haushaltsnamen zurücksetzen bzw. das Mitglied
wieder «Testperson» nennen (Upsert-Semantik; nichts löschen — Standing
Rule). Kein Automatismus, bewusst: ein Reset-Skript mit Schreibrechten
wäre mehr Risiko als der seltene Handgriff wert.

- **S1 — Scan-Äquivalent iOS:** `xcrun simctl openurl booted <PERSONAL_URL>`
  → Safari → Assertion: verriegelte Sicht («Testperson» sichtbar, kein
  «Personen»-Button). Deckt: Handoff-Kette End-to-End auf echtem WebKit
  inkl. HTTP-404-Verhalten.
- **S2 — iOS-Install:** Appium (XCUITest): Share-Sheet → «Zum
  Home-Bildschirm» → Hinzufügen → Springboard-Icon «Fairli» tippen →
  Assertion: verriegelte Sicht UND `Modus: standalone` NICHT auf der
  Einstiegsseite. Deckt: Web-Clip-URL-Erfassung (unser ältester Bug).
- **S3 — Stale-Icon-Falle (Noel-Szenario):** Web Clip absichtlich von der
  EINSTIEGSSEITE aus hinzufügen → Icon starten → Assertion: Diagnose zeigt
  `Modus: standalone (Homescreen-Icon!)`. Dokumentiert die Falle und
  verifiziert, dass die Diagnose sie benennt.
- **S4 — Android Chrome:** `adb shell am start -a android.intent.action.VIEW
  -d <PERSONAL_URL>` → UiAutomator-Dump → Assertion «Testperson». Danach
  Chrome-Menü → «Zum Startbildschirm» → Icon starten → Assertion Sicht.
  (Shortcut-Pfad, deterministisch; WebAPK siehe S5.)
- **S5 — WebAPK (best effort):** Play-Store-Image, Familien-Link
  installieren, Icon starten. Als `continue-on-error` markieren —
  Minting auf Emulatoren ist bekannt flaky; rote Läufe hier blockieren
  nichts, grüne sind Signal.

## Infrastruktur

- **iOS (S1–S3):** GitHub-Actions `macos-14`-Runner (für öffentliche Repos
  kostenlos). `xcrun simctl` fürs Booten/OpenURL; Appium mit
  XCUITest-Driver für Share-Sheet/Springboard. Zwei Simulator-Versionen
  (aktuelles iOS + Vorgänger), da sich LTP-Verhalten zwischen Versionen
  ändert.
- **Android (S4–S5):** `ubuntu-latest` + `reactivecircus/android-emulator-runner`;
  S4 mit `google_apis`-Image, S5 mit `google_apis_playstore`.
- **Trigger:** `workflow_dispatch` + nightly `schedule` — NICHT pro Push
  (10–20 min Laufzeit, Flakiness-Risiko; Tier 1 bleibt der Push-Gate).
- **Artefakte:** Screenshots + UiAutomator-Dumps/Simulator-Logs bei jedem
  Lauf hochladen — Feld-Fehlschläge vergleicht man am besten gegen ein
  bekannt-gutes Referenzbild.

## Tier 2b — echte Geräte (vor «Produktion»)

BrowserStack App Live / AWS Device Farm mit echten iPhones/Pixels:
BrowserStack hat einen kostenlosen Open-Source-Plan (Antrag mit Repo-Link).
Dort zusätzlich: echter Kamera-Scan (manuell, dokumentiertes Skript),
echtes LTP in Mail/Messages (Link per iMessage senden!), echtes
WebAPK-Minting. Frequenz: vor Releases, nicht nightly.

## Stand (11.07.2026)

- **S4 GRÜN** (Lauf 2): echtes Chrome, Emulator api-34, voller Produktions-
  Handoff, UiAutomator-Assertion. Gelernt: der emulator-runner führt
  `script:` zeilenweise via `sh -c` aus → Szenario lebt in
  `scripts/tier2-s4.sh`.
- **S1 implementiert** (OCR-Assertion via tesseract): Lauf 1 bewies die
  volle Kette in echtem iOS-Safari (Mitglieder-Sicht gerendert), scheiterte
  nur an OCR-untauglicher Assertion (kleiner Chip-Text) → auf grossen
  Titel umgestellt. Laufzeit ~18 min (macos-14, brew tesseract).
- Beide nightly (03:07/03:17 UTC) + workflow_dispatch.
- **S3 in Tier-1 vorgezogen** (12 Tests): Stale-Icon-Falle als
  Playwright-Test via `navigator.standalone`-Shim — standalone + blanke
  index.html ⇒ Diagnose zeigt «Homescreen-Icon!»; dazu der Gegenfall
  (gesundes Admin-Icon ⇒ family-first-Restore). Laeuft pro Push auf beiden
  Engines. Das ECHTE Springboard-Web-Clip-Szenario (S2/S3 via Appium)
  bleibt der naechste Tier-2-Ausbau. Gelernt: CDP-display-mode-Emulation
  greift im Headless-Shell nicht; das navigator-Signal ist das richtige
  Testobjekt (es ist, was die App prueft).
- Diagnostischer Wert sofort eingelöst: die Kette, an der Mikas Telefon
  scheitert, funktioniert auf sauberen Geräten beider Plattformen —
  stützt die Stale-Icon-Hypothese.

### S2/S3 auf dem echten Simulator: WebClip-Injektion (implementiert)

Workflow `tier2-ios-webclip.yml` (nightly 03:27 UTC + dispatch), Ansatz OHNE
Appium: Web Clips sind auf dem Simulator schlichte Dateien
(`data/Library/WebClips/<Name>.webclip/Info.plist` mit Title/URL/FullScreen).
Der Workflow injiziert zwei Clips bei heruntergefahrenem Simulator, bootet,
tippt die Springboard-Icons per `idb ui tap` (Suche per AXLabel,
`scripts/idb-find-tap.py`, defensiv geparst, wischt bei Bedarf weiter) und
prueft per Screenshot-OCR:
- **S3a «FairliOK»** (persoenliche E2E-URL): erwartet Mitglieder-Sicht.
- **S3b «FairliStale»** (blanke index.html — Mikas Falle): erwartet
  Einstiegsseite; Modus-Diagnose per OCR ist Bonus (10.5px evtl. zu klein).
Getestet wird die LAUNCH-Semantik installierter Icons (URL eingebacken,
FullScreen).

**Status: S3a + S3b GRÜN (Lauf 3, 11.07.).** S3a-Screenshot zeigt die
Mitglieder-Sicht OHNE Safari-URL-Zeile ⇒ FullScreen/standalone wirkt.
S3b reproduziert Mikas Stale-Icon-Falle nightly auf echtem iOS.
Runner-Drift-Lektionen (14.07., erster Nightly-Ausfall): (0) Das
macOS-Runner-Image wandert unter uns — Symptome: frisch gebootete Sims
zeigen jetzt einen LOCK SCREEN (grosse Uhr im describe-all = das Signal;
Fix: Swipe-up + HOME vor dem ersten Icon-Tap), und iOS-18.x-Springboards
IGNORIEREN dateisystem-injizierte WebClips (plists ueberleben auf der
Platte, Icons erscheinen nie). Fix: eigenes Geraet per `simctl create`
fest auf iOS 17.x pinnen statt Regex ueber Runner-Defaults. Wenn 17.x aus
den Images faellt: Clip-Erzeugung auf den Capture-Flow (Share-Sheet)
umbauen — der funktioniert auf jedem Runtime. Iterations-Lektionen: (1) neueres Homebrew verlangt `brew trust
facebook/fb` für Fremd-Taps; (2) fb-idb ist mit brew-Python 3.14
inkompatibel (asyncio.get_event_loop entfernt) → System-Python nutzen:
`/usr/bin/python3 -m pip install --user fb-idb`, USERBIN in GITHUB_PATH.
(3) Die Modus-Diagnosezeile (10.5px) ist für OCR zu klein — Assertions
auf grosse UI-Elemente stützen. **Capture-Semantik-Test (tier2-ios-capture.yml, 12.07., dispatch):** prueft
Maintainer-Hypothese («beim Hinzufuegen wird nur die Basis-URL eingebacken»)
EMPIRISCH: echter Share-Flow in Safari (idb: Share → Add to Home Screen →
Add, `scripts/idb-share-flow.py` mit Sheet-Scroll), danach wird die
Wahrheit direkt aus dem erzeugten Web Clip gelesen
(`data/Library/WebClips/*.webclip/Info.plist`, Feld URL) — keine OCR,
keine Deutung. Ergebnis steht im Log unter «EINGEBACKENE URL».
Die Share-Sheet-ERFASSUNG («baeckt iOS beim Hinzufuegen die
aktuelle URL ein?») bleibt der letzte offene Ausbau — braucht
UI-Automation des Teilen-Dialogs (idb-Taps auf Safari-UI oder Appium).

### Share-Sheet-Capture (S2-Kern): ABGESCHLOSSEN, nightly

`tier2-ios-capture.yml` (03:37 UTC): echter Share-Flow (Koordinaten-Tap
Share → OCR-Tap «Add to Home Screen» → OCR-Tap «Add», wortgenau/oben-rechts)
→ liest die plist des frisch erzeugten Web Clips. 13.07.: Bug per Ground
Truth bewiesen (URL => index.html trotz Deep-Link in Safari; Ursache:
statisches Manifest wird beim Parsen registriert, JS-Entfernen wirkungslos)
und Fix v4.20.0 verifiziert (URL => voller Familien-Pfad). Lektionen:
tesseract-Zeilen verschmelzen Navbars → exakte Matches WORTweise, oben-
rechts gewinnt; HOMEBREW_NO_AUTO_UPDATE=1 spart ~10 min; Screenshot→OCR→
Tap ist unser Standardmechanismus fuer System-UI, die der Accessibility-
Baum nicht zeigt.

## Reihenfolge der Umsetzung

1. S4 (Android Chrome Deep-Link) — geringster Aufwand, sofortiger Wert.
2. S1 (iOS openurl) — der macOS-Runner-Einstieg, noch ohne Appium.
3. S2/S3 (Appium + Springboard) — der eigentliche Gewinn, aber am meisten
   Pflege; erst bauen, wenn S1 stabil läuft.
4. S5 + Tier 2b vor einem echten Produktions-Anspruch.

Grundsatz aus Tier 1 übernehmen: Jedes Szenario referenziert den realen
Vorfall, den es verhindert. Kein Szenario ohne Geschichte.

## Grenze: Chrome auf iOS (Stand 14.07.2026, v4.20.1)

Der Chrome-auf-iOS-Install-Flow ist NICHT Tier-2-automatisierbar — am
14.07. aktiv verifiziert: chromium-browser-snapshots enthaelt keine
iOS-Artefakte (Bucket-Listing leer), Chrome for Testing kennt kein iOS,
App-Store-IPAs sind FairPlay-verschluesselt (Simulator lehnt ab),
Chromium-Source-Build braucht 7–9 h / ~120 GB und sprengt das
6-h-Job-Limit. Moeglicher Proxy: Firefox iOS aus Source (~30 min Build,
gleiches System-Share-Sheet seit 16.4) — Experimentierlauf noetig, da die
«Zum Home-Bildschirm»-Aktion am web-browser-Entitlement haengt. Abdeckung stattdessen dreistufig:
1. Tier 1 pinnt das CriOS-UA-Profil (kein Manifest, Handoff, Anleitung) und
   den Anleitungs-Wortlaut (Chrome erlaubt, kein nacktes «Teilen»).
2. Mechanik-Aequivalenz: seit iOS 16.4 nutzen alle Browser dasselbe
   System-Share-Sheet/Web-Clip wie Safari (S2/S3 decken die Mechanik ab).
3. Ein manueller Geraetetest (oder Tier 2b/BrowserStack-Echtgeraet) bleibt
   offen — s. DEVELOPER_ONBOARDING §12.
