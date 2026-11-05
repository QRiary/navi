/**
 * Settings → main → palette: built-in palettes, then the user's own themes (colors + look effects).
 * Edits stay loose (the "colors" overrides and the effects in the config) until "save to <theme>" or "save as new";
 * the picked card says when something is not saved, and "back to the theme" in the colors section rolls it back.
 */
import { Download, Pencil, Save, Trash2, Upload } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { THEME_PRESETS, type ThemePreset } from '../config/theme.config';
import { count, getLanguage, t } from '../i18n';
import { whyDisabled } from '../lib/whyDisabled';
import { useSettingsStore } from '../store/settingsStore';
import { useThemesStore } from '../store/themesStore';
import { exportTheme, importTheme, pickTheme, removeTheme, renameTheme, saveAsNew, saveToCurrent, suggestedName, unsavedChanges } from '../theme/themeActions';
import { THEME_NAME_MAX, toPreset } from '../theme/userThemes';
import { Hint } from './InfoTip';
import { Modal } from './Modal';

const ICON = { size: 14, strokeWidth: 1.5 };

function changesText(c: { colors: number; effects: boolean }): string | null {
  if (!c.colors && !c.effects) return null;
  const parts = [
    c.colors ? count(c.colors, ['color', 'colors'], ['цвет', 'цвета', 'цветов']) : '',
    c.effects ? t('effects', 'эффекты') : '',
  ].filter(Boolean);
  return t(`changed, not saved: ${parts.join(', ')}`, `изменено, не сохранено: ${parts.join(', ')}`);
}

function Preview({ p }: { p: ThemePreset }) {
  return (
    <div className="theme-preview" style={{ background: p.palette.background, borderColor: p.palette.border }}>
      <i style={{ background: p.palette.text }} />
      <i style={{ background: p.palette.meterFrom }} />
      <i style={{ background: p.palette.meterTo }} />
    </div>
  );
}

/** Name dialog for "save as new" and "rename". `submit` answers an error text or null (done). */
function NameDialog({ title, initial, action, submit, onClose }: { title: string; initial: string; action: string; submit: (name: string) => Promise<string | null>; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    const err = await submit(name);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('cancel', 'отмена')}
          </button>
          <button className="btn btn--primary" {...whyDisabled(!name.trim() && t('Type a name', 'Введите имя'))} onClick={() => void run()}>
            {action}
          </button>
        </>
      }
    >
      <form className="field" onSubmit={(e) => void run(e)}>
        <label className="kicker" htmlFor="theme-name-input">
          {t('theme name', 'имя темы')}
        </label>
        <input
          id="theme-name-input"
          className="input"
          data-autofocus
          maxLength={THEME_NAME_MAX}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onFocus={(e) => e.target.select()}
        />
        {error && (
          <span className="field-hint" role="alert" style={{ color: 'var(--danger-color)' }}>
            {error}
          </span>
        )}
      </form>
    </Modal>
  );
}

export function PaletteSection() {
  const settings = useSettingsStore((s) => s.settings);
  const themes = useThemesStore((s) => s.themes);
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'rename'; id: string; name: string } | null>(null);
  const lang = getLanguage();
  const own = themes.find((th) => th.id === settings.theme);
  const changes = changesText(unsavedChanges(settings, own));

  const card = (p: ThemePreset, actions?: ReactNode) => {
    const active = settings.theme === p.id;
    const desc = active && changes ? changes : lang === 'ru' ? p.description.ru : p.description.en;
    return (
      <div key={p.id} className={`theme-card ${active ? 'is-active' : ''}`}>
        <button className="theme-pick" onClick={() => pickTheme(p.id)} aria-pressed={active}>
          <Preview p={p} />
          <span className="theme-name">{p.name}</span>
          <span className={`theme-desc ${active && changes ? 'is-unsaved' : ''}`}>{desc}</span>
        </button>
        {actions}
      </div>
    );
  };

  return (
    <section className="section" style={{ marginTop: 0 }}>
      <div className="section-head">
        <h2>
          <Hint
            tip={t(
              'A palette sets all colors at once; your own themes also set the look effects (scan lines, noise, light at the top, glow, glitch, wires). Changes to colors and effects are not saved into a theme until you press “save”, so trying things out is safe: “back to the theme” under the colors rolls them back. Changed colors stay when you switch palettes until you roll them back. Themes are files in %APPDATA%\\NAVI\\themes; export one to share it.',
              'Палитра задаёт сразу все цвета; ваши темы задают ещё и эффекты (развёртка, шум, свет сверху, свечение, сбой, провода). Изменения цветов и эффектов не попадают в тему, пока вы не нажмёте «сохранить», так что пробовать безопасно: «вернуть тему» под цветами откатывает их. Изменённые цвета остаются при смене палитры, пока вы их не откатите. Темы — файлы в %APPDATA%\\NAVI\\themes; чтобы поделиться темой, экспортируйте её.',
            )}
          >
            {t('palette', 'палитра')}
          </Hint>
        </h2>
        <div className="field-row">
          {own && (
            <button className="btn" {...whyDisabled(!changes && t(`Nothing changed since “${own.name}” was saved`, `С сохранения «${own.name}» ничего не изменилось`))} onClick={() => void saveToCurrent()}>
              <Save {...ICON} /> {t(`save to “${own.name}”`, `сохранить в «${own.name}»`)}
            </button>
          )}
          <button className="btn" title={t('Save the colors and effects you see now as a new theme', 'Сохранить текущие цвета и эффекты как новую тему')} onClick={() => setDialog({ kind: 'new' })}>
            <Save {...ICON} /> {t('save as new theme', 'сохранить как новую тему')}
          </button>
          <button className="btn" title={t('Add a theme from a .navi-theme.json file', 'Добавить тему из файла .navi-theme.json')} onClick={() => void importTheme()}>
            <Upload {...ICON} /> {t('import', 'импорт')}
          </button>
        </div>
      </div>
      <div className="theme-grid">
        {THEME_PRESETS.map((p) => card(p))}
        {themes.map((th) =>
          card(
            toPreset(th),
            <div className="theme-actions">
              <button className="icon-btn" title={t('Rename', 'Переименовать')} aria-label={t(`Rename “${th.name}”`, `Переименовать «${th.name}»`)} onClick={() => setDialog({ kind: 'rename', id: th.id, name: th.name })}>
                <Pencil {...ICON} />
              </button>
              <button className="icon-btn" title={t('Export to a file to share', 'Экспорт в файл, чтобы поделиться')} aria-label={t(`Export “${th.name}”`, `Экспорт «${th.name}»`)} onClick={() => void exportTheme(th.id)}>
                <Download {...ICON} />
              </button>
              <button className="icon-btn theme-remove" title={t('Remove (can be undone)', 'Удалить (можно отменить)')} aria-label={t(`Remove “${th.name}”`, `Удалить «${th.name}»`)} onClick={() => void removeTheme(th.id)}>
                <Trash2 {...ICON} />
              </button>
            </div>,
          ),
        )}
      </div>
      {dialog?.kind === 'new' && (
        <NameDialog title={t('save as new theme', 'сохранить как новую тему')} initial={suggestedName()} action={t('save', 'сохранить')} submit={saveAsNew} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'rename' && (
        <NameDialog
          title={t('rename theme', 'переименовать тему')}
          initial={dialog.name}
          action={t('rename', 'переименовать')}
          submit={(name) => renameTheme(dialog.id, name)}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
