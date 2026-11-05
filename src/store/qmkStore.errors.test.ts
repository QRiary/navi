// A refused build is shown as a sentence; the main process's raw text goes behind “Details”. The sentence is picked by
// matching that raw text, so this test feeds the real refusals from electron/ and fails if their wording drifts.
import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { trustRefusal } = require('../../electron/trust.cjs');
const { checkBuildFolder } = require('../../electron/qmk.cjs');

let buildRefusalSentence: typeof import('./qmkStore').buildRefusalSentence;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).window = { addEventListener: () => {} };
  ({ buildRefusalSentence } = await import('./qmkStore'));
});

const id = (p: string) => p;
const expected = { dir: 'C:/qmk/keyboards/acme/keymaps/mine', root: 'firmware' };

describe('build refusal sentence', () => {
  it('names the untrusted folder', () => {
    const raw = trustRefusal({ issues: [{ file: 'rules.mk', reason: 'CC is not allowed' }], trusted: false });
    expect(buildRefusalSentence(raw)).toMatch(/files NAVI can’t check as safe/);
  });

  it('names a folder mismatch', () => {
    const raw = checkBuildFolder({ output: 'Compiling keymap with make', expected, shown: 'C:/elsewhere', userspace: null, toLocal: id });
    expect(raw).toBeTruthy();
    expect(buildRefusalSentence(raw)).toMatch(/different keymap folder/);
  });

  it('names a dry run that printed no build command', () => {
    const raw = checkBuildFolder({ output: '☒ Invalid keymap argument.', expected, shown: expected.dir, userspace: null, toLocal: id });
    expect(buildRefusalSentence(raw)).toMatch(/didn’t say which keymap folder/);
  });

  it('anything else is a build that didn’t start', () => {
    expect(buildRefusalSentence('build option is not allowed: CC')).toBe('The build didn’t start.');
  });
});
