/**
 * “Run the firmware tests before flashing” (firmware.runTests) and a button that runs them now: navi_tests.txt played
 * in QMK's unit test framework (electron/firmwareTests.cjs). The result shows here; the run's output in the log below
 * the tab (FlashTab).
 */
import { FlaskConical } from 'lucide-react';
import type { Project } from '../../core/project/types';
import { useProjectStore } from '../../store/projectStore';
import { useQmkStore } from '../../store/qmkStore';
import { t } from '../../i18n';
import { testsBlocker, testsResultSentence } from '../../lib/firmwareTests';
import { whyDisabled } from '../../lib/whyDisabled';
import { toast } from '../../store/toastStore';
import { InfoTip } from '../InfoTip';
import { findAttr } from '../../lib/find';

export function FirmwareTestsRow({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const runner = useQmkStore((s) => s.env?.runner);
  const job = useQmkStore((s) => s.job);
  const lastTests = useQmkStore((s) => s.lastTests);
  const runTests = useQmkStore((s) => s.runTests);
  const on = project.firmware.runTests;
  const blocker = testsBlocker(project, runner);
  const title = t('Run the firmware tests before flashing', 'Запускать тесты прошивки перед прошивкой');
  const busy = !!job?.running;
  const noTarget = !project.firmware.keyboard && t('Choose the keyboard target first (Firmware → target).', 'Сначала выберите target клавиатуры («Прошивка → target»).');
  const run = async () => {
    if ((await runTests(project)) === null) {
      const q = useQmkStore.getState();
      toast(q.error ?? t('The firmware tests didn’t start.', 'Тесты прошивки не запустились.'), 'error', { detail: q.errorDetail ?? undefined });
    }
  };
  const result = lastTests &&!(job?.kind === 'tests' && job.running) ? testsResultSentence(lastTests) : null;
  return (
    <>
      <div className="row" {...findAttr('setting:firmware.runTests')} style={{ ['--row-cols' as string]: 'minmax(0,1.3fr) minmax(0,1fr) auto' }}>
        <span>
          {title}{' '}
          <InfoTip label={title}>
            {t(
              '“Build + flash” first builds the keymap into QMK’s unit test framework and plays navi_tests.txt; a key that types something else stops it before the keyboard is touched. The tests run the keymap’s code, your own C included, as a program on this PC, so they are refused wherever a build would be.',
              '«Собрать и прошить» сначала собирает раскладку во фреймворк юнит-тестов QMK и проигрывает navi_tests.txt; клавиша, которая печатает другое, останавливает его до того, как клавиатура затронута. Тесты запускают код раскладки, ваш C тоже, как программу на этом компьютере, поэтому они отменяются везде, где отменилась бы сборка.',
            )}
          </InfoTip>
        </span>
        <code className="kicker">{t('NAVI (test build on this PC)', 'NAVI (тестовая сборка на этом ПК)')}</code>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={on}
            {...whyDisabled(!on && blocker)}
            onChange={(e) => apply((p) => ({ ...p, firmware: { ...p.firmware, runTests: e.target.checked } }), title)}
            aria-label={title}
          />
        </label>
      </div>
      <div className="field-row">
        <button className="btn" {...whyDisabled(blocker || noTarget || (busy && t('Wait: a QMK job is running', 'Подождите: идёт задача QMK')))} onClick={() => void run()}>
          <FlaskConical size={14} strokeWidth={1.5} /> {t('Run firmware tests', 'Запустить тесты прошивки')}
        </button>
        {job?.kind === 'tests' && job.running && <span className="kicker">{t('building and playing the tests…', 'собираю и проигрываю тесты…')}</span>}
        {result && <span className={lastTests?.status === 'pass' ? 'kicker' : 'field-hint'}>{result}</span>}
        {on && blocker && <span className="field-hint">{blocker}</span>}
      </div>
    </>
  );
}
