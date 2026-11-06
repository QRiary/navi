import { describe, expect, it } from 'vitest';
import { FOCUS_RING_ATTR, installFocusRing } from './focusRing';

function setup() {
  const listeners: Record<string, (e: { key?: string }) => void> = {};
  const attrs = new Set<string>();
  installFocusRing(
    { addEventListener: (type, fn) => (listeners[type] = fn) },
    { toggleAttribute: (name, force) => (force ? attrs.add(name) : attrs.delete(name)) },
  );
  return { fire: (type: string, key?: string) => listeners[type]({ key }), on: () => attrs.has(FOCUS_RING_ATTR) };
}

describe('focus ring', () => {
  it('stays off for arrow keys after a click', () => {
    const s = setup();
    s.fire('pointerdown');
    s.fire('keydown', 'ArrowDown');
    s.fire('keydown', 'ArrowRight');
    expect(s.on()).toBe(false);
  });

  it('turns on with Tab and off with the next press of the mouse', () => {
    const s = setup();
    s.fire('keydown', 'Tab');
    expect(s.on()).toBe(true);
    s.fire('keydown', 'ArrowDown');
    expect(s.on()).toBe(true);
    s.fire('pointerdown');
    expect(s.on()).toBe(false);
  });
});
