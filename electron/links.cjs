/**
 * PROJECTS LINKED TO A FILE (main process).
 *  • A project can live in a file the user picked (e.g. in their own git repo); Save writes it back there.
 *    NAVI's own copy, draft and 50 versions stay in <userData>/projects as before.
 *  • The link (project id → file) is kept only in NAVI's data (<userData>/project-links.json): never in the project
 *    file, never carried by import/export. Only the main process picks the file (open/save dialogs): the interface
 *    never sends a path to write to.
 *  • "Changed outside NAVI" = the file's text differs from the text NAVI last read from it or wrote to it
 *    (kept as a hash). Save refuses to overwrite such a file unless the interface passes the hash of the version
 *    it showed the user; then a newer change still refuses.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readTextIfExists, safeFileName, safeId, writeFileAtomic } = require('./safety.cjs');

const MAX_FILE = 20 * 1024 * 1024;

const hashText = (text) => crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');

/** The file's text, or null when it is missing. Too big = an error, not a silent "missing". */
function readLinked(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
  if (!st.isFile()) return null;
  if (st.size > MAX_FILE) throw new Error('linked file is too large (> 20 MB)');
  return readTextIfExists(file);
}

function createLinkStore(file) {
  /** A broken or foreign file means no links: never a crash. */
  const read = () => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const out = {};
      if (!data || typeof data.links !== 'object' || data.links === null) return out;
      for (const [id, link] of Object.entries(data.links)) {
        try {
          safeId(id);
        } catch {
          continue;
        }
        if (!link || typeof link.path !== 'string' || !path.isAbsolute(link.path)) continue;
        out[id] = { path: link.path, hash: typeof link.hash === 'string' ? link.hash : null };
      }
      return out;
    } catch {
      return {};
    }
  };
  const write = (links) => writeFileAtomic(file, `${JSON.stringify({ links }, null, 2)}\n`);
  const update = (fn) => {
    const links = read();
    fn(links);
    write(links);
  };
  const need = (id) => {
    const link = read()[safeId(id)];
    if (!link) throw new Error('this project is not linked to a file');
    return link;
  };

  return {
    get: (id) => read()[safeId(id)] ?? null,

    /**
     * The linked file now: missing, or its text and whether it changed since NAVI last read or wrote it.
     * null = the project is not linked.
     */
    state(id) {
      const link = read()[safeId(id)];
      if (!link) return null;
      const text = readLinked(link.path);
      if (text === null) return { path: link.path, exists: false, text: null, hash: null, changed: false };
      const hash = hashText(text);
      return { path: link.path, exists: true, text, hash, changed: hash !== link.hash };
    },

    /** Link to a file whose text NAVI has just read or written: that text is the known version. */
    attach(id, filePath, text) {
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('only an absolute file can be linked');
      update((links) => {
        links[safeId(id)] = { path: filePath, hash: hashText(text) };
      });
    },

    /** Point the link to another file (moved); the known version stays, so a different file reads as changed. */
    relink(id, filePath) {
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('only an absolute file can be linked');
      const link = need(id);
      update((links) => {
        links[safeId(id)] = { path: filePath, hash: link.hash };
      });
    },

    /** The user saw this version of the file (kept their edits or took it): it is the known one now. */
    accept(id, hash) {
      if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw new Error('invalid file version');
      const link = need(id);
      update((links) => {
        links[safeId(id)] = { path: link.path, hash };
      });
    },

    /**
     * Save to the linked file. Refused when the file changed outside NAVI: since NAVI last read/wrote it, or, with
     * expectHash (the version the user saw and chose to overwrite), since that version.
     */
    write(id, text, expectHash) {
      if (typeof text !== 'string') throw new Error('project must be text');
      if (Buffer.byteLength(text, 'utf8') > MAX_FILE) throw new Error('project is too large');
      const link = need(id);
      const current = readLinked(link.path);
      if (current === null) return { status: 'missing', path: link.path };
      const currentHash = hashText(current);
      const known = typeof expectHash === 'string' ? expectHash : link.hash;
      if (currentHash !== known && current !== text) return { status: 'conflict', path: link.path, text: current, hash: currentHash };
      if (current !== text) writeFileAtomic(link.path, text);
      update((links) => {
        links[safeId(id)] = { path: link.path, hash: hashText(text) };
      });
      return { status: 'written', path: link.path };
    },

    unlink(id) {
      update((links) => {
        delete links[safeId(id)];
      });
    },
  };
}

const FILTERS = [{ name: 'NAVI project', extensions: ['json', 'navi'] }];

/** IPC: the dialogs live here, so only a file the user picked in a main-process dialog can be linked. */
function registerLinkIpc({ ipcMain, dialog, getWindow, dataDir }) {
  const links = createLinkStore(path.join(dataDir, 'project-links.json'));
  /** Files picked in "open a file (linked)", waiting for the project to be created; one use each. */
  const picks = new Map();

  const pickFile = async () => {
    const res = await dialog.showOpenDialog(getWindow(), { properties: ['openFile'], filters: FILTERS });
    if (res.canceled || res.filePaths.length === 0) return null;
    const file = res.filePaths[0];
    const text = readLinked(file);
    if (text === null) throw new Error('cannot read the file');
    return { file, text };
  };

  ipcMain.handle('navi:links:state', (_e, id) => links.state(id));

  ipcMain.handle('navi:links:open', async () => {
    const pick = await pickFile();
    if (!pick) return null;
    const token = crypto.randomBytes(12).toString('hex');
    picks.clear();
    picks.set(token, pick);
    return { token, name: path.basename(pick.file), path: pick.file, text: pick.text };
  });

  ipcMain.handle('navi:links:attach', (_e, token, id) => {
    const pick = picks.get(token);
    if (!pick) throw new Error('the picked file is no longer available, pick it again');
    picks.delete(token);
    links.attach(id, pick.file, pick.text);
    return pick.file;
  });

  /** "Link to a file…": a save dialog; the current project is written there and linked. */
  ipcMain.handle('navi:links:create', async (_e, id, name, text) => {
    safeId(id);
    if (typeof text !== 'string') throw new Error('project must be text');
    const res = await dialog.showSaveDialog(getWindow(), { defaultPath: safeFileName(`${name}.navi.json`, 'project.navi.json'), filters: FILTERS });
    if (res.canceled || !res.filePath) return null;
    writeFileAtomic(res.filePath, text);
    links.attach(id, res.filePath, text);
    return res.filePath;
  });

  ipcMain.handle('navi:links:relink', async (_e, id) => {
    if (!links.get(id)) throw new Error('this project is not linked to a file');
    const pick = await pickFile();
    if (!pick) return null;
    links.relink(id, pick.file);
    return links.state(id);
  });

  ipcMain.handle('navi:links:accept', (_e, id, hash) => links.accept(id, hash));
  ipcMain.handle('navi:links:write', (_e, id, text, expectHash) => links.write(id, text, expectHash));
  ipcMain.handle('navi:links:unlink', (_e, id) => links.unlink(id));

  return links;
}

module.exports = { createLinkStore, registerLinkIpc, hashText };
