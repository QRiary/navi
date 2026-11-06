/**
 * “Build + flash” (the button beside Save): save the project, write the keymap files, build, restart the keyboard into
 * its bootloader (NAVI's Raw HID message when the project's firmware allows it, else the user presses QK_BOOT), flash
 * the half with the cable, wait for it to come back. Each step is the same call the Firmware tabs make; the only
 * question asked is the diff of a file that isn't what NAVI wrote last (edited outside NAVI). Any refusal or failure
 * stops the run with a toast that leads to the tab where it can be fixed.
 */
import { create } from 'zustand';
import { bootloaderPacket, rawUsageOf } from '../core/qmk/bootloaderReboot';
import { navi, type FirmwareInfo } from '../desktop/bridge';
import { sendRawPacket } from '../device/rawHid';
import { t } from '../i18n';
import { generateFiles } from '../lib/firmwareFiles';
import { expectedUsb, inBootloader, pickFlashTarget, planKeymapWrite, waitForKeyboardBack, type KeymapWritePlan } from '../lib/flashSteps';
import { navigate } from '../lib/router';
import { useDeviceStore } from './deviceStore';
import { isDirty, saveProject, useProjectStore } from './projectStore';
import { loadSpec } from '../core/keycodes/spec';
import { useQmkStore } from './qmkStore';
import { useSettingsStore } from './settingsStore';
import { toast } from './toastStore';

export type BuildFlashPhase = 'idle' | 'saving' | 'review' | 'writing' | 'building' | 'restarting' | 'press' | 'backing-up' | 'flashing' | 'returning' | 'done';

export interface BuildFlashState {
  phase: BuildFlashPhase;
  /** When the current phase started (the button shows the build's elapsed time). */
  since: number;
  /** Phase `review`: the files edited outside NAVI that the write would overwrite. */
  review: KeymapWritePlan['review'];
  /** Phase `press`: why NAVI couldn't restart the keyboard itself (shown as the button's tooltip). */
  pressWhy: string;
  run(): Promise<void>;
  /** The review dialog's answer: true = write them. */
  answerReview(write: boolean): void;
  cancel(): void;
}

/** How long the bootloader gets to appear after NAVI's message before the user is asked to press QK_BOOT. */
export const REBOOT_WAIT_MS = 8000;
const POLL_MS = 1000;
const DONE_SHOWN_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Stopped extends Error {}

let runId = 0;
let reviewAnswer: ((write: boolean) => void) | null = null;

function stopWith(message: string, opts: { detail?: string; tab?: string } = {}): never {
  toast(message, 'error', {
    detail: opts.detail,
    action: opts.tab ? { label: t('open', 'открыть'), run: () => navigate({ section: 'firmware', tab: opts.tab }) } : undefined,
  });
  throw new Stopped();
}

export const useBuildFlashStore = create<BuildFlashState>()((set, get) => {
  const phase = (p: BuildFlashPhase, extra: Partial<BuildFlashState> = {}) => set({ phase: p, since: Date.now(), ...extra });

  async function steps(id: number) {
    const alive = () => id === runId;
    const check = () => {
      if (!alive()) throw new Stopped();
    };
    const qmk = useQmkStore.getState;

    // 1. Save: what ends up on the keyboard is always a saved version.
    if (isDirty(useProjectStore.getState())) {
      phase('saving');
      if ((await saveProject()) === null) throw new Stopped(); // saveProject already showed why
      check();
    }
    const project = useProjectStore.getState().project;
    const env = qmk().env;
    if (!project || !navi) throw new Stopped();
    const kb = project.firmware.keyboard;
    const km = project.firmware.keymap;
    if (!env?.runner || !env.homeValid || !env.home || !kb) stopWith(t('Set up QMK and the keyboard target first.', 'Сначала настройте QMK и target клавиатуры.'), { tab: !kb ? 'target' : 'setup' });

    // 2. The files, from what is on disk right now.
    phase('writing');
    await qmk().loadSources(kb, km);
    await qmk().ensureOwnCode(kb, km);
    check();
    const disk = qmk().keymapSources;
    const info = qmk().sources?.info;
    if (!disk) stopWith(qmk().error ?? t('Couldn’t read the keymap folder.', 'Не удалось прочитать папку keymap.'), { detail: qmk().errorDetail ?? undefined, tab: 'target' });
    if (info?.matrix && (info.matrix.rows !== project.hardware.matrix.rows || info.matrix.cols !== project.hardware.matrix.cols))
      stopWith(t('The target matrix differs from the project: the files are not written.', 'Матрица target не совпадает с проектом: файлы не записываются.'), { tab: 'files' });
    const generated = generateFiles(project, loadSpec(project.firmware.keycodeSpec ?? 'latest'), info, qmk().ownCode);
    if (generated.issues.some((i) => i.level === 'error')) stopWith(t('The keymap files have errors: see Firmware → keymap files.', 'В файлах keymap есть ошибки: смотрите «Прошивка → файлы keymap».'), { tab: 'files' });
    const plan = planKeymapWrite(generated.files, disk);
    if (plan.review.length) {
      phase('review', { review: plan.review });
      const write = await new Promise<boolean>((resolve) => (reviewAnswer = resolve));
      reviewAnswer = null;
      check();
      if (!write) throw new Stopped();
      phase('writing', { review: [] });
    }
    if (plan.write.length) {
      try {
        await navi.qmk.writeKeymap(env.home, env.userspace, kb, km, plan.write);
      } catch (err) {
        stopWith(t('Couldn’t write the keymap files. Nothing was changed; check the QMK folder is writable and try again.', 'Не удалось записать файлы раскладки. Ничего не изменено; проверьте, что в папку QMK можно писать, и повторите.'), { detail: String(err), tab: 'files' });
      }
      await qmk().loadSources(kb, km);
      check();
    }

    // 3. Build.
    phase('building');
    const build = project.firmware.build ?? {};
    const res = await qmk().compile(kb, km, build.env ?? {}, build.parallel);
    check();
    if (!res) stopWith(qmk().error ?? t('The build didn’t start.', 'Сборка не запустилась.'), { detail: qmk().errorDetail ?? undefined, tab: 'build' });
    if (res.code !== 0) stopWith(t(`The build failed (exit code ${res.code}): see the build log.`, `Сборка не удалась (код ${res.code}): смотрите лог сборки.`), { tab: 'build' });
    if (!res.firmware) stopWith(t('The build finished, but NAVI found no firmware file it made.', 'Сборка закончилась, но NAVI не нашёл созданного ею файла прошивки.'), { tab: 'build' });
    const fw: FirmwareInfo = res.firmware;

    // 4. Into the bootloader.
    const expect = expectedUsb(project);
    let scan = await navi.flash.scan();
    if (!inBootloader(scan)) {
      let pressWhy = t(
        'NAVI may not restart this keyboard: tick “Let NAVI restart the keyboard into its bootloader” on Firmware → flash (it works after the next flash).',
        'NAVI не разрешено перезагружать эту клавиатуру: отметьте «Разрешить NAVI перезагружать клавиатуру в загрузчик» во вкладке «Прошивка → прошить» (заработает после следующей прошивки).',
      );
      if (project.firmware.bootloaderReboot) {
        phase('restarting');
        const configs = [...generated.files.filter((f) => /config\.h$/.test(f.name)).map((f) => f.text), ...(qmk().ownCode?.files ?? []).filter((f) => /(^|\/)config\.h$/.test(f.path)).map((f) => f.text)];
        const { page, usage } = rawUsageOf(configs);
        const sent = await sendRawPacket(page, usage, bootloaderPacket(), expect);
        check();
        if (sent.sent) {
          const until = Date.now() + REBOOT_WAIT_MS;
          while (Date.now() < until && !inBootloader(scan)) {
            await sleep(POLL_MS);
            check();
            scan = await navi.flash.scan();
          }
          pressWhy = t(
            'The keyboard didn’t restart: its firmware doesn’t answer NAVI’s message yet (the first flash with the tick, or your own raw_hid_receive doesn’t call navi_raw_hid_receive).',
            'Клавиатура не перезагрузилась: её прошивка ещё не отвечает на сообщение NAVI (первая прошивка с этой отметкой, или ваш raw_hid_receive не вызывает navi_raw_hid_receive).',
          );
        } else {
          pressWhy =
            sent.why === 'several'
              ? t('Several keyboards answer on this Raw HID interface and the project doesn’t know its USB ID: NAVI won’t guess which one to restart.', 'На этом интерфейсе Raw HID несколько клавиатур, а USB ID проекту не известен: NAVI не будет угадывать, какую перезагрузить.')
              : t(`No keyboard with the Raw HID interface ${page.toString(16).toUpperCase()}:${usage.toString(16).toUpperCase()} is connected.`, `Не подключена клавиатура с интерфейсом Raw HID ${page.toString(16).toUpperCase()}:${usage.toString(16).toUpperCase()}.`);
        }
      }
      if (!inBootloader(scan)) {
        phase('press', { pressWhy });
        while (!inBootloader(scan)) {
          await sleep(POLL_MS);
          check();
          scan = await navi.flash.scan();
        }
      }
    }

    // 5. Flash (the half with the cable: the one in its bootloader now).
    const target = pickFlashTarget(scan);
    if (target.kind === 'several') stopWith(t('Several boards are in their bootloader: flash the one you mean on Firmware → flash.', 'В загрузчике несколько плат: прошейте нужную во вкладке «Прошивка → прошить».'), { tab: 'flash' });
    if (target.kind === 'none') stopWith(t('The bootloader is gone before flashing: try again.', 'Загрузчик пропал до прошивки: повторите.'), { tab: 'flash' });
    phase('flashing');
    if (target.kind === 'uf2') {
      const { drive } = target;
      await qmk().refreshFirmware();
      // No CURRENT.UF2 of this board in the archive yet: save it now (read-only for the board), before anything is written.
      if (!qmk().firmware.some((f) => f.source === 'backup' && f.boardId === drive.boardId)) {
        phase('backing-up');
        try {
          await navi.flash.backupUf2(drive.root);
        } catch (err) {
          stopWith(t('Couldn’t save the board’s current firmware (CURRENT.UF2), so nothing was flashed. Try again, or save it on Firmware → flash.', 'Не удалось сохранить текущую прошивку платы (CURRENT.UF2), поэтому ничего не прошито. Повторите или сохраните её во вкладке «Прошивка → прошить».'), { detail: err instanceof Error ? err.message : String(err), tab: 'flash' });
        }
        await qmk().refreshFirmware();
        check(); // stopping during the save is safe: nothing was written to the board
        phase('flashing');
      }
      const ok = await navi.flash.checkUf2(fw.id, drive.root);
      if (!ok.ok) stopWith(ok.reason === 'not-uf2' ? t('The built file is not a UF2 firmware.', 'Собранный файл — не прошивка UF2.') : t(`Chip family mismatch: the firmware doesn’t fit board ${drive.boardId}.`, `Не то семейство чипа: прошивка не подходит плате ${drive.boardId}.`), { tab: 'flash' });
      if (ok.unverified) stopWith(t(`Unknown board ${drive.boardId}: flash it on Firmware → flash, where you can confirm it.`, `Неизвестная плата ${drive.boardId}: прошейте её во вкладке «Прошивка → прошить», там это можно подтвердить.`), { tab: 'flash' });
      const res2 = await navi.flash.uf2(fw.id, drive.root);
      if (!res2.driveGone)
        stopWith(t('The board didn’t accept the firmware: its bootloader drive is still there. Unplug it, put it in its bootloader again and flash on Firmware → flash.', 'Плата не приняла прошивку: диск загрузчика остался. Отключите её, снова переведите в загрузчик и прошейте во вкладке «Прошивка → прошить».'), { detail: res2.copyError ?? undefined, tab: 'flash' });
    } else {
      const s = useSettingsStore.getState().settings.qmk;
      const res2 = await navi.flash.qmk({ home: s.home, msys: s.msys, wsl: s.wsl }, fw.id, target.bootloader.type);
      if (res2.code !== 0) stopWith(t(`qmk flash failed (exit code ${res2.code}).`, `qmk flash не удался (код ${res2.code}).`), { detail: res2.output, tab: 'flash' });
    }

    // 6. Back over USB.
    phase('returning');
    const back = await waitForKeyboardBack(expect, () => !alive());
    check();
    if (!back.ok) stopWith(back.text, { tab: 'flash' });
    if (back.back) await useDeviceStore.getState().refresh();
    toast(back.text);
    phase('done');
    await sleep(DONE_SHOWN_MS);
    if (alive() && get().phase === 'done') phase('idle');
  }

  return {
    phase: 'idle',
    since: 0,
    review: [],
    pressWhy: '',
    async run() {
      const p = get().phase;
      if (p !== 'idle' && p !== 'done') return;
      const id = ++runId;
      try {
        await steps(id);
      } catch (err) {
        if (!(err instanceof Stopped)) toast(t('“Build + flash” stopped on an unexpected error.', '«Собрать и прошить» остановилось из-за неожиданной ошибки.'), 'error', { detail: err instanceof Error ? err.message : String(err) });
        if (id === runId) phase('idle', { review: [], pressWhy: '' });
      }
    },
    answerReview(write) {
      reviewAnswer?.(write);
    },
    cancel() {
      const p = get().phase;
      if (p === 'building') void useQmkStore.getState().cancel();
      // Flashing itself is never interrupted halfway: the copy / qmk flash finishes, only the waits stop.
      if (p === 'flashing') return;
      runId++;
      reviewAnswer?.(false);
      phase('idle', { review: [], pressWhy: '' });
    },
  };
});
