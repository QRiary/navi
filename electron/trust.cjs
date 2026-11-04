/**
 * Trusted local folders (main process).
 *  • A keymap folder may hold the user's own C and make code. make runs that code, so a folder that is not trusted
 *    must pass the same allowlist as the files NAVI writes (safety.cjs unsafeSource), or the build is refused.
 *  • Trust is per absolute folder, kept only in NAVI's data (<userData>/trusted-folders.json): never in a project
 *    file, never carried by import/export, never set by a file inside the folder. Off by default, revocable.
 *  • The grant itself (with its warning dialog) lives in qmk.cjs registerQmkIpc: only the main process grants.
 */
const fs = require('node:fs');
const path = require('node:path');
const { unsafeSource, writeFileAtomic } = require('./safety.cjs');

/** Same limit as qmk.cjs MAX_SOURCE: a bigger file is not read, so it cannot be checked. */
const MAX_FILE = 2 * 1024 * 1024;
/** More files than this is not a keymap folder; refuse instead of passing what was not scanned. */
const MAX_FILES = 5000;

/**
 * One spelling per folder: resolved, no trailing separator. On Windows drive paths are case-folded (the file system
 * ignores case), \\wsl$\ is \\wsl.localhost\ with host and distro case-folded; the Linux part keeps its case.
 */
function normalizeFolder(p) {
  let abs = path.resolve(String(p));
  const root = path.parse(abs).root;
  while (abs.length > root.length && /[\\/]$/.test(abs)) abs = abs.slice(0, -1);
  if (process.platform !== 'win32') return abs;
  if (/^[A-Za-z]:/.test(abs)) return abs.toLowerCase();
  const unc = /^\\\\([^\\]+)\\([^\\]+)(\\.*)?$/.exec(abs);
  if (unc) {
    let host = unc[1].toLowerCase();
    if (host === 'wsl$') host = 'wsl.localhost';
    const share = unc[2].toLowerCase();
    // Inside WSL the Linux file system is case-sensitive; other shares (SMB) are not.
    const rest = unc[3] ?? '';
    return `\\\\${host}\\${share}${host === 'wsl.localhost' ? rest : rest.toLowerCase()}`;
  }
  return abs;
}

function createTrustStore(file) {
  /** A broken or foreign file means nothing is trusted: never a crash, never "trust everything". */
  const read = () => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data || !Array.isArray(data.folders)) return [];
      const out = [];
      for (const f of data.folders) {
        if (typeof f !== 'string' || !path.isAbsolute(f)) continue;
        const n = normalizeFolder(f);
        if (!out.includes(n)) out.push(n);
      }
      return out;
    } catch {
      return [];
    }
  };
  const write = (folders) => writeFileAtomic(file, `${JSON.stringify({ folders }, null, 2)}\n`);

  return {
    list: () => read(),
    isTrusted: (dir) => typeof dir === 'string' && dir.length > 0 && read().includes(normalizeFolder(dir)),
    grant(dir) {
      if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('only an absolute folder can be trusted');
      let st;
      try {
        st = fs.statSync(dir);
      } catch {
        throw new Error(`folder not found: ${dir}`);
      }
      if (!st.isDirectory()) throw new Error(`not a folder: ${dir}`);
      const n = normalizeFolder(dir);
      const folders = read();
      if (!folders.includes(n)) write([...folders, n]);
    },
    revoke(dir) {
      if (typeof dir !== 'string' || dir.length === 0) return;
      const n = normalizeFolder(dir);
      const folders = read();
      if (folders.includes(n)) write(folders.filter((f) => f !== n));
    },
  };
}

/**
 * Check every file under the folders against the allowlist. Returns [{ file, reason }]; a missing folder is fine.
 * .git is skipped; a link anywhere is an issue (make would follow it out of the folder); a file too big to read is an
 * issue; a file with a NUL byte is skipped as binary unless it is a .mk file; *.mk gets the make check, every other
 * file the C check (any text file can be #included).
 */
function scanFolders(folders) {
  const issues = [];
  let count = 0;
  for (const folder of folders) {
    const stack = [folder];
    while (stack.length) {
      const cur = stack.pop();
      let st;
      try {
        st = fs.lstatSync(cur);
      } catch (err) {
        if (err && err.code === 'ENOENT' && cur === folder) continue;
        issues.push({ file: cur, reason: 'cannot be read' });
        continue;
      }
      if (st.isSymbolicLink()) {
        issues.push({ file: cur, reason: 'a link (make would follow it out of the folder)' });
        continue;
      }
      if (st.isDirectory()) {
        if (cur !== folder && path.basename(cur) === '.git') continue;
        let names;
        try {
          names = fs.readdirSync(cur);
        } catch {
          issues.push({ file: cur, reason: 'cannot be read' });
          continue;
        }
        for (const name of names.sort().reverse()) stack.push(path.join(cur, name));
        continue;
      }
      if (++count > MAX_FILES) {
        issues.push({ file: folder, reason: `more than ${MAX_FILES} files, too many to check` });
        break;
      }
      if (!st.isFile()) {
        issues.push({ file: cur, reason: 'not a regular file' });
        continue;
      }
      if (st.size > MAX_FILE) {
        issues.push({ file: cur, reason: 'too large to check' });
        continue;
      }
      let buf;
      try {
        buf = fs.readFileSync(cur);
      } catch {
        issues.push({ file: cur, reason: 'cannot be read' });
        continue;
      }
      const isMake = cur.toLowerCase().endsWith('.mk');
      if (!isMake && buf.includes(0)) continue;
      // The name only routes unsafeSource to its make or C branch.
      const why = unsafeSource(isMake ? 'rules.mk' : 'file.c', buf.toString('utf8'));
      if (why) issues.push({ file: cur, reason: why });
    }
    if (count > MAX_FILES) break;
  }
  return issues;
}

/** null = build, string = why the build is refused. Trust only lifts the refusal caused by the folder's own files. */
function trustRefusal({ issues, trusted }) {
  if (!issues || issues.length === 0 || trusted) return null;
  const shown = issues.slice(0, 5).map((i) => `  ${i.file}: ${i.reason}`);
  const more = issues.length > 5 ? `\n  …and ${issues.length - 5} more` : '';
  return (
    `The keymap folder has files outside what NAVI can check as safe to build:\n${shown.join('\n')}${more}\n` +
    'Fix them, or trust the folder in NAVI if you know this code (make will then run it on this computer).'
  );
}

module.exports = { createTrustStore, normalizeFolder, scanFolders, trustRefusal, MAX_FILES };
