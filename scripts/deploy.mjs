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
const ref = await api(`git/ref/heads/${BRANCH}`);
const baseCommit = ref.object.sha;
const baseTree = (await api(`git/commits/${baseCommit}`)).tree.sha;
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
