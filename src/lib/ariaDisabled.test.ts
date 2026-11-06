import { describe, expect, it } from 'vitest';
import { shouldBlock } from './ariaDisabled';

const el = (tagName: string, disabled: boolean): { tagName: string; closest: (s: string) => unknown } => ({
  tagName,
  closest: (s: string) => (disabled && s === '[aria-disabled="true"]' ? el(tagName, true) : null),
});

describe('aria-disabled guard', () => {
  it('blocks a click on an aria-disabled button, lets an enabled one through', () => {
    expect(shouldBlock({ type: 'click', target: el('BUTTON', true) })).toBe(true);
    expect(shouldBlock({ type: 'click', target: el('BUTTON', false) })).toBe(false);
  });

  it('keeps Tab working on an aria-disabled select, blocks other keys and the mouse', () => {
    expect(shouldBlock({ type: 'keydown', key: 'Tab', target: el('SELECT', true) })).toBe(false);
    expect(shouldBlock({ type: 'keydown', key: 'ArrowDown', target: el('SELECT', true) })).toBe(true);
    expect(shouldBlock({ type: 'mousedown', target: el('SELECT', true) })).toBe(true);
  });

  it('does not block keys on an aria-disabled button (its click is what is blocked)', () => {
    expect(shouldBlock({ type: 'keydown', key: 'Enter', target: el('BUTTON', true) })).toBe(false);
  });
});
