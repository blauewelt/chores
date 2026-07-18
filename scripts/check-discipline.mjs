// Deploy-Disziplin-Lint (zustandsbasiert): HEAD muss in sich konsistent sein.
// Kein Diff — funktioniert unabhaengig von Commit-Granularitaet.
// Regeln: LOG.md muss die aktuelle APP_VERSION UND den aktuellen SW-Cache-
// Namen erwaehnen (unsere LOG-Eintraege nennen immer beide).
import { readFileSync } from 'node:fs';
const index = readFileSync('index.html', 'utf8');
const sw = readFileSync('sw.js', 'utf8');
const log = readFileSync('LOG.md', 'utf8');
const version = index.match(/const APP_VERSION = '([\d.]+)'/)?.[1];
const cache = sw.match(/const CACHE = '(haushalt-v\d+)'/)?.[1];
if (!version || !cache) { console.error('FEHLER: APP_VERSION oder SW-Cache nicht gefunden.'); process.exit(1); }
const errs = [];
if (!log.includes(version)) errs.push(`LOG.md erwähnt die aktuelle APP_VERSION ${version} nicht.`);
if (!log.includes(cache)) errs.push(`LOG.md erwähnt den aktuellen SW-Cache ${cache} nicht (Bump vergessen?).`);
if (errs.length) { errs.forEach(e => console.error('FEHLER:', e)); process.exit(1); }
console.log(`Deploy-Disziplin ok: ${version} / ${cache} in LOG.md dokumentiert.`);

// ---------- Anonymisierungs-Wache (v4.46.3, gehasht seit Rotation) ----------
// Das Repo ist weltlesbar. Die Wache kennt die verbotenen Tokens nur als
// SHA-256-Hashes — sie VERRAET also selbst nichts (die erste Fassung trug
// die Klartext-Namen und war damit ihr eigener Verstoss). Getroffene Tokens
// werden beim Fund ausgegeben: sie stehen dann ohnehin schon in der Datei.
import { readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const BANNED_HASHES = new Set([
  '93c6b09e0fc292a99a2d60d862f484b66c8709f78fd3a30ceaec6422a2197824',
  'fbd785fa01c09b62ee58e7db3889276e91be5d98eede6b37905fb36df12f4de1',
  '1b72f5d53852fb6cc9d25a4f3fb1c5cd39cf1dd789560c3825157a9e5fed4691',
  '1c69ae305d986dde90bb5a9d9be627d3a93e39ee94fa513177461c44e96f3ceb',
  '15acfdc75fdb88851487238cd8442c5ecc8e0c31868ce9f52a4e2361ba899f2f',
  '91b55f158aaba02dc71ba57d1789aa70fde2bf11f5442418ba1c6cb3d0b7e780',
  'c57f6b3610d56ef3764cebc1e80a67af98f4bc6be3787c7bafdde493157e345a',
  'f569212708a1900837952441396b13ad60f87b70cb7a4332017e622a538743d6',
  '30cc6dd8ef8458e679e13ae3bf3f634cace9810e2eea03bb6487904595f41056',
  '5d7f15f2fce8ddb2dbef5c38be896c238ba7e0a432e396759030a853fa6b1151',
  'be480d3210e56e785947940fedd007ad4eb049b849e5def041dd90595cc220a2',
  '1567e79a15758616ee6c7bccbbd6f2bafcf3de6c49e7dd31fe6cd8a63d944359',
  '943a4ca3ffe3b7e2b0b358d78e0a17844d3b4ce59d03cbc5a0f65db778484d97',
]);
const BANNED_RE = [ /\b(?:fam|famc|famx)-[a-z0-9]{10,}\b/g ];
const ALLOW = new Set(['fam-e2e-fairli01', 'famx-authselftest01', 'famx-testsecret1234', 'famx-backfilltest01']);
const SKIP = new Set(['node_modules', 'test-results', '.git', 'playwright-report']);
// fables_corner.txt: kreativ/persoenlich — Umzugs-Entscheid beim Maintainer.
const SKIP_FILES = new Set(['fables_corner.txt']);
const EXT = new Set(['.html', '.js', '.mjs', '.md', '.yml', '.sh', '.py', '.sql', '.json', '.txt']);
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = dir + '/' + e;
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.has(p.slice(p.lastIndexOf('.'))) && !SKIP_FILES.has(e)) yield p;
  }
}
const sha = s => createHash('sha256').update(s).digest('hex');
let leaks = 0;
for (const f of walk('.')) {
  const txt = readFileSync(f, 'utf8');
  for (const tok of new Set((txt.toLowerCase().match(/[a-z0-9][a-z0-9-]{3,}/g) || []))) {
    if (!ALLOW.has(tok) && BANNED_HASHES.has(sha(tok))) {
      console.error(`FEHLER: Anonymisierungs-Wache — «${tok}» in ${f}`); leaks++;
    }
  }
  for (const re of BANNED_RE) {
    for (const hit of (txt.match(re) || [])) {
      if (ALLOW.has(hit)) continue;
      console.error(`FEHLER: Anonymisierungs-Wache — Link-ID-Muster «${hit}» in ${f}`); leaks++;
    }
  }
}
if (leaks) { console.error(`${leaks} Verstoss/Verstoesse — Personenbezug/Link-IDs gehoeren NICHT ins Repo.`); process.exit(1); }
