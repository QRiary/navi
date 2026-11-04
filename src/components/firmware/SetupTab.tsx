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
import { BuildLog } from './BuildLog';

const ICON = { size: 14, strokeWidth: 1.5 };

export function SetupTab() {
  const env = useQmkStore((s) => s.env);
  const detecting = useQmkStore((s) => s.detecting);
  const detect = useQmkStore((s) => s.detect);
  const runDiagnostic = useQmkStore((s) => s.runDiagnostic);
  const job = useQmkStore((s) => s.job);
  const qmk = useSettingsStore((s) => s.settings.qmk);
  const setValue = useSettingsStore((s) => s.setValue);

  useEffect(() => {
    if (!env && navi) void detect();
  }, [env, detect]);

  if (!navi) {
    return (
      <div className="notice">
        <span>{t('Building and flashing need the desktop app (npm run app).', 'Сборке и прошивке нужно настольное приложение (npm run app).')}</span>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="grid-2">
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('QMK environment', 'окружение QMK')}</span>
            <button className="btn" disabled={detecting} onClick={() => void detect()}>
              <RefreshCw {...ICON} /> {detecting ? t('checking…', 'проверяю…') : t('check again', 'проверить снова')}
            </button>
          </div>
          <div className="panel-box-body field">
            {env ? (
              <dl className="kv">
                <dt>QMK CLI</dt>
                <dd>{env.runner ? `${env.cliVersion ?? '?'} · ${env.runner.kind === 'msys' ? 'QMK MSYS' : env.runner.kind === 'wsl' ? 'WSL' : 'PATH'} · ${env.runner.path}` : <span style={{ color: 'var(--danger-color)' }}>{t('not found', 'не найден')}</span>}</dd>
                <dt>qmk_firmware</dt>
                <dd>
                  {env.home ? (
                    <>
                      {env.home} {env.homeValid ? <span className="badge badge--ok">ok</span> : <span className="badge badge--warn">{t('not a QMK folder', 'не папка QMK')}</span>}
                    </>
                  ) : (
                    <span style={{ color: 'var(--danger-color)' }}>{t('not found', 'не найдена')}</span>
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
              <button className="btn" disabled={!env?.runner || job?.running} onClick={() => void runDiagnostic('doctor')}>
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
              <input className="input" defaultValue={qmk.home} placeholder={t('empty = ask QMK CLI', 'пусто — спросить у QMK CLI')} onBlur={(e) => e.target.value !== qmk.home && setValue('qmk.home', e.target.value.trim())} />
            </label>
            <label className="field">
              <span className="field-label">QMK MSYS</span>
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
            <p className="field-hint">{t('Saved in the app config (Settings → config). Press “check again” after changing.', 'Сохраняется в конфиге приложения (Настройки → config). После изменения — «проверить снова».')}</p>
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
            <button className="text-btn" onClick={() => void navi!.openExternal('https://docs.qmk.fm/newbs_getting_started')}>
              docs.qmk.fm/newbs_getting_started <ExternalLink size={12} strokeWidth={1.5} />
            </button>
          </p>
        </section>
      )}
      {job && job.kind !== 'compile' && <BuildLog />}
    </div>
  );
}
