// Rendert die VERLAUFS-Icons aus EINER SVG-Quelle (v4.119.0; seit v4.121.0
// nur noch fuer den Beta-Test html.trial — die globalen icon-*.png sind wieder
// das Navy-Gesicht, deren Quelle ist --b3-logo in index.html).
//   node scripts/render-icons.mjs && python3 scripts/optimize-icons.py
//                                            → icon-trial-192/512/512-maskable.png
//                                               (+ icon-face.svg, das Master)
// Motiv: das Gesicht (Geometrie = --b3-logo in index.html) in WEISS auf dem
// Verlauf «Verlauf-1» des Logo-Designers (blau unten links → pink unten
// rechts, nach oben in Aubergine abdunkelnd). Der Verlauf ist aus dessen
// PNG abgenommen (seine SVG enthielt nur die weisse Glyphe, keinen
// Hintergrund): seit v4.122.0 als Raster icon-grad.png, nicht mehr als
// Naeherung aus zwei linearen Verlaeufen (die lag sichtbar daneben).
// Maskable: Gesicht um 0.658 zur Mitte skaliert → der entfernteste Pixel
// liegt bei ~31 % der Kantenlaenge, Android verlangt < 40 % (Safe-Circle).
// Kacheln sind VOLLFLAECHIG, ohne Rundung: das OS maskiert selbst.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// v4.122.0: der Verlauf ist das Raster icon-grad.png (32×32, aus dem
// Designer-PNG abgenommen: scripts/extract-gradient.py) als <image> — EXAKT
// dasselbe base64 wie in --b3-logo und FACE.make() (index.html); ein Test
// vergleicht die drei mit der ausgelieferten Datei.
const GRAD = readFileSync(join(ROOT, 'icon-grad.png')).toString('base64');
const BG = `<image href="data:image/png;base64,${GRAD}" width="100" height="100" preserveAspectRatio="none"/>`;
// Einfarbig weiss: auf dem Verlauf konkurrierten die farbigen Augen mit dem
// Hintergrund, das violette ging im Pink unten rechts unter.
// v4.123.0: die Geometrie des DESIGNERS (Smile.zip 28.10.2026, seine SVG-
// Pfade in viewBox 1035, durch 10.25): Ringe r 10.65 / Strich 10.65 (aussen
// 15.97, innen 5.32 = seine Kreise), Mund als Strich 16.2 an sein Band
// gefittet. Dieselben Zahlen wie GT in FACE.make() und --b3-logo (html.trial).
const FACE = `<g fill="none" stroke-linecap="round" stroke="#FFFFFF">
  <circle cx="28.15" cy="36.38" r="10.65" stroke-width="10.65"/>
  <circle cx="71.65" cy="34.51" r="10.65" stroke-width="10.65"/>
  <path d="M17.9 71.3C43.2 80.5 59.5 80.5 84.9 71.3" stroke-width="16.2"/>
</g>`;
export const svg = (scale = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${BG}
<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${FACE}</g></svg>`;

const launch = { executablePath: process.env.PW_CHROMIUM || undefined };
const browser = await chromium.launch(launch);
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(file, size, scale = 1) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg(scale).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: join(ROOT, file), clip: { x: 0, y: 0, width: size, height: size } });
  console.log('✓', file);
}
await render('icon-trial-192.png', 192);
await render('icon-trial-512.png', 512);
await render('icon-trial-512-maskable.png', 512, 0.658);
writeFileSync(join(ROOT, 'icon-face.svg'), svg());
await browser.close();
