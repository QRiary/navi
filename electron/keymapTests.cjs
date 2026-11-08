// The keymap's own tests (a test step of the user's keymap that `qmk compile` runs): when they fail, NAVI shows each
// failing case. The contract is documented in docs/firmware-tests.md → “Your keymap's own tests in the build”.
'use strict';

const MARKER = 'NAVI-KEYMAP-TESTS: failed';
const MAX_FAILURES = 200;
const WHERE_RE = /^([^\s:][^:]*:\d+): (.*)$/;

/**
 * Compile output → null (no marker line: not a failure of the keymap's tests), else
 * `{ failures: [{ where, scenario, expected, actual }], more }`. A `file:line:` line not followed by an `expected:`
 * line (gtest's `x.cpp:53: Failure`) is not a case.
 */
function parseKeymapTests(output) {
  // GCC colors its messages; NUL bytes come from a wsl.exe that prints UTF-16 messages (see parseRunOutput).
  const lines = String(output ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\0/g, '').split(/\r?\n/);
  if (!lines.some((l) => l.trim() === MARKER)) return null;
  const failures = [];
  let more = 0;
  for (let i = 0; i < lines.length - 2; i++) {
    const m = WHERE_RE.exec(lines[i]);
    const e = /^ {2}expected:(.*)$/.exec(lines[i + 1]);
    const a = /^ {2}actual:(.*)$/.exec(lines[i + 2]);
    if (!m || !e || !a) continue;
    if (failures.length >= MAX_FAILURES) more++;
    else failures.push({ where: m[1], scenario: m[2].trimEnd(), expected: e[1].trim(), actual: a[1].trim() });
    i += 2;
  }
  return { failures, more };
}

module.exports = { parseKeymapTests, MARKER, MAX_FAILURES };
