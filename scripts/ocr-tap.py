#!/usr/bin/env python3
# Selbstkalibrierendes Tippen: Screenshot → OCR (tesseract) → Text finden →
# Mitte in Punkten antippen. Umgeht die zu flache idb-Accessibility (Share-
# Sheet-Inhalte sind dort unsichtbar). Nutzung:
#   ocr-tap.py <udid> <png> <zieltext> [--exact]
# --exact: Zeile muss GENAU dem Zieltext entsprechen (z. B. «Add» vs.
# «Add Bookmark»); bei mehreren Treffern gewinnt oben-rechts (Nav-Button).
import subprocess, sys
from PIL import Image
import pytesseract

udid, png, target = sys.argv[1], sys.argv[2], sys.argv[3]
exact = '--exact' in sys.argv
im = Image.open(png)
scale = im.width / 393.0   # iPhone 15 Pro: 393 pt logische Breite (im Workflow gepinnt)

d = pytesseract.image_to_data(im, output_type=pytesseract.Output.DICT)
lines = {}
for i, word in enumerate(d['text']):
    if not word.strip():
        continue
    key = (d['block_num'][i], d['par_num'][i], d['line_num'][i])
    lines.setdefault(key, []).append(
        (d['left'][i], d['top'][i], d['width'][i], d['height'][i], word))

cands = []
if exact:
    # WORT-genau, nicht Zeilen-genau: tesseract verschmilzt die Navbar zu
    # EINER Zeile («Cancel Add to Home Screen Add») — der Button ist das
    # rechteste Vorkommen des Einzelworts. Oben-rechts gewinnt.
    for words in lines.values():
        for (l, t, w, h, word) in words:
            if word.strip('.,"«»“”\'').lower() == target.lower():
                cands.append((t, -(l + w), l + w/2, t + h/2, word))
else:
    for words in lines.values():
        text = ' '.join(w[4] for w in sorted(words))
        if target.lower() in text.lower():
            xs = [w[0] for w in words]; xe = [w[0] + w[2] for w in words]
            ys = [w[1] for w in words]; ye = [w[1] + w[3] for w in words]
            cands.append((min(ys), -max(xe), (min(xs)+max(xe))/2, (min(ys)+max(ye))/2, text))

if not cands:
    print(f'OCR: "{target}" nicht gefunden. Zeilen:',
          ' | '.join(' '.join(w[4] for w in sorted(v)) for v in list(lines.values())[:14]))
    sys.exit(1)

cands.sort()                      # oben zuerst, dann rechts zuerst
_, _, cx, cy, text = cands[0]
x, y = int(cx/scale), int(cy/scale)
print(f'OCR-Tap "{text}" @ {x},{y} pt')
subprocess.run(['idb', 'ui', 'tap', '--udid', udid, str(x), str(y)], check=True)
