/**
 * Firmware → build: a real `qmk compile -kb … -km …`, the full log, errors with file and line,
 * the built file goes to the firmware archive.
 * The files in the keymap folder are built: if they differ from the project —
 * a warning and a confirmation (otherwise it is easy to flash an old keymap).
 */
import { useState } from 'react';
import { Hammer, Plus, X } from 'lucide-react';
import { patchProject } from '../../core/project/ops';
import { allowedMakeVar, MAKE_VALUE_RE } from '../../core/qmk/customCode';
import { QMK_DOCS } from '../../lib/qmkDocs';
import { href } from '../../lib/router';
import { whyDisabled } from '../../lib/whyDisabled';
import { Hint } from '../InfoTip';
import { EmptyState } from '../EmptyState';
import { ErrorDetails } from '../ErrorDetails';
import { useProjectStore } from '../../store/projectStore';
import { autoJobs, useQmkStore } from '../../store/qmkStore';
import { BuildLog } from './BuildLog';
import { KeymapTestFailures } from './KeymapTestFailures';
import { useGenerated } from './FilesTab';
import { t } from '../../i18n';

export function BuildTab() {
  const project = useProjectStore((s) => s.project);
  const env = useQmkStore((s) => s.env);
  const job = useQmkStore((s) => s.job);
  const keymapSources = useQmkStore((s) => s.keymapSources);
  const compile = useQmkStore((s) => s.compile);
  const last = useQmkStore((s) => s.lastCompile);
  const error = useQmkStore((s) => s.error);
  const errorDetail = useQmkStore((s) => s.errorDetail);
  const apply = useProjectStore((s) => s.apply);
  const [optKey, setOptKey] = useState('');
  const [optValue, setOptValue] = useState('');
  const [confirmStale, setConfirmStale] = useState(false);
  const generated = useGenerated();
  if (!project) return null;
  // The files on disk differ from what the project gives now.
  const stale = !!generated && !!keymapSources?.exists && generated.files.some((g) => (keymapSources.files.find((x) => x.name === g.name)?.text ?? null) !== g.text);
  const build = project.firmware.build ?? {};
  const buildEnv = build.env ?? {};
  const setBuild = (next: typeof build, label: string) => apply((p) => patchProject(p, { firmware: { ...p.firmware, build: next } }), label);
  const keyOk = allowedMakeVar(optKey) && optKey !== 'SRC' && optKey !== 'INTROSPECTION_KEYMAP_C';
  const valueOk = MAKE_VALUE_RE.test(optValue);
  const kb = project.firmware.keyboard;
  const ready = !!env?.runner && !!env.homeValid && !!kb;
  const running = !!job?.running;
  return (
    <div className="page">
      <div className="toolbar">
        <span className="kicker">
          {kb
            ? `qmk compile -kb ${kb} -km ${project.firmware.keymap} -j ${build.parallel ?? autoJobs()}${Object.entries(buildEnv)
                .map(([k, v]) => ` -e ${k}=${v}`)
                .join('')}`
            : t('choose a keyboard target first', 'сначала выберите target')}
        </span>
        <div className="toolbar-actions">
          <button
            className={`btn btn--primary ${stale && confirmStale ? 'btn--danger' : ''}`}
            {...whyDisabled(
              (!env?.runner && t('QMK CLI not found: see the “setup” tab', 'QMK CLI не найден: смотрите вкладку «окружение»')) ||
                (!env?.homeValid && t('qmk_firmware not found: see the “setup” tab', 'qmk_firmware не найден: смотрите вкладку «окружение»')) ||
                (!kb && t('Choose a keyboard target first (“target” tab)', 'Сначала выберите target клавиатуры (вкладка «target»)')) ||
                (running && t('Wait: the build is running', 'Подождите: идёт сборка')),
            )}
            onClick={() => {
              if (stale && !confirmStale) {
                setConfirmStale(true);
                return;
              }
              setConfirmStale(false);
              void compile(kb!, project.firmware.keymap, buildEnv, build.parallel);
            }}
          >
            <Hammer size={14} strokeWidth={1.5} />{' '}
            {running ? t('building…', 'сборка…') : stale && confirmStale ? t('build the files on disk anyway', 'всё равно собрать файлы с диска') : t('build firmware', 'собрать прошивку')}
          </button>
        </div>
      </div>
      <div className="panel-box" style={{ marginBottom: 'var(--gap)' }}>
        <div className="panel-box-head">
          <span className="cell-label">
            <Hint
              docs={QMK_DOCS.configOptions}
              tip={t(
                'Extra settings given to the QMK build as KEY=VALUE (for example CONSOLE_ENABLE=yes), on top of the generated rules.mk. They apply to this build only.',
                'Дополнительные настройки сборки QMK в виде KEY=VALUE (например, CONSOLE_ENABLE=yes) поверх сгенерированного rules.mk. Действуют только на эту сборку.',
              )}
            >
              {t('build options', 'параметры сборки')}
            </Hint>
          </span>
          <label className="field-hint">
            <Hint
              tip={t(
                'How many files the compiler builds at once (make -j). More is faster but uses more CPU and memory; auto picks a value for this computer.',
                'Сколько файлов компилятор собирает одновременно (make -j). Больше — быстрее, но сильнее грузит процессор и память; авто подбирает значение для этого компьютера.',
              )}
            >
              {t('parallel jobs', 'параллельно')}
            </Hint>{' '}
            <select className="select" value={build.parallel ?? 0} onChange={(e) => setBuild({ ...build, parallel: Number(e.target.value) || undefined }, t('build jobs', 'параллельная сборка'))}>
              <option value={0}>
                {t('auto', 'авто')} · -j {autoJobs()}
              </option>
              {[1, 2, 4, 8, 16].map((n) => (
                <option key={n} value={n}>
                  -j {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="panel-box-body field">
          <span className="field-hint">
            {t(
              'Extra make variables (qmk compile -e KEY=VALUE), e.g. CONSOLE_ENABLE=yes. Only feature flags and drivers — tool variables (CC, SHELL…) could run programs.',
              'Дополнительные переменные make (qmk compile -e КЛЮЧ=ЗНАЧЕНИЕ), например CONSOLE_ENABLE=yes. Только флаги и драйверы — переменные инструментов (CC, SHELL…) могли бы запускать программы.',
            )}
          </span>
          {Object.keys(buildEnv).length === 0 && (
            <EmptyState
              what={t('No extra variables: the build uses only the keymap’s rules.mk.', 'Дополнительных переменных нет: сборка берёт только rules.mk раскладки.')}
              example={t('CONSOLE_ENABLE=yes for one debug build, without changing rules.mk.', 'CONSOLE_ENABLE=yes для одной отладочной сборки, не меняя rules.mk.')}
            />
          )}
          <div className="chips" style={Object.keys(buildEnv).length === 0 ? { display: 'none' } : undefined}>
            {Object.entries(buildEnv).map(([k, v]) => (
              <span key={k} className="chip">
                {k}={v}{' '}
                <button
                  aria-label={t('Remove', 'Убрать')}
                  onClick={() => setBuild({ ...build, env: Object.fromEntries(Object.entries(buildEnv).filter(([x]) => x !== k)) }, t('build option', 'параметр сборки'))}
                >
                  <X size={11} strokeWidth={1.5} />
                </button>
              </span>
            ))}
          </div>
          <div className="field-row">
            <input className="input" style={{ width: 200 }} placeholder="KEY" value={optKey} onChange={(e) => setOptKey(e.target.value.toUpperCase())} aria-label={t('Option name', 'Имя параметра')} />
            <span>=</span>
            <input className="input" style={{ width: 140 }} placeholder="yes" value={optValue} onChange={(e) => setOptValue(e.target.value)} aria-label={t('Option value', 'Значение')} />
            <button
              className="btn"
              {...whyDisabled(
                (!optKey && t('Type an option name first', 'Сначала введите имя параметра')) ||
                  (!keyOk && t('This option name is not allowed (see the list below)', 'Это имя параметра не разрешено (список ниже)')) ||
                  (!valueOk && t('The value must be one word: letters, digits, _', 'Значение — одно слово: буквы, цифры, _')),
              )}
              onClick={() => {
                setBuild({ ...build, env: { ...buildEnv, [optKey]: optValue } }, t('build option', 'параметр сборки'));
                setOptKey('');
                setOptValue('');
              }}
            >
              <Plus size={14} strokeWidth={1.5} /> {t('add', 'добавить')}
            </button>
            {optKey && !keyOk && (
              <span className="field-hint" style={{ color: 'var(--danger-color)' }}>
                {t('only …_ENABLE, …_DRIVER, …_TYPE, CONVERT_TO, SPLIT_KEYBOARD, BOOTLOADER', 'только …_ENABLE, …_DRIVER, …_TYPE, CONVERT_TO, SPLIT_KEYBOARD, BOOTLOADER')}
              </span>
            )}
            {optValue && !valueOk && (
              <span className="field-hint" style={{ color: 'var(--danger-color)' }}>
                {t('one word: letters, digits, _', 'одно слово: буквы, цифры, _')}
              </span>
            )}
          </div>
        </div>
      </div>
      {!ready && (
        <div className="notice" role="status">
          <span>
            {!env?.runner || !env?.homeValid ? (
              <a href={href({ section: 'firmware', tab: 'setup' })}>{t('Set up QMK (environment)', 'Настройте QMK (окружение)')}</a>
            ) : (
              <a href={href({ section: 'firmware', tab: 'target' })}>{t('Choose a keyboard target', 'Выберите target клавиатуры')}</a>
            )}
          </span>
        </div>
      )}
      {ready && stale && (
        <div className="notice" role="alert" style={{ borderColor: 'var(--danger-color)' }}>
          <span>
            {t(
              'The files in the keymap folder differ from the project — the build uses the files on disk, not the project.',
              'Файлы в папке keymap отличаются от проекта — собираются файлы с диска, а не проект.',
            )}{' '}
            <a href={href({ section: 'firmware', tab: 'files' })}>{t('Write the project files first →', 'Сначала запишите файлы проекта →')}</a>
          </span>
        </div>
      )}
      {ready && !keymapSources?.exists && (
        <p className="field-hint">{t('The keymap folder does not exist yet — write the files first (tab “files”).', 'Папки keymap ещё нет — сначала запишите файлы (вкладка «файлы»).')}</p>
      )}
      {error && (
        <div className="field-hint" role="alert">
          <span style={{ color: 'var(--danger-color)' }}>{error}</span>
          <ErrorDetails text={errorDetail} />
        </div>
      )}
      {last && !running && (
        <div className="notice" role={last.code === 0 ? 'status' : 'alert'} style={{ borderColor: last.code === 0 ? 'var(--meter-to)' : 'var(--danger-color)' }}>
          <span>
            {last.code === 0
              ? last.firmware
                ? t(
                    `Built in ${Math.round(last.durationMs / 1000)} s: ${last.firmware.file} (${Math.round(last.firmware.size / 1024)} KB) — saved to the firmware archive.`,
                    `Собрано за ${Math.round(last.durationMs / 1000)} с: ${last.firmware.file} (${Math.round(last.firmware.size / 1024)} КБ) — сохранено в архив прошивок.`,
                  )
                : t('qmk compile finished, but the firmware file was not found.', 'qmk compile завершился, но файл прошивки не найден.')
              : t(`Build failed (exit code ${last.code}). See the errors above the log.`, `Сборка не удалась (код ${last.code}). Ошибки — над логом.`)}{' '}
            {last.firmware && <a href={href({ section: 'firmware', tab: 'flash' })}>{t('→ flash', '→ прошить')}</a>}
          </span>
        </div>
      )}
      {last && !running && last.code !== 0 && !!last.keymapTests?.failures.length && (
        <div>
          <p className="field-hint">
            {t(
              'Your keymap’s own tests expected something else from these keys. If you changed them on purpose, accept the new results: the tests are updated and the build goes on.',
              'Собственные тесты вашей раскладки ждали от этих клавиш другого. Если вы изменили их намеренно, примите новые результаты: тесты обновятся, и сборка продолжится.',
            )}
          </p>
          <KeymapTestFailures failures={last.keymapTests.failures} more={last.keymapTests.more} />
          <button
            className="btn btn--primary"
            {...whyDisabled(running && t('Wait: the build is running', 'Подождите: идёт сборка'))}
            onClick={() => void compile(kb!, project.firmware.keymap, buildEnv, build.parallel, { acceptTests: true })}
          >
            <Hammer size={14} strokeWidth={1.5} /> {t('accept new results and build', 'принять новые результаты и собрать')}
          </button>
        </div>
      )}
      {(job?.kind === 'compile' || last) && <BuildLog />}
    </div>
  );
}
