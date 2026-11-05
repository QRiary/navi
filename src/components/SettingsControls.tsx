/**
 * Settings → main: rows that edit one config value (the JSONC text stays the source of truth).
 * A drag in a slider or a color picker fires many events: each row shows the value at once and writes
 * the config at most once per animation frame (the latest value wins).
 */
import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PALETTE_KEYS, SETTINGS_RANGES, type PaletteKey } from '../config/theme.config';
import { useThemesStore } from '../store/themesStore';
import { revertToTheme, unsavedChanges } from '../theme/themeActions';
import { useSettingsStore } from '../store/settingsStore';
import { resolvePalette } from '../theme/applyTheme';
import { t } from '../i18n';
import { whyDisabled } from '../lib/whyDisabled';
import { Slider } from './Slider';

/** Local copy of a stored value + a write function that runs once per frame with the newest value. */
function useFrameWrite<T>(stored: T, write: (value: T) => void): [T, (value: T) => void] {
  const [local, setLocal] = useState(stored);
  const pending = useRef<{ value: T } | null>(null);
  const frame = useRef(0);
  const writeRef = useRef(write);
  writeRef.current = write;
  // Ignore a stored value that arrives while a newer drag value is still waiting for its frame.
  useEffect(() => {
    if (!pending.current) setLocal(stored);
  }, [stored]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const set = (value: T) => {
    setLocal(value);
    pending.current = { value };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const p = pending.current;
      pending.current = null;
      if (p) writeRef.current(p.value);
    });
  };
  return [local, set];
}

const ONE_COL = 'minmax(0,1fr) auto';

export function SliderRow({ settingKey, value, label, unit, step, percent = false }: { settingKey: string; value: number; label: string; unit?: string; step: number; percent?: boolean }) {
  const setValue = useSettingsStore((s) => s.setValue);
  const [min, max] = SETTINGS_RANGES[settingKey];
  const [local, setLocal] = useFrameWrite(value, (v) => setValue(settingKey, v));
  const shown = percent ? `${Math.round(local * 100)}%` : `${Math.round(local * 100) / 100}${unit ? ` ${unit}` : ''}`;
  return (
    <div className="row" style={{ ['--row-cols' as string]: 'minmax(0,1fr) minmax(120px,200px) 64px' }}>
      <span>{label}</span>
      <Slider value={local} min={min} max={max} step={step} label={label} valueText={shown} onChange={setLocal} />
      <span className="num">{shown}</span>
    </div>
  );
}

export function SelectRow({ settingKey, value, label, options }: { settingKey: string; value: string; label: string; options: { value: string; label: string }[] }) {
  const setValue = useSettingsStore((s) => s.setValue);
  return (
    <div className="row" style={{ ['--row-cols' as string]: ONE_COL }}>
      <span>{label}</span>
      <select className="select" aria-label={label} value={value} onChange={(e) => setValue(settingKey, e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function colorLabel(key: PaletteKey): string {
  switch (key) {
    case 'background':
      return t('Window background', 'Фон окна');
    case 'panel':
      return t('Panel background', 'Фон панелей');
    case 'cell':
      return t('Cells and fields', 'Ячейки и поля');
    case 'hover':
      return t('Hover highlight', 'Подсветка при наведении');
    case 'border':
      return t('Borders', 'Рамки');
    case 'key':
      return t('Keys in keyboard drawings', 'Клавиши на схемах клавиатуры');
    case 'keyBorder':
      return t('Key outlines', 'Рамки клавиш');
    case 'text':
      return t('Main text', 'Основной текст');
    case 'textDim':
      return t('Secondary text', 'Второстепенный текст');
    case 'label':
      return t('UPPERCASE labels', 'Подписи ЗАГЛАВНЫМИ');
    case 'accent':
      return t('Accent: active elements', 'Акцент: активные элементы');
    case 'accentText':
      return t('Text on the accent', 'Текст на акценте');
    case 'meterFrom':
      return t('Meters: gradient start', 'Шкалы: начало градиента');
    case 'meterTo':
      return t('Meters: gradient end', 'Шкалы: конец градиента');
    case 'danger':
      return t('Errors', 'Ошибки');
  }
}

function ColorRow({ name, override, base }: { name: PaletteKey; override: string | undefined; base: string }) {
  const setValue = useSettingsStore((s) => s.setValue);
  const [local, setLocal] = useFrameWrite(override ?? base, (v) => setValue(`colors.${name}`, v));
  const label = colorLabel(name);
  return (
    <div className="row" style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto 64px 32px' }}>
      <span>{label}</span>
      <input type="color" className="color-input" aria-label={label} value={local} onChange={(e) => setLocal(e.target.value)} />
      <code className="num">{local}</code>
      <button
        className="icon-btn"
        {...whyDisabled(override === undefined && t('Already the palette color', 'Уже цвет палитры'), t('Reset to the palette color', 'Вернуть цвет палитры'))}
        aria-label={t(`Reset “${label}” to the palette color`, `Вернуть цвет палитры: «${label}»`)}
        onClick={() => setValue(`colors.${name}`, null)}
      >
        <RotateCcw size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function ColorsSection() {
  const settings = useSettingsStore((s) => s.settings);
  const themes = useThemesStore((s) => s.themes);
  const colors = settings.colors;
  const own = themes.find((th) => th.id === settings.theme);
  // A color's own value without its override: the palette's, or for keys whatever they follow (cell / border).
  const base = (k: PaletteKey) => resolvePalette({ ...settings, colors: { ...colors, [k]: null } })[k];
  const changes = unsavedChanges(settings, own);
  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('colors', 'цвета')}</h2>
        <button
          className="btn"
          {...whyDisabled(
            !changes.colors && !changes.effects && (own ? t(`Colors and effects are the same as in “${own.name}”`, `Цвета и эффекты те же, что в «${own.name}»`) : t('No color differs from the palette', 'Ни один цвет не отличается от палитры')),
            own ? t(`Colors and effects as saved in “${own.name}”`, `Цвета и эффекты как сохранены в «${own.name}»`) : t('Colors of the palette', 'Цвета палитры'),
          )}
          onClick={revertToTheme}
        >
          <RotateCcw size={14} strokeWidth={1.5} /> {own ? t('back to the theme', 'вернуть тему') : t('reset all colors', 'сбросить все цвета')}
        </button>
      </div>
      <div className="panel-box rows">
        {PALETTE_KEYS.map((k) => (
          <ColorRow key={k} name={k} override={colors[k] ?? undefined} base={base(k)} />
        ))}
      </div>
    </section>
  );
}
