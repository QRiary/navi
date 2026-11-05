import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Hints, help and states conventions:
 *  • a disabled control says why: `{...whyDisabled(reason, title)}` (`src/lib/whyDisabled.ts`), never a bare
 *    `disabled={…}`. A line that must stay bare (a prop passed through to the element that shows the reason, a
 *    field locked while a job runs with the job shown beside it) carries a `disabled-ok` comment saying why;
 *  • QMK docs links come from `QMK_DOCS` (`src/lib/qmkDocs.ts`), so `npm run check:docs` sees and checks them all.
 */

const SRC = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : []));
}

function offending(test: (line: string) => boolean): string[] {
  const bad: string[] = [];
  for (const file of files(SRC)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (test(line)) bad.push(`${file.slice(SRC.length + 1)}:${i + 1} ${line.trim()}`);
      });
  }
  return bad;
}

describe('hints convention', () => {
  it('every disabled control goes through whyDisabled', () => {
    expect(offending((line) => /\bdisabled=\{/.test(line) && !line.includes('disabled-ok'))).toEqual([]);
  });

  it('docs links are only in the QMK_DOCS registry', () => {
    expect(offending((line) => /https:\/\/docs\.qmk\.fm/.test(line))).toEqual([]);
  });
});
