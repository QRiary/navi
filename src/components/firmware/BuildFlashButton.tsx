/**
 * “Build + flash” beside Save (src/store/buildFlashStore.ts runs the steps). The button itself shows the step; a
 * cancel button sits beside it while a step can be stopped. A file edited outside NAVI opens its diff first.
 */
import { useEffect, useState } from 'react';
import { Check, X, Zap } from 'lucide-react';
import { diffLines } from '../../core/qmk/textDiff';
import { navi } from '../../desktop/bridge';
import { t } from '../../i18n';
import { whyDisabled } from '../../lib/whyDisabled';
import { useBuildFlashStore, type BuildFlashPhase } from '../../store/buildFlashStore';
import { useProjectStore } from '../../store/projectStore';
import { useQmkStore } from '../../store/qmkStore';
import { Modal } from '../Modal';
import { KeymapTestFailures } from './KeymapTestFailures';
import { TextDiff } from './TextDiff';

const ICON = { size: 14, strokeWidth: 1.5 };

const elapsed = (since: number) => {
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function label(phase: BuildFlashPhase, since: number): string {
  switch (phase) {
    case 'saving':
      return t('saving…', 'сохранение…');
    case 'review':
      return t('check the files', 'проверьте файлы');
    case 'tests-failed':
      return t('keymap tests failed', 'тесты раскладки не прошли');
    case 'writing':
      return t('writing files…', 'запись файлов…');
    case 'testing':
      return `${t('testing', 'тесты')} ${elapsed(since)}`;
    case 'building':
      return `${t('building', 'сборка')} ${elapsed(since)}`;
    case 'restarting':
      return t('restarting the keyboard…', 'перезагрузка клавиатуры…');
    case 'press':
      return t('press QK_BOOT', 'нажмите QK_BOOT');
    case 'backing-up':
      return t('saving current firmware…', 'сохраняю текущую прошивку…');
    case 'flashing':
      return t('flashing…', 'прошивка…');
    case 'returning':
      return t('waiting for the keyboard…', 'жду клавиатуру…');
    case 'done':
      return t('flashed', 'прошито');
    default:
      return t('build + flash', 'собрать и прошить');
  }
}

export function BuildFlashButton() {
  const project = useProjectStore((s) => s.project);
  const env = useQmkStore((s) => s.env);
  const job = useQmkStore((s) => s.job);
  const detecting = useQmkStore((s) => s.detecting);
  const { phase, since, pressWhy, run, cancel } = useBuildFlashStore();
  const [, tick] = useState(0);
  // The button is on every page, so it finds QMK itself at start (before, only opening Firmware did).
  useEffect(() => {
    const q = useQmkStore.getState();
    if (navi && !q.env && !q.detecting) void q.detect();
  }, []);
  useEffect(() => {
    if (phase !== 'building' && phase !== 'testing') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  if (!navi || !project) return null;
  const running = phase !== 'idle' && phase !== 'done';
  const kb = project.firmware.keyboard;
  const reason =
    (!env && detecting && t('Checking the QMK setup…', 'Проверяю установку QMK…')) ||
    (!env?.runner && t('QMK CLI not found: see Firmware → setup', 'QMK CLI не найден: смотрите «Прошивка → окружение»')) ||
    (!env?.homeValid && t('qmk_firmware not found: see Firmware → setup', 'qmk_firmware не найден: смотрите «Прошивка → окружение»')) ||
    (!kb && t('Choose a keyboard target first (Firmware → target)', 'Сначала выберите target клавиатуры («Прошивка → target»)')) ||
    (!running && job?.running && t('Wait: a QMK command is running', 'Подождите: выполняется команда QMK'));
  const title =
    phase === 'press'
      ? `${pressWhy} ${t('Press QK_BOOT (or the reset button) on the half with the cable: NAVI flashes as soon as the bootloader shows up.', 'Нажмите QK_BOOT (или кнопку reset) на половине с кабелем: NAVI прошьёт, как только появится загрузчик.')}`
      : t(
          'Save the project, write the keymap files, build and flash the half with the cable. NAVI asks only when a file was edited outside NAVI (it shows the diff first). With “Let NAVI restart the keyboard into its bootloader” (Firmware → flash) no key press is needed.',
          'Сохранить проект, записать файлы keymap, собрать и прошить половину с кабелем. NAVI спрашивает, только если файл правили вне NAVI (сначала покажет разницу). С «Разрешить NAVI перезагружать клавиатуру в загрузчик» («Прошивка → прошить») нажимать клавишу не нужно.',
        );
  return (
    <>
      <button
        className={`btn ${phase === 'press' ? 'btn--primary' : ''}`}
        aria-live="polite"
        // While it runs the button shows the step and a click does nothing (run() ignores it): not greyed out, so
        // “press QK_BOOT” stays easy to see.
        {...whyDisabled(!running && reason, running && phase !== 'press' ? label(phase, since) : title)}
        onClick={() => void run()}
      >
        {phase === 'done' ? <Check {...ICON} /> : <Zap {...ICON} />} {label(phase, since)}
      </button>
      {running && phase !== 'flashing' && phase !== 'review' && phase !== 'tests-failed' && (
        <button className="icon-btn" aria-label={t('Stop “build + flash”', 'Остановить «собрать и прошить»')} title={t('Stop “build + flash”', 'Остановить «собрать и прошить»')} onClick={cancel}>
          <X {...ICON} />
        </button>
      )}
      {phase === 'review' && <ReviewDialog />}
      {phase === 'tests-failed' && <TestsFailedDialog />}
    </>
  );
}

/** The keymap's own tests failed in the build: their cases, and a way to accept the new results and build on. */
function TestsFailedDialog() {
  const failed = useBuildFlashStore((s) => s.testFailures);
  const answer = useBuildFlashStore((s) => s.answerTests);
  return (
    <Modal
      title={t('the keymap’s tests failed', 'тесты раскладки не прошли')}
      onClose={() => answer(false)}
      footer={
        <>
          <button className="btn" onClick={() => answer(false)}>
            {t('stop', 'остановить')}
          </button>
          <button className="btn btn--primary" onClick={() => answer(true)}>
            {t('accept new results and build', 'принять новые результаты и собрать')}
          </button>
        </>
      }
    >
      <p className="field-hint">
        {t(
          'Your keymap’s own tests expected something else from these keys. If you changed them on purpose, accept the new results: the tests are updated and the build goes on.',
          'Собственные тесты вашей раскладки ждали от этих клавиш другого. Если вы изменили их намеренно, примите новые результаты: тесты обновятся, и сборка продолжится.',
        )}
      </p>
      {failed && <KeymapTestFailures failures={failed.failures} more={failed.more} />}
    </Modal>
  );
}

/** The files on disk that aren't what NAVI wrote last: their diff before NAVI overwrites them (the old copies go to backups). */
function ReviewDialog() {
  const review = useBuildFlashStore((s) => s.review);
  const answer = useBuildFlashStore((s) => s.answerReview);
  const dir = useQmkStore((s) => s.keymapSources?.dir);
  return (
    <Modal
      title={t('files changed outside NAVI', 'файлы изменены вне NAVI')}
      onClose={() => answer(false)}
      footer={
        <>
          <button className="btn" onClick={() => answer(false)}>
            {t('stop', 'остановить')}
          </button>
          <button className="btn btn--primary" onClick={() => answer(true)}>
            {t('write, build and flash', 'записать, собрать и прошить')}
          </button>
        </>
      }
    >
      <p className="field-hint">
        {t('These files in', 'Эти файлы в')} <code style={{ overflowWrap: 'anywhere' }}>{dir}</code>{' '}
        {t(
          'are not what NAVI wrote last: someone edited them outside NAVI. Writing replaces them with the project’s version (the old copies go to backups).',
          'не совпадают с тем, что NAVI записал последним: их правили вне NAVI. Запись заменит их версией из проекта (старые копии — в резервную папку).',
        )}
      </p>
      {review.map((f) => (
        <section key={f.name}>
          <strong>{f.name}</strong>
          <TextDiff lines={diffLines(f.before, f.after)} />
        </section>
      ))}
    </Modal>
  );
}
