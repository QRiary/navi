/**
 * INTERFACE SIZE — `layout.zoom` in the config, applied as the window's zoom factor (electron/zoom.cjs).
 * Settings → main, Ctrl+= / Ctrl+- / Ctrl+0 (forwarded by the main process) and Ctrl+wheel all change the same
 * config value in 10% steps, so the Settings control follows.
 */
import { useEffect } from 'react';
import { SETTINGS_RANGES } from '../config/theme.config';
import { navi } from '../desktop/bridge';
import { useSettingsStore } from '../store/settingsStore';

export const ZOOM_RANGE = SETTINGS_RANGES['layout.zoom'] as [number, number];
export const ZOOM_STEP = 0.1;
/**
 * Wheel distance (CSS px) for one 10% step. A mouse-wheel notch is 100 px of screen, i.e. 50…125 CSS px at
 * 80…200%, so every notch is exactly one step; a touchpad pinch (many small deltas) adds up to it.
 */
const WHEEL_PER_STEP = 40;

/** The zoom after a step: +1 bigger, -1 smaller, 0 back to 100%; on the 10% grid, within 80…200%. */
export function stepZoom(current: number, step: 1 | -1 | 0): number {
  if (step === 0) return 1;
  const tenths = Math.round((Number.isFinite(current) ? current : 1) / ZOOM_STEP) + step;
  return Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], Math.round(tenths) / 10));
}

function changeZoom(step: 1 | -1 | 0) {
  const { settings, setValue } = useSettingsStore.getState();
  const next = stepZoom(settings.layout.zoom, step);
  if (next !== settings.layout.zoom) setValue('layout.zoom', next);
}

/** Applies the interface size and listens to the zoom shortcuts. Desktop app only (a browser has its own zoom). */
export function useInterfaceZoom() {
  const zoom = useSettingsStore((s) => s.settings.layout.zoom);
  useEffect(() => {
    if (navi) void navi.setZoom(zoom);
  }, [zoom]);
  useEffect(() => {
    if (!navi) return;
    const off = navi.onZoomStep(changeZoom);
    let wheel = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      // Before the drawing's own wheel zoom and Chromium's page zoom.
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(idle);
      idle = setTimeout(() => (wheel = 0), 300);
      wheel += e.deltaMode === 0 ? e.deltaY : Math.sign(e.deltaY) * WHEEL_PER_STEP;
      if (Math.abs(wheel) >= WHEEL_PER_STEP) {
        changeZoom(wheel < 0 ? 1 : -1);
        wheel = 0;
      }
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      off();
      clearTimeout(idle);
      window.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, []);
}
