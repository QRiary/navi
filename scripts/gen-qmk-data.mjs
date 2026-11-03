/**
 * npm run gen:qmk -- <path to qmk_firmware>
 *
 * Takes the OFFICIAL data from the QMK sources and saves it into the project as JSON:
 *  • data/constants/keycodes/*.hjson (+ extras — layouts, e.g. Russian) → src/core/qmk-data/keycodes.json
 *    The files are stored “as is” (by version); versions are merged by src/core/keycodes/spec.ts
 *    with the same rules as QMK (lib/python/qmk/keycodes.py).
 *  • quantum/rgb_matrix/animations/*.h → src/core/qmk-data/rgb-matrix-effects.json
 *    Effect order = the order in rgb_matrix_effects.inc (the effect number in the firmware depends on it).
 *  • quantum/rgblight/rgblight_modes.h → src/core/qmk-data/rgblight-modes.json
 *
 * No network needed: only the given folder is read. The QMK commit is written into the result.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Hjson from 'hjson';

const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, 'data', 'constants', 'keycodes'))) {
  console.error('Give the path to qmk_firmware: npm run gen:qmk -- C:/path/to/qmk_firmware');
  process.exit(1);
}

const outDir = path.join(import.meta.dirname, '..', 'src', 'core', 'qmk-data');
fs.mkdirSync(outDir, { recursive: true });

let commit = 'unknown';
let commitDate = 'unknown';
try {
  commit = execFileSync('git', ['-C', root, 'log', '-1', '--format=%H'], { encoding: 'utf8' }).trim();
  commitDate = execFileSync('git', ['-C', root, 'log', '-1', '--format=%cI'], { encoding: 'utf8' }).trim();
} catch {
  // not a git checkout — keep unknown
}

/** Reads hjson. An empty file (QMK has such files — “version without changes”) = {}. */
function readHjson(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  return Hjson.parse(text, { keepWsc: false });
}

// ── keycodes ─────────────────────────────────────────────────────────
const kcDir = path.join(root, 'data', 'constants', 'keycodes');
const files = {};
for (const name of fs.readdirSync(kcDir).sort()) {
  if (name.endsWith('.hjson')) files[name] = readHjson(path.join(kcDir, name));
}
const extras = {};
for (const name of fs.readdirSync(path.join(kcDir, 'extras')).sort()) {
  if (name.endsWith('.hjson')) extras[name] = readHjson(path.join(kcDir, 'extras', name));
}
fs.writeFileSync(
  path.join(outDir, 'keycodes.json'),
  JSON.stringify({ source: { repo: 'qmk/qmk_firmware', commit, commitDate, path: 'data/constants/keycodes' }, files, extras }),
);
console.log(`keycodes: ${Object.keys(files).length} files, extras: ${Object.keys(extras).length}`);

// ── RGB Matrix: effects in order ─────────────────────────────────────
const animDir = path.join(root, 'quantum', 'rgb_matrix', 'animations');
const inc = fs.readFileSync(path.join(animDir, 'rgb_matrix_effects.inc'), 'utf8');
const effects = [];
for (const m of inc.matchAll(/#include\s+"([\w]+\.h)"/g)) {
  const header = fs.readFileSync(path.join(animDir, m[1]), 'utf8');
  // RGB_MATRIX_EFFECT(NAME) — an effect; before it the nearest #ifdef ENABLE_RGB_MATRIX_<NAME>
  for (const e of header.matchAll(/^RGB_MATRIX_EFFECT\((\w+)\)/gm)) {
    const name = e[1];
    const always = name === 'SOLID_COLOR'; // the only effect without an ENABLE_ flag
    const framebuffer = /RGB_MATRIX_FRAMEBUFFER_EFFECTS/.test(header);
    const reactive = /RGB_MATRIX_KEYREACTIVE_ENABLED|RGB_MATRIX_KEYPRESSES|RGB_MATRIX_KEYRELEASES/.test(header);
    effects.push({ id: name, enable: always ? null : `ENABLE_RGB_MATRIX_${name}`, file: m[1], framebuffer, reactive });
  }
}
fs.writeFileSync(
  path.join(outDir, 'rgb-matrix-effects.json'),
  JSON.stringify({ source: { repo: 'qmk/qmk_firmware', commit, commitDate, path: 'quantum/rgb_matrix/animations' }, effects }, null, 1),
);
console.log(`rgb matrix: ${effects.length} effects`);

// ── RGB Light: modes ──────────────────────────────────────────────────
const modesFile = path.join(root, 'quantum', 'rgblight', 'rgblight_modes.h');
if (fs.existsSync(modesFile)) {
  const text = fs.readFileSync(modesFile, 'utf8');
  const modes = [];
  for (const m of text.matchAll(/_RGBM_(SINGLE_STATIC|SINGLE_DYNAMIC|MULTI_STATIC|MULTI_DYNAMIC|TMP_STATIC|TMP_DYNAMIC)\(\s*(\w+)\s*\)/g)) {
    if (m[1].startsWith('TMP')) continue;
    if (!modes.some((x) => x.id === m[2])) modes.push({ id: m[2], kind: m[1].toLowerCase() });
  }
  fs.writeFileSync(
    path.join(outDir, 'rgblight-modes.json'),
    JSON.stringify({ source: { repo: 'qmk/qmk_firmware', commit, commitDate, path: 'quantum/rgblight/rgblight_modes.h' }, modes }, null, 1),
  );
  console.log(`rgblight: ${modes.length} modes`);
}
// ── config.h / rules.mk ⇄ keyboard.json mappings (official QMK tables) ──
const mappingsDir = path.join(root, 'data', 'mappings');
const mappings = {};
for (const name of ['info_config.hjson', 'info_rules.hjson', 'info_defaults.hjson']) {
  const file = path.join(mappingsDir, name);
  if (fs.existsSync(file)) mappings[name.replace('.hjson', '')] = readHjson(file);
}
fs.writeFileSync(
  path.join(outDir, 'config-mappings.json'),
  JSON.stringify({ source: { repo: 'qmk/qmk_firmware', commit, commitDate, path: 'data/mappings' }, ...mappings }, null, 1),
);
console.log(`mappings: config ${Object.keys(mappings.info_config ?? {}).length}, rules ${Object.keys(mappings.info_rules ?? {}).length}`);

console.log(`QMK ${commit.slice(0, 10)} (${commitDate}) → ${outDir}`);
