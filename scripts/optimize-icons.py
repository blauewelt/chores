#!/usr/bin/env python3
# Nachlauf zu render-icons.mjs: Playwright schreibt unkomprimierte PNGs; hier
# verlustfrei nachverdichten (RGB, zlib 9). Seit v4.121.0 nur die Trial-Icons —
# die globalen icon-*.png / icon-b3-* / twa/store_icon.png werden hier NICHT
# angefasst (Navy-Gesicht, fuer alle, bis der Haushalt entschieden hat).
import os
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
for f in ['icon-trial-192.png', 'icon-trial-512.png', 'icon-trial-512-maskable.png']:
    p = os.path.join(ROOT, f); b = os.path.getsize(p)
    Image.open(p).convert('RGB').save(p, optimize=True, compress_level=9)
    print(f, b, '->', os.path.getsize(p))
