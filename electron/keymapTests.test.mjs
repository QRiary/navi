// The keymap's own tests in a build (keymapTests.cjs): the failing cases out of the compile output.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseKeymapTests } = require('./keymapTests.cjs');

const BLOCK = `snapshot.txt:1490: +MED_I wait:200 TG_GAME -MED_I QK_LOCK esc esc
  expected: ⟨ESC⟩
  actual:   ⟨ESC⟩⟨ESC⟩`;
const SAMPLE = `../qmk_userspace/tests/qriary/test_snapshot.cpp:53: Failure
Failed
${BLOCK}`;

describe('parseKeymapTests', () => {
  it('no marker line: null', () => {
    expect(parseKeymapTests(SAMPLE)).toBeNull();
    expect(parseKeymapTests('')).toBeNull();
    expect(parseKeymapTests(undefined)).toBeNull();
  });

  it('the sample: one failure, gtest’s Failure line ignored', () => {
    expect(parseKeymapTests(`NAVI-KEYMAP-TESTS: failed\n${SAMPLE}\n`)).toEqual({
      failures: [{ where: 'snapshot.txt:1490', scenario: '+MED_I wait:200 TG_GAME -MED_I QK_LOCK esc esc', expected: '⟨ESC⟩', actual: '⟨ESC⟩⟨ESC⟩' }],
      more: 0,
    });
  });

  it('strips ANSI escapes and NUL bytes', () => {
    const r = parseKeymapTests(`\x1b[31mNAVI-KEYMAP-TESTS: failed\x1b[0m\n${BLOCK.replace('snapshot', '\x1b[1msnap\0shot').replace('expected: ', 'expected: \x1b[0m')}`);
    expect(r?.failures).toHaveLength(1);
    expect(r?.failures[0]).toMatchObject({ where: 'snapshot.txt:1490', expected: '⟨ESC⟩' });
    expect(parseKeymapTests('NAVI-KEYMAP\0-TESTS: failed\n')).toEqual({ failures: [], more: 0 });
  });

  it('two blocks', () => {
    const r = parseKeymapTests(`NAVI-KEYMAP-TESTS: failed\n${BLOCK}\nother\na.txt:2: b c\n  expected: x\n  actual:   y\n`);
    expect(r?.failures.map((f) => f.where)).toEqual(['snapshot.txt:1490', 'a.txt:2']);
    expect(r?.failures[1]).toMatchObject({ scenario: 'b c', expected: 'x', actual: 'y' });
  });

  it('marker with no blocks: an empty list', () => {
    expect(parseKeymapTests('NAVI-KEYMAP-TESTS: failed\nsomething else\n')).toEqual({ failures: [], more: 0 });
  });

  it('caps at 200 and counts the rest', () => {
    const many = Array.from({ length: 205 }, (_, i) => `s.txt:${i + 1}: c${i}\n  expected: a\n  actual: b`).join('\n');
    const r = parseKeymapTests(`NAVI-KEYMAP-TESTS: failed\n${many}`);
    expect(r?.failures).toHaveLength(200);
    expect(r?.more).toBe(5);
  });
});
