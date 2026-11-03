import { create } from 'zustand';

/** Short pop-up notifications: “Project saved” etc. */

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (message, tone = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }));
    // A long message stays longer so there is time to read it.
    setTimeout(() => get().dismiss(id), Math.min(9000, Math.max(2600, message.length * 55)));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (message: string, tone?: Toast['tone']) => useToastStore.getState().show(message, tone);
