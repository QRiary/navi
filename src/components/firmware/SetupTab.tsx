/**
 * Firmware → environment: where the QMK CLI is (QMK MSYS or qmk in PATH), where qmk_firmware is, the version.
 * If something is missing — what to install and how (without faking a build).
 */
import { useEffect } from 'react';
import { ExternalLink, RefreshCw, Stethoscope } from 'lucide-react';
import { navi } from '../../desktop/bridge';
import { useQmkStore } from '../../store/qmkStore';
import { useSettingsStore } from '../../store/settingsStore';
import { t } from '../../i18n';
import { QMK_DOCS } from '../../lib/qmkDocs';
import { whyDisabled } from '../../lib/whyDisabled';
import { EmptyState } from '../EmptyState';
import { Hint } from '../InfoTip';
import { BuildLog } from './BuildLog';

const ICON = { size: 14, strokeWidth: 1.5 };

/** `active`: the tab is shown (Firmware keeps visited tabs mounted). */
export function SetupTab({ active = true }: { active?: boolean }) {
  const env = useQmkStore((s) => s.env);
  const detecting = useQmkStore((s) => s.detecting);
  const detect = useQmkStore((s) => s.detect);
  const runDiagnostic = useQmkStore((s) => s.runDiagnostic);
  const job = useQmkStore((s) => s.job);
  const qmk = useSettingsStore((s) => s.settings.qmk);
  const setValue = useSettingsStore((s) => s.setValue);

  const trustedFolders = useQmkStore((s) => s.trustedFolders);
  const loadTrustedFolders = useQmkStore((s) => s.loadTrustedFolders);
  const revokeTrust = useQmkStore((s) => s.revokeTrust);

  useEffect(() => {
    if (!env && navi) void detect();
  }, [env, detect]);
  // Reread every time the tab is shown (it stays mounted while hidden; a build may have added a folder).
  useEffect(() => {
    if (active) void loadTrustedFolders();
  }, [active, loadTrustedFolders]);

  if (!navi) {
    return (
      <div className="notice" role="status">
        <span>{t('Building and flashing need the desktop app (npm run app).', 'Сборке и прошивке нужно настольное приложение (npm run app).')}</span>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="grid-2">
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">
              <Hint
                docs={QMK_DOCS.gettingStarted}
                tip={t(
                  'What NAVI needs to build firmware: the QMK command line tool (qmk) with its compilers, and the qmk_firmware source folder. On Windows both come with QMK MSYS.',
                  'Что нужно NAVI для сборки прошивки: консольная утилита QMK (qmk) с компиляторами и папка с исходниками qmk_firmware. В Windows и то и другое есть в QMK MSYS.',
                )}
              >
                {t('QMK environment', 'окружение QMK')}
              </Hint>
            </span>
            <button className="btn" {...whyDisabled(detecting && t('Wait: checking…', 'Подождите: идёт проверка…'))} onClick={() => void detect()}>
              <RefreshCw {...ICON} /> {detecting ? t('checking…', 'проверяю…') : t('check again', 'проверить снова')}
            </button>
          </div>
          <div className="panel-box-body field">
            {env ? (
              <dl className="kv">
                <dt>QMK CLI</dt>
                <dd>
                  {env.runner ? (
                    `${env.cliVersion ?? '?'} · ${env.runner.kind === 'msys' ? 'QMK MSYS' : env.runner.kind === 'wsl' ? 'WSL' : 'PATH'} · ${env.runner.path}`
                  ) : (
                    <span style={{ color: 'var(--danger-color)' }}>{t('not found', 'не найден')}</span>
                  )}
                </dd>
                <dt>
                  <Hint
                    docs={QMK_DOCS.gettingStarted}
                    tip={t(
                      'The folder with QMK’s source code: every keyboard definition and the compiler setup. NAVI builds your keymap inside it.',
                      'Папка с исходным кодом QMK: описания всех клавиатур и настройки сборки. NAVI собирает вашу раскладку внутри неё.',
                    )}
                  >
                    qmk_firmware
                  </Hint>
                </dt>
                <dd>
                  {env.home ? (
                    <>
                      {env.home} {env.homeValid ? <span className="badge badge--ok">ok</span> : <span className="badge badge--warn">{t('not a QMK folder', 'не папка QMK')}</span>}
                    </>
                  ) : (
                    <span style={{ color: 'var(--danger-color)' }}>{t('not found', 'не найдена')}</span>
                  )}
                </dd>
                <dt>
                  <Hint
                    docs={QMK_DOCS.externalUserspace}
                    tip={t(
                      'External Userspace: a folder outside qmk_firmware that holds your own keymaps, so QMK updates do not touch them. If one is found, NAVI looks up the keymap there the way QMK does.',
                      'External Userspace: папка вне qmk_firmware, где лежат ваши раскладки, чтобы обновления QMK их не трогали. Если она найдена, NAVI ищет раскладку там так же, как QMK.',
                    )}
                  >
                    QMK userspace
                  </Hint>
                </dt>
                <dd>
                  {env.userspace ? (
                    <>
                      {env.userspace} <span className="badge badge--ok">ok</span>
                    </>
                  ) : (
                    <span className="kicker">{t('none', 'нет')}</span>
                  )}
                </dd>
                {env.git && (
                  <>
                    <dt>{t('version', 'версия')}</dt>
                    <dd>
                      {env.git.commit.slice(0, 10)} · {new Date(env.git.date).toLocaleDateString()}
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="field-hint">{detecting ? t('Checking…', 'Проверяю…') : t('Not checked yet.', 'Ещё не проверено.')}</p>
            )}
            {env?.errors.map((e, i) => (
              <p key={i} className="field-hint" style={{ color: 'var(--danger-color)' }}>
                {e}
              </p>
            ))}
            <div className="field-row">
              <button
                className="btn"
                {...whyDisabled(
                  (!env?.runner && t('QMK CLI not found: install QMK MSYS first', 'QMK CLI не найден: сначала установите QMK MSYS')) ||
                    (job?.running && t('Wait: another QMK job is running', 'Подождите: идёт другая задача QMK')),
                  t('Run “qmk doctor”: QMK’s own check of the toolchain', 'Запустить «qmk doctor» — собственную проверку инструментов QMK'),
                )}
                onClick={() => void runDiagnostic('doctor')}
              >
                <Stethoscope {...ICON} /> qmk doctor
              </button>
            </div>
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('paths', 'пути')}</span>
          </div>
          <div className="panel-box-body field">
            <label className="field">
              <span className="field-label">qmk_firmware</span>
              <input
                className="input"
                defaultValue={qmk.home}
                placeholder={t('empty = ask QMK CLI', 'пусто — спросить у QMK CLI')}
                onBlur={(e) => e.target.value !== qmk.home && setValue('qmk.home', e.target.value.trim())}
              />
            </label>
            <label className="field">
              <span className="field-label">
                <Hint
                  docs={QMK_DOCS.gettingStarted}
                  tip={t(
                    'The Windows installer that bundles the QMK CLI, compilers and a shell. Set its folder if it is not in the default place; empty = NAVI looks for it by itself.',
                    'Установщик QMK для Windows: QMK CLI, компиляторы и оболочка вместе. Укажите его папку, если она не стандартная; пусто — NAVI ищет сам.',
                  )}
                >
                  QMK MSYS
                </Hint>
              </span>
              <input className="input" defaultValue={qmk.msys} placeholder="C:\QMK_MSYS" onBlur={(e) => e.target.value !== qmk.msys && setValue('qmk.msys', e.target.value.trim())} />
            </label>
            {env?.wsl && (
              <label className="field">
                <span className="field-label">{t('WSL distro', 'дистрибутив WSL')}</span>
                <select className="select" value={qmk.wsl} onChange={(e) => setValue('qmk.wsl', e.target.value)}>
                  <option value="">{t('automatic', 'автоматически')}</option>
                  {env.wsl.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name} · {d.hasQmk ? t('qmk found', 'qmk найден') : t('no qmk', 'нет qmk')}
                    </option>
                  ))}
                  {qmk.wsl && !env.wsl.some((d) => d.name === qmk.wsl) && <option value={qmk.wsl}>{qmk.wsl}</option>}
                </select>
              </label>
            )}
            <p className="field-hint">
              {t('Saved in the app config (Settings → config). Press “check again” after changing.', 'Сохраняется в конфиге приложения (Настройки → config). После изменения — «проверить снова».')}
            </p>
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">
              <Hint
                tip={t(
                  'Before a build, NAVI checks every file in the keymap folder (and users/<keymap>) against a safety allowlist and refuses the build if something could run a program. A folder you trust is not checked. Trust is granted only through a warning dialog and is kept only on this computer.',
                  'Перед сборкой NAVI проверяет каждый файл в папке раскладки (и users/<keymap>) по списку допустимого и отказывается собирать, если что-то может запустить программу. Доверенная папка не проверяется. Доверие даётся только через окно с предупреждением и хранится только на этом компьютере.',
                )}
              >
                {t('trusted folders', 'доверенные папки')}
              </Hint>
            </span>
          </div>
          <div className="panel-box-body field">
            {trustedFolders.length === 0 ? (
              <EmptyState
                what={t('Folders you trusted skip the safety check before a build.', 'Доверенные папки не проверяются перед сборкой.')}
                example={t(
                  'When a build is refused because of a file in your keymap folder, you can read the warning and trust that folder; it then shows up here.',
                  'Если сборка отклонена из-за файла в папке раскладки, можно прочитать предупреждение и довериться папке; она появится здесь.',
                )}
              />
            ) : (
              trustedFolders.map((dir) => (
                <div key={dir} className="field-row">
                  <code style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{dir}</code>
                  <button className="btn" onClick={() => void revokeTrust(dir)}>
                    {t('revoke', 'отозвать')}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      {env && (!env.runner || !env.homeValid) && (
        <section className="section">
          <div className="section-head">
            <h2>{t('how to install QMK on Windows', 'как установить QMK на Windows')}</h2>
          </div>
          <ol className="steps-list">
            <li>
              {t('Download and install', 'Скачайте и установите')} <strong>QMK MSYS</strong>{' '}
              <button className="text-btn" onClick={() => void navi!.openExternal('https://msys.qmk.fm/')}>
                msys.qmk.fm <ExternalLink size={12} strokeWidth={1.5} />
              </button>{' '}
              {t('(includes the QMK CLI and compilers; ~1 GB).', '(в нём QMK CLI и компиляторы; ~1 ГБ).')}
            </li>
            <li>
              {t('Open “QMK MSYS” and run', 'Откройте «QMK MSYS» и выполните')} <code>qmk setup</code> {t('— it downloads qmk_firmware (answer “y”).', '— он скачает qmk_firmware (отвечайте «y»).')}
            </li>
            <li>{t('Come back here and press “check again”.', 'Вернитесь сюда и нажмите «проверить снова».')}</li>
          </ol>
          <p className="field-hint">
            {t('Docs:', 'Документация:')}{' '}
            <button className="text-btn" onClick={() => void navi!.openExternal(QMK_DOCS.gettingStarted)}>
              docs.qmk.fm/newbs_getting_started <ExternalLink size={12} strokeWidth={1.5} />
            </button>
          </p>
        </section>
      )}
      {job && job.kind !== 'compile' && <BuildLog />}
    </div>
  );
}
