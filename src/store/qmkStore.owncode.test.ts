// The user's own C read (stand-in picking) through the store: never repeated while the result is still good. It was
// re-read on every tap-hold key selected, ~350ms over \\wsl.localhost each, and froze the window while it ran.
import { beforeAll, describe, expect, it } from 'vitest';

let reads = 0;
const listeners = new Map<string, () => void>();
const fakeNavi = {
  qmk: {
    onStarted: () => {},
    onLog: () => {},
    onDone: () => {},
    detect: async () => ({ home: 'C:/qmk_firmware', homeValid: true, userspace: null }),
    readOwnCode: async () => {
      reads++;
      await new Promise((r) => setTimeout(r, 5));
      return [{ path: 'own.c', text: 'case 0xC3:' }];
    },
  },
};
let useQmkStore: typeof import('./qmkStore').useQmkStore;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).window = { navi: fakeNavi, addEventListener: (type: string, fn: () => void) => listeners.set(type, fn) };
  ({ useQmkStore } = await import('./qmkStore'));
});

describe('own code read', () => {
  it('a read already running for the same target is joined', async () => {
    reads = 0;
    const s = useQmkStore.getState();
    await Promise.all([s.loadOwnCode('acme/split', 'mine'), s.loadOwnCode('acme/split', 'mine')]);
    expect(reads).toBe(1);
    expect(useQmkStore.getState().ownCode?.files.map((f) => f.path)).toEqual(['own.c']);
  });

  it('ensureOwnCode reads again only after the window lost focus, or for another target', async () => {
    const s = useQmkStore.getState();
    await s.loadOwnCode('acme/split', 'mine');
    reads = 0;
    for (let i = 0; i < 5; i++) await s.ensureOwnCode('acme/split', 'mine'); // switching keys
    expect(reads).toBe(0);
    listeners.get('blur')!(); // the user went to edit their C
    await s.ensureOwnCode('acme/split', 'mine');
    await s.ensureOwnCode('acme/split', 'mine');
    expect(reads).toBe(1);
    await s.ensureOwnCode('acme/split', 'other');
    expect(reads).toBe(2);
  });
});
