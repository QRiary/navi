/**
 * FINDING THINGS: the per-tab filter boxes and the jump of the global search (Ctrl+K).
 *
 * A jump goes to a route and names an item by its `data-find-id` ("combo:<id>", "cfg:TAPPING_TERM"). The page
 * that holds the item may react first (open the combo, select the macro) through `useFindJump`; then
 * `useFindReveal` (in App) scrolls the element into view and flashes it. Every filter box made with
 * `useListFilter` empties on a jump, so the item it jumps to isn't filtered away.
 */
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { navigate, type Route } from './router';

export interface FindJump {
  id: string;
  /** Grows with every jump, so a second jump to the same item still fires. */
  seq: number;
  /** When it was made (ms): a tab mounted by the jump still sees it, a tab opened much later doesn't. */
  at: number;
}

interface FindState {
  jump: FindJump | null;
  /** The global search window is open. */
  open: boolean;
  setOpen(open: boolean): void;
}

export const useFindStore = create<FindState>()((set) => ({
  jump: null,
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Go to a route and, if `id` is given, show the element with that `data-find-id` there. */
export function jumpTo(route: Route, id?: string) {
  navigate(route);
  const seq = (useFindStore.getState().jump?.seq ?? 0) + 1;
  useFindStore.setState({ jump: { id: id ?? '', seq, at: Date.now() } });
}

/** The attribute that marks an element a jump can land on. */
export const findAttr = (id: string) => ({ 'data-find-id': id });

/**
 * Calls `onJump(rest)` when a jump arrives for an id starting with `prefix` ("combo:" → the combo's id).
 * Only jumps made after the component mounted count, plus one made just before (the jump that opened the tab).
 */
export function useFindJump(prefix: string, onJump: (rest: string) => void) {
  const jump = useFindStore((s) => s.jump);
  const seen = useRef<number | null>(null);
  const callback = useRef(onJump);
  callback.current = onJump;
  useEffect(() => {
    if (!jump || jump.seq === seen.current) return;
    const fresh = seen.current !== null || Date.now() - jump.at < 3000;
    seen.current = jump.seq;
    if (!fresh) return;
    if (jump.id.startsWith(prefix)) callback.current(jump.id.slice(prefix.length));
  }, [jump, prefix]);
}

/** A filter box's text; it empties on every jump of the global search. */
export function useListFilter(): [string, (q: string) => void] {
  const [query, setQuery] = useState('');
  const seq = useFindStore((s) => s.jump?.seq);
  const first = useRef(seq);
  useEffect(() => {
    if (seq !== first.current) setQuery('');
  }, [seq]);
  return [query, setQuery];
}

/** Lower case, ё → е, so "ё" and "е" match like a Russian reader expects. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е');
}

/** True when every word of the query is found in one of the fields (any order, any field). */
export function matchesQuery(query: string, ...fields: (string | number | null | undefined | false)[]): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = normalize(fields.filter((f) => f !== null && f !== undefined && f !== false).join(' \u0001 '));
  return words.every((w) => hay.includes(w));
}

/** Focuses the filter box of the tab on screen; false when the tab has none. */
export function focusListFilter(): boolean {
  const boxes = [...document.querySelectorAll<HTMLInputElement>('input[data-list-filter]')];
  const box = boxes.find((b) => b.offsetParent !== null && !b.closest('[inert]'));
  if (!box) return false;
  box.focus();
  box.select();
  return true;
}

const FLASH_MS = 1600;

/** How much of the top of `el`'s scroll area stays covered by sticky blocks once it is scrolled to `el`. */
function stickyCover(el: HTMLElement): number {
  const area = el.closest<HTMLElement>('.page-scroll');
  if (!area) return 0;
  let cover = 0;
  for (const s of area.querySelectorAll<HTMLElement>('.tabs--sticky, .combo-top')) {
    if (s.offsetParent === null || s.contains(el)) continue;
    const style = getComputedStyle(s);
    if (style.position !== 'sticky') continue;
    cover = Math.max(cover, (parseFloat(style.top) || 0) + s.offsetHeight);
  }
  return cover;
}

/** Scrolls to and flashes the element a jump names, once it is on screen (a tab may mount it a moment later). */
export function useFindReveal() {
  const jump = useFindStore((s) => s.jump);
  useEffect(() => {
    if (!jump?.id) return;
    let frame = 0;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let found: HTMLElement | undefined;
    const selector = `[data-find-id="${CSS.escape(jump.id)}"]`;
    const look = () => {
      const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.offsetParent !== null || e instanceof SVGElement);
      if (!el) {
        if (++tries < 90) frame = requestAnimationFrame(look);
        return;
      }
      const reduced = document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Centered in the part of the scroll area that sticky blocks (tab bar, the combos keyboard) don't cover: a top
      // scroll margin as tall as they are moves the center down by half of it, which is exactly that.
      el.style.scrollMarginTop = `${stickyCover(el)}px`;
      el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      el.style.scrollMarginTop = '';
      found = el;
      el.classList.remove('is-found');
      void el.offsetWidth;
      el.classList.add('is-found');
      timer = setTimeout(() => el.classList.remove('is-found'), FLASH_MS);
    };
    frame = requestAnimationFrame(look);
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      found?.classList.remove('is-found');
    };
  }, [jump]);
}
