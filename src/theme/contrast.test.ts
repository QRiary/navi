import { describe, expect, it } from 'vitest';
import { THEME_PRESETS } from '../config/theme.config';
import { contrastRatio, mixHex } from './color';

// WCAG AA for normal text: 4.5:1. Every color used for text must reach it on every surface text sits on:
// the window, panels, cells, hover and the selected (accent-soft, 8% accent over the panel) background.
const TEXT_COLORS = ['text', 'textDim', 'label', 'accent', 'danger', 'meterFrom', 'meterTo'] as const;

describe('palette contrast', () => {
  for (const preset of THEME_PRESETS) {
    const p = preset.palette;
    const surfaces = { background: p.background, panel: p.panel, cell: p.cell, hover: p.hover, selected: mixHex(p.panel, p.accent, 0.08) };
    for (const color of TEXT_COLORS) {
      it(`${preset.id}: ${color} reads on every surface`, () => {
        for (const [name, surface] of Object.entries(surfaces)) {
          expect(contrastRatio(p[color], surface), `${color} on ${name}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
    it(`${preset.id}: text on the accent reads`, () => {
      expect(contrastRatio(p.accentText, p.accent)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
