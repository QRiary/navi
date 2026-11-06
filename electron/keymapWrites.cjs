/**
 * What NAVI last wrote into keymap folders: the sha256 of each file, by its full path, in
 * `<userData>/keymap-writes.json` (never in a project). A file on disk whose hash differs, or that NAVI never wrote,
 * may hold the user's own edits: “build + flash” shows its diff before overwriting it (Firmware → files always shows it).
 */
const crypto = require('node:crypto');
const path = require('node:path');
const { readTextIfExists, writeFileAtomic } = require('./safety.cjs');

const MAX_ENTRIES = 2000;

const sha256 = (text) => crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');

/** Windows paths compare case-insensitively; \\wsl.localhost paths are kept as they are apart from the separators. */
function keyOf(file) {
  const full = path.resolve(file);
  return process.platform === 'win32' && !full.startsWith('\\\\') ? full.toLowerCase() : full;
}

function createKeymapWrites(file) {
  const load = () => {
    try {
      const data = JSON.parse(readTextIfExists(file) ?? '{}');
      return data && typeof data.files === 'object' && !Array.isArray(data.files) ? data.files : {};
    } catch {
      return {};
    }
  };
  return {
    /** True when `text` (read from `full`) is exactly what NAVI wrote there last. */
    isNavis(full, text) {
      return load()[keyOf(full)] === sha256(text);
    },
    /** After a write: remember each file's hash (oldest entries dropped past MAX_ENTRIES). */
    record(dir, files) {
      const all = load();
      for (const f of files) {
        const k = keyOf(path.join(dir, f.name));
        delete all[k];
        all[k] = sha256(f.text);
      }
      const keys = Object.keys(all);
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete all[k];
      writeFileAtomic(file, `${JSON.stringify({ files: all }, null, 2)}\n`);
    },
  };
}

module.exports = { createKeymapWrites, sha256 };
