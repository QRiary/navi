/**
 * PROJECT STORAGE on disk (main process).
 *
 *   %APPDATA%\NAVI\projects\<id>\project.json      — the saved version (“Save”, Ctrl+S)
 *   %APPDATA%\NAVI\projects\<id>\draft.json        — draft: autosave of every edit
 *   %APPDATA%\NAVI\projects\<id>\history\*.json    — previous saved versions (up to 50)
 *   %APPDATA%\NAVI\projects\<id>\built.json        — the project as NAVI last wrote its keymap files
 *   %APPDATA%\NAVI\projects\.trash\…              — deleted projects (can be restored by hand)
 *
 * A restart or a crash does not lose edits: the draft is written atomically (temp file + rename).
 * The content is checked by the interface (src/core/project/validate.ts) — only files here.
 */
const fs = require('node:fs');
const path = require('node:path');
const { joinInside, readTextIfExists, safeId, writeFileAtomic } = require('./safety.cjs');

const MAX_REVISIONS = 50;
const MAX_PROJECT_BYTES = 20 * 1024 * 1024;

function createProjectStore(projectsDir) {
  fs.mkdirSync(projectsDir, { recursive: true });

  const dirOf = (id) => joinInside(projectsDir, safeId(id));
  const checkSize = (text) => {
    if (typeof text !== 'string') throw new Error('project must be text');
    if (Buffer.byteLength(text, 'utf8') > MAX_PROJECT_BYTES) throw new Error('project is too large');
  };

  /** Short info from the project text (no full validation — only for the list). */
  function summarize(id, text, hasDraft) {
    try {
      const p = JSON.parse(text);
      const km = Array.isArray(p.keymaps) ? p.keymaps.find((k) => k && k.id === p.activeKeymapId) ?? p.keymaps[0] : null;
      const geo = Array.isArray(p.geometries) ? p.geometries.find((g) => g && g.id === p.activeGeometryId) ?? p.geometries[0] : null;
      return {
        id,
        name: typeof p.name === 'string' ? p.name.slice(0, 120) : id,
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : '',
        keyboard: p.hardware && typeof p.hardware.name === 'string' ? p.hardware.name.slice(0, 120) : '',
        layers: km && Array.isArray(km.layers) ? km.layers.length : 0,
        keys: geo && Array.isArray(geo.keys) ? geo.keys.length : 0,
        unsaved: hasDraft,
      };
    } catch {
      return { id, name: id, updatedAt: '', keyboard: '?', layers: 0, keys: 0, unsaved: hasDraft, broken: true };
    }
  }

  return {
    list() {
      const out = [];
      for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        let id;
        try {
          id = safeId(entry.name);
        } catch {
          continue;
        }
        const dir = dirOf(id);
        const draft = readTextIfExists(path.join(dir, 'draft.json'));
        const saved = readTextIfExists(path.join(dir, 'project.json'));
        const text = draft ?? saved;
        if (text) out.push(summarize(id, text, draft !== null));
      }
      return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },

    read(id) {
      const dir = dirOf(id);
      return { saved: readTextIfExists(path.join(dir, 'project.json')), draft: readTextIfExists(path.join(dir, 'draft.json')) };
    },

    saveDraft(id, text) {
      checkSize(text);
      writeFileAtomic(path.join(dirOf(id), 'draft.json'), text);
    },

    discardDraft(id) {
      fs.rmSync(path.join(dirOf(id), 'draft.json'), { force: true });
    },

    /** Save: the previous saved version goes to history, the draft is deleted. */
    save(id, text, label) {
      checkSize(text);
      const dir = dirOf(id);
      const current = path.join(dir, 'project.json');
      const prev = readTextIfExists(current);
      if (prev !== null && prev !== text) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tag = typeof label === 'string' && /^[\w-]{1,40}$/.test(label) ? `_${label}` : '';
        writeFileAtomic(path.join(dir, 'history', `${stamp}${tag}.json`), prev);
        this.pruneHistory(id);
      }
      writeFileAtomic(current, text);
      fs.rmSync(path.join(dir, 'draft.json'), { force: true });
    },

    pruneHistory(id) {
      const hist = path.join(dirOf(id), 'history');
      if (!fs.existsSync(hist)) return;
      const files = fs.readdirSync(hist).filter((f) => f.endsWith('.json')).sort();
      for (const f of files.slice(0, Math.max(0, files.length - MAX_REVISIONS))) fs.rmSync(path.join(hist, f), { force: true });
    },

    revisions(id) {
      const hist = path.join(dirOf(id), 'history');
      if (!fs.existsSync(hist)) return [];
      return fs
        .readdirSync(hist)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse()
        .map((file) => {
          const st = fs.statSync(path.join(hist, file));
          const m = file.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:_([\w-]+))?\.json$/);
          return {
            file,
            at: m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : st.mtime.toISOString(),
            label: m && m[6] ? m[6] : null,
            size: st.size,
          };
        });
    },

    readRevision(id, file) {
      safeId(file);
      return fs.readFileSync(joinInside(dirOf(id), 'history', file), 'utf8');
    },

    /** Delete = move to .trash (can be restored by hand). */
    remove(id) {
      const dir = dirOf(id);
      if (!fs.existsSync(dir)) return;
      const trash = joinInside(projectsDir, '.trash');
      fs.mkdirSync(trash, { recursive: true });
      fs.renameSync(dir, path.join(trash, `${safeId(id)}-${Date.now()}`));
    },

    /** Undo of `remove`: moves the newest `.trash/<id>-<time>` folder back. false when there is none or the id is taken again. */
    restore(id) {
      const dir = dirOf(id);
      if (fs.existsSync(dir)) return false;
      const trash = joinInside(projectsDir, '.trash');
      if (!fs.existsSync(trash)) return false;
      const prefix = `${safeId(id)}-`;
      const stamp = (name) => (name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)) ? Number(name.slice(prefix.length)) : -1);
      const newest = fs
        .readdirSync(trash)
        .filter((n) => stamp(n) >= 0)
        .sort((a, b) => stamp(b) - stamp(a))[0];
      if (!newest) return false;
      fs.renameSync(path.join(trash, newest), dir);
      return true;
    },

    exists(id) {
      return fs.existsSync(dirOf(id));
    },

    /** The project as NAVI last wrote its keymap files (built.json), the baseline of "behavior changes since the last build". */
    readBuilt(id) {
      return readTextIfExists(path.join(dirOf(id), 'built.json'));
    },

    saveBuilt(id, text) {
      checkSize(text);
      writeFileAtomic(path.join(dirOf(id), 'built.json'), text);
    },
  };
}

module.exports = { createProjectStore, MAX_PROJECT_BYTES };
