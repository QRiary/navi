import { describe, expect, it } from 'vitest';
import { clipboardGoesToText, focusPlace } from './clipboardTarget';

/** A stand-in element: `closest` matches when the selector names one of its own or an ancestor's markers. */
const el = (markers: string[], id = '') => ({ id, closest: (sel: string) => (markers.some((m) => sel.includes(m)) ? {} : null) }) as unknown as Element;
const body = el([]);
const html = el([]);
const doc = { body, documentElement: html } as unknown as Document;

describe('clipboard shortcuts: text or keys', () => {
  it('selected text always wins', () => {
    for (const focus of ['none', 'keys', 'editable', 'other'] as const) expect(clipboardGoesToText({ selectedText: 'LT(1, KC_A)', focus })).toBe(true);
  });

  it('with no text selected, keys get it only from the page itself or the keyboard / picker', () => {
    expect(clipboardGoesToText({ selectedText: '', focus: 'none' })).toBe(false);
    expect(clipboardGoesToText({ selectedText: '', focus: 'keys' })).toBe(false);
    expect(clipboardGoesToText({ selectedText: '', focus: 'editable' })).toBe(true);
    expect(clipboardGoesToText({ selectedText: '', focus: 'other' })).toBe(true);
  });

  it('classifies the focused element', () => {
    expect(focusPlace(null, doc)).toBe('none');
    expect(focusPlace(body, doc)).toBe('none');
    expect(focusPlace(html, doc)).toBe('none');
    expect(focusPlace(el([], 'main-content'), doc)).toBe('none');
    expect(focusPlace(el(['textarea']), doc)).toBe('editable');
    expect(focusPlace(el(['contenteditable']), doc)).toBe('editable');
    expect(focusPlace(el(['data-key-shortcuts']), doc)).toBe('keys');
    expect(focusPlace(el(['button']), doc)).toBe('other');
  });
});
