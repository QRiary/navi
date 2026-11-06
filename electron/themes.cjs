/**
 * The user's own themes on disk: <userData>/themes/<id>.navi-theme.json, one file per theme.
 *  • Only the folder's own files: the id is checked (lowercase letters, digits, "-"), no paths from the interface.
 *  • The interface parses and checks the colors (src/theme/userThemes.ts); here only names and sizes are checked.
 *  • A removed theme's file goes to <userData>/themes/.trash (the newest copy per id), so an undo can bring it back
 *    even after a restart.
 */
const fs = require('node:fs');
const path = require('node:path');
const { readTextIfExists, writeFileAtomic } = require('./safety.cjs');

const EXT = '.navi-theme.json';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const MAX_BYTES = 64 * 1024;
const MAX_FILES = 500;

function checkId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`invalid theme id: ${String(id).slice(0, 40)}`);
  return id;
}

function createThemeStore(dir) {
  const fileOf = (id) => path.join(dir, `${checkId(id)}${EXT}`);
  return {
    /** Every theme file: [{ id, text }], sorted by id. Files too big or with a bad name are skipped. */
    list() {
      let names;
      try {
        names = fs.readdirSync(dir);
      } catch (err) {
        if (err && err.code === 'ENOENT') return [];
        throw err;
      }
      const out = [];
      for (const name of names.sort()) {
        if (!name.endsWith(EXT) || out.length >= MAX_FILES) continue;
        const id = name.slice(0, -EXT.length);
        if (!ID_RE.test(id)) continue;
        const file = path.join(dir, name);
        const st = fs.lstatSync(file);
        if (!st.isFile() || st.size > MAX_BYTES) continue;
        out.push({ id, text: fs.readFileSync(file, 'utf8') });
      }
      return out;
    },
    write(id, text) {
      if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('theme is too large');
      writeFileAtomic(fileOf(id), text);
    },
    /** Moves the file to .trash; returns its text (null if there was none). */
    remove(id) {
      const file = fileOf(id);
      const text = readTextIfExists(file);
      if (text === null) return null;
      writeFileAtomic(path.join(dir, '.trash', `${id}${EXT}`), text);
      fs.rmSync(file, { force: true });
      return text;
    },
  };
}

function registerThemeIpc({ ipcMain, dataDir }) {
  const store = createThemeStore(path.join(dataDir, 'themes'));
  ipcMain.handle('navi:themes:list', () => store.list());
  ipcMain.handle('navi:themes:write', (_e, id, text) => store.write(id, text));
  ipcMain.handle('navi:themes:remove', (_e, id) => store.remove(id));
  return store;
}

module.exports = { createThemeStore, registerThemeIpc, THEME_EXT: EXT };
