/**
 * Flash steps shared by Firmware → flash and “build + flash” (src/store/buildFlashStore.ts). Nothing is faked: a
 * keyboard is “in its bootloader” only when a UF2 drive or a bootloader USB ID shows up, and “flashed” only when the
 * keyboard comes back over USB.
 */
import type { Project } from '../core/project/types';
import { navi, type BootloaderDevice, type FirmwareInfo, type FlashScan, type KeymapSources, type Uf2Drive } from '../desktop/bridge';
import { t } from '../i18n';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The archive holds a backup of a board with this Board-ID: CURRENT.UF2 saved by NAVI, or a picotool copy added with
 * “add a saved copy…”. The halves of a split keyboard share their Board-ID, so NAVI can't tell their backups apart.
 */
export const hasBoardBackup = (firmware: readonly Pick<FirmwareInfo, 'source' | 'boardId'>[], boardId: string) =>
  firmware.some((f) => f.source === 'backup' && f.boardId === boardId);

/**
 * Board-IDs the user chose to flash without a backup (Firmware → flash, “flash anyway”): the first flash of such a
 * board is asked once; after it, “build + flash” doesn't stop for it. Kept in localStorage: losing it only asks again.
 */
const NO_BACKUP_KEY = 'navi.flash.noBackupOk';

function noBackupList(): string[] {
  try {
    const v: unknown = JSON.parse(globalThis.localStorage?.getItem(NO_BACKUP_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const noBackupAccepted = (boardId: string) => noBackupList().includes(boardId);

export function acceptNoBackup(boardId: string): void {
  if (noBackupAccepted(boardId)) return;
  try {
    globalThis.localStorage?.setItem(NO_BACKUP_KEY, JSON.stringify([...noBackupList(), boardId]));
  } catch {
    // storage unavailable: it will be asked again next time
  }
}

/** The keyboard's USB ID as the project knows it (read from the device, else the hardware page), or null. */
export function expectedUsb(project: Project | null): { vid: number; pid: number } | null {
  if (!project) return null;
  return project.device ?? (project.hardware.usb.vid && project.hardware.usb.pid ? { vid: project.hardware.usb.vid, pid: project.hardware.usb.pid } : null);
}

/** RP2040 bootloaders show up both as a USB ID and as a drive: the drive is what takes the file. */
export const qmkBootloaders = (scan: FlashScan) => scan.bootloaders.filter((b) => b.type !== 'rp2040');

export const inBootloader = (scan: FlashScan) => scan.uf2Drives.length > 0 || qmkBootloaders(scan).length > 0;

export type FlashTarget = { kind: 'uf2'; drive: Uf2Drive } | { kind: 'qmk'; bootloader: BootloaderDevice } | { kind: 'none' } | { kind: 'several' };

/** Where a firmware goes: one UF2 drive, else one QMK bootloader. Several boards at once → let the user pick (Firmware → flash). */
export function pickFlashTarget(scan: FlashScan): FlashTarget {
  if (scan.uf2Drives.length > 1) return { kind: 'several' };
  if (scan.uf2Drives.length === 1) return { kind: 'uf2', drive: scan.uf2Drives[0]! };
  const boot = qmkBootloaders(scan);
  if (boot.length > 1) return { kind: 'several' };
  if (boot.length === 1) return { kind: 'qmk', bootloader: boot[0]! };
  return { kind: 'none' };
}

export type KeymapWritePlan = {
  /** Files whose text differs from the disk (new ones included). */
  write: { name: string; text: string }[];
  /** Of those, the ones on disk that are not what NAVI wrote last: shown as a diff before they are overwritten. */
  review: { name: string; before: string; after: string }[];
};

export function planKeymapWrite(files: readonly { name: string; text: string }[], disk: KeymapSources | null): KeymapWritePlan {
  const plan: KeymapWritePlan = { write: [], review: [] };
  for (const f of files) {
    const old = disk?.files.find((x) => x.name === f.name);
    if (old?.text === f.text) continue;
    plan.write.push({ name: f.name, text: f.text });
    if (old && !old.navi) plan.review.push({ name: f.name, before: old.text, after: f.text });
  }
  return plan;
}

export type KeyboardBack = { ok: boolean; back: boolean; text: string };

/** After flashing: wait until the keyboard appears over USB again (up to 40 s). `stop` ends the wait early (canceled). */
export async function waitForKeyboardBack(expect: { vid: number; pid: number } | null, stop: () => boolean = () => false): Promise<KeyboardBack> {
  const since = Date.now();
  while (Date.now() - since < 40000 && !stop()) {
    await sleep(1500);
    const s = await navi!.flash.scan();
    const back = expect ? s.usb.find((u) => Number.parseInt(u.vid, 16) === expect.vid && Number.parseInt(u.pid, 16) === expect.pid) : null;
    if (back) return { ok: true, back: true, text: t(`Done: the keyboard is back (USB ${back.vid}:${back.pid}).`, `Готово: клавиатура снова на связи (USB ${back.vid}:${back.pid}).`) };
    const stillBoot = s.bootloaders.length > 0 || s.uf2Drives.length > 0;
    if (!expect && !stillBoot && Date.now() - since > 6000) {
      return {
        ok: true,
        back: false,
        text: t(
          'The bootloader is gone (the board restarted). The keyboard USB ID is not known to the project, so the result is not confirmed — check that the keyboard types.',
          'Загрузчик пропал (плата перезапустилась). USB ID клавиатуры проекту не известен — результат не подтверждён, проверьте, что клавиатура печатает.',
        ),
      };
    }
  }
  return {
    ok: false,
    back: false,
    text: t(
      'The keyboard did not come back within 40 s. If a new USB ID was expected, check by typing; otherwise enter the bootloader again and flash a previous firmware from the archive.',
      'Клавиатура не вернулась за 40 с. Если ожидался другой USB ID — проверьте, печатает ли она; иначе снова войдите в загрузчик и прошейте прежнюю прошивку из архива.',
    ),
  };
}
