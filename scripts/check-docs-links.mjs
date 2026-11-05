// Opens every QMK docs link in src/ (https://docs.qmk.fm/…) and checks the page answers 200 and, for a #anchor, that
// the page has an element with that id. Run after adding an InfoTip link: node scripts/check-docs-links.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(p);
  }
})('src');

const urls = new Set();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/https:\/\/docs\.qmk\.fm\/[A-Za-z0-9_/#.-]*/g)) urls.add(m[0]);
// The feature registry's `docs: 'features/combo'` paths (featureDocs() turns them into links).
for (const m of readFileSync('src/core/features/registry.ts', 'utf8').matchAll(/\bdocs: '([A-Za-z0-9_/#.-]+)'/g)) urls.add(`https://docs.qmk.fm/${m[1]}`);

const pages = new Map();
let bad = 0;
for (const url of [...urls].sort()) {
  const [page, anchor] = url.split('#');
  if (!pages.has(page)) pages.set(page, fetch(page).then(async (r) => ({ status: r.status, html: r.ok ? await r.text() : '' })));
  const { status, html } = await pages.get(page);
  const ok = status === 200 && (!anchor || html.includes(`id="${anchor}"`));
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'BAD '} ${url}${status !== 200 ? ` (${status})` : !ok ? ' (no such anchor)' : ''}`);
}
console.log(`${urls.size} links, ${bad} bad`);
process.exit(bad ? 1 : 0);
