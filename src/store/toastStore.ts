import { create } from 'zustand';

/**
 * Pop-up notifications. Info toasts vanish by themselves (a hover or focus inside pauses the timer; one with an
 * action stays at least 8 s). Error toasts stay until closed. At most MAX_TOASTS are shown: a new one drops the
 * oldest info toast first, an error only goes when MAX_TOASTS errors are already shown.
 */

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastOptions {
  /** Raw technical text (an error message): behind a “details” toggle, included when copying. */
  detail?: string;
  action?: ToastAction;
}

export interface Toast extends ToastOptions {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, tone?: Toast['tone'], opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
  /** Hover / focus inside a toast: stop its timer. */
  pause: (id: number) => void;
  resume: (id: number) => void;
}

export const MAX_TOASTS = 5;
export const ACTION_MIN_MS = 8000;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

let nextId = 1;
const timers = new Map<number, Timer>();

function arm(id: number, timer: Timer, dismiss: (id: number) => void) {
  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => dismiss(id), timer.remaining);
}

function clearTimer(id: number) {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (message, tone = 'info', opts = {}) => {
    const id = nextId++;
    const toast: Toast = { id, message, tone, ...opts };
    let list = [...get().toasts, toast];
    while (list.length > MAX_TOASTS) {
      const drop = list.find((t) => t.tone === 'info') ?? list[0];
      list = list.filter((t) => t !== drop);
      clearTimer(drop.id);
    }
    set({ toasts: list });
    if (tone === 'info') {
      // A long message stays longer so there is time to read it.
      const base = Math.min(9000, Math.max(2600, message.length * 55));
      const timer: Timer = { handle: null, remaining: opts.action ? Math.max(ACTION_MIN_MS, base) : base, startedAt: 0 };
      timers.set(id, timer);
      arm(id, timer, get().dismiss);
    }
    return id;
  },
  dismiss: (id) => {
    clearTimer(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  pause: (id) => {
    const timer = timers.get(id);
    if (!timer?.handle) return;
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
  },
  resume: (id) => {
    const timer = timers.get(id);
    if (timer && !timer.handle) arm(id, timer, get().dismiss);
  },
}));

export const toast = (message: string, tone?: Toast['tone'], opts?: ToastOptions) =>
  useToastStore.getState().show(message, tone, opts);

/** An error toast: a plain sentence (what failed, what to do) with the raw error behind “Details”. */
export const toastError = (message: string, err?: unknown) =>
  toast(message, 'error', err === undefined ? undefined : { detail: err instanceof Error ? err.message : String(err) });
