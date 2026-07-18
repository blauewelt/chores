# Fairli — Was ist neu

**Versionen 4.18 – 4.25.1** · 11.–14. Juli 2026

Eine ereignisreiche Woche. Der grösste Brocken war unsichtbar — ein hartnäckiger
Fehler beim Einrichten des App-Icons, der endlich gefunden und behoben wurde.
Dazu kamen einige Verbesserungen, die den Alltag mit Fairli spürbar angenehmer
machen, viele davon direkt aus eurem Feedback.

---

## 🏠 Das App-Icon funktioniert jetzt zuverlässig

Wochenlang landeten manche von euch beim Öffnen des Fairli-Icons auf der
Startseite («Neuen Haushalt erstellen») statt in eurem Haushalt. Die Ursache ist
gefunden und behoben:

- **Beim Hinzufügen zum Home-Bildschirm** wird jetzt garantiert die richtige
  Adresse gespeichert. Vorher speicherte iPhone in bestimmten Fällen nur die
  «leere» Startseite — daher die Verwirrung.
- **Ältere, kaputte Icons heilen sich selbst:** Einmal den Einladungs-Link
  öffnen und antippen genügt — danach funktioniert genau dieses Icon dauerhaft.
- **Landet ihr doch einmal auf der Startseite,** erklärt euch die App jetzt
  direkt, was zu tun ist (altes Icon löschen, Link öffnen), statt euch
  versehentlich einen neuen Haushalt anlegen zu lassen.

## 📲 Einfacher installieren & einladen

- **Neuer Hinweis-Balken** oben: Wer einen Einladungslink öffnet, sieht sofort
  «Als App auf den Home-Bildschirm» — ohne Menüs suchen zu müssen. Einmal
  weggeklickt, bleibt er weg.
- **Auf Android geht’s per Knopfdruck:** Ein Tipp auf «Jetzt installieren» öffnet
  den System-Dialog — fertig. (Auf dem iPhone erlaubt Apple das leider nur von
  Hand — dort führt euch die App Schritt für Schritt.)
- Die Install-Anleitung zeigt jetzt **nur euer eigenes Gerät** — keine
  verwirrenden Pixel-Schritte auf dem iPhone und umgekehrt.
- **«Teilen» heisst jetzt «Einladen».** Der Fairli-Knopf hiess genauso wie
  Apples eigener Teilen-Knopf — das sorgte für Verwechslungen beim Installieren.
  Jetzt ist klar getrennt, was zu Fairli gehört und was zum Browser.
- Der Einladungs-Link öffnet sich jetzt sauber in Safari **und** Chrome (früher
  hiess es fälschlich «nicht in Chrome»).

## ✅ Aufgaben eintragen — flexibler

- **«Einmalig»-Kachel** (immer oben links): Etwas erledigt, das keine feste
  Kachel braucht? Einmalig eintragen, ohne den Bildschirm mit Kacheln zu füllen.
- **Beim Anlegen einer Aufgabe** ist «Speichern + eintragen» jetzt der
  Hauptknopf — die Aufgabe wird angelegt **und** gleich verbucht. Nur die Kachel
  anlegen? Dafür gibt es «Nur speichern».
- **Das «+» denkt mit:** Im Verlauf öffnet es «Einmalig eintragen» statt eine
  unsichtbare Kachel anzulegen.

## 📜 Verlauf — aufgeräumt und korrigierbar

- **Serien werden zusammengefasst:** Dreimal «Einkaufen» hintereinander erscheint
  als eine Zeile «Einkaufen ×3» mit zusammengezählten Punkten — statt drei
  separater Einträge. (Praktisch: Statt einer «gross»- und einer «klein»-Kachel
  einfach mehrmals dieselbe Kachel tippen.)
- **Einträge bearbeiten:** Titel, Notiz **und Zeitpunkt** lassen sich nachträglich
  ändern. Bei einer Serie verschiebt eine Zeitänderung alle Einträge gemeinsam.
  Das Bearbeiten ändert nie die zugehörige Kachel.
- **Versehentlich gelöscht? «Rückgängig».** Nach dem Löschen erscheint fünf
  Sekunden lang ein «Rückgängig»-Knopf — kein Eintrag geht mehr durch einen
  Fehltipp verloren.
- **Grössere Menü-Einträge:** Die «⋯»-Menüs sind grösser und «Löschen» ist klar
  abgesetzt — damit man es nicht mehr aus Versehen trifft.

## ✨ Kleinigkeiten

- Der Haushaltsname oben ist etwas grösser.
- Einheitlicheres Bedienkonzept in allen Dialogen: Schliessen immer mit «×» oben
  rechts, Hauptaktion immer als grosser Knopf unten.
- Die «Einmalig»-Kachel hat jetzt auch ein eigenes Bild.
- Diverse Flacker- und Anzeige-Verbesserungen beim Öffnen persönlicher Links.

---

## 🛠 Unter der Haube (für Interessierte)

- **Automatische Tests:** Fairli hat jetzt eine zweistufige Testpyramide — bei
  jeder Änderung laufen 50 Regressionstests (in Chrome **und** Safari), dazu
  nächtliche Tests auf echten iPhone- und Android-Simulatoren. Jeder Test
  entspricht einem Fehler, der genau einmal passiert ist und nicht
  wiederkommen soll.
- Der oben erwähnte Icon-Fehler wurde nicht erraten, sondern **bewiesen**: Ein
  automatisierter Test las direkt aus, welche Adresse iPhone beim Installieren
  speichert — vorher die falsche, nach dem Fix die richtige.

*Danke fürs Testen und für euer Feedback — ein grosser Teil dieser Woche kam
direkt daraus.*
