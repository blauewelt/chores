// Minimal static server that mimics GitHub Pages for blauewelt.github.io/chores:
// - files served under the /chores/ prefix
// - ANY unknown path returns HTTP 404 *with the body of 404.html*
//   (this is exactly the SPA-handoff mechanism the app relies on)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = process.env.PORT || 8080;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.md': 'text/plain' };

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = url.pathname;
  if (p === '/chores' || p === '/chores/') p = '/chores/index.html';
  if (!p.startsWith('/chores/')) { res.writeHead(404).end('not pages'); return; }
  const rel = normalize(p.slice('/chores/'.length)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(readFileSync(file));
  } else {
    // GitHub Pages: unknown path -> 404 status + 404.html body
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(ROOT, '404.html')));
  }
}).listen(PORT, () => console.log(`pages-mimic on http://127.0.0.1:${PORT}/chores/`));
