/**
 * SETTINGS SECTION — like in the CARRIER player: a text config (JSONC) with checks, palettes,
 * language, quick toggles. In the desktop app the config is the file %APPDATA%\NAVI\user.config.jsonc.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, FolderOpen, RotateCcw, Upload } from 'lucide-react';
import { CodeEditor } from '../components/CodeEditor';
import { DEFAULT_CONFIG_TEXT, parseConfig } from '../config/configFile';
import { THEME_PRESETS } from '../config/theme.config';
import { listLanguages } from '../core/keycodes/spec';
import { navi } from '../desktop/bridge';
import { JSON_FILTERS, openTextFile, saveTextFile } from '../lib/files';
import { href } from '../lib/router';
import { useSettingsStore } from '../store/settingsStore';
import { toast } from '../store/toastStore';
import { getLanguage, t } from '../i18n';

const ICON = { size: 15, strokeWidth: 1.5 };

function ConfigTab() {
  const configText = useSettingsStore((s) => s.configText);
  const applyConfig = useSettingsStore((s) => s.applyConfig);
  const reset = useSettingsStore((s) => s.reset);
  const [draft, setDraft] = useState(configText);
  const [base, setBase] = useState(configText);
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = draft !== configText;
  useEffect(() => {
    if (configText !== base) {
      if (draft === base) setDraft(configText);
      setBase(configText);
    }
  }, [configText, base, draft]);
  const { issues } = useMemo(() => parseConfig(draft), [draft]);
  const errors = issues.filter((i) => i.level === 'error');
  const apply = () => {
    const result = applyConfig(draft);
    if (result.some((i) => i.level === 'error')) toast(t('The config has errors — changes not applied', 'В конфиге ошибки — изменения не применены'), 'error');
    else toast(t('Config applied', 'Конфиг применён'));
  };
  return (
    <div>
      <div className="toolbar">
        <span className="file-name">
          user.config.jsonc{dirty && <span className="dirty-mark"> ● {t('not applied', 'не применено')}</span>}
        </span>
        <div className="toolbar-actions">
          {navi && (
            <button className="btn" onClick={() => void navi!.openPath('config')}>
              <FolderOpen {...ICON} /> {t('file', 'файл')}
            </button>
          )}
          <button className="btn" onClick={() => void openTextFile(JSON_FILTERS).then((f) => f && setDraft(f.text))}>
            <Upload {...ICON} /> {t('load', 'загрузить')}
          </button>
          <button className="btn" onClick={() => void saveTextFile('user.config.jsonc', draft)}>
            <Download {...ICON} /> {t('save as', 'сохранить как')}
          </button>
          <button
            className={`btn ${confirmReset ? 'btn--danger' : ''}`}
            onClick={() => {
              if (!confirmReset) {
                setConfirmReset(true);
                setTimeout(() => setConfirmReset(false), 4000);
                return;
              }
              reset();
              setDraft(DEFAULT_CONFIG_TEXT);
              setConfirmReset(false);
              toast(t('Config reset to default', 'Конфиг сброшен на стандартный'));
            }}
          >
            <RotateCcw {...ICON} /> {confirmReset ? t('reset for sure?', 'точно сбросить?') : t('defaults', 'по умолчанию')}
          </button>
          <button className="btn" disabled={!dirty} onClick={() => setDraft(configText)}>
            {t('cancel', 'отменить')}
          </button>
          <button className="btn btn--primary" disabled={!dirty || errors.length > 0} onClick={apply}>
            {t('apply', 'применить')} <kbd>ctrl+s</kbd>
          </button>
        </div>
      </div>
      <CodeEditor label={t('App config', 'Конфиг приложения')} value={draft} onChange={setDraft} onSave={apply} errorLines={errors.map((e) => e.line).filter((l): l is number => !!l)} />
      <div className="config-status" role="status">
        {issues.length === 0 ? (
          <span className="status-ok">ok · {t('no errors', 'ошибок нет')}</span>
        ) : (
          <ul className="issue-list">
            {issues.map((issue, i) => (
              <li key={i} className={`issue issue--${issue.level}`}>
                <span className="issue-where">
                  {issue.level === 'error' ? 'err' : 'warn'}
                  {issue.line ? t(` · line ${issue.line}`, ` · стр. ${issue.line}`) : ''}
                </span>
                {issue.path && <code>{issue.path}</code>} {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function QuickTab() {
  const settings = useSettingsStore((s) => s.settings);
  const setValue = useSettingsStore((s) => s.setValue);
  const lang = getLanguage();
  const toggle = (key: string, value: boolean, label: string, hint?: string) => (
    <div className="row" style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto' }}>
      <span>
        {label}
        {hint && <span className="field-hint"> — {hint}</span>}
      </span>
      <button className={`toggle ${value ? 'is-on' : ''}`} onClick={() => setValue(key, !value)} aria-pressed={value}>
        {value ? 'on' : 'off'}
      </button>
    </div>
  );
  return (
    <div className="page">
      <section className="section" style={{ marginTop: 0 }}>
        <div className="section-head">
          <h2>{t('palette', 'палитра')}</h2>
        </div>
        <div className="theme-grid">
          {THEME_PRESETS.map((p) => (
            <button key={p.id} className={`theme-card ${settings.theme === p.id ? 'is-active' : ''}`} onClick={() => setValue('theme', p.id)} aria-pressed={settings.theme === p.id}>
              <div className="theme-preview" style={{ background: p.palette.background, borderColor: p.palette.border }}>
                <i style={{ background: p.palette.text }} />
                <i style={{ background: p.palette.meterFrom }} />
                <i style={{ background: p.palette.meterTo }} />
              </div>
              <span className="theme-name">{p.name}</span>
              <span className="theme-desc">{lang === 'ru' ? p.description.ru : p.description.en}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{t('keyboard display', 'отображение клавиатуры')}</h2>
        </div>
        <div className="panel-box rows">
          <div className="row" style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto' }}>
            <span>{t('GUI key label', 'Подпись клавиши GUI')}</span>
            <select className="select" value={settings.keyboard.os} onChange={(e) => setValue('keyboard.os', e.target.value)}>
              <option value="windows">Win</option>
              <option value="macos">Cmd</option>
              <option value="linux">Super</option>
            </select>
          </div>
          <div className="row" style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto' }}>
            <span>{t('Second label: computer layout', 'Вторая подпись: раскладка компьютера')}</span>
            <select className="select" value={settings.keyboard.hostLayout} onChange={(e) => setValue('keyboard.hostLayout', e.target.value)}>
              <option value="none">{t('none', 'нет')}</option>
              {listLanguages()
                .filter((l) => l !== 'us')
                .map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
            </select>
          </div>
          {toggle('keyboard.showTransparentSource', settings.keyboard.showTransparentSource, t('Show what transparent keys fall through to', 'Показывать, что «просвечивает» через прозрачные клавиши'))}
          {toggle('keyboard.showMatrix', settings.keyboard.showMatrix, t('Show matrix positions', 'Показывать позиции матрицы'))}
          {toggle('layout.inspector', settings.layout.inspector, t('Inspector panel', 'Панель инспектора'))}
          {toggle('layout.statusLine', settings.layout.statusLine, t('Status line', 'Строка состояния'))}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{t('device', 'устройство')}</h2>
        </div>
        <div className="panel-box rows">
          {toggle('device.autoConnect', settings.device.autoConnect, t('Connect to the project keyboard on start', 'Подключаться к клавиатуре проекта при запуске'))}
          {toggle('device.liveWrite', settings.device.liveWrite, t('Live write', 'Живая запись'), t('every key change is written to the keyboard at once (like VIA)', 'каждое изменение клавиш сразу пишется в клавиатуру (как VIA)'))}
          {toggle('editor.confirmDeviceWrite', settings.editor.confirmDeviceWrite, t('Show the change list before writing', 'Показывать список изменений перед записью'))}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{t('effects', 'эффекты')}</h2>
        </div>
        <div className="panel-box rows">
          {toggle('effects.animations', settings.effects.animations, t('Animations', 'Анимации'))}
          {toggle('effects.glitch', settings.effects.glitch, t('Glitch on headers', 'Сбой сигнала у заголовков'))}
          {toggle('effects.wires', settings.effects.wires, t('Wires in the background', 'Провода на фоне'))}
        </div>
        <p className="field-hint" style={{ marginTop: 8 }}>
          {t('Scanlines, noise, sizes, colors — in the config.', 'Развёртка, шум, размеры, цвета — в конфиге.')} <a href={href({ section: 'settings', tab: 'config' })}>config</a>
        </p>
      </section>
    </div>
  );
}

export function SettingsPage({ tab }: { tab?: string }) {
  const language = useSettingsStore((s) => s.settings.language);
  const setValue = useSettingsStore((s) => s.setValue);
  const active = tab === 'config' ? 'config' : 'quick';
  return (
    <div className="page settings-page">
      <div className="lang-switch">
        <span className="cell-label">language</span>
        <button className={`btn ${language === 'en' ? 'btn--primary' : ''}`} onClick={() => setValue('language', 'en')}>
          english
        </button>
        <button className={`btn ${language === 'ru' ? 'btn--primary' : ''}`} onClick={() => setValue('language', 'ru')}>
          русский
        </button>
      </div>
      <div className="tabs" role="tablist">
        <a className={`tab ${active === 'quick' ? 'is-active' : ''}`} href={href({ section: 'settings' })}>
          {t('main', 'основное')}
        </a>
        <a className={`tab ${active === 'config' ? 'is-active' : ''}`} href={href({ section: 'settings', tab: 'config' })}>
          config
        </a>
      </div>
      {active === 'config' ? <ConfigTab /> : <QuickTab />}
    </div>
  );
}
