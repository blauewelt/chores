#!/usr/bin/env python3
# Nachlauf zu render-icons.mjs: Playwright schreibt unkomprimierte PNGs; hier
# verlustfrei nachverdichten (RGB, zlib 9) und die Aliase/Store-Kopie aus den
# optimierten Bytes neu ziehen, damit «gleiche Bytes» weiter stimmt.
import os, shutil
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
for f in ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png']:
    p = os.path.join(ROOT, f); b = os.path.getsize(p)
    Image.open(p).convert('RGB').save(p, optimize=True, compress_level=9)
    print(f, b, '->', os.path.getsize(p))
for a, b in [('icon-192.png', 'icon-b3-192.png'), ('icon-512.png', 'icon-b3-512.png'),
             ('icon-512-maskable.png', 'icon-b3-512-maskable.png'), ('icon-512.png', 'twa/store_icon.png')]:
    shutil.copyfile(os.path.join(ROOT, a), os.path.join(ROOT, b))
