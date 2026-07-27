// Atomarer Deploy: ALLE Dateien in EINEM Commit (Git Data API).
// Verhindert (a) Zwischenzustaende live (neue index.html + alte sw.js) und
// (b) Disziplin-Lint-Fehlalarme durch Ein-Datei-Commits.
// Nutzung: GH_TOKEN=... node scripts/deploy.mjs -m "message" datei1 datei2 …
import { readFileSync } from 'node:fs';
const REPO = 'blauewelt/chores', BRANCH = 'main';
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('GH_TOKEN fehlt'); process.exit(1); }
const args = process.argv.slice(2);
const mi = args.indexOf('-m');
const message = args[mi + 1];
const files = args.filter((a, i) => i !== mi && i !== mi + 1);
if (!message || !files.length) { console.error('Nutzung: deploy.mjs -m "msg" files…'); process.exit(1); }
const api = async (path, method = 'GET', body) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
    body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};
// ---------- Release-Lock (§11b, 27.07.2026) ----------
// Drei Kollisionen an EINEM Tag: zwei Sessions vergaben unabhaengig dieselbe
// APP_VERSION und denselben SW-Cache. Menschliche Teams parallelisieren die
// ARBEIT, aber die VERGABE der Release-Nummer ist zentralisiert. Hier ist die
// Zentralisierung ein atomarer Git-Ref: das Anlegen von refs/heads/release-lock
// schlaegt fehl, wenn er existiert — wer ihn haelt, deployt; danach loeschen.
// Ein Lock aelter als 30 min gilt als verwaist und wird gebrochen (Session
// abgestuerzt). Der Halter steht in der Commit-Message des Lock-Commits.
const HOLDER = process.env.FAIRLI_SESSION || 'unbenannte-session';
const LOCK_REF = 'release-lock';
const LOCK_TTL_MS = 30 * 60 * 1000;
async function tryApi(path, method, body) {
  try { return { ok: true, data: await api(path, method, body) }; }
  catch (e) { return { ok: false, err: String(e && e.message || e) }; }
}
async function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    const head = (await api(`git/ref/heads/${BRANCH}`)).object.sha;
    const headTree = (await api(`git/commits/${head}`)).tree.sha;
    const lc = await api('git/commits', 'POST', {
      message: `release-lock ${HOLDER} ${new Date().toISOString()}`,
      tree: headTree, parents: [head] });
    const made = await tryApi('git/refs', 'POST', { ref: `refs/heads/${LOCK_REF}`, sha: lc.sha });
    if (made.ok) return;
    // Lock existiert: Halter und Alter pruefen
    const cur = await tryApi(`git/ref/heads/${LOCK_REF}`);
    if (!cur.ok) continue;                                   // Rennen: gerade freigegeben
    const info = await api(`git/commits/${cur.data.object.sha}`);
    const age = Date.now() - Date.parse(info.author.date);
    if (age > LOCK_TTL_MS) {
      console.error(`release-lock verwaist (${Math.round(age / 60000)} min, «${info.message}») — wird gebrochen.`);
      await tryApi(`git/refs/heads/${LOCK_REF}`, 'DELETE');
      continue;
    }
    console.error(`ABBRUCH: release-lock wird gehalten — «${info.message}» (${Math.round(age / 1000)} s alt).`);
    console.error('Warten, bis die andere Session deployt hat, dann: fetch, rebase, Version NEU vergeben.');
    process.exit(2);
  }
  console.error('ABBRUCH: release-lock konnte nicht erworben werden.');
  process.exit(2);
}
async function releaseLock() { await tryApi(`git/refs/heads/${LOCK_REF}`, 'DELETE'); }

await acquireLock();
let exitCode = 0;
try {

const ref = await api(`git/ref/heads/${BRANCH}`);
const baseCommit = ref.object.sha;
const baseTree = (await api(`git/commits/${baseCommit}`)).tree.sha;

// Versions-Wache UNTER dem Lock: wird index.html/sw.js deployt, muessen
// APP_VERSION bzw. SW-Cache vom Remote-Stand ABWEICHEN — gleiche Werte
// heissen «nicht rebased oder nicht gebumpt», exakt der Kollisionsfall.
async function remoteText(path) {
  const r = await api(`contents/${path}?ref=${baseCommit}`);
  return Buffer.from(r.content, 'base64').toString('utf8');
}
if (files.includes('index.html')) {
  const rv = (await remoteText('index.html')).match(/const APP_VERSION = '([\d.]+)'/)?.[1];
  const lv = readFileSync('index.html', 'utf8').match(/const APP_VERSION = '([\d.]+)'/)?.[1];
  if (rv && lv && rv === lv) {
    exitCode = 3;   // process.exit() wuerde das finally (Lock-Freigabe!) ueberspringen
    throw new Error(`ABBRUCH: APP_VERSION ${lv} ist bereits live — Remote hat sich bewegt oder der Bump fehlt. Fetch, rebase, neu nummerieren.`);
  }
}
if (files.includes('sw.js')) {
  const rc = (await remoteText('sw.js')).match(/const CACHE = '([^']+)'/)?.[1];
  const lcache = readFileSync('sw.js', 'utf8').match(/const CACHE = '([^']+)'/)?.[1];
  if (rc && lcache && rc === lcache) {
    exitCode = 3;
    throw new Error(`ABBRUCH: SW-Cache ${lcache} ist bereits live — Bump fehlt oder Remote hat sich bewegt.`);
  }
}
// Binaerdateien (PNG etc.) MUESSEN als base64-Blob hochgeladen werden —
// readFileSync(utf8) zerstoert sie (0x89 → U+FFFD; Live-Vorfall v4.61.1:
// drei Icon-PNGs kaputt deployt). Textdateien weiter inline im Tree.
const BINARY = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|aab|apk|zip|pdf)$/i;
const entries = [];
for (const p of files) {
  if (BINARY.test(p)) {
    const blob = await api('git/blobs', 'POST', {
      content: readFileSync(p).toString('base64'), encoding: 'base64' });
    entries.push({ path: p, mode: '100644', type: 'blob', sha: blob.sha });
  } else {
    entries.push({ path: p, mode: '100644', type: 'blob', content: readFileSync(p, 'utf8') });
  }
}
const tree = await api('git/trees', 'POST', { base_tree: baseTree, tree: entries });
const commit = await api('git/commits', 'POST', { message, tree: tree.sha, parents: [baseCommit] });
await api(`git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha });
console.log(`deployed ${files.length} Dateien atomar: ${commit.sha.slice(0, 8)} "${message}"`);

} catch (e) {
  console.error(String(e && e.message || e));
  if (exitCode === 0) exitCode = 1;
} finally {
  await releaseLock();          // auch bei Fehlern: nie einen Lock zuruecklassen
}
process.exit(exitCode);
