/**
 * INTERFACE SIZE — the window's zoom factor (Settings → main → Interface size, `layout.zoom` in the config).
 *
 * The value lives in the config (the interface owns it); this module only applies it and forwards the zoom
 * shortcuts. Chromium's own zoom (menu accelerators Ctrl+= / Ctrl+- / Ctrl+0, pinch) is switched off, so there is
 * one zoom: Ctrl+= / Ctrl+Shift+= / Ctrl++ (numpad), Ctrl+-, Ctrl+0 are sent to the interface as a step
 * (+1 / -1 / 0 = reset), which changes the config value; Ctrl+wheel is handled in the interface itself.
 */

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 2;
/** Height of the title bar at 100% (the interface draws its own, `.titlebar` in layout.css). */
const TITLE_BAR_HEIGHT = 32;

/** By physical key (`input.code`), so it works in any keyboard layout. */
const ZOOM_KEYS = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1, Digit0: 0, Numpad0: 0 };

/** A `before-input-event` input → +1 / -1 / 0 for a zoom shortcut, else null. */
function zoomKeyStep(input) {
  if (!input || input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return null;
  const step = ZOOM_KEYS[input.code];
  return step === undefined ? null : step;
}

/** Any value → a zoom factor within 0.8…2 (garbage → 1). */
function clampZoomFactor(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

let currentFactor = 1;

/** Title bar overlay height for the current zoom: the window buttons stay as tall as the drawn title bar. */
function titleBarHeight() {
  return Math.round(TITLE_BAR_HEIGHT * currentFactor);
}

/** Per window: no pinch zoom, zoom shortcuts go to the interface instead of Chromium's menu. */
function attachZoomKeys(win) {
  void win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.on('before-input-event', (event, input) => {
    const step = zoomKeyStep(input);
    if (step === null) return;
    event.preventDefault();
    win.webContents.send('navi:zoom-step', step);
  });
}

function registerZoomIpc({ ipcMain, getWindow }) {
  ipcMain.handle('navi:set-zoom', (event, factor) => {
    const win = getWindow();
    if (!win || event.sender !== win.webContents) return;
    currentFactor = clampZoomFactor(factor);
    win.webContents.setZoomFactor(currentFactor);
    try {
      win.setTitleBarOverlay({ height: titleBarHeight() });
    } catch {
      // no overlay (other platforms)
    }
  });
}

module.exports = { zoomKeyStep, clampZoomFactor, titleBarHeight, attachZoomKeys, registerZoomIpc, ZOOM_MIN, ZOOM_MAX };
