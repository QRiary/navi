/**
 * QMK: finding the environment, keyboard sources, writing the keymap, building, firmware archive.
 * Everything runs only on a click in the interface. Building is a real `qmk compile`.
 *
 * QMK files change only in the keymap folder (keyboards/<kb>/keymaps/<km>/) or in a new folder
 * for your own keyboard — and only after the user has seen the changes. Before writing,
 * the previous files are copied to %APPDATA%\NAVI\backups\qmk\<time>\.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { cancel, findMsys, findOnPath, fromWslUnc, parseWslList, qmkCommand, run, toWslUnc, validateArg, validateDistro, validatePath } = require('./runner.cjs');
const { allowedBuildOption, insideDir, joinInside, readTextIfExists, safeFileName, safeId, unsafeSource, writeFileAtomic } = require('./safety.cjs');

const KB_RE = /^[a-z0-9_][a-z0-9_/.+-]{0,150}$/i;
const KM_RE = /^[a-z0-9_][a-z0-9_-]{0,60}$/i;
const KEYMAP_FILES = new Set(['keymap.c', 'keymap.json', 'rules.mk', 'config.h', 'readme.md']);
const KEYBOARD_FILES = new Set(['keyboard.json', 'info.json', 'rules.mk', 'config.h', 'readme.md', 'halconf.h', 'mcuconf.h']);
const MAX_SOURCE = 2 * 1024 * 1024;

function checkKb(kb) {
  if (typeof kb !== 'string' || !KB_RE.test(kb) || kb.split('/').some((p) => p === '..' || p === '.' || p === '')) throw new Error('invalid keyboard name');
  return kb;
}
function checkKm(km) {
  if (typeof km !== 'string' || !KM_RE.test(km)) throw new Error('invalid keymap name');
  return km;
}

/** Check that a folder is qmk_firmware. */
function isQmkHome(dir) {
  try {
    return fs.statSync(path.join(dir, 'quantum')).isDirectory() && fs.statSync(path.join(dir, 'keyboards')).isDirectory();
  } catch {
    return false;
  }
}

/** Pure choice of the QMK runner. found = { msys, qmkOnPath, wsl: [{ name, hasQmk }] }. */
function chooseRunner(settings, found) {
  const msysResult = () => ({ kind: 'msys', bash: found.msys.bash, dir: found.msys.dir });
  if (settings?.msys && found.msys?.dir === settings.msys) return msysResult();
  if (settings?.wsl) {
    try {
      return { kind: 'wsl', distro: validateDistro(settings.wsl) };
    } catch {
      // invalid name in settings: ignored
    }
  }
  if (found.msys) return msysResult();
  if (found.qmkOnPath) return { kind: 'path', qmk: found.qmkOnPath };
  const d = (found.wsl || []).find((x) => x.hasQmk);
  return d ? { kind: 'wsl', distro: d.name } : null;
}

/** Output of a program as raw bytes (wsl.exe -l prints UTF-16). Never rejects: { code, stdout }. */
function execBytes(file, args, timeout) {
  return new Promise((resolve) => {
    execFile(file, args, { encoding: 'buffer', timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, stdout: stdout || Buffer.alloc(0) });
    });
  });
}

let wslCache = null;

/** WSL distros and whether qmk is found in each. null: not Windows or wsl.exe is unusable. */
async function discoverWsl(refresh) {
  if (process.platform !== 'win32') return null;
  if (wslCache && !refresh) return wslCache.list;
  const l = await execBytes('wsl.exe', ['-l', '-q'], 10000);
  let list = null;
  if (l.code === 0) {
    list = [];
    for (const name of parseWslList(l.stdout)) {
      const q = await execBytes('wsl.exe', ['-d', name, '--', 'bash', '-lc', 'command -v qmk'], 20000);
      list.push({ name, hasQmk: q.code === 0 && q.stdout.toString('utf8').includes('qmk') });
    }
  }
  wslCache = { list };
  return list;
}

async function runner(settings, refresh = false) {
  const msys = findMsys(settings?.msys);
  const qmkOnPath = findOnPath('qmk');
  const found = { msys, qmkOnPath, wsl: [] };
  // wsl.exe is only asked when nothing found locally decides the choice.
  const decided = (settings?.msys && msys?.dir === settings.msys) || settings?.wsl || msys || qmkOnPath;
  if (!decided) found.wsl = (await discoverWsl(refresh)) || [];
  return chooseRunner(settings, found);
}

/** qmk config home: a Linux path from WSL becomes UNC, an MSYS path /c/... a drive path. */
function homeFromConfig(value, r) {
  if (r?.kind === 'wsl' && value.startsWith('/')) return toWslUnc(r.distro, value);
  const m = r?.kind === 'msys' ? value.match(/^\/([a-z])\/(.*)$/i) : null;
  if (m) return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
  return value;
}

async function runQmk(settings, args, opts = {}) {
  const r = await runner(settings);
  if (!r) return { code: -1, output: 'QMK CLI not found' };
  // wsl.exe gets --cd instead of a spawn cwd (a UNC folder cannot be one).
  const cmd = qmkCommand(r, args, { cwd: opts.cwd });
  const job = run(cmd.command, cmd.args, { cwd: r.kind === 'wsl' ? undefined : opts.cwd, env: cmd.env, onLine: opts.onLine, timeoutMs: opts.timeoutMs });
  opts.onJob?.(job.id);
  return job.done;
}

/** QMK environment: where the CLI is, where qmk_firmware is, which version. */
async function detect(settings) {
  // "Check again": the distro list is refreshed here (the picker in settings shows it).
  const wsl = await discoverWsl(true);
  const r = await runner(settings);
  const report = {
    runner: r ? { kind: r.kind, path: r.kind === 'msys' ? r.dir : r.kind === 'wsl' ? r.distro : r.qmk } : null,
    cliVersion: null,
    home: null,
    homeSource: null,
    homeValid: false,
    git: null,
    wsl,
    errors: [],
  };
  if (r) {
    const v = await runQmk(settings, ['--version'], { timeoutMs: 60000 });
    const m = v.output.match(/\d+\.\d+\.\d+/);
    if (v.code === 0 && m) report.cliVersion = m[0];
    else report.errors.push(`qmk --version: ${v.output.trim().slice(-400)}`);
  }
  let home = settings?.home || null;
  if (home) report.homeSource = 'settings';
  if (!home && r) {
    const c = await runQmk(settings, ['config', 'user.qmk_home'], { timeoutMs: 60000 });
    const m = c.output.match(/user\.qmk_home=(.+)/);
    if (m && m[1].trim() && m[1].trim() !== 'None') {
      home = m[1].trim();
      report.homeSource = 'qmk-config';
    }
  }
  if (!home) {
    const guess = path.join(require('node:os').homedir(), 'qmk_firmware');
    if (isQmkHome(guess)) {
      home = guess;
      report.homeSource = 'default-folder';
    }
  }
  if (home) {
    home = homeFromConfig(home, r);
    report.home = home;
    report.homeValid = isQmkHome(home);
    if (report.homeValid) {
      const u = fromWslUnc(home);
      // Windows git on \\wsl.localhost trips safe.directory and is slow: ask git inside the distro.
      const gitExe = u ? 'wsl.exe' : findOnPath('git');
      if (gitExe) {
        const gitArgs = u ? ['-d', u.distro, '--exec', 'git', '-C', validatePath(u.linuxPath), 'log', '-1', '--format=%H|%cI'] : ['-C', home, 'log', '-1', '--format=%H|%cI'];
        const g = await run(gitExe, gitArgs, { timeoutMs: 20000 }).done;
        if (g.code === 0) {
          const [commit, date] = g.output.trim().split('|');
          report.git = { commit, date };
        }
      }
    }
  }
  return report;
}

// ── Keyboard sources ───────────────────────────────────────────────────

const keyboardListCache = new Map();

/**
 * Same targets as the folder walk below, from file paths relative to keyboards/ (a find run inside WSL).
 * Folders named keymaps or starting with "." are skipped; at most 6 levels deep.
 */
function keyboardTargets(relFiles) {
  const dirs = new Map(); // folder -> Set of file names
  for (const raw of relFiles) {
    const parts = raw.trim().replace(/^\.\//, '').split('/').filter(Boolean);
    if (parts.length < 2) continue;
    const name = parts.pop();
    if (!['keyboard.json', 'rules.mk', 'info.json', 'config.h'].includes(name)) continue;
    if (parts.some((p) => p === 'keymaps' || p.startsWith('.'))) continue;
    const dir = parts.join('/');
    if (!dirs.has(dir)) dirs.set(dir, new Set());
    dirs.get(dir).add(name);
  }
  const out = [];
  for (const [dir, names] of dirs) {
    if (dir.split('/').length > 6) continue;
    const hasChildTarget = () => [...dirs.keys()].some((d) => d.startsWith(`${dir}/`) && !d.slice(dir.length + 1).includes('/') && dirs.get(d).has('keyboard.json'));
    if (names.has('keyboard.json') || (names.has('rules.mk') && (names.has('info.json') || names.has('config.h')) && !hasChildTarget())) out.push(dir);
  }
  return out.sort();
}

/** All keyboard targets: folders with keyboard.json (or info.json + rules.mk for old ones). */
async function listKeyboards(home) {
  if (!isQmkHome(home)) throw new Error('not a qmk_firmware folder');
  const root = path.join(home, 'keyboards');
  const cached = keyboardListCache.get(root);
  if (cached && Date.now() - cached.at < 60000) return cached.list;
  const wslHome = fromWslUnc(home);
  if (wslHome) {
    // --exec: no shell in between (parentheses and | would break). A walk over \\wsl.localhost takes minutes (2.5 min vs 0.25 s inside WSL): list the files inside the distro.
    const base = `${wslHome.linuxPath === '/' ? '' : wslHome.linuxPath}/keyboards`;
    const args = ['-d', wslHome.distro, '--cd', validatePath(base), '--exec', 'find', '.', '-mindepth', '2', '-maxdepth', '8', '(', '-name', 'keymaps', '-o', '-name', '.?*', ')', '-prune', '-o', '-type', 'f', '(', '-name', 'keyboard.json', '-o', '-name', 'rules.mk', '-o', '-name', 'info.json', '-o', '-name', 'config.h', ')', '-print'];
    const res = await run('wsl.exe', args, { timeoutMs: 120000 }).done;
    if (res.code !== 0) throw new Error(`listing keyboards in WSL failed: ${res.output.trim().slice(-300)}`);
    const list = keyboardTargets(res.output.split('\n').map((l) => l.replace(/^\.\//, '')));
    keyboardListCache.set(root, { at: Date.now(), list });
    return list;
  }
  const out = [];
  const walk = (dir, rel, depth) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const names = new Set(entries.map((e) => e.name));
    const subdirs = entries.filter((e) => e.isDirectory() && e.name !== 'keymaps' && !e.name.startsWith('.'));
    const isTarget = names.has('keyboard.json') || (names.has('rules.mk') && (names.has('info.json') || names.has('config.h')) && !subdirs.some((s) => fs.existsSync(path.join(dir, s.name, 'keyboard.json'))));
    if (isTarget && rel) out.push(rel);
    for (const s of subdirs) walk(path.join(dir, s.name), rel ? `${rel}/${s.name}` : s.name, depth + 1);
  };
  walk(root, '', 0);
  out.sort();
  keyboardListCache.set(root, { at: Date.now(), list: out });
  return out;
}

/** Keyboard definition files along the folder chain (as QMK merges them) + every keymap along the path. */
function readKeyboard(home, kb) {
  checkKb(kb);
  const root = path.join(home, 'keyboards');
  const parts = kb.split('/');
  const files = [];
  const keymaps = [];
  for (let i = 1; i <= parts.length; i++) {
    const rel = parts.slice(0, i).join('/');
    const dir = joinInside(root, ...parts.slice(0, i));
    for (const name of ['info.json', 'keyboard.json', 'rules.mk', 'config.h', 'post_rules.mk', 'post_config.h']) {
      const text = readTextIfExists(path.join(dir, name));
      if (text !== null && text.length < MAX_SOURCE) files.push({ path: `${rel}/${name}`, text });
    }
    const kmDir = path.join(dir, 'keymaps');
    if (fs.existsSync(kmDir)) {
      for (const e of fs.readdirSync(kmDir, { withFileTypes: true })) {
        if (e.isDirectory()) keymaps.push({ name: e.name, at: rel, files: fs.readdirSync(path.join(kmDir, e.name)) });
      }
    }
  }
  if (!fs.existsSync(joinInside(root, ...parts))) throw new Error(`keyboard “${kb}” not found`);
  return { files, keymaps };
}

/** Keymap folder: looked up along the chain (deepest first), otherwise a new one in the deepest folder. */
function keymapDir(home, kb, km) {
  checkKb(kb);
  checkKm(km);
  const root = path.join(home, 'keyboards');
  const parts = kb.split('/');
  for (let i = parts.length; i >= 1; i--) {
    const dir = joinInside(root, ...parts.slice(0, i), 'keymaps', km);
    if (fs.existsSync(dir)) return { dir, exists: true };
  }
  return { dir: joinInside(root, ...parts, 'keymaps', km), exists: false };
}

function readKeymap(home, kb, km) {
  const { dir, exists } = keymapDir(home, kb, km);
  const files = [];
  if (exists) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile() || fs.statSync(full).size > MAX_SOURCE) continue;
      files.push({ name, text: fs.readFileSync(full, 'utf8') });
    }
  }
  return { dir, exists, files };
}

function backupFiles(dataDir, baseDir, names) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(dataDir, 'backups', 'qmk', stamp);
  let copied = 0;
  for (const name of names) {
    const src = path.join(baseDir, name);
    if (fs.existsSync(src)) {
      fs.mkdirSync(backup, { recursive: true });
      fs.copyFileSync(src, path.join(backup, name));
      copied++;
    }
  }
  if (copied) fs.writeFileSync(path.join(backup, 'ORIGIN.txt'), `${baseDir}\n`, 'utf8');
  return copied ? backup : null;
}

function writeKeymap(dataDir, home, kb, km, files) {
  const { dir } = keymapDir(home, kb, km);
  if (!Array.isArray(files) || files.length === 0) throw new Error('no files');
  for (const f of files) {
    if (!KEYMAP_FILES.has(f.name) || typeof f.text !== 'string' || f.text.length > MAX_SOURCE) throw new Error(`file is not allowed: ${f.name}`);
    const why = unsafeSource(f.name, f.text);
    if (why) throw new Error(`${f.name}: ${why}`);
  }
  const backup = backupFiles(dataDir, dir, files.map((f) => f.name));
  for (const f of files) writeFileAtomic(path.join(dir, f.name), f.text);
  return { dir, backup };
}

/** Own keyboard (new target): writes only allowed files into keyboards/<kb>/. */
function writeKeyboard(dataDir, home, kb, files) {
  checkKb(kb);
  const dir = joinInside(path.join(home, 'keyboards'), ...kb.split('/'));
  for (const f of files) {
    if (!KEYBOARD_FILES.has(f.name) || typeof f.text !== 'string' || f.text.length > MAX_SOURCE) throw new Error(`file is not allowed: ${f.name}`);
    const why = unsafeSource(f.name, f.text);
    if (why) throw new Error(`${f.name}: ${why}`);
  }
  const backup = backupFiles(dataDir, dir, files.map((f) => f.name));
  for (const f of files) writeFileAtomic(path.join(dir, f.name), f.text);
  keyboardListCache.clear();
  return { dir, backup };
}

// ── Firmware archive ───────────────────────────────────────────────────

const FW_EXT = new Set(['.uf2', '.hex', '.bin']);

function describeFirmware(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(512);
    const n = fs.readSync(fd, head, 0, 512, 0);
    const size = fs.fstatSync(fd).size;
    if (n >= 32 && head.readUInt32LE(0) === 0x0a324655 && head.readUInt32LE(4) === 0x9e5d5157) {
      const flags = head.readUInt32LE(8);
      const family = flags & 0x2000 ? head.readUInt32LE(28) : null;
      return { format: 'uf2', size, uf2Family: family };
    }
    if (head.toString('ascii', 0, 1) === ':') return { format: 'hex', size };
    return { format: 'bin', size };
  } finally {
    fs.closeSync(fd);
  }
}

/** Normal firmware — up to 16 MB; a copy of the whole board memory (CURRENT.UF2 of a 16 MB flash) — up to 34 MB. */
const FW_MAX = 16 * 1024 * 1024;
const BACKUP_MAX = 34 * 1024 * 1024;

/**
 * Walk all UF2 blocks: chip family, address range, data size.
 * null — not UF2 or the file is broken (each block is 512 bytes with three “magic” numbers).
 */
function scanUf2(file) {
  const data = fs.readFileSync(file);
  if (data.length === 0 || data.length % 512 !== 0) return null;
  let family = null;
  let mixedFamily = false;
  let start = Infinity;
  let end = 0;
  let bytes = 0;
  let blocks = 0;
  for (let off = 0; off < data.length; off += 512) {
    if (data.readUInt32LE(off) !== 0x0a324655 || data.readUInt32LE(off + 4) !== 0x9e5d5157 || data.readUInt32LE(off + 508) !== 0x0ab16f30) return null;
    const flags = data.readUInt32LE(off + 8);
    if (flags & 1) continue; // “not main flash” — the bootloader skips such blocks too
    const addr = data.readUInt32LE(off + 12);
    const size = data.readUInt32LE(off + 16);
    if (size > 476) return null;
    const fam = flags & 0x2000 ? data.readUInt32LE(off + 28) >>> 0 : null;
    if (blocks === 0) family = fam;
    else if (fam !== family) mixedFamily = true;
    start = Math.min(start, addr);
    end = Math.max(end, addr + size);
    bytes += size;
    blocks++;
  }
  return { blocks, family, mixedFamily, start: blocks ? start : 0, end, bytes };
}

/** Copy a firmware file into the archive. opts.name — own file name, opts.maxBytes — size limit. */
function archiveFirmware(firmwareDir, src, meta, opts = {}) {
  const ext = path.extname(opts.name || src).toLowerCase();
  if (!FW_EXT.has(ext)) throw new Error('unknown firmware file type');
  const data = fs.readFileSync(src);
  if (data.length > (opts.maxBytes || FW_MAX)) throw new Error('firmware file is too large');
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${sha256.slice(0, 8)}`;
  const dir = joinInside(firmwareDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const name = safeFileName(opts.name || path.basename(src), `firmware${ext}`);
  writeFileAtomic(path.join(dir, name), data);
  const info = { id, file: name, sha256, size: data.length, createdAt: new Date().toISOString(), ...describeFirmware(path.join(dir, name)), ...meta };
  writeFileAtomic(path.join(dir, 'meta.json'), JSON.stringify(info, null, 1));
  return info;
}

function listFirmware(firmwareDir) {
  if (!fs.existsSync(firmwareDir)) return [];
  const out = [];
  for (const e of fs.readdirSync(firmwareDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const meta = readTextIfExists(path.join(firmwareDir, e.name, 'meta.json'));
    if (!meta) continue;
    try {
      const info = JSON.parse(meta);
      if (info && info.id === e.name) out.push(info);
    } catch {
      // broken meta — skip
    }
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function firmwarePath(firmwareDir, id) {
  safeId(id);
  const meta = JSON.parse(fs.readFileSync(joinInside(firmwareDir, id, 'meta.json'), 'utf8'));
  safeId(meta.file);
  return joinInside(firmwareDir, id, meta.file);
}

/** Where QMK left the firmware: the line “Copying <file> to qmk_firmware folder” or by name. */
function findBuiltFirmware(home, kb, km, output) {
  const m = output.match(/Copying\s+([^\s]+\.(?:uf2|hex|bin))\s+to qmk_firmware folder/i);
  const candidates = [];
  if (m) candidates.push(path.join(home, m[1]));
  const base = `${kb.replace(/\//g, '_')}_${km}`;
  for (const ext of ['.uf2', '.hex', '.bin']) candidates.push(path.join(home, base + ext), path.join(home, '.build', base + ext));
  for (const c of candidates) if (insideDir(home, c) && fs.existsSync(c)) return c;
  return null;
}

// ── IPC ────────────────────────────────────────────────────────────────

function registerQmkIpc({ ipcMain, getWindow, dataDir, firmwareDir }) {
  const send = (channel, payload) => getWindow()?.webContents.send(channel, payload);

  ipcMain.handle('navi:qmk:detect', (_e, settings) => detect(settings));
  ipcMain.handle('navi:qmk:list-keyboards', (_e, home) => listKeyboards(validatePath(home)));
  ipcMain.handle('navi:qmk:read-keyboard', (_e, home, kb) => readKeyboard(validatePath(home), kb));
  ipcMain.handle('navi:qmk:read-keymap', (_e, home, kb, km) => readKeymap(validatePath(home), kb, km));
  ipcMain.handle('navi:qmk:write-keymap', (_e, home, kb, km, files) => writeKeymap(dataDir, validatePath(home), kb, km, files));
  ipcMain.handle('navi:qmk:write-keyboard', (_e, home, kb, files) => writeKeyboard(dataDir, validatePath(home), kb, files));

  /** Build: a real qmk compile. The result is copied into the firmware archive. */
  ipcMain.handle('navi:qmk:compile', async (_e, settings, { home, keyboard, keymap, env, parallel }) => {
    validatePath(home);
    checkKb(keyboard);
    checkKm(keymap);
    const args = ['compile', '-kb', validateArg(keyboard), '-km', validateArg(keymap)];
    if (Number.isInteger(parallel) && parallel > 0 && parallel <= 64) args.push('-j', String(parallel));
    for (const [k, v] of Object.entries(env || {})) {
      if (!allowedBuildOption(k, v)) throw new Error(`build option is not allowed: ${k}`);
      args.push('-e', validateArg(`${k}=${v}`));
    }
    let jobId = null;
    const started = Date.now();
    const result = await runQmk(settings, args, {
      cwd: home,
      onJob: (id) => {
        jobId = id;
        send('navi:qmk:started', { job: id, kind: 'compile', args });
      },
      onLine: (stream, line) => send('navi:qmk:log', { job: jobId, stream, line }),
    });
    let firmware = null;
    if (result.code === 0) {
      const built = findBuiltFirmware(home, keyboard, keymap, result.output);
      if (built) firmware = archiveFirmware(firmwareDir, built, { source: 'build', keyboard, keymap, durationMs: Date.now() - started });
    }
    const payload = { job: jobId, code: result.code, firmware, durationMs: Date.now() - started };
    send('navi:qmk:done', payload);
    return payload;
  });

  /** Simple QMK commands for diagnostics. */
  ipcMain.handle('navi:qmk:run', async (_e, settings, command) => {
    const allowed = { doctor: ['doctor'], version: ['--version'], env: ['env'] };
    const args = allowed[command];
    if (!args) throw new Error('command is not allowed');
    let jobId = null;
    const result = await runQmk(settings, args, {
      onJob: (id) => {
        jobId = id;
        send('navi:qmk:started', { job: id, kind: command, args });
      },
      onLine: (stream, line) => send('navi:qmk:log', { job: jobId, stream, line }),
      timeoutMs: 10 * 60 * 1000,
    });
    send('navi:qmk:done', { job: jobId, code: result.code });
    return { job: jobId, code: result.code };
  });

  ipcMain.handle('navi:qmk:cancel', (_e, job) => cancel(job));

  ipcMain.handle('navi:fw:list', () => listFirmware(firmwareDir));
  ipcMain.handle('navi:fw:remove', (_e, id) => {
    safeId(id);
    const dir = joinInside(firmwareDir, id);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  ipcMain.handle('navi:fw:import', async () => {
    const { dialog } = require('electron');
    const res = await dialog.showOpenDialog(getWindow(), { properties: ['openFile'], filters: [{ name: 'Firmware', extensions: ['uf2', 'hex', 'bin'] }] });
    if (res.canceled || !res.filePaths[0]) return null;
    return archiveFirmware(firmwareDir, res.filePaths[0], { source: 'import', originalPath: res.filePaths[0] });
  });
  ipcMain.handle('navi:fw:export', async (_e, id) => {
    const { dialog } = require('electron');
    const src = firmwarePath(firmwareDir, id);
    const res = await dialog.showSaveDialog(getWindow(), { defaultPath: path.basename(src) });
    if (res.canceled || !res.filePath) return null;
    fs.copyFileSync(src, res.filePath);
    return res.filePath;
  });
}

module.exports = { registerQmkIpc, chooseRunner, homeFromConfig, runner, keyboardTargets, listKeyboards, readKeyboard, readKeymap, describeFirmware, scanUf2, archiveFirmware, listFirmware, firmwarePath, findBuiltFirmware, isQmkHome, BACKUP_MAX };
