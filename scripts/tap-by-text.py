#!/usr/bin/env python3
# Liest einen uiautomator-Dump und tippt (adb input tap) den ersten Knopf,
# dessen Text/Desc einen der uebergebenen Strings enthaelt. Fuer das
# generische Wegtippen von Chrome-Ersteinrichtungs-Dialogen im Emulator.
import re, subprocess, sys

# ZWEI Durchgaenge (23.08.2026): erst GENAU, dann als Teilzeichenkette.
# Vorher gewann die Teilzeichenkette sofort — und «OK» steckt in «bookmark».
# Getippt wurde damit der Hinweistext des Onboardings statt seines Knopfes,
# der Dialog blieb stehen, und die Assertion fand «Testperson» nicht mehr
# (der modale Dialog nimmt den Hintergrund aus dem Accessibility-Baum).
# Kurze Zielwoerter sind in Fliesstext IMMER irgendwo enthalten.
def norm(x):
    for ch in '\u2019\u2018\u00b4\u0060':
        x = x.replace(ch, "'")
    return x.strip().lower()

xml = open(sys.argv[1], encoding='utf-8', errors='replace').read()
targets = [norm(t) for t in sys.argv[2:]]
nodes = re.findall(r'<node[^>]*/>|<node[^>]*>', xml)

def tap(node, label):
    m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
    if not m:
        return False
    x = (int(m.group(1)) + int(m.group(3))) // 2
    y = (int(m.group(2)) + int(m.group(4))) // 2
    print(f'tap "{label[:40]}" @ {x},{y}')
    subprocess.run(['adb', 'shell', 'input', 'tap', str(x), str(y)])
    return True

for mode in ('exact', 'contains'):
    for node in nodes:
        text = (re.search(r'text="([^"]*)"', node) or [None, ''])[1]
        desc = (re.search(r'content-desc="([^"]*)"', node) or [None, ''])[1]
        label = norm(text + ' ' + desc)
        hit = (any(t == label for t in targets) if mode == 'exact'
               else any(t in label for t in targets))
        if hit and tap(node, text or desc):
            sys.exit(0)
print('nichts zu tippen')
