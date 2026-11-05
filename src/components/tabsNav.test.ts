import { describe, expect, it } from 'vitest';
import { nextTabIndex } from './tabsNav';

describe('nextTabIndex', () => {
  it('moves right and wraps to the first tab', () => {
    expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
  });

  it('moves left and wraps to the last tab', () => {
    expect(nextTabIndex('ArrowLeft', 1, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
  });

  it('Home and End jump to the ends', () => {
    expect(nextTabIndex('Home', 2, 4)).toBe(0);
    expect(nextTabIndex('End', 0, 4)).toBe(3);
  });

  it('ignores other keys and empty bars', () => {
    expect(nextTabIndex('ArrowDown', 1, 3)).toBeNull();
    expect(nextTabIndex('Enter', 1, 3)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull();
  });

  it('treats an unknown current tab as the first one', () => {
    expect(nextTabIndex('ArrowRight', -1, 3)).toBe(1);
    expect(nextTabIndex('ArrowLeft', 7, 3)).toBe(2);
  });

  it('a single tab stays put', () => {
    expect(nextTabIndex('ArrowRight', 0, 1)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 1)).toBe(0);
  });
});
