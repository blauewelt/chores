#!/usr/bin/env python3
# Nimmt den Verlauf «Verlauf-1» aus dem PNG des Logo-Designers ab und schreibt
# ihn als kleines Raster (icon-grad.png, 32×32) — die EINE Quelle fuer den
# Hintergrund von --b3-logo (index.html), FACE.make() und icon-face.svg /
# icon-trial-*.png (scripts/render-icons.mjs).
#
# Warum ein Raster (26.10.2026): der Designer hat den Verlauf in Illustrator
# als freien Verlauf (Punkte, kein linearer/radialer) angelegt — seine SVG
# enthielt nur die weisse Glyphe, seine AI/EPS keinen PDF-Inhalt. Die
# v4.119.0-Naeherung aus zwei linearen Verlaeufen lag im Mittel 23/255 daneben
# (Maintainer: «doesn't quite match»); ein 32×32-Raster, bilinear hochgezogen,
# liegt bei 0.4/255. Die %-Glyphe wird maskiert und per Diffusion (Laplace)
# aufgefuellt — der Verlauf ist glatt, das Ergebnis darum plausibel.
#
#   python3 scripts/extract-gradient.py <Verlauf-1_1024px.png> [icon-grad.png]
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src = sys.argv[1]
dst = sys.argv[2] if len(sys.argv) > 2 else 'icon-grad.png'
N = 128            # Arbeitsaufloesung fuer die Diffusion
OUT = 32           # Ausgaberaster

d = np.array(Image.open(src).convert('RGB')).astype(float)
glyph = ndimage.binary_dilation(d.min(2) >= 120, iterations=14)   # weiss + Kantenrand
H = d.shape[0]; bs = H / N
known = (~glyph).astype(float)

def block(a):
    out = np.zeros((N, N))
    for i in range(N):
        for j in range(N):
            out[i, j] = a[int(i * bs):int((i + 1) * bs), int(j * bs):int((j + 1) * bs)].sum()
    return out

kb = block(known)
img = np.stack([block(d[..., c] * known) / np.maximum(kb, 1) for c in range(3)], -1)
unk = kb < 0.5 * bs * bs
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
print(f'{dst}: {OUT}×{OUT}, {unk.sum()} von {N*N} Zellen aufgefuellt')
