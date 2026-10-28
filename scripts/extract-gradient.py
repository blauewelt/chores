#!/usr/bin/env python3
# Nimmt den Verlauf «Verlauf-1» aus den PNGs des Logo-Designers ab und schreibt
# ihn als kleines Raster (icon-grad.png, 32×32) — die EINE Quelle fuer den
# Hintergrund von --b3-logo (index.html), FACE.make() und icon-face.svg /
# icon-trial-*.png (scripts/render-icons.mjs).
#
# Warum ein Raster (26.10.2026): der Designer hat den Verlauf in Illustrator
# als freien Verlauf (Punkte, kein linearer/radialer) angelegt — seine SVG
# enthielt nur die weisse Glyphe (bzw. den Verlauf selbst als eingebettetes
# Raster), seine AI/EPS keinen PDF-Inhalt. Die v4.119.0-Naeherung aus zwei
# linearen Verlaeufen lag im Mittel 23/255 daneben (Maintainer: «doesn't quite
# match»); ein 32×32-Raster, bilinear hochgezogen, liegt bei 0.4/255. Die
# weisse Glyphe (und transparente Ecken) werden maskiert und per Diffusion
# (Laplace) aufgefuellt — der Verlauf ist glatt, das Ergebnis darum plausibel.
# MEHRERE Quellbilder (28.10.2026: %-Icon + Smile-Icon, derselbe Verlauf unter
# verschiedenen Glyphen) verkleinern das Loch: 35 % → 15 % der Flaeche.
#
#   python3 scripts/extract-gradient.py <png> [<png> …] [-o icon-grad.png] [--embed index.html]
#   --embed ersetzt JEDES data:image/png;base64 in index.html durch das neue
#   Raster (die zwei Stellen --b3-logo / FACE.make) — danach render-icons.mjs.
import sys, base64, re
import numpy as np
from PIL import Image
from scipy import ndimage

args = sys.argv[1:]
dst = 'icon-grad.png'; embed = None; srcs = []
while args:
    a = args.pop(0)
    if a == '-o': dst = args.pop(0)
    elif a == '--embed': embed = args.pop(0)
    else: srcs.append(a)
N = 128            # Arbeitsaufloesung fuer die Diffusion
OUT = 32           # Ausgaberaster

def load(path):
    im = Image.open(path).convert('RGBA'); arr = np.array(im).astype(float)
    al = arr[..., 3]; ys, xs = np.where(al > 250)          # deckender Kern (abgerundete Ecken sind transparent)
    arr = arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    rgb, al = arr[..., :3], arr[..., 3]
    glyph = ndimage.binary_dilation((rgb.min(2) >= 120) | (al < 250), iterations=14)
    return rgb, ~glyph

def block(a, bs):
    out = np.zeros((N, N))
    for i in range(N):
        for j in range(N):
            out[i, j] = a[int(i * bs):int((i + 1) * bs), int(j * bs):int((j + 1) * bs)].sum()
    return out

num = np.zeros((N, N, 3)); den = np.zeros((N, N)); full = 0
for p in srcs:
    rgb, known = load(p); bs = rgb.shape[0] / N; full = bs * bs
    k = known.astype(float); kb = block(k, bs); den += kb
    for c in range(3): num[..., c] += block(rgb[..., c] * k, bs)
img = num / np.maximum(den, 1)[..., None]
unk = den < 0.5 * full
for c in range(3):
    a = img[..., c]; a[unk] = a[~unk].mean()
    for it in range(20000):
        p = np.pad(a, 1, mode='edge')
        nb = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
        new = np.where(unk, nb, a)
        if it % 2000 == 0 and np.abs(new - a).max() < 0.01: break
        a = new
    img[..., c] = a
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((OUT, OUT), Image.LANCZOS).save(dst, optimize=True)
print(f'{dst}: {OUT}×{OUT} aus {len(srcs)} Bild(ern), {unk.sum()} von {N*N} Zellen aufgefuellt')
if embed:
    b64 = base64.b64encode(open(dst, 'rb').read()).decode()
    s = open(embed, encoding='utf-8').read()
    s2, n = re.subn(r'data:image/png;base64,[A-Za-z0-9+/=]+', 'data:image/png;base64,' + b64, s)
    open(embed, 'w', encoding='utf-8').write(s2)
    print(f'{embed}: {n} Stelle(n) ersetzt')
