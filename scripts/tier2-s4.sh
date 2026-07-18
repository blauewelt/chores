#!/usr/bin/env bash
# Tier-2 S4: Chrome im Android-Emulator oeffnet den persoenlichen E2E-Link.
# Als EINE Datei, weil android-emulator-runner das `script:` zeilenweise
# durch `sh -c` jagt (Mehrzeiler/Funktionen unmoeglich — gelernt im 1. Lauf).
set -e
URL="https://blauewelt.github.io/chores/f/fam-e2e-fairli01/u/e2etest0001"

dismiss() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 0
  adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1 || return 0
  python3 scripts/tap-by-text.py ui.xml "Accept & continue" "Use without an account" \
    "No thanks" "Got it" "Weiter" "OK" || true
}

adb wait-for-device
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
