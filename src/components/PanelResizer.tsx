import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { DEFAULT_SETTINGS, PANEL_WIDTH_LIMITS } from '../config/theme.config';
import { useSettingsStore } from '../store/settingsStore';
import { t } from '../i18n';

type Side = 'sidebar' | 'right';

const SETTING = { sidebar: 'sidebarWidth', right: 'inspectorWidth' } as const;
const CSS_VAR = { sidebar: '--sidebar-width', right: '--inspector-width' } as const;
/** Keep at least this much space for the main area, px. */
const MIN_MAIN = 380;
const KEY_STEP = 16;

/**
 * Edge of a side panel that can be dragged with the mouse (like in Spotify).
 * While dragging the width changes right away; it is written to the config when the button is released.
 * Double-click — reset to the default width. From the keyboard: Tab to the edge, arrows ← →.
 */
export function PanelResizer({ side }: { side: Side }) {
  const key = SETTING[side];
  const width = useSettingsStore((s) => s.settings.layout[key]);
  const setValue = useSettingsStore((s) => s.setValue);
  const [min, max] = PANEL_WIDTH_LIMITS[key];

  const clampWidth = (w: number) => {
    let upper = max;
    const app = document.querySelector<HTMLElement>('.app');
    if (app) {
      const other = app.querySelector(side === 'sidebar' ? '.inspector' : '.sidebar');
      upper = Math.min(max, app.clientWidth - (other?.getBoundingClientRect().width ?? 0) - MIN_MAIN);
    }
    return Math.round(Math.max(min, Math.min(Math.max(min, upper), w)));
  };
  const save = (w: number) => {
    const next = clampWidth(w);
    if (next !== width) setValue(`layout.${key}`, next);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const root = document.documentElement;
    const startX = e.clientX;
    let current = width;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('is-active');
    document.body.classList.add('is-resizing-panels');

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      current = clampWidth(side === 'sidebar' ? width + dx : width - dx);
      root.style.setProperty(CSS_VAR[side], `${current}px`);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      handle.classList.remove('is-active');
      document.body.classList.remove('is-resizing-panels');
      save(current);
      // The temporary width is removed once the new one is applied from the config — no flicker.
      requestAnimationFrame(() => requestAnimationFrame(() => root.style.removeProperty(CSS_VAR[side])));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const grow = side === 'sidebar' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = side === 'sidebar' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === grow) save(width + KEY_STEP);
    else if (e.key === shrink) save(width - KEY_STEP);
    else if (e.key === 'Home') save(min);
    else if (e.key === 'End') save(max);
    else return;
    e.preventDefault();
  };

  const label = side === 'sidebar' ? t('Left panel width', 'Ширина левой панели') : t('Right panel width', 'Ширина правой панели');
  return (
    <div
      className={`panel-resizer panel-resizer--${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      title={t(`${label}: drag with the mouse. Double-click to reset.`, `${label}: потяните мышью. Двойной щелчок — как было.`)}
      onPointerDown={onPointerDown}
      onDoubleClick={() => save(DEFAULT_SETTINGS.layout[key])}
      onKeyDown={onKeyDown}
    />
  );
}
