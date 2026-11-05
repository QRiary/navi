import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useToastStore } from './toastStore';

const ids = () => useToastStore.getState().toasts.map((t) => t.id);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const id of ids()) useToastStore.getState().dismiss(id);
  vi.useRealTimers();
});

describe('toasts', () => {
  it('returns the id', () => {
    const id = toast('hi');
    expect(ids()).toEqual([id]);
  });

  it('an info toast dismisses itself', () => {
    toast('hi');
    vi.advanceTimersByTime(3000);
    expect(ids()).toEqual([]);
  });

  it('an error toast stays', () => {
    toast('bad', 'error');
    vi.advanceTimersByTime(60_000);
    expect(ids()).toHaveLength(1);
  });

  it('an action toast lives at least 8 s', () => {
    toast('Deleted: x', 'info', { action: { label: 'Undo', run: () => undefined } });
    vi.advanceTimersByTime(7900);
    expect(ids()).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(ids()).toHaveLength(0);
  });

  it('hover pauses the timer and leaving resumes it', () => {
    const id = toast('hi');
    vi.advanceTimersByTime(2000);
    useToastStore.getState().pause(id);
    vi.advanceTimersByTime(60_000);
    expect(ids()).toEqual([id]);
    useToastStore.getState().resume(id);
    vi.advanceTimersByTime(700);
    expect(ids()).toEqual([]);
  });

  it('the cap of 5 drops the oldest info first and keeps errors', () => {
    const err = toast('bad', 'error');
    const first = toast('a');
    toast('b');
    toast('c');
    toast('d');
    const last = toast('e');
    expect(ids()).toHaveLength(5);
    expect(ids()).toContain(err);
    expect(ids()).not.toContain(first);
    expect(ids()).toContain(last);
  });

  it('errors are dropped only when 5 errors are shown', () => {
    const errs = [1, 2, 3, 4, 5].map((n) => toast(`e${n}`, 'error'));
    const next = toast('e6', 'error');
    expect(ids()).toEqual([...errs.slice(1), next]);
  });
});
