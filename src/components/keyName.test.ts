import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyName } from './KeyName';
import type { FriendlyName } from '../core/keycodes/friendly';

const render = (text: string, qmk: string) =>
  renderToStaticMarkup(createElement(KeyName, { name: { text, qmk } as FriendlyName }));

describe('KeyName', () => {
  // A double-click selects one word; with no real character between the name and the QMK code, the browser
  // takes "RussianNAVI_TOGGLE_RU" as one word (a CSS margin is not a word boundary).
  it('separates the readable name from the QMK code with a real space', () => {
    expect(render('Toggle Russian', 'NAVI_TOGGLE_RU')).toMatch(/Toggle Russian <code[^>]*>NAVI_TOGGLE_RU<\/code>/);
  });

  it('shows no code and no trailing space when the name is the code', () => {
    expect(render('KC_A', 'KC_A')).toBe('<span title="KC_A">KC_A</span>');
  });
});
