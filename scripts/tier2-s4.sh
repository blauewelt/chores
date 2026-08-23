#!/usr/bin/env bash
# Tier-2 S4: Chrome im Android-Emulator oeffnet den persoenlichen E2E-Link.
# Als EINE Datei, weil android-emulator-runner das `script:` zeilenweise
# durch `sh -c` jagt (Mehrzeiler/Funktionen unmoeglich — gelernt im 1. Lauf).
set -e
URL="https://blauewelt.github.io/chores/f/fam-e2e-fairli01/u/e2etest0001"

dismiss() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 0
  adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1 || return 0
  # Die letzten beiden sind NICHT Chrome, sondern Fairli selbst: das
  # Onboarding «Zugriff sichern» (v4.45.0) ist modal und steht bei JEDEM
  # Erstbesuch vor der App — ein frischer Emulator ist immer ein Erstbesuch.
  # Ohne das Wegtippen misst die Assertion den Dialog statt der Sicht.
  # «OK» ist RAUS (23.08.2026): als Teilzeichenkette steckt es in «bookmark»
  # und traf damit den Hinweistext des Onboardings statt eines Knopfes.
  python3 scripts/tap-by-text.py ui.xml "Accept & continue" "Use without an account" \
    "No thanks" "Got it" "Weiter" "Let's go" "Los geht's" || true
}

adb wait-for-device
# Netz VOR dem Deep-Link pruefen: ohne Verbindung laedt die App nie und die
# Assertion unten faellt mit «Testperson nicht gefunden» — eine irrefuehrende
# Fehlermeldung fuer ein Emulator-Problem (Vorfall 23.08.2026, das Artefakt
# zeigte Chromes «No internet»). WARTEN statt sofort aufgeben: die virtuelle
# WLAN-Assoziation ist nach boot_completed noch nicht fertig, der erste
# Versuch trifft regelmaessig ins Leere. Schlaegt es endgueltig fehl, sagt
# die Diagnose WAS fehlt (Route? Flugmodus? DNS?) — beim ersten Anlauf war
# «-dns-server» die naheliegende, aber falsche Vermutung.
adb shell svc wifi enable >/dev/null 2>&1 || true
adb shell svc data enable >/dev/null 2>&1 || true
net_ok() { adb shell ping -c 1 -W 2 8.8.8.8 2>&1 | grep -q "bytes from"; }
for i in $(seq 1 20); do net_ok && break; sleep 3; done
# Und ping ist als shell-User KEIN verlaessliches Mass — das war die zweite
# Lehre desselben Tages. `ip route add default via 10.0.2.2` antwortete
# «File exists»: die Route IST da. Android waehlt Netze aber pro UID ueber
# Policy-Tabellen, und die main-Tabelle, die ping befragt, traegt keine
# Default-Route. «Network is unreachable» sagt damit nichts darueber, ob der
# BROWSER ins Netz kommt. Also zweitens den ConnectivityService fragen — und
# im Zweifel nur WARNEN statt zu blocken: das eigentliche Mass ist die
# Assertion unten. Ein Vorab-Check, der haeufiger irrt als die Sache, die er
# absichern soll, gehoert nicht ins Tor.
net_up() { adb shell dumpsys connectivity 2>/dev/null | grep -qE "VALIDATED|Active default network"; }
for i in $(seq 1 10); do net_up && break; sleep 3; done
if ! net_ok && ! net_up; then
  echo "WARNUNG: Emulator meldet kein nutzbares Netz. Diagnose (die Assertion laeuft trotzdem):"
  adb shell ip addr 2>&1 | head -60 || true
  adb shell ip route 2>&1 | head -10 || true
  adb shell settings get global airplane_mode_on 2>&1 || true
  adb shell getprop 2>&1 | grep -iE "dns|wifi|net\." | head -20 || true
  adb shell dumpsys connectivity 2>&1 | head -25 || true
else
  echo "Netz steht."
fi
adb shell am start -a android.intent.action.VIEW -d "$URL" com.android.chrome
for i in 1 2 3 4 5; do sleep 4; dismiss; done

# Erneut laden, damit der finale Dump sicher die App zeigt (nicht einen Dialog)
adb shell am start -a android.intent.action.VIEW -d "$URL" com.android.chrome
sleep 12
adb shell uiautomator dump /sdcard/final.xml
adb pull /sdcard/final.xml final.xml
adb exec-out screencap -p > screen.png

echo "--- Assertion: 'Testperson' sichtbar, KEIN 'Neuen Haushalt' ---"
grep -q "Testperson" final.xml
if grep -q "Neuen Haushalt erstellen" final.xml; then
  echo "FEHLER: Einstiegsseite statt verriegelter Sicht"; exit 1
fi
echo "S4 GRUEN: verriegelte Sicht im echten Chrome erreicht"
