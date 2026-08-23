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
  python3 scripts/tap-by-text.py ui.xml "Accept & continue" "Use without an account" \
    "No thanks" "Got it" "Weiter" "OK" "Let's go" "Los geht" || true
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
# MESSUNG statt Vermutung (Diagnose-Lauf 23.08.2026): eth0 (10.0.2.15) und
# wlan0 (10.0.2.16) haben Adressen und On-Link-Routen, aber es gibt KEINE
# Default-Route — daher «Network is unreachable». Das Image faehrt den
# virtio-WLAN-Pfad (ro.boot.qemu.virtiowifi=1) und bekommt per DHCP keine
# Default-Route mehr. Das QEMU-Slirp-Gateway liegt immer auf 10.0.2.2:
# nachtragen ist deterministisch und billiger als auf DHCP zu hoffen.
if ! net_ok && ! adb shell ip route 2>/dev/null | grep -q '^default'; then
  echo "keine Default-Route — trage 10.0.2.2 nach"
  adb root >/dev/null 2>&1 || true
  adb wait-for-device
  adb shell ip route add default via 10.0.2.2 dev eth0 2>&1 || true
  adb shell ip route add default via 10.0.2.2 dev wlan0 2>&1 || true
  for i in 1 2 3 4 5; do net_ok && break; sleep 2; done
fi
if ! net_ok; then
  echo "FEHLER: Emulator hat kein Netz — nicht die App ist rot. Diagnose:"
  adb shell ip addr 2>&1 | head -60 || true
  adb shell ip route 2>&1 | head -10 || true
  adb shell settings get global airplane_mode_on 2>&1 || true
  adb shell getprop 2>&1 | grep -iE "dns|wifi|net\." | head -20 || true
  exit 1
fi
echo "Netz steht."
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
