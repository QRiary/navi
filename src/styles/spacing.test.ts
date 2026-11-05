import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Spacing stays on the 4px grid (Material's 4/8dp rhythm): every padding, margin and gap in px is
 * 0, 1, 2 or a multiple of 4. A value that only lines something up (not spacing) is kept with a
 * `grid-ok` comment on the same line.
 */

const SRC = join(__dirname, '..');
const SPACING = /\b(padding|margin|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block)(-(start|end))?)?\s*:\s*([^;]+);/g;
const INLINE = /\b(padding|margin|gap|rowGap|columnGap)(Top|Right|Bottom|Left|Inline|Block)?\s*:\s*('[^']*'|-?\d+(\.\d+)?)/g;

const onGrid = (n: number) => Math.abs(n) <= 2 || Math.abs(n) % 4 === 0;

function offGridPx(value: string): number[] {
  // Inside calc() only the terms that are a length on their own count (calc(16px * var(--space))).
  return [...value.matchAll(/(-?\d+(\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => !onGrid(n));
}

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name), ext) : ext.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe('spacing grid', () => {
  it('CSS padding, margin and gap are on the 4px grid', () => {
    const bad: string[] = [];
    for (const file of files(join(SRC, 'styles'), /\.css$/)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (line.includes('grid-ok')) return;
          for (const m of line.matchAll(SPACING)) {
            // calc((var(--track) - 14px) / 2) centers a slider thumb: a size, not spacing.
            if (/var\(--track\)/.test(m[6])) continue;
            const off = offGridPx(m[6]);
            if (off.length) bad.push(`${file.slice(SRC.length + 1)}:${i + 1} ${m[0].trim()}`);
          }
        });
    }
    expect(bad).toEqual([]);
  });

  it('inline style spacing in components is on the 4px grid', () => {
    const bad: string[] = [];
    for (const file of files(SRC, /\.tsx$/)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!line.includes('style=') || line.includes('grid-ok')) return;
          for (const m of line.matchAll(INLINE)) {
            const v = m[3];
            const off = v.startsWith("'") ? offGridPx(v) : onGrid(Number(v)) ? [] : [Number(v)];
            if (off.length) bad.push(`${file.slice(SRC.length + 1)}:${i + 1} ${m[0]}`);
          }
        });
    }
    expect(bad).toEqual([]);
  });
});
