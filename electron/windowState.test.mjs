// Window bounds are saved on move/resize/close and restored at start only while the title bar is still reachable.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { parseWindowState, titleBarReachable, pickWindowBounds, loadWindowBounds, trackWindowState } = require('./windowState.cjs');
const { zoomKeyStep, clampZoomFactor } = require('./zoom.cjs');

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 };
const LEFT = { x: -1920, y: 0, width: 1920, height: 1040 };

describe('parseWindowState', () => {
  it('reads a saved state', () => {
    expect(parseWindowState('{"x":10,"y":20,"width":1200,"height":800,"maximized":true}')).toEqual({ x: 10, y: 20, width: 1200, height: 800, maximized: true });
  });
  it('rejects broken or partial files', () => {
    expect(parseWindowState(null)).toBeNull();
    expect(parseWindowState('not json')).toBeNull();
    expect(parseWindowState('{"x":1,"y":2,"width":0,"height":5}')).toBeNull();
    expect(parseWindowState('{"x":"1","y":2,"width":1000,"height":700}')).toBeNull();
    expect(parseWindowState('[1,2]')).toBeNull();
  });
  it('treats anything but true as not maximized', () => {
    expect(parseWindowState('{"x":1,"y":2,"width":1000,"height":700,"maximized":"yes"}')?.maximized).toBe(false);
  });
});

describe('titleBarReachable', () => {
  it('needs the title bar strip on a work area', () => {
    expect(titleBarReachable({ x: 100, y: 100, width: 1200, height: 800 }, [PRIMARY])).toBe(true);
    // title bar above the screen top
    expect(titleBarReachable({ x: 100, y: -40, width: 1200, height: 800 }, [PRIMARY])).toBe(false);
    // only a sliver on the right edge
    expect(titleBarReachable({ x: 1860, y: 100, width: 1200, height: 800 }, [PRIMARY])).toBe(false);
    // on the left monitor
    expect(titleBarReachable({ x: -1500, y: 100, width: 1200, height: 800 }, [PRIMARY, LEFT])).toBe(true);
    expect(titleBarReachable({ x: -1500, y: 100, width: 1200, height: 800 }, [PRIMARY])).toBe(false);
  });
});

describe('pickWindowBounds', () => {
  it('restores a visible rectangle and the maximized flag', () => {
    const saved = { x: 50, y: 60, width: 1300, height: 850, maximized: true };
    expect(pickWindowBounds(saved, [PRIMARY], PRIMARY)).toEqual(saved);
  });
  it('keeps the minimum size', () => {
    const b = pickWindowBounds({ x: 50, y: 60, width: 500, height: 300, maximized: false }, [PRIMARY], PRIMARY);
    expect([b.width, b.height]).toEqual([980, 640]);
  });
  it('centers the default size on the primary display when the saved spot is gone', () => {
    const b = pickWindowBounds({ x: -1500, y: 100, width: 1200, height: 800, maximized: false }, [PRIMARY], PRIMARY);
    expect(b).toEqual({ x: 240, y: 70, width: 1440, height: 900, maximized: false });
  });
  it('centers when nothing was saved, shrinking to a small screen but not under the minimum', () => {
    expect(pickWindowBounds(null, [PRIMARY], PRIMARY)).toEqual({ x: 240, y: 70, width: 1440, height: 900, maximized: false });
    const small = { x: 0, y: 0, width: 1280, height: 680 };
    expect(pickWindowBounds(null, [small], small)).toEqual({ x: 0, y: 0, width: 1280, height: 680, maximized: false });
    const tiny = { x: 0, y: 0, width: 900, height: 600 };
    expect(pickWindowBounds(null, [tiny], tiny)).toEqual({ x: 0, y: 0, width: 980, height: 640, maximized: false });
  });
});

describe('loadWindowBounds / trackWindowState', () => {
  let dir;
  afterEach(() => {
    vi.useRealTimers();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });
  const screen = { getAllDisplays: () => [{ workArea: PRIMARY }], getPrimaryDisplay: () => ({ workArea: PRIMARY }) };

  function fakeWindow(bounds, maximized = false) {
    const win = new EventEmitter();
    win.bounds = bounds;
    win.maximized = maximized;
    win.getNormalBounds = () => win.bounds;
    win.isMaximized = () => win.maximized;
    win.isFullScreen = () => false;
    win.isDestroyed = () => false;
    return win;
  }

  it('writes after moves settle and on close, then reads it back', () => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-winstate-'));
    const file = path.join(dir, 'window-state.json');
    expect(loadWindowBounds(file, screen)).toEqual({ x: 240, y: 70, width: 1440, height: 900, maximized: false });

    const win = fakeWindow({ x: 10, y: 20, width: 1000, height: 700 });
    trackWindowState(win, file, 500);
    win.emit('move');
    win.emit('move');
    expect(fs.existsSync(file)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ x: 10, y: 20, width: 1000, height: 700, maximized: false });

    // maximized: the normal bounds stay, the flag is saved; close writes at once
    win.maximized = true;
    win.emit('close');
    expect(loadWindowBounds(file, screen)).toEqual({ x: 10, y: 20, width: 1000, height: 700, maximized: true });
  });
});

describe('zoom shortcuts', () => {
  const key = (code, extra = {}) => ({ type: 'keyDown', code, control: true, ...extra });
  it('maps Ctrl+= / Ctrl+Shift+= / numpad +, Ctrl+-, Ctrl+0 by physical key', () => {
    expect(zoomKeyStep(key('Equal'))).toBe(1);
    expect(zoomKeyStep(key('Equal', { shift: true }))).toBe(1);
    expect(zoomKeyStep(key('NumpadAdd'))).toBe(1);
    expect(zoomKeyStep(key('Minus'))).toBe(-1);
    expect(zoomKeyStep(key('NumpadSubtract'))).toBe(-1);
    expect(zoomKeyStep(key('Digit0'))).toBe(0);
  });
  it('ignores other keys, key-up, no Ctrl and AltGr', () => {
    expect(zoomKeyStep(key('KeyS'))).toBeNull();
    expect(zoomKeyStep(key('Equal', { type: 'keyUp' }))).toBeNull();
    expect(zoomKeyStep(key('Equal', { control: false }))).toBeNull();
    expect(zoomKeyStep(key('Equal', { alt: true }))).toBeNull();
  });
  it('clamps the factor', () => {
    expect(clampZoomFactor(5)).toBe(2);
    expect(clampZoomFactor(0.1)).toBe(0.8);
    expect(clampZoomFactor('x')).toBe(1);
    expect(clampZoomFactor(1.3)).toBe(1.3);
  });
});
