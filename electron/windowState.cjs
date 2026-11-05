/**
 * WINDOW STATE — the main window opens where it was closed.
 *
 * `<userData>/window-state.json` keeps the normal (not maximized) bounds and the maximized flag. It is written on
 * move/resize (debounced) and on close. At start the saved rectangle is used only if its title bar is still on a
 * connected display (enough of it to grab with the mouse); otherwise the window opens centered on the primary display
 * at the default size. The test window (NAVI_TEST_WINDOW) never reads or writes this file: main.cjs skips it.
 */
const fs = require('node:fs');
const { writeFileAtomic } = require('./safety.cjs');

const DEFAULT_SIZE = { width: 1440, height: 900 };
const MIN_SIZE = { width: 980, height: 640 };
/** The title bar strip that must stay on screen, px (the drawn title bar is 32 px tall). */
const GRAB_HEIGHT = 32;
/** How much of the title bar must be visible: wide enough to grab it with the mouse. */
const GRAB_MIN_WIDTH = 120;
const GRAB_MIN_HEIGHT = 16;
const SAVE_DELAY_MS = 500;

const isInt = (n) => Number.isInteger(n) && Math.abs(n) < 1e6;

/** Parsed file text → { x, y, width, height, maximized } or null when it's missing or broken. */
function parseWindowState(text) {
  if (typeof text !== 'string') return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { x, y, width, height } = data;
  if (![x, y, width, height].every(isInt) || width <= 0 || height <= 0) return null;
  return { x, y, width, height, maximized: data.maximized === true };
}

function overlap(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

/** True when the window's title bar strip is on one of the work areas enough to drag the window. */
function titleBarReachable(bounds, workAreas) {
  const strip = { x: bounds.x, y: bounds.y, width: bounds.width, height: GRAB_HEIGHT };
  const needWidth = Math.min(GRAB_MIN_WIDTH, bounds.width);
  return workAreas.some((area) => {
    const o = overlap(strip, area);
    return o.width >= needWidth && o.height >= GRAB_MIN_HEIGHT;
  });
}

/** The default size (shrunk to fit a small screen, never under the minimum), centered in the work area. */
function centeredBounds(workArea) {
  const width = Math.max(MIN_SIZE.width, Math.min(DEFAULT_SIZE.width, workArea.width));
  const height = Math.max(MIN_SIZE.height, Math.min(DEFAULT_SIZE.height, workArea.height));
  return {
    x: Math.round(workArea.x + Math.max(0, (workArea.width - width) / 2)),
    y: Math.round(workArea.y + Math.max(0, (workArea.height - height) / 2)),
    width,
    height,
  };
}

/**
 * Bounds to open the window with.
 * @param saved the parsed state (or null)
 * @param workAreas work areas of all connected displays
 * @param primaryWorkArea the primary display's work area
 */
function pickWindowBounds(saved, workAreas, primaryWorkArea) {
  if (saved) {
    const bounds = {
      x: saved.x,
      y: saved.y,
      width: Math.max(MIN_SIZE.width, saved.width),
      height: Math.max(MIN_SIZE.height, saved.height),
    };
    if (titleBarReachable(bounds, workAreas)) return { ...bounds, maximized: saved.maximized };
  }
  return { ...centeredBounds(primaryWorkArea), maximized: saved?.maximized === true };
}

/** Reads the file and picks the start bounds for the current displays (`screen` from electron). */
function loadWindowBounds(file, screen) {
  let text = null;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    // no file yet
  }
  const areas = screen.getAllDisplays().map((d) => d.workArea);
  return pickWindowBounds(parseWindowState(text), areas, screen.getPrimaryDisplay().workArea);
}

/** The state to save from a window: its normal bounds (also while maximized or minimized) and the maximized flag. */
function windowStateOf(win) {
  const b = win.getNormalBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() };
}

/** Saves the state on move/resize (debounced) and right away on close. Errors are ignored: it's a convenience. */
function trackWindowState(win, file, delayMs = SAVE_DELAY_MS) {
  let timer = null;
  let last = null;
  const save = () => {
    clearTimeout(timer);
    timer = null;
    if (win.isDestroyed() || win.isFullScreen()) return;
    const text = JSON.stringify(windowStateOf(win));
    if (text === last) return;
    try {
      writeFileAtomic(file, text);
      last = text;
    } catch {
      // the next move tries again
    }
  };
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  };
  for (const name of ['move', 'resize', 'maximize', 'unmaximize']) win.on(name, later);
  win.on('close', save);
  return { save };
}

module.exports = {
  DEFAULT_SIZE,
  MIN_SIZE,
  parseWindowState,
  titleBarReachable,
  centeredBounds,
  pickWindowBounds,
  loadWindowBounds,
  windowStateOf,
  trackWindowState,
};
