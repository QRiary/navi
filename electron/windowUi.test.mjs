// Right-click menu and the unsaved-changes close flow (electron/contextMenu.cjs, electron/closeGuard.cjs).
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { contextMenuTemplate } = require('./contextMenu.cjs');
const { createCloseGuard, fallbackDialogOptions } = require('./closeGuard.cjs');

const allFlags = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };

describe('context menu template', () => {
  it('no menu on plain page areas', () => {
    expect(contextMenuTemplate({ isEditable: false, selectionText: '', editFlags: allFlags }, 'en')).toBeNull();
  });

  it('text field: four items enabled per editFlags, in the UI language', () => {
    const items = contextMenuTemplate({ isEditable: true, selectionText: '', editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } }, 'ru');
    expect(items.filter((i) => i.role).map((i) => [i.role, i.label, i.enabled])).toEqual([
      ['cut', 'Вырезать', false],
      ['copy', 'Копировать', false],
      ['paste', 'Вставить', true],
      ['selectAll', 'Выделить всё', true],
    ]);
  });

  it('selected page text: copy works, cut and paste follow the flags', () => {
    const items = contextMenuTemplate({ isEditable: false, selectionText: 'KC_A', editFlags: { canCopy: true, canSelectAll: true } }, 'en');
    expect(items.filter((i) => i.enabled).map((i) => i.label)).toEqual(['Copy', 'Select all']);
  });

  it('unknown language falls back to English', () => {
    expect(contextMenuTemplate({ isEditable: true, editFlags: allFlags }, 'de')[0].label).toBe('Cut');
  });
});

describe('close guard', () => {
  const setup = ({ askOk = true, nativeClose = false } = {}) => {
    const timers = [];
    const deps = {
      ask: vi.fn(() => askOk),
      askNative: vi.fn(() => nativeClose),
      closeWindow: vi.fn(),
      setTimer: (fn) => (timers.push(fn), timers.length),
      clearTimer: (id) => (timers[id - 1] = null),
    };
    const guard = createCloseGuard(deps);
    const event = () => ({ preventDefault: vi.fn() });
    const fire = () => timers.forEach((fn) => fn?.());
    return { guard, deps, event, fire };
  };

  it('nothing unsaved: the window closes at once, nobody is asked', () => {
    const { guard, deps, event } = setup();
    const e = event();
    guard.onClose(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(deps.ask).not.toHaveBeenCalled();
  });

  it('unsaved: the close is held and the page is asked; "close" closes for real, and that close passes', () => {
    const { guard, deps, event } = setup();
    guard.report({ dirty: true });
    const e = event();
    guard.onClose(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(deps.ask).toHaveBeenCalledOnce();
    guard.answer('shown');
    guard.answer('close');
    expect(deps.closeWindow).toHaveBeenCalledOnce();
    const again = event();
    guard.onClose(again);
    expect(again.preventDefault).not.toHaveBeenCalled();
  });

  it('"stay" keeps the window; a second close asks again', () => {
    const { guard, deps, event } = setup();
    guard.report({ dirty: true });
    guard.onClose(event());
    guard.answer('shown');
    guard.answer('stay');
    expect(deps.closeWindow).not.toHaveBeenCalled();
    guard.onClose(event());
    expect(deps.ask).toHaveBeenCalledTimes(2);
  });

  it('a repeated close while the dialog is up is held without asking twice', () => {
    const { guard, deps, event } = setup();
    guard.report({ dirty: true });
    guard.onClose(event());
    guard.answer('shown');
    const e = event();
    guard.onClose(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(deps.ask).toHaveBeenCalledOnce();
  });

  it('no answer in time: the native box asks, in the last reported language', () => {
    const { guard, deps, event, fire } = setup({ nativeClose: true });
    guard.report({ dirty: true, language: 'ru' });
    guard.onClose(event());
    fire();
    expect(deps.askNative).toHaveBeenCalledWith('ru');
    expect(deps.closeWindow).toHaveBeenCalledOnce();
  });

  it('"shown" cancels the timeout: a slow user never gets the native box', () => {
    const { guard, deps, event, fire } = setup();
    guard.report({ dirty: true });
    guard.onClose(event());
    guard.answer('shown');
    fire();
    expect(deps.askNative).not.toHaveBeenCalled();
  });

  it('the page is gone: the native box at once; "stay" keeps the window', () => {
    const { guard, deps, event } = setup({ askOk: false, nativeClose: false });
    guard.report({ dirty: true });
    guard.onClose(event());
    expect(deps.askNative).toHaveBeenCalledWith('en');
    expect(deps.closeWindow).not.toHaveBeenCalled();
  });

  it('ignores junk reports and late answers', () => {
    const { guard, deps } = setup();
    guard.report({ language: 'xx', dirty: 'yes' });
    expect(guard.state).toEqual({ language: 'en', dirty: false });
    guard.answer('close');
    expect(deps.closeWindow).not.toHaveBeenCalled();
  });

  it('the native box is in one language only', () => {
    const ru = fallbackDialogOptions('ru');
    expect(ru.buttons).toEqual(['Закрыть', 'Остаться']);
    expect(`${ru.message} ${ru.detail}`.replace(/NAVI/g, '')).not.toMatch(/[A-Za-z]/);
    expect(fallbackDialogOptions(undefined).buttons).toEqual(['Close', 'Stay']);
  });
});
