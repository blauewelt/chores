// Absichts-Tafel (§11b): Sessions koennen nicht miteinander reden — dieser
// Ref-Zettel ersetzt das Gespraech. VOR Arbeitsbeginn claimen, NACH getaner
// Arbeit loeschen, und fremde Zettel VOR dem Start lesen: ueberlappt das
// Gebiet, steht eine der Sessions ab (ein Lock serialisiert Deploys, aber
// er kann nicht zwei Meinungen ueber dieselbe UI mergen).
// Nutzung:  GH_TOKEN=… FAIRLI_SESSION=<name> node scripts/wip.mjs claim "Verlauf-Layout"
//           GH_TOKEN=… node scripts/wip.mjs list
//           GH_TOKEN=… FAIRLI_SESSION=<name> node scripts/wip.mjs done
const REPO = 'blauewelt/chores', BRANCH = 'main';
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('GH_TOKEN fehlt'); process.exit(1); }
const NAME = (process.env.FAIRLI_SESSION || 'unbenannte-session').replace(/[^a-z0-9-]/gi, '-');
const api = async (path, method = 'GET', body) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
    body: body ? JSON.stringify(body) : undefined });
  if (res.status === 404 || res.status === 422) return null;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
};
const cmd = process.argv[2];
if (cmd === 'claim') {
  const what = process.argv[3];
  if (!what) { console.error('Nutzung: wip.mjs claim "<Gebiet/Absicht>"'); process.exit(1); }
  const head = (await api(`git/ref/heads/${BRANCH}`)).object.sha;
  const tree = (await api(`git/commits/${head}`)).tree.sha;
  const c = await api('git/commits', 'POST', {
    message: `wip ${NAME}: ${what} (${new Date().toISOString()})`, tree, parents: [head] });
  await api(`git/refs/heads/wip-${NAME}`, 'DELETE');
  const made = await api('git/refs', 'POST', { ref: `refs/heads/wip-${NAME}`, sha: c.sha });
  console.log(made ? `geclaimt: wip-${NAME} — ${what}` : 'claim fehlgeschlagen');
} else if (cmd === 'list') {
  const refs = await api('git/matching-refs/heads/wip-') || [];
  if (!refs.length) { console.log('keine offenen Absichten'); process.exit(0); }
  for (const r of refs) {
    const c = await api(`git/commits/${r.object.sha}`);
    const age = Math.round((Date.now() - Date.parse(c.author.date)) / 60000);
    console.log(`${r.ref.replace('refs/heads/', '')} · vor ${age} min · ${c.message}`);
  }
} else if (cmd === 'done') {
  await api(`git/refs/heads/wip-${NAME}`, 'DELETE');
  console.log(`erledigt: wip-${NAME} geloescht`);
} else {
  console.error('Nutzung: wip.mjs claim "…" | list | done'); process.exit(1);
}
