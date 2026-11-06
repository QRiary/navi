import { describe, expect, it } from 'vitest';
import { pickRawTarget } from './rawHid';

const dev = (vendorId: number, productId: number, productName = 'kb') => ({ vendorId, productId, productName });

describe('pickRawTarget', () => {
  it('the project VID:PID wins, even with other keyboards plugged in', () => {
    expect(pickRawTarget([dev(1, 1, 'other'), dev(0xfeed, 2)], { vid: 0xfeed, pid: 2 })).toEqual(dev(0xfeed, 2));
  });
  it('without a VID:PID: only a single keyboard is picked (one keyboard may be several HID objects)', () => {
    expect(pickRawTarget([dev(1, 1), dev(1, 1)], null)).toEqual(dev(1, 1));
    expect(pickRawTarget([dev(1, 1), dev(2, 2)], null)).toBe('several');
    expect(pickRawTarget([], null)).toBe('none');
  });
  it('a VID:PID nobody has: falls back to the single keyboard there is', () => {
    expect(pickRawTarget([dev(1, 1)], { vid: 9, pid: 9 })).toEqual(dev(1, 1));
    expect(pickRawTarget([dev(1, 1), dev(2, 2)], { vid: 9, pid: 9 })).toBe('several');
  });
});
