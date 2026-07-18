#!/usr/bin/env python3
# Liest einen uiautomator-Dump und tippt (adb input tap) den ersten Knopf,
# dessen Text/Desc einen der uebergebenen Strings enthaelt. Fuer das
# generische Wegtippen von Chrome-Ersteinrichtungs-Dialogen im Emulator.
import re, subprocess, sys

xml = open(sys.argv[1], encoding='utf-8', errors='replace').read()
targets = [t.lower() for t in sys.argv[2:]]
nodes = re.findall(r'<node[^>]*/>|<node[^>]*>', xml)
for node in nodes:
    text = (re.search(r'text="([^"]*)"', node) or [None, ''])[1]
    desc = (re.search(r'content-desc="([^"]*)"', node) or [None, ''])[1]
    label = (text + ' ' + desc).lower()
    if not any(t in label for t in targets):
        continue
    m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
    if not m:
        continue
    x = (int(m.group(1)) + int(m.group(3))) // 2
    y = (int(m.group(2)) + int(m.group(4))) // 2
    print(f'tap "{(text or desc)[:40]}" @ {x},{y}')
    subprocess.run(['adb', 'shell', 'input', 'tap', str(x), str(y)])
    sys.exit(0)
print('nichts zu tippen')
