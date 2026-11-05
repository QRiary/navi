import { describe, expect, it } from 'vitest';
import { loadSpec } from '../keycodes/spec';
import { createDilemmaProject } from '../project/factory';
import type { Project } from '../project/types';
import { hardwareFacts } from '../../lib/hardwareFacts';
import { buildNote } from './buildNote';

const spec = loadSpec('latest');
const note = (p: Project, f: Parameters<typeof buildNote>[1]) => buildNote(p, f, spec, hardwareFacts(p));

describe('buildNote', () => {
  it('a feature the project does not use yet says it turns on by itself', () => {
    const p = createDilemmaProject();
    const n = note(p, 'combo');
    expect(n.state).toBe('not-yet');
    expect(n.text.en).toBe('Combos: not in your build yet. It turns on by itself when you add the first one here.');
  });

  it('a used feature is in the build, and says what it takes to work on the keyboard', () => {
    const p = createDilemmaProject();
    p.combos = [
      {
        id: 'c',
        name: 'c',
        keys: [
          [0, 0],
          [0, 1],
        ],
        result: 0x04,
      },
    ];
    const n = note(p, 'combo');
    expect(n.state).toBe('in-use');
    expect(n.text.en).toContain('the project uses it');
    expect(n.text.en).toContain('build and flash');
  });

  it('says the keyboard has it when the current firmware is known to', () => {
    const p = createDilemmaProject();
    p.leaderSequences = [{ id: 'l', keys: [0x04], action: { type: 'tap', keycode: 0x05 } }];
    p.firmware.flags = { leader: { state: 'on', evidence: 'device' } };
    expect(note(p, 'leader').text.en).toContain('The firmware on the keyboard has it too.');
  });

  it('a feature turned on by hand but unused', () => {
    const p = createDilemmaProject();
    p.firmware.buildFeatures = { key_override: true };
    expect(note(p, 'key_override').state).toBe('turned-on');
  });

  it('the unicode map counts only in its own mode', () => {
    const p = createDilemmaProject();
    p.unicodeMap = [{ id: 'u', name: 'U_A', codepoint: 0x41 }];
    p.firmware.unicode = 'unicode';
    expect(note(p, 'unicodemap').state).toBe('not-yet');
    p.firmware.unicode = 'unicodemap';
    expect(note(p, 'unicodemap').state).toBe('in-use');
  });
});
