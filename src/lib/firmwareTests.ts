/**
 * Firmware tests in the interface: why they can't run, and a result as a sentence and as raw details.
 * The runner is electron/firmwareTests.cjs (docs/firmware-tests.md → NAVI's runner).
 */
import type { Project } from '../core/project/types';
import type { FirmwareTestResult, QmkEnvironment } from '../desktop/bridge';
import { t } from '../i18n';

const onWindows = () => typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

/** Why the tests can't run for this project and QMK runner (null = they can): the tick's and the button's reason. */
export function testsBlocker(project: Project, runner: QmkEnvironment['runner'] | undefined, windows = onWindows()): string | null {
  if (!project.firmware.tests) return t('Needs “write firmware tests” on Firmware → keymap files.', 'Нужна отметка «писать тесты прошивки» во вкладке «Прошивка → файлы keymap».');
  if (runner && (runner.kind === 'msys' || (runner.kind === 'path' && windows)))
    return t('Needs QMK in WSL or on Linux: QMK MSYS can’t build QMK’s unit tests.', 'Нужен QMK в WSL или на Linux: QMK MSYS не собирает юнит-тесты QMK.');
  if (project.firmware.customReview)
    return t('The imported own code isn’t allowed yet (Firmware → keymap files): the tests would run it on this PC.', 'Импортированный свой код ещё не разрешён («Прошивка → файлы keymap»): тесты запустили бы его на этом компьютере.');
  return null;
}

/** Why the main process refused a run (qmk.cjs runFirmwareTests), as a sentence. */
export function testsRefusalSentence(raw: string): string {
  if (raw.includes('own code that is not allowed yet'))
    return t('The tests were refused: the imported own code isn’t allowed yet (Firmware → keymap files).', 'Тесты отменены: импортированный свой код ещё не разрешён («Прошивка → файлы keymap»).');
  if (raw.includes('code NAVI did not generate from the project'))
    return t(
      'The tests were refused: the keymap folder has code NAVI didn’t generate from the project (your own lines or files), and the tests would run it as a program on this PC. Trust the folder (Firmware → flash, next to “Run firmware tests”) only if you know this code.',
      'Тесты отменены: в папке keymap есть код, который NAVI не генерировала из проекта (ваши строки или файлы), а тесты запустили бы его как программу на этом компьютере. Доверьте папку («Прошивка → прошить», рядом с «Запустить тесты прошивки»), только если знаете этот код.',
    );
  if (raw.includes('outside what NAVI can check as safe to build'))
    return t(
      'The tests were refused: the keymap folder has files NAVI can’t check as safe, and the tests would run them on this PC. Fix them, or trust the folder if you know this code.',
      'Тесты отменены: в папке keymap есть файлы, безопасность которых NAVI проверить не может, а тесты запустили бы их на этом компьютере. Исправьте их или доверьте папку, если знаете этот код.',
    );
  if (/did not print the build command|QMK would build|QMK uses userspace/.test(raw))
    return t('The tests were refused: QMK would build a different keymap folder than the one NAVI shows.', 'Тесты отменены: QMK собрал бы другую папку keymap, не ту, что показывает NAVI.');
  return t('The firmware tests didn’t start.', 'Тесты прошивки не запустились.');
}

/** The result as one sentence. */
export function testsResultSentence(r: FirmwareTestResult): string {
  switch (r.status) {
    case 'pass':
      return t(`Firmware tests passed: ${r.passed} of ${r.passed}.`, `Тесты прошивки прошли: ${r.passed} из ${r.passed}.`);
    case 'fail':
      return t(`Firmware tests failed: ${r.failed} of ${r.passed + r.failed} typed something else.`, `Тесты прошивки не прошли: ${r.failed} из ${r.passed + r.failed} напечатали другое.`);
    case 'cant-build':
      return t('The firmware tests can’t build: see the errors.', 'Тесты прошивки не собираются: смотрите ошибки.');
    case 'unsupported':
      return t('The firmware tests need QMK in WSL or on Linux.', 'Для тестов прошивки нужен QMK в WSL или на Linux.');
    case 'no-tests':
      return t('No navi_tests.txt in the keymap folder: write the files with “write firmware tests” on.', 'В папке keymap нет navi_tests.txt: запишите файлы с отметкой «писать тесты прошивки».');
    case 'error':
      return t(`The firmware tests didn’t finish: ${r.message}.`, `Тесты прошивки не завершились: ${r.message}.`);
  }
}

/** The raw details behind the sentence: the mismatches, the compiler errors or the run's last lines. */
export function testsResultDetail(r: FirmwareTestResult): string | undefined {
  if (r.status === 'fail') return r.failures.join('\n');
  if (r.status === 'cant-build') return r.errors.join('\n');
  if (r.status === 'error') return r.tail;
  return undefined;
}
