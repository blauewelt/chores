#!/usr/bin/env python3
# Hebt den KONTRAST eines Screenshots an, damit tesseract auch abgedunkelte
# Bereiche liest. Nutzung: ocr-boost.py <in.png> <out.png> [anteil-oben]
#
# Warum es das gibt (23.08.2026): S1 war tagelang rot, weil hinter dem modalen
# Onboarding «Zugriff sichern» die verriegelte Sicht VOLLSTAENDIG dastand —
# Haushaltsname, ICH-BIN-Chip, Tabs — nur eben abgedunkelt. Das Bild enthielt
# den Beweis, die OCR las ihn nur nicht. Die erste Reaktion (per idb auf
# «Los geht's» tippen) war der teure Umweg: idb-companion baut auf den
# gehosteten Runnern nicht mehr (verlangt Xcode 26). Kontrast anheben kostet
# nichts und braucht kein UI-Automation-Werkzeug.
import sys
from PIL import Image, ImageOps

src, dst = sys.argv[1], sys.argv[2]
frac = float(sys.argv[3]) if len(sys.argv) > 3 else 0.45

im = Image.open(src).convert('L')
# Nur der obere Teil: dort steht die App, darunter das Sheet. Getrennt
# normalisiert wird der abgedunkelte Bereich nicht vom hellen Sheet
# «uebertoent» (autocontrast rechnet ueber das GANZE Bild).
im = im.crop((0, 0, im.width, int(im.height * frac)))
im = ImageOps.autocontrast(im, cutoff=0)
im = im.resize((im.width * 2, im.height * 2))
im.save(dst)
print(f'kontrastverstaerkt: {dst} ({im.width}x{im.height}, oberste {frac:.0%})')
