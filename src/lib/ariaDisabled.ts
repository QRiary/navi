/**
 * `whyDisabled` marks a control `aria-disabled="true"` instead of `disabled`, so it stays focusable and its reason
 * (the tooltip, exposed as the accessible description) can be reached by keyboard and screen reader. This guard,
 * installed once on the document in the capture phase, makes such a control inert: a click (which Enter and Space
 * also produce on a button) never reaches the React handlers; a select/input does not open or take keys.
 */
interface Target {
  closest?(selector: string): unknown;
  tagName?: string;
}
interface Ev {
  type: string;
  key?: string;
  target: unknown;
  preventDefault(): void;
  stopPropagation(): void;
}
interface Source {
  addEventListener(type: string, listener: (e: Ev) => void, capture: boolean): void;
}

const SELECTOR = '[aria-disabled="true"]';

export function shouldBlock(e: { type: string; key?: string; target: unknown }): boolean {
  const target = e.target as Target | null;
  const el = target?.closest?.(SELECTOR) as Target | null | undefined;
  if (!el) return false;
  if (e.type === 'click') return true;
  const field = el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
  if (!field) return false;
  if (e.type === 'mousedown') return true;
  return e.type === 'keydown' && e.key !== 'Tab';
}

export function installAriaDisabledGuard(source: Source): void {
  const block = (e: Ev) => {
    if (!shouldBlock(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  for (const type of ['click', 'mousedown', 'keydown']) source.addEventListener(type, block, true);
}
