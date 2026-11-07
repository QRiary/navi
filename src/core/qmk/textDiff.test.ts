import { describe, expect, it } from 'vitest';
import { diffLines, diffStats } from './textDiff';

const lines = (n: number, tag = 'line') => Array.from({ length: n }, (_, i) => `${tag} ${i}`);

describe('diffLines', () => {
  it('shows only the changed lines of a small file', () => {
    const d = diffLines('a\nb\nc\n', 'a\nB\nc\n');
    expect(diffStats(d)).toEqual({ added: 1, removed: 1 });
    expect(d.filter((l) => l.kind !== 'same').map((l) => `${l.kind}:${l.text}`)).toEqual(['del:b', 'add:B']);
  });

  it('ignores CRLF vs LF', () => {
    expect(diffStats(diffLines('a\r\nb\r\n', 'a\nb\n'))).toEqual({ added: 0, removed: 0 });
  });

  it('a few changes in a 3000-line file stay a few lines, not the whole file', () => {
    const before = lines(3000);
    const after = [...before];
    after[10] = 'changed near the top';
    after[1500] = 'changed in the middle';
    after.splice(2990, 0, 'added near the end');
    const d = diffLines(before.join('\n'), after.join('\n'));
    expect(diffStats(d)).toEqual({ added: 3, removed: 2 });
  });

  it('handles a large file that changed completely', () => {
    const d = diffLines(lines(3000, 'old').join('\n'), lines(3000, 'new').join('\n'));
    expect(diffStats(d)).toEqual({ added: 3000, removed: 3000 });
  });

  it('keeps the order of lines: replaying the diff gives the new text', () => {
    const before = lines(200);
    const after = before.filter((_, i) => i % 7 !== 0).map((l, i) => (i % 11 === 0 ? `${l}!` : l));
    after.splice(50, 0, 'x', 'y');
    const full = diffLines(before.join('\n'), after.join('\n'), Number.MAX_SAFE_INTEGER);
    expect(full.filter((l) => l.kind !== 'add').map((l) => l.text)).toEqual(before);
    expect(full.filter((l) => l.kind !== 'del').map((l) => l.text)).toEqual(after);
  });
});
