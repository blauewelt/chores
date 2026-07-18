#!/usr/bin/env python3
# Fuehrt in Safari (Simulator) den Teilen-Dialog bis «Zum Home-Bildschirm»
# aus: Share → (scrollen) → Add to Home Screen → Add. Screenshots je Schritt.
# Nutzung: idb-share-flow.py <UDID>
import re, subprocess, sys, time

udid = sys.argv[1]
step = 0

def shot(name):
    global step
    step += 1
    subprocess.run(['xcrun', 'simctl', 'io', udid, 'screenshot', f'cap{step:02d}-{name}.png'],
                   capture_output=True)

def describe():
    out = subprocess.run(['idb', 'ui', 'describe-all', '--udid', udid],
                         capture_output=True, text=True).stdout
    items = []
    try:
        import json
        data = json.loads(out)
        items = data if isinstance(data, list) else [data]
    except Exception:
        import json
        for line in out.splitlines():
            line = line.strip()
            if line.startswith('{'):
                try: items.append(json.loads(line))
                except Exception: pass
    return items

def center(el):
    f = el.get('frame')
    if isinstance(f, dict):
        return f['x'] + f['width'] / 2, f['y'] + f['height'] / 2
    m = re.search(r'\{\{([\d.-]+),\s*([\d.-]+)\},\s*\{([\d.]+),\s*([\d.]+)\}\}',
                  str(el.get('AXFrame') or f or ''))
    if m:
        x, y, w, h = map(float, m.groups())
        return x + w / 2, y + h / 2
    return None

def tap_label(label, attempts=4, swipe_up=False):
    for a in range(attempts):
        for el in describe():
            lab = str(el.get('AXLabel') or el.get('label') or '')
            if label.lower() in lab.lower():
                c = center(el)
                if c and c[1] > 0:
                    print(f'tap "{lab[:40]}" @ {c[0]:.0f},{c[1]:.0f}')
                    subprocess.run(['idb', 'ui', 'tap', '--udid', udid,
                                    str(int(c[0])), str(int(c[1]))])
                    return True
        if swipe_up:
            print(f'"{label}" nicht sichtbar (Versuch {a+1}) — scrolle im Sheet')
            subprocess.run(['idb', 'ui', 'swipe', '--udid', udid,
                            '200', '600', '200', '250'])
        time.sleep(2)
    print(f'FEHLER: "{label}" nicht gefunden')
    return False

shot('safari')
if not tap_label('Share'):
    sys.exit(1)
time.sleep(3); shot('sheet')
if not tap_label('Add to Home Screen', swipe_up=True):
    sys.exit(1)
time.sleep(3); shot('addform')
if not tap_label('Add'):
    sys.exit(1)
time.sleep(4); shot('done')
print('Share-Flow abgeschlossen')
