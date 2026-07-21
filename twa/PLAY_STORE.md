# Fairli im Google Play Store (TWA)

Stand 21.07.2026. Alles Serverseitige ist bereits erledigt — dieses
Dokument beschreibt, was auf einem Rechner mit Play-Console-Zugang
noch zu tun ist.

## Bereits erledigt (verifiziert live)

- **Digital Asset Links**: `https://blauewelt.github.io/.well-known/assetlinks.json`
  ist live und nennt `io.github.blauewelt.fairli` mit dem Fingerprint des
  Upload-Schlüssels (beginnt `F5:A0:D3:27:…`). Nötig war ein `.nojekyll`
  im Root-Repo — Jekyll unterschlägt Punkt-Ordner (dokumentierte Falle).
- **Upload-Keystore**: privat übergeben (NICHT im Repo — Repo ist
  öffentlich). Alias `fairli`, RSA 2048, gültig 25 Jahre.
- **twa-manifest.json** (dieser Ordner): fertige Bubblewrap-Konfiguration.
  Farben = App-Farben (dunkler Start, v4.56.2), startUrl generisch
  (`/chores/` — die App landet per zuletzt-benutzter Route richtig,
  v4.56.0), Fallback `customtabs`.

## Build (einmalig ~15 Minuten)

    npm i -g @bubblewrap/cli
    cd twa && cp <privat-übergebener>/fairli-upload.keystore .
    bubblewrap build          # JDK/Android-SDK lädt Bubblewrap selbst
    # Ergebnis: app-release-bundle.aab (für Play) + app-release-signed.apk
    # (zum lokalen Testen: adb install app-release-signed.apk)

Lokaler Test VOR dem Upload: App öffnen → es darf KEINE Browser-Leiste
erscheinen (Asset-Links greifen), Start ist dunkel, «Zu meinem
Haushalt» bzw. die Haustür erscheint.

## Play Console

1. Neue App → Name **Fairli**, Standard-Sprache Deutsch (Schweiz),
   App (kein Spiel), kostenlos.
2. **Play App Signing** (Standard) akzeptieren. WICHTIG: danach unter
   *App-Integrität → App-Signatur* den **Google-App-Signing-Fingerprint**
   kopieren und in `assetlinks.json` als ZWEITEN Eintrag im
   `sha256_cert_fingerprints`-Array ergänzen — Google signiert die
   ausgelieferte App mit einem eigenen Schlüssel. Ohne diesen zweiten
   Fingerprint zeigt die Store-Version eine Browser-Leiste.
3. AAB unter *Produktion* (oder erst *Interner Test*) hochladen.

## Store-Eintrag (Textvorschläge)

**Kurzbeschreibung (80 Zeichen):**
> Aufgaben im Haushalt – fair verteilt. Ohne Konto, ohne Werbung.

**Vollständige Beschreibung:**
> Fairli verteilt Haushaltsaufgaben fair – in WGs und Familien.
>
> • Aufgaben antippen, Punkte sammeln, Verlauf ansehen
> • Jede Person hat ihren eigenen Link – kein Konto, kein Passwort
> • Personen ohne eigenes Telefon (Kinder, Katzen …) werden mitgeführt
> • Mehrsprachig (20 Sprachen), dunkles Design, funktioniert offline
>
> **Transparenz:** Fairli ist eine Web-App, deren vollständiger
> Quellcode öffentlich einsehbar ist:
> https://github.com/blauewelt/chores
> Jede Zeile, die diese App ausführt, kann dort gelesen und geprüft
> werden – einschliesslich der gesamten Änderungsgeschichte. Es gibt
> kein Tracking, keine Werbung und keine Datenweitergabe an Dritte.
>
> Hinweis zur Lizenz: der Quellcode ist einsehbar (source-available);
> die Nutzung der App ist frei, die Weiterverbreitung des Codes ist
> lizenzrechtlich geregelt (siehe LICENSE im Repository).

**Datensicherheits-Formular (Play):** keine Werbung, kein Tracking;
Haushaltsdaten (Namen, Aufgaben, Verlauf) werden zur Synchronisation
auf einem Server gespeichert; optional Ende-zu-Ende-verschlüsselt
(famx-Haushalte). Keine Konten, keine Standort-/Kontaktdaten.

## Warum «einsehbar» und nicht «Open Source»

Die LICENSE im Repo ist bewusst «alle Rechte vorbehalten» (Entscheid
19.07.2026). «Open Source» im Store-Text wäre darum falsch und
angreifbar — «Quellcode öffentlich einsehbar» ist wahr und trägt
denselben Vertrauensgedanken. Falls später eine OSI-Lizenz gewünscht
ist: zuerst LICENSE ändern, dann den Store-Text.

## Nachtrag 21.07.2026 — Build wurde bereits ausgeführt

Der Build lief in der Claude-Sandbox durch; **fairli-play.aab**
(signiert, für Play) und **fairli-test.apk** (signiert, für
`adb install`) wurden privat übergeben. Falls lokal neu gebaut wird:

- `bubblewrap update` erzeugt das Projekt neu mit compileSdk 36 —
  danach die drei lokalen Anpassungen wiederholen: `versionName "1.0.0"`
  (Bubblewrap liess ihn leer), `targetSdkVersion 35`, und bei
  SDK-Probleme das Standard-Layout als sdk.dir (nicht den
  cmdline-tools-Ordner; AGP findet Plattformen sonst nicht — kostete
  hier vier Anläufe).
- JDK: ein echtes JDK mit javac (17 empfohlen); ein reines JRE
  scheitert an «does not provide JAVA_COMPILER».
- androidx.browser aus dem Template verlangt compileSdk ≥ 36.
- Signatur-Kette verifiziert: Zertifikat-SHA-256 des APK =
  f5a0d327… = Fingerprint in assetlinks.json. Version 1.0.0 (Code 1),
  Label «Fairli», targetSdk 35, compileSdk 36.
