#!/usr/bin/env python3
# Findet ein Element per AXLabel im Output von `idb ui describe-all` und
# tippt seine Mitte. Iteration 3:
#  - REKURSIVE Traversierung (der Baum ist verschachtelt — Top-Level-Scan
#    fand Safaris «Share»-Button nicht)
#  - Schema-Debug: bei Nichtfund wird ein Ausschnitt des Roh-Outputs geloggt
#  - Koordinaten-Fallback via env FALLBACK_TAP="x y"
import json, os, re, subprocess, sys, time

udid, label = sys.argv[1], sys.argv[2]

def raw_describe():
    p = subprocess.run(['idb', 'ui', 'describe-all', '--udid', udid],
                       capture_output=True, text=True)
    if not p.stdout.strip():
        print(f'describe-all leer (rc={p.returncode}) stderr: {p.stderr[:200]}')
    return p.stdout

def parse(out):
    try:
        data = json.loads(out)
        return data if isinstance(data, list) else [data]
    except json.JSONDecodeError:
        items = []
        for line in out.splitlines():
            line = line.strip()
            if line.startswith('{') or line.startswith('['):
                try:
                    d = json.loads(line)
                    items.extend(d if isinstance(d, list) else [d])
                except json.JSONDecodeError:
                    pass
        return items

def walk(node):
    # liefert ALLE dicts im Baum (children/elements/beliebige Listen)
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)

def frame_center(el):
    f = el.get('frame')
    if isinstance(f, dict) and 'x' in f:
        return f['x'] + f.get('width', 0) / 2, f['y'] + f.get('height', 0) / 2
    s = el.get('AXFrame') or (f if isinstance(f, str) else '')
    m = re.search(r'\{\{([\d.-]+),\s*([\d.-]+)\},\s*\{([\d.]+),\s*([\d.]+)\}\}', str(s))
    if m:
        x, y, w, h = map(float, m.groups())
        return x + w / 2, y + h / 2
    return None

def find(out):
    for el in walk(parse(out)):
        lab = ' '.join(str(el.get(k) or '') for k in
                       ('AXLabel', 'label', 'AXValue', 'title', 'name'))
        if label.lower() in lab.lower():
            c = frame_center(el)
            if c:
                return c, lab.strip()[:50]
    return None

for attempt in range(3):
    out = raw_describe()
    hit = find(out)
    if hit:
        (x, y), lab = hit
        print(f'tap "{lab}" @ {x:.0f},{y:.0f}')
        subprocess.run(['idb', 'ui', 'tap', '--udid', udid, str(int(x)), str(int(y))])
        sys.exit(0)
    if attempt == 0:
        print('Schema-Ausschnitt:', out[:600].replace('\n', ' '))
    vec = sys.argv[3:7] if len(sys.argv) >= 7 else ['300', '400', '60', '400']
    print(f'"{label}" nicht gefunden (Versuch {attempt+1}) — wische {" ".join(vec)}')
    subprocess.run(['idb', 'ui', 'swipe', '--udid', udid] + vec)
    time.sleep(2)

fb = os.environ.get('FALLBACK_TAP')
if fb:
    x, y = fb.split()
    print(f'Fallback-Tap @ {x},{y}')
    subprocess.run(['idb', 'ui', 'tap', '--udid', udid, x, y])
    sys.exit(0)
print(f'FEHLER: "{label}" nicht gefunden, kein Fallback'); sys.exit(1)
