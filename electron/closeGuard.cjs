/**
 * CLOSING WITH UNSAVED CHANGES. The renderer reports the interface language and whether the project has unsaved
 * changes (`navi:ui-state`). When the window is closed with unsaved changes, the close is held and the renderer is
 * asked (`navi:close-request`); it shows its own dialog (Save / Don't save / Cancel) and answers through
 * `navi:close-answer`: 'shown' right away, then 'close' or 'stay'. If it doesn't say 'shown' within the timeout
 * (the page hung or crashed), a native box asks instead, in the language last reported (English by default).
 */

const TIMEOUT_MS = 5000;

const FALLBACK_TEXT = {
  en: {
    buttons: ['Close', 'Stay'],
    message: 'NAVI is not responding, and the project has unsaved changes.',
    detail: 'The last draft NAVI wrote is kept and reopens next time; edits after it may be lost.',
  },
  ru: {
    buttons: ['Закрыть', 'Остаться'],
    message: 'NAVI не отвечает, а в проекте есть несохранённые изменения.',
    detail: 'Последний записанный черновик сохранён и откроется при следующем запуске; правки после него могут потеряться.',
  },
};

/** Options for dialog.showMessageBoxSync: one language only. Button 0 = close. */
function fallbackDialogOptions(language) {
  const text = FALLBACK_TEXT[language] ?? FALLBACK_TEXT.en;
  return { type: 'question', buttons: text.buttons, defaultId: 1, cancelId: 1, title: 'NAVI', message: text.message, detail: text.detail, noLink: true };
}

/**
 * The state machine, with its outside world passed in (tests drive it with fakes).
 *  ask() → sends the request, false when the page is gone; askNative() → true = close; closeWindow() closes for real.
 */
function createCloseGuard({ ask, askNative, closeWindow, timeoutMs = TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const state = { language: 'en', dirty: false };
  let allowed = false;
  let asking = false;
  let timer = null;

  const closeNow = () => {
    allowed = true;
    asking = false;
    closeWindow();
  };
  const fallback = () => {
    timer = null;
    asking = false;
    if (askNative(state.language)) closeNow();
  };

  return {
    state,
    /** Partial update from the renderer. */
    report(update) {
      if (update && (update.language === 'en' || update.language === 'ru')) state.language = update.language;
      if (update && typeof update.dirty === 'boolean') state.dirty = update.dirty;
    },
    /** The window's `close` event. */
    onClose(event) {
      if (allowed || !state.dirty) return;
      event.preventDefault();
      if (asking) return;
      asking = true;
      if (!ask()) return fallback();
      timer = setTimer(fallback, timeoutMs);
    },
    /** The renderer's answer: 'shown' (its dialog is up), 'close' or 'stay'. */
    answer(choice) {
      if (!asking) return;
      if (timer) clearTimer(timer);
      timer = null;
      if (choice === 'shown') return;
      asking = false;
      if (choice === 'close') closeNow();
    },
  };
}

/** Wires the guard to the window and IPC. Returns the guard (its state.language is read by the context menu). */
function registerCloseGuard({ ipcMain, dialog, getWindow }) {
  const guard = createCloseGuard({
    ask: () => {
      const win = getWindow();
      if (!win || win.webContents.isDestroyed() || win.webContents.isCrashed()) return false;
      win.webContents.send('navi:close-request');
      return true;
    },
    askNative: (language) => {
      const win = getWindow();
      return dialog.showMessageBoxSync(win ?? undefined, fallbackDialogOptions(language)) === 0;
    },
    closeWindow: () => getWindow()?.close(),
  });
  ipcMain.handle('navi:ui-state', (_e, update) => guard.report(update));
  ipcMain.handle('navi:close-answer', (_e, choice) => guard.answer(choice));
  return {
    language: () => guard.state.language,
    attach: (win) => win.on('close', (event) => guard.onClose(event)),
  };
}

module.exports = { createCloseGuard, fallbackDialogOptions, registerCloseGuard, TIMEOUT_MS };
