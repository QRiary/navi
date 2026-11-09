import { describe, expect, it } from 'vitest';
import { comboRows, contrastRatio, heatFill, heatScale, inkOn, shortCount } from './heatmap';

describe('shortCount', () => {
  it('keeps a legend label at most 4 characters, so marks on the 200px bar never touch', () => {
    expect(shortCount(978)).toBe('978');
    expect(shortCount(3910)).toBe('3.9k');
    expect(shortCount(8798)).toBe('8.8k');
    expect(shortCount(9960)).toBe('10k');
    expect(shortCount(15640)).toBe('16k');
    expect(shortCount(879815)).toBe('880k');
    expect(shortCount(2_400_000)).toBe('2.4M');
    expect(shortCount(15640, 'к')).toBe('16к');
  });
});
import { emptyKeyCounts } from '../core/project/keyCounts';
import type { Combo } from '../core/project/types';

describe('heat scale', () => {
  // Reference positions the formula gives for these counts.
  const COUNTS = [45, 160, 506, 515, 1607, 9997];
  const EXPECTED = [0.06500651572820179, 0.25822221797470735, 0.4428293435294869, 0.5441248892337454, 0.727746928788454, 0.962070104745405];

  it('places each count by half its log distance from the geometric mean, half its rank', () => {
    const s = heatScale([...COUNTS, 0]);
    COUNTS.forEach((c, i) => expect(s.at(c)).toBeCloseTo(EXPECTED[i], 12));
  });
  it('never pressed has no position, so the key is drawn as an outline', () => {
    expect(heatScale(COUNTS).at(0)).toBeNull();
    expect(heatScale([0, 0]).at(5)).toBeNull();
    expect(heatScale([]).marks).toEqual([]);
  });
  it('one used key sits in the middle, and a huge outlier can’t flatten the rest', () => {
    expect(heatScale([7]).at(7)).toBe(0.5);
    const s = heatScale([1, 2, 3, 4, 1_000_000]);
    expect(s.at(4)! - s.at(1)!).toBeGreaterThan(0.2);
  });
  it('a key pressed a few dozen times looks clearly darker than one pressed a few hundred times', () => {
    const s = heatScale([30, 40, 300, 400, 3000, 16000]);
    expect(s.at(300)! - s.at(30)!).toBeGreaterThan(0.3);
  });
  it('equal counts share one position, and more presses never get less', () => {
    const s = heatScale([5, 5, 9, 100]);
    expect(s.at(5)! < s.at(9)! && s.at(9)! < s.at(100)!).toBe(true);
  });
  it('marks the real least, middle and most used counts', () => {
    expect(heatScale([...COUNTS, 0]).marks.map((m) => m.count)).toEqual([45, 515, 9997]);
    expect(heatScale([3, 3]).marks.map((m) => m.count)).toEqual([3]);
  });
  it('the ramp darkens to light in OKLab, readable ink (4.5:1) all along and visible on the dark key', () => {
    expect(contrastRatio(heatFill(1), '#000000')).toBeGreaterThan(contrastRatio(heatFill(0.5), '#000000'));
    expect(contrastRatio(heatFill(0), '#080808')).toBeGreaterThan(1.3);
    for (let k = 0; k <= 100; k++) {
      const f = heatFill(k / 100);
      expect(contrastRatio(f, inkOn(f))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('ink flips with the fill', () => {
    expect(inkOn('#ffffff')).toBe('#000000');
    expect(inkOn('#000000')).toBe('#ffffff');
  });
});

describe('combo rows', () => {
  const mk = (id: string, name: string): Combo => ({ id, name, keys: [], result: 0 });
  it('never fired first (the point: finding unused combos), then by count, missing entries are 0', () => {
    const f = emptyKeyCounts();
    f.combos = { esc: 3, tab: 9 };
    const rows = comboRows([mk('c1', 'zed'), mk('c2', 'esc'), mk('c3', 'tab'), mk('c4', 'abc')], f);
    expect(rows.map((r) => [r.combo.id, r.count])).toEqual([
      ['c4', 0],
      ['c1', 0],
      ['c2', 3],
      ['c3', 9],
    ]);
    expect(comboRows([mk('c1', '')], null)[0].count).toBe(0);
  });
});
