/**
 * Keyboard focus ring only after Tab / Shift+Tab, until the next mouse or touch press.
 *
 * Chromium's own `:focus-visible` also turns on when any key (an arrow, say) is pressed while a control the
 * mouse clicked has focus, which drew a stray ring around tabs and buttons. The CSS draws focus rings only
 * under `html[data-focus-ring]`, which this sets.
 */
export const FOCUS_RING_ATTR = 'data-focus-ring';

interface EventSource {
  addEventListener(type: 'keydown' | 'pointerdown', listener: (e: { key?: string }) => void, capture: boolean): void;
}
interface Root {
  toggleAttribute(name: string, force: boolean): unknown;
}

export function installFocusRing(source: EventSource, root: Root): void {
  source.addEventListener('keydown', (e) => e.key === 'Tab' && root.toggleAttribute(FOCUS_RING_ATTR, true), true);
  source.addEventListener('pointerdown', () => root.toggleAttribute(FOCUS_RING_ATTR, false), true);
}
