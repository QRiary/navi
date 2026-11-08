/**
 * “Build + flash” (the button beside Save): save the project, write the keymap files, build, restart the keyboard into
 * its bootloader (NAVI's Raw HID message when the project's firmware allows it, else the user presses QK_BOOT), flash
 * the half with the cable, wait for it to come back. With firmware.runTests the firmware tests run after the write
 * and before the build: anything but a pass stops the run. Each step is the same call the Firmware tabs make; the only
 * question asked is the diff of a file that isn't what NAVI wrote last (edited outside NAVI). Any refusal or failure
 * stops the run with a toast that leads to the tab where it can be fixed.
 */
import { create } from 'zustand';
import { bootloaderPacket, rawUsageOf } from '../core/qmk/bootloaderReboot';
import { navi, type CompileResult, type FirmwareInfo, type KeymapTestFailure } from '../desktop/bridge';
import { sendRawPacket } from '../device/rawHid';
import { t } from '../i18n';
import { generateFiles } from '../lib/firmwareFiles';
import { testsBlocker, testsResultDetail, testsResultSentence } from '../lib/firmwareTests';
import { expectedUsb, hasBoardBackup, inBootloader, noBackupAccepted, pickFlashTarget, planKeymapWrite, waitForKeyboardBack, type KeymapWritePlan } from '../lib/flashSteps';
import { navigate } from '../lib/router';
import { useBehaviorStore } from './behaviorStore';
import { useDeviceStore } from './deviceStore';
import { isDirty, saveProject, useProjectStore } from './projectStore';
import { loadSpec } from '../core/keycodes/spec';
import { useQmkStore } from './qmkStore';
import { useSettingsStore } from './settingsStore';
import { toast } from './toastStore';

export type BuildFlashPhase = 'idle' | 'saving' | 'review' | 'tests-failed' | 'writing' | 'testing' | 'building' | 'restarting' | 'press' | 'backing-up' | 'flashing' | 'returning' | 'done';

export interface BuildFlashState {
  phase: BuildFlashPhase;
  /** When the current phase started (the button shows the build's elapsed time). */
  since: number;
  /** Phase `review`: the files edited outside NAVI that the write would overwrite. */
  review: KeymapWritePlan['review'];
  /** Phase `tests-failed`: the keymap's own tests failed in the build (the cases; `more` = how many are not listed). */
  testFailures: { failures: KeymapTestFailure[]; more: number } | null;
  /** Phase `press`: why NAVI couldn't restart the keyboard itself (shown as the button's tooltip). */
  pressWhy: string;
  run(): Promise<void>;
  /** The review dialog's answer: true = write them. */
  answerReview(write: boolean): void;
  /** The tests-failed dialog's answer: true = accept the new results and build again. */
  answerTests(accept: boolean): void;
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
let testsAnswer: ((accept: boolean) => void) | null = null;

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
    // The files on disk are this project's now: the baseline of "behavior changes since the last build".
    void useBehaviorStore.getState().record(project);

    // 3. Firmware tests: a key that types something else stops the run before the keyboard is touched.
    if (project.firmware.runTests) {
      const blocked = testsBlocker(project, env.runner);
      if (blocked) stopWith(t(`The firmware tests can’t run, so nothing was built: ${blocked}`, `Тесты прошивки не запускаются, поэтому ничего не собрано: ${blocked}`), { tab: 'flash' });
      phase('testing');
      const tests = await qmk().runTests(project);
      check();
      if (!tests) stopWith(qmk().error ?? t('The firmware tests didn’t start.', 'Тесты прошивки не запустились.'), { detail: qmk().errorDetail ?? undefined, tab: 'flash' });
      if (tests.status !== 'pass') stopWith(`${testsResultSentence(tests)} ${t('Nothing was flashed.', 'Ничего не прошито.')}`, { detail: testsResultDetail(tests), tab: 'flash' });
    }

    // 4. Build.
    phase('building');
    const build = project.firmware.build ?? {};
    let res: CompileResult | null = await qmk().compile(kb, km, build.env ?? {}, build.parallel);
    check();
    // The keymap's own tests failed: ask once whether the new results are meant; accepting rebuilds with the make variable.
    if (res && res.code !== 0 && res.keymapTests?.failures.length) {
      phase('tests-failed', { testFailures: res.keymapTests });
      const accept = await new Promise<boolean>((resolve) => (testsAnswer = resolve));
      testsAnswer = null;
      check();
      if (!accept) throw new Stopped();
      phase('building', { testFailures: null });
      res = await qmk().compile(kb, km, build.env ?? {}, build.parallel, { acceptTests: true });
      check();
    }
    if (!res) stopWith(qmk().error ?? t('The build didn’t start.', 'Сборка не запустилась.'), { detail: qmk().errorDetail ?? undefined, tab: 'build' });
    if (res.code !== 0 && res.keymapTests) stopWith(t('The keymap’s own tests failed: see the build log.', 'Собственные тесты раскладки не прошли: смотрите лог сборки.'), { tab: 'build' });
    if (res.code !== 0) stopWith(t(`The build failed (exit code ${res.code}): see the build log.`, `Сборка не удалась (код ${res.code}): смотрите лог сборки.`), { tab: 'build' });
    if (!res.firmware) stopWith(t('The build finished, but NAVI found no firmware file it made.', 'Сборка закончилась, но NAVI не нашёл созданного ею файла прошивки.'), { tab: 'build' });
    const fw: FirmwareInfo = res.firmware;

    // 5. Into the bootloader.
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

    // 6. Flash (the half with the cable: the one in its bootloader now).
    const target = pickFlashTarget(scan);
    if (target.kind === 'several') stopWith(t('Several boards are in their bootloader: flash the one you mean on Firmware → flash.', 'В загрузчике несколько плат: прошейте нужную во вкладке «Прошивка → прошить».'), { tab: 'flash' });
    if (target.kind === 'none') stopWith(t('The bootloader is gone before flashing: try again.', 'Загрузчик пропал до прошивки: повторите.'), { tab: 'flash' });
    phase('flashing');
    if (target.kind === 'uf2') {
      const { drive } = target;
      await qmk().refreshFirmware();
      // A bootloader that shows no CURRENT.UF2 (the RP2040 / RP2350 ROM) can't save the current firmware. Without a
      // backup in the archive (a picotool copy added on Firmware → flash), the first flash is never done silently:
      // it may be a seller's firmware with no source. Firmware → flash asks once (“flash anyway”); after that, not here.
      if (!drive.current && !hasBoardBackup(qmk().firmware, drive.boardId) && !noBackupAccepted(drive.boardId)) {
        stopWith(
          t(
            'Nothing was flashed: this board’s current firmware isn’t saved, and its bootloader can’t save it (no CURRENT.UF2). If it may be a seller’s firmware you’d want back, save every half with picotool (picotool save -a half.uf2) and add the copies on Firmware → flash (“add a saved copy…”). If you don’t need it, flash once on Firmware → flash; after that “build + flash” won’t ask. To leave the bootloader, unplug the half and plug it back in.',
            'Ничего не прошито: текущая прошивка этой платы не сохранена, а её загрузчик сохранить её не умеет (нет CURRENT.UF2). Если это может быть прошивка продавца, которую захочется вернуть, сохраните каждую половину программой picotool (picotool save -a half.uf2) и добавьте копии во вкладке «Прошивка → прошить» («добавить сохранённую копию…»). Если она не нужна, прошейте один раз во вкладке «Прошивка → прошить» — после этого «Собрать и прошить» спрашивать не будет. Чтобы выйти из загрузчика, отключите половину и подключите снова.',
          ),
          { tab: 'flash' },
        );
      }
      // No CURRENT.UF2 of this board in the archive yet: save it now (read-only for the board), before anything is
      // written.
      if (drive.current && !hasBoardBackup(qmk().firmware, drive.boardId)) {
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

    // 7. Back over USB.
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
    testFailures: null,
    pressWhy: '',
    async run() {
      const p = get().phase;
      if (p !== 'idle' && p !== 'done') return;
      const id = ++runId;
      try {
        await steps(id);
      } catch (err) {
        if (!(err instanceof Stopped)) toast(t('“Build + flash” stopped on an unexpected error.', '«Собрать и прошить» остановилось из-за неожиданной ошибки.'), 'error', { detail: err instanceof Error ? err.message : String(err) });
        if (id === runId) phase('idle', { review: [], testFailures: null, pressWhy: '' });
      }
    },
    answerReview(write) {
      reviewAnswer?.(write);
    },
    answerTests(accept) {
      testsAnswer?.(accept);
    },
    cancel() {
      const p = get().phase;
      if (p === 'building' || p === 'testing') void useQmkStore.getState().cancel();
      // Flashing itself is never interrupted halfway: the copy / qmk flash finishes, only the waits stop.
      if (p === 'flashing') return;
      runId++;
      reviewAnswer?.(false);
      testsAnswer?.(false);
      phase('idle', { review: [], testFailures: null, pressWhy: '' });
    },
  };
});
