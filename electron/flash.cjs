/**
 * FLASHING: finding a keyboard in bootloader mode and writing the firmware.
 *
 *  • Bootloaders are recognised by USB VID:PID from the official QMK table
 *    (lib/python/qmk/constants.py BOOTLOADER_VIDS_PIDS) + RP2040 (2E8A:0003).
 *  • RP2040 and other UF2 bootloaders show up as a drive with an INFO_UF2.TXT file. Flashing = copying
 *    the .uf2 to this drive. Before copying we check that the file is UF2 and that its “family”
 *    matches the board (RP2040 ≠ RP2350 ≠ nRF52…): a mismatching file is not written.
 *  • Other bootloaders (DFU, Caterina, HalfKay…) — through the official `qmk flash <file>`.
 *  • Current firmware backup: the RP2040 bootloader shows a CURRENT.UF2 file — the board's whole flash
 *    memory. Its copy in the archive = the seller's firmware, which can be restored by the same UF2 write.
 *
 * Success is NOT declared here: a finished copy/program is not a confirmation yet.
 * The confirmation is the keyboard appearing over USB again (the interface checks that).
 */
const fs = require('node:fs');
const path = require('node:path');
const { cancel, findMsys, findOnPath, qmkCommand, run, validatePath } = require('./runner.cjs');
const os = require('node:os');
const { firmwarePath, describeFirmware, scanUf2, archiveFirmware, BACKUP_MAX } = require('./qmk.cjs');

const BOOTLOADERS = [
  ['atmel-dfu', '03eb', '2fef', 'ATmega16U2'],
  ['atmel-dfu', '03eb', '2ff0', 'ATmega32U2'],
  ['atmel-dfu', '03eb', '2ff3', 'ATmega16U4'],
  ['atmel-dfu', '03eb', '2ff4', 'ATmega32U4'],
  ['atmel-dfu', '03eb', '2ff9', 'AT90USB64'],
  ['atmel-dfu', '03eb', '2ffa', 'AT90USB162'],
  ['atmel-dfu', '03eb', '2ffb', 'AT90USB128'],
  ['kiibohd', '1c11', 'b007', 'Kiibohd'],
  ['stm32-dfu', '1eaf', '0003', 'STM32duino'],
  ['stm32-dfu', '0483', 'df11', 'STM32 DFU'],
  ['apm32-dfu', '314b', '0106', 'APM32 DFU'],
  ['gd32v-dfu', '28e9', '0189', 'GD32V DFU'],
  ['wb32-dfu', '342d', 'dfa0', 'WB32 DFU'],
  ['at32-dfu', '2e3c', 'df11', 'AT32 DFU'],
  ['bootloadhid', '16c0', '05df', 'BootloadHID'],
  ['usbasploader', '16c0', '05dc', 'USBaspLoader'],
  ['usbtinyisp', '1782', '0c9f', 'USBtinyISP'],
  ['md-boot', '03eb', '6124', 'Massdrop'],
  ['caterina', '1209', '2302', 'Keyboardio Atreus 2'],
  ['caterina', '1b4f', '9203', 'Pro Micro 3V3'],
  ['caterina', '1b4f', '9205', 'Pro Micro 5V'],
  ['caterina', '1b4f', '9207', 'LilyPad / Pro Micro clone'],
  ['caterina', '1ffb', '0101', 'A-Star 32U4'],
  ['caterina', '2341', '0036', 'Leonardo'],
  ['caterina', '2341', '0037', 'Micro'],
  ['caterina', '239a', '000c', 'Feather 32U4'],
  ['caterina', '239a', '000d', 'ItsyBitsy 32U4 3V3'],
  ['caterina', '239a', '000e', 'ItsyBitsy 32U4 5V'],
  ['caterina', '2a03', '0036', 'Leonardo'],
  ['caterina', '2a03', '0037', 'Micro'],
  ['hid-bootloader', '03eb', '2067', 'QMK HID'],
  ['hid-bootloader', '16c0', '0478', 'PJRC HalfKay'],
  ['rp2040', '2e8a', '0003', 'RP2040 BOOTSEL'],
  ['rp2040', '2e8a', '000f', 'RP2350 BOOTSEL'],
];

/** UF2 families by Board-ID from INFO_UF2.TXT (https://github.com/microsoft/uf2 — uf2families.json). */
const UF2_FAMILIES = {
  'RPI-RP2': [0xe48bff56],
  RP2350: [0xe48bff57, 0xe48bff59, 0xe48bff5a, 0xe48bff5b],
};

/** USB devices (Windows): VID, PID, name, status — through PowerShell (read-only). */
async function listUsb() {
  if (process.platform !== 'win32') return [];
  const ps = 'Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPDeviceID -like \'USB\\VID_*\' } | ForEach-Object { "$($_.PNPDeviceID)`t$($_.Name)`t$($_.Status)" }';
  const res = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeoutMs: 20000 }).done;
  const seen = new Map();
  for (const line of res.output.split(/\r?\n/)) {
    const [id, name, status] = line.split('\t');
    const m = id && id.match(/VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i);
    if (!m) continue;
    const key = `${m[1]}:${m[2]}`.toLowerCase();
    if (!seen.has(key)) seen.set(key, { vid: m[1].toLowerCase(), pid: m[2].toLowerCase(), name: name || '', status: status || '', instanceId: id });
  }
  return [...seen.values()];
}

/** UF2 bootloader drives: the drive root contains INFO_UF2.TXT. */
function listUf2Drives() {
  const out = [];
  if (process.platform !== 'win32') return out;
  for (let c = 67; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    const info = path.join(root, 'INFO_UF2.TXT');
    try {
      if (!fs.existsSync(info)) continue;
      const text = fs.readFileSync(info, 'utf8').slice(0, 2000);
      const model = (text.match(/Model:\s*(.+)/) || [])[1]?.trim() ?? '';
      const boardId = (text.match(/Board-ID:\s*(.+)/) || [])[1]?.trim() ?? '';
      out.push({ root, model, boardId, info: text.trim() });
    } catch {
      // drive not available
    }
  }
  return out;
}

async function scan() {
  const usb = await listUsb();
  const bootloaders = [];
  for (const d of usb) {
    const bl = BOOTLOADERS.find((b) => b[1] === d.vid && b[2] === d.pid);
    if (bl) bootloaders.push({ type: bl[0], vid: d.vid, pid: d.pid, name: bl[3], device: d.name, status: d.status });
  }
  return { usb, bootloaders, uf2Drives: listUf2Drives(), scannedAt: new Date().toISOString() };
}

/**
 * Check a .uf2 before copying it to the bootloader drive.
 * meta — info from the archive: a backup taken from a bootloader of the same type (Board-ID) can be restored
 * even if the chip family is not written in its blocks.
 */
function checkUf2(file, drive, meta) {
  const desc = describeFirmware(file);
  if (desc.format !== 'uf2') return { ok: false, reason: 'not-uf2', desc };
  const expected = UF2_FAMILIES[drive.boardId];
  const sameBoardBackup = meta?.source === 'backup' && !!meta.boardId && meta.boardId === drive.boardId;
  if (sameBoardBackup && desc.uf2Family === null) return { ok: true, desc, backup: true };
  if (!expected) return { ok: true, unverified: true, desc };
  if (desc.uf2Family === null || !expected.includes(desc.uf2Family >>> 0)) return { ok: false, reason: 'family-mismatch', desc, expected };
  return { ok: true, desc };
}

/** Firmware metadata from the archive (to check backups). */
function firmwareMeta(firmwareDir, id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(path.dirname(firmwarePath(firmwareDir, id)), 'meta.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Streaming copy with progress. */
function copyWithProgress(src, dst, onProgress) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(src);
    const output = fs.createWriteStream(dst);
    let done = 0;
    input.on('data', (chunk) => {
      done += chunk.length;
      onProgress(done);
    });
    input.on('error', reject);
    output.on('error', reject);
    output.on('close', () => resolve(done));
    input.pipe(output);
  });
}

/**
 * Back up the current firmware from the bootloader drive (CURRENT.UF2) into the archive.
 * Nothing is written to the board: only the file the bootloader shows is read.
 */
async function backupCurrentUf2(drive, firmwareDir, onProgress = () => {}) {
  const src = path.join(drive.root, 'CURRENT.UF2');
  if (!fs.existsSync(src)) throw new Error('this bootloader has no CURRENT.UF2 — it cannot read the current firmware');
  const total = fs.statSync(src).size;
  if (total > BACKUP_MAX) throw new Error('CURRENT.UF2 is larger than expected');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-backup-'));
  try {
    const tmp = path.join(tmpDir, 'CURRENT.UF2');
    await copyWithProgress(src, tmp, (done) => onProgress(done, total));
    const scan = scanUf2(tmp);
    if (!scan || scan.blocks === 0) throw new Error('CURRENT.UF2 is not a valid UF2 file — nothing saved');
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `backup-${stamp}-${(drive.boardId || 'board').replace(/[^A-Za-z0-9_-]/g, '_')}.uf2`;
    const flash = { start: scan.start, end: scan.end, bytes: scan.bytes, blocks: scan.blocks };
    return archiveFirmware(firmwareDir, tmp, { source: 'backup', boardId: drive.boardId, model: drive.model, flash }, { name, maxBytes: BACKUP_MAX });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function waitForDriveGone(root, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (!fs.existsSync(path.join(root, 'INFO_UF2.TXT'))) return resolve(true);
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(tick, 250);
    };
    tick();
  });
}

function registerFlashIpc({ ipcMain, getWindow, firmwareDir }) {
  const send = (channel, payload) => getWindow()?.webContents.send(channel, payload);

  ipcMain.handle('navi:flash:scan', () => scan());

  ipcMain.handle('navi:flash:check-uf2', (_e, firmwareId, driveRoot) => {
    const drive = listUf2Drives().find((d) => d.root === driveRoot);
    if (!drive) throw new Error('the bootloader drive is not connected');
    return checkUf2(firmwarePath(firmwareDir, firmwareId), drive, firmwareMeta(firmwareDir, firmwareId));
  });

  ipcMain.handle('navi:flash:backup-uf2', async (_e, driveRoot) => {
    const drive = listUf2Drives().find((d) => d.root === driveRoot);
    if (!drive) throw new Error('the bootloader drive is not connected');
    return backupCurrentUf2(drive, firmwareDir, (done, total) => send('navi:flash:progress', { done, total }));
  });

  /** Copy a .uf2 to the bootloader drive. Returns whether the drive disappeared (the board rebooted). */
  ipcMain.handle('navi:flash:uf2', async (_e, firmwareId, driveRoot, { allowUnverified } = {}) => {
    const drive = listUf2Drives().find((d) => d.root === driveRoot);
    if (!drive) throw new Error('the bootloader drive is not connected');
    const file = firmwarePath(firmwareDir, firmwareId);
    const check = checkUf2(file, drive, firmwareMeta(firmwareDir, firmwareId));
    if (!check.ok) throw new Error(check.reason === 'not-uf2' ? 'the file is not a UF2 firmware' : 'the UF2 file is for another chip family than this bootloader');
    if (check.unverified && !allowUnverified) throw new Error('unknown bootloader board — confirm flashing explicitly');
    const total = fs.statSync(file).size;
    const target = path.join(drive.root, 'NAVI.UF2');
    let copyError = null;
    try {
      await new Promise((resolve, reject) => {
        const input = fs.createReadStream(file);
        const output = fs.createWriteStream(target);
        let done = 0;
        input.on('data', (chunk) => {
          done += chunk.length;
          send('navi:flash:progress', { done, total });
        });
        input.on('error', reject);
        output.on('error', reject);
        output.on('close', resolve);
        input.pipe(output);
      });
    } catch (err) {
      // The board often reboots right after the last block — Windows reports a write error.
      copyError = err.message;
    }
    const driveGone = await waitForDriveGone(drive.root, 15000);
    return { copied: copyError === null, copyError, driveGone, bytes: total };
  });

  /** Flash through the official qmk flash (DFU, Caterina, HalfKay …). */
  ipcMain.handle('navi:flash:qmk', async (_e, settings, firmwareId, bootloader) => {
    const msys = findMsys(settings?.msys);
    const qmk = msys ? null : findOnPath('qmk');
    if (!msys && !qmk) throw new Error('QMK CLI not found');
    const file = validatePath(firmwarePath(firmwareDir, firmwareId)).replace(/\\/g, '/');
    const args = ['flash'];
    if (typeof bootloader === 'string' && /^[a-z0-9-]{2,30}$/.test(bootloader)) args.push('-bl', bootloader);
    args.push(file);
    const cmd = qmkCommand(msys ? { kind: 'msys', bash: msys.bash } : { kind: 'path', qmk }, args);
    const job = run(cmd.command, cmd.args, { env: cmd.env, onLine: (stream, line) => send('navi:qmk:log', { job: job.id, stream, line }), timeoutMs: 11 * 60 * 1000 });
    send('navi:qmk:started', { job: job.id, kind: 'flash', args });
    const res = await job.done;
    send('navi:qmk:done', { job: job.id, code: res.code });
    return { job: job.id, code: res.code, output: res.output.slice(-20000) };
  });

  ipcMain.handle('navi:flash:cancel', (_e, job) => cancel(job));
}

module.exports = { registerFlashIpc, BOOTLOADERS, UF2_FAMILIES, checkUf2, listUf2Drives, backupCurrentUf2 };
