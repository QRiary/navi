/**
 * SETTINGS SECTION — like in the CARRIER player: a text config (JSONC) with checks, palettes,
 * language, quick toggles. In the desktop app the config is the file %APPDATA%\NAVI\user.config.jsonc.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, FolderOpen, RotateCcw, Upload } from 'lucide-react';
import { CodeEditor } from '../components/CodeEditor';
import { InterfaceSizeControl } from '../components/InterfaceSizeControl';
import { DEFAULT_CONFIG_TEXT, parseConfig } from '../config/configFile';
import { ColorsSection, SelectRow, SliderRow } from '../components/SettingsControls';
import { SETTINGS_ENUMS } from '../config/theme.config';
import { PaletteSection } from '../components/ThemePalettes';
import { listLanguages } from '../core/keycodes/spec';
import { navi } from '../desktop/bridge';
import { JSON_FILTERS, openTextFile, saveTextFile } from '../lib/files';
import { href } from '../lib/router';
import { currentTab, tabItems, tabRoute } from '../lib/sections';
import { TabPanels, Tabs } from '../components/Tabs';
import { Hint } from '../components/InfoTip';
import { whyDisabled } from '../lib/whyDisabled';
import { findAttr } from '../lib/find';
import { settingHint, settingLabel } from '../lib/settingsIndex';
import { useSettingsStore } from '../store/settingsStore';
import { toast } from '../store/toastStore';
import { t } from '../i18n';

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
        <span className="file-name">user.config.jsonc{dirty && <span className="dirty-mark"> ● {t('not applied', 'не применено')}</span>}</span>
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
          <button className="btn" {...whyDisabled(!dirty && t('No unapplied changes to cancel', 'Нет неприменённых изменений'))} onClick={() => setDraft(configText)}>
            {t('cancel', 'отменить')}
          </button>
          <button
            className="btn btn--primary"
            {...whyDisabled(
              (!dirty && t('No changes to apply', 'Нет изменений для применения')) || (errors.length > 0 && t('Fix the errors listed below first', 'Сначала исправьте ошибки в списке ниже')),
            )}
            onClick={apply}
          >
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

const DENSITY_LABEL: Record<string, () => string> = {
  compact: () => t('compact', 'компактная'),
  comfortable: () => t('comfortable', 'обычная'),
  spacious: () => t('spacious', 'просторная'),
};
const FONT_LABEL: Record<string, () => string> = {
  mono: () => t('monospace', 'моноширинный'),
  sans: () => t('sans-serif', 'без засечек'),
};

function QuickTab() {
  const settings = useSettingsStore((s) => s.settings);
  const setValue = useSettingsStore((s) => s.setValue);
  const toggle = (key: string, value: boolean) => {
    const hint = settingHint(key);
    return (
      <div className="row" {...findAttr(`setting:${key}`)} style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto' }}>
        <span>
          {settingLabel(key)}
          {hint && <span className="field-hint"> — {hint}</span>}
        </span>
        <button className={`toggle ${value ? 'is-on' : ''}`} onClick={() => setValue(key, !value)} aria-pressed={value}>
          {value ? t('on', 'вкл') : t('off', 'выкл')}
        </button>
      </div>
    );
  };
  return (
    <div className="page">
      <PaletteSection />
      <ColorsSection />
      {navi && (
        <section className="section">
          <div className="section-head">
            <h2>
              <Hint
                tip={t(
                  'Interface size zooms everything (text, buttons, the keyboard drawing), like a browser zoom. To change only the text size, use typography.scale in the config file.',
                  'Размер интерфейса увеличивает всё (текст, кнопки, рисунок клавиатуры), как масштаб в браузере. Чтобы изменить только размер текста, используйте typography.scale в файле конфига.',
                )}
              >
                {t('interface', 'интерфейс')}
              </Hint>
            </h2>
          </div>
          <div className="panel-box rows">
            <InterfaceSizeControl />
          </div>
        </section>
      )}
      <section className="section">
        <div className="section-head">
          <h2>{t('keyboard display', 'отображение клавиатуры')}</h2>
        </div>
        <div className="panel-box rows">
          <div className="row" {...findAttr('setting:keyboard.os')} style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto' }}>
            <span>{settingLabel('keyboard.os')}</span>
            <select className="select" value={settings.keyboard.os} onChange={(e) => setValue('keyboard.os', e.target.value)}>
              <option value="windows">Win</option>
              <option value="macos">Cmd</option>
              <option value="linux">Super</option>
            </select>
          </div>
          <div className="row" {...findAttr('setting:keyboard.hostLayout')} style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto' }}>
            <span>{settingLabel('keyboard.hostLayout')}</span>
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
          {toggle('keyboard.showTransparentSource', settings.keyboard.showTransparentSource)}
          {toggle('keyboard.showMatrix', settings.keyboard.showMatrix)}
          {toggle('layout.inspector', settings.layout.inspector)}
          {toggle('layout.statusLine', settings.layout.statusLine)}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{t('device', 'устройство')}</h2>
        </div>
        <div className="panel-box rows">
          {toggle('device.autoConnect', settings.device.autoConnect)}
          {toggle('device.liveWrite', settings.device.liveWrite)}
          {toggle('editor.confirmDeviceWrite', settings.editor.confirmDeviceWrite)}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>
            <Hint
              tip={t(
                'Decoration only: these change how the app looks and never touch your project or the keyboard. Turn animations off if the interface feels slow.',
                'Только оформление: меняет вид приложения и никак не затрагивает проект и клавиатуру. Если интерфейс тормозит, выключите анимации.',
              )}
            >
              {t('effects', 'эффекты')}
            </Hint>
          </h2>
        </div>
        <div className="panel-box rows">
          {toggle('effects.animations', settings.effects.animations)}
          {toggle('effects.glitch', settings.effects.glitch)}
          {toggle('effects.wires', settings.effects.wires)}
          <SliderRow settingKey="effects.scanlines" value={settings.effects.scanlines} label={settingLabel('effects.scanlines')} step={0.01} percent />
          <SliderRow settingKey="effects.noise" value={settings.effects.noise} label={settingLabel('effects.noise')} step={0.01} percent />
          <SliderRow settingKey="effects.vignette" value={settings.effects.vignette} label={settingLabel('effects.vignette')} step={0.01} percent />
          <SliderRow settingKey="effects.glow" value={settings.effects.glow} label={settingLabel('effects.glow')} step={0.01} percent />
          <SliderRow settingKey="surfaces.opacity" value={settings.surfaces.opacity} label={settingLabel('surfaces.opacity')} step={0.01} percent />
          <SliderRow settingKey="surfaces.blur" value={settings.surfaces.blur} label={settingLabel('surfaces.blur')} step={1} unit="px" />
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{t('sizes and shape', 'размеры и форма')}</h2>
        </div>
        <div className="panel-box rows">
          <SliderRow settingKey="keyboard.keySize" value={settings.keyboard.keySize} label={settingLabel('keyboard.keySize')} step={1} unit="px" />
          <SliderRow settingKey="shape.panelRadius" value={settings.shape.panelRadius} label={settingLabel('shape.panelRadius')} step={1} unit="px" />
          <SliderRow settingKey="shape.keyRadius" value={settings.shape.keyRadius} label={settingLabel('shape.keyRadius')} step={1} unit="px" />
          <SelectRow
            settingKey="layout.density"
            value={settings.layout.density}
            label={settingLabel('layout.density')}
            options={SETTINGS_ENUMS['layout.density'].map((v) => ({ value: v, label: DENSITY_LABEL[v]() }))}
          />
          <SelectRow
            settingKey="typography.font"
            value={settings.typography.font}
            label={settingLabel('typography.font')}
            options={SETTINGS_ENUMS['typography.font'].map((v) => ({ value: v, label: FONT_LABEL[v]() }))}
          />
        </div>
        <p className="field-hint" style={{ marginTop: 8 }}>
          {t('Everything else:', 'Всё остальное:')} <a href={href({ section: 'settings', tab: 'config' })}>{t('the config file', 'файл конфига')}</a>
        </p>
      </section>
    </div>
  );
}

export function SettingsPage({ tab }: { tab?: string }) {
  const language = useSettingsStore((s) => s.settings.language);
  const setValue = useSettingsStore((s) => s.setValue);
  const active = currentTab('settings', tab);
  return (
    <div className="page settings-page">
      <div className="lang-switch" {...findAttr('setting:language')}>
        <span className="cell-label">{t('language', 'язык')}</span>
        <button className={`btn ${language === 'en' ? 'btn--primary' : ''}`} onClick={() => setValue('language', 'en')}>
          english
        </button>
        <button className={`btn ${language === 'ru' ? 'btn--primary' : ''}`} onClick={() => setValue('language', 'ru')}>
          русский
        </button>
      </div>
      <Tabs
        idBase="settings"
        label={t('Settings', 'Настройки')}
        items={tabItems('settings')}
        current={active}
        href={(id) => href(tabRoute('settings', id))}
        sticky
      />
      <TabPanels idBase="settings" ids={['quick', 'config']} current={active} render={(id) => (id === 'config' ? <ConfigTab /> : <QuickTab />)} />
    </div>
  );
}
