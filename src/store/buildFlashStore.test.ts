// “Build + flash” end to end against a fake main process: which steps run, what is asked, and what stops it.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../core/project/types';

vi.mock('../device/rawHid', () => ({ sendRawPacket: vi.fn() }));

type Scan = { usb: { vid: string; pid: string; name: string; status: string; instanceId: string }[]; bootloaders: unknown[]; uf2Drives: { root: string; boardId: string; model: string; current: boolean }[]; scannedAt: string };
const empty = (): Scan => ({ usb: [], bootloaders: [], uf2Drives: [], scannedAt: '' });
const drive = { root: 'E:\\', boardId: 'RPI-RP2', model: 'RP2', current: true };
const keyboardBack = (): Scan => ({ ...empty(), usb: [{ vid: 'FEED', pid: '0001', name: 'kb', status: 'OK', instanceId: 'x' }] });

let scans: Scan[] = [];
const calls: string[] = [];
const fakeNavi = {
  qmk: {
    onStarted: () => {},
    onLog: () => {},
    onDone: () => {},
    writeKeymap: vi.fn(async (_h: string, _u: unknown, _kb: string, _km: string, files: { name: string }[]) => {
      calls.push(`write ${files.map((f) => f.name).join(',')}`);
      return { dir: 'D', backup: null };
    }),
  },
  flash: {
    scan: vi.fn(async () => (scans.length > 1 ? scans.shift()! : (scans[0] ?? empty()))),
    checkUf2: vi.fn(async () => ({ ok: true })),
    uf2: vi.fn(async () => {
      calls.push('uf2');
      return { copied: true, copyError: null, driveGone: true, bytes: 1 };
    }),
    backupUf2: vi.fn(async (root: string) => {
      calls.push(`backup ${root}`);
      return { id: 'bk2', source: 'backup', boardId: 'RPI-RP2' };
    }),
    qmk: vi.fn(),
  },
};

let store: typeof import('./buildFlashStore');
let projectStore: typeof import('./projectStore');
let qmkStore: typeof import('./qmkStore');
let deviceStore: typeof import('./deviceStore');
let toasts: typeof import('./toastStore');
let raw: typeof import('../device/rawHid');
let project: Project;
let generatedNow: { name: string; text: string }[];

beforeAll(async () => {
  (globalThis as Record<string, unknown>).window = { navi: fakeNavi, addEventListener: () => {} };
  store = await import('./buildFlashStore');
  projectStore = await import('./projectStore');
  qmkStore = await import('./qmkStore');
  deviceStore = await import('./deviceStore');
  toasts = await import('./toastStore');
  raw = await import('../device/rawHid');
  const { createDilemmaProject } = await import('../core/project/factory');
  const { generateFiles } = await import('../lib/firmwareFiles');
  const { loadSpec } = await import('../core/keycodes/spec');
  const base = createDilemmaProject();
  project = { ...base, device: { vid: 0xfeed, pid: 0x0001 }, firmware: { ...base.firmware, keyboard: 'acme/kb', keymap: 'mine', bootloaderReboot: true } } as Project;
  generate = (p) => generateFiles(p, loadSpec(p.firmware.keycodeSpec ?? 'latest'), undefined, null).files;
  generatedNow = generate(project);
});
let generate: (p: Project) => { name: string; text: string }[];

/** disk 'navi': the folder holds exactly what NAVI would write now, as NAVI wrote it. */
function setup(opts: { disk?: { name: string; text: string; navi?: boolean }[] | 'navi'; tick?: boolean; compileCode?: number; runTests?: boolean; tests?: boolean; runner?: string; testResult?: unknown; keymapTests?: { failures: unknown[]; more: number } } = {}) {
  calls.length = 0;
  vi.mocked(raw.sendRawPacket).mockReset();
  toasts.useToastStore.setState({ toasts: [] });
  const p = { ...project, firmware: { ...project.firmware, bootloaderReboot: opts.tick ?? true, runTests: opts.runTests ?? false, tests: opts.tests ?? opts.runTests ?? false } };
  const disk = opts.disk === 'navi' ? generate(p).map((f) => ({ ...f, navi: true })) : (opts.disk ?? []);
  projectStore.useProjectStore.setState({ project: p, saved: p });
  deviceStore.useDeviceStore.setState({ refresh: async () => {} });
  const fw = { id: 'fw1', file: 'kb.uf2', source: 'build' };
  qmkStore.useQmkStore.setState({
    env: { runner: { kind: opts.runner ?? 'wsl', path: 'x' }, homeValid: true, home: 'C:/qmk', userspace: null } as never,
    runTests: vi.fn(async () => {
      calls.push('tests');
      return (opts.testResult ?? { status: 'pass', passed: 3, failed: 0 }) as never;
    }),
    keymapSources: { dir: 'D', exists: true, root: 'firmware', files: disk },
    sources: null,
    ownCode: null,
    firmware: [{ id: 'bk', file: 'CURRENT.UF2', source: 'backup', boardId: 'RPI-RP2' }] as never,
    loadSources: async () => {},
    ensureOwnCode: async () => {},
    refreshFirmware: async () => {},
    compile: vi.fn(async (_kb: string, _km: string, _env?: unknown, _par?: unknown, o?: { acceptTests?: boolean }) => {
      calls.push(o?.acceptTests ? 'compile accept' : 'compile');
      if (opts.keymapTests && !o?.acceptTests) return { job: 1, code: 2, firmware: null, durationMs: 1, keymapTests: opts.keymapTests } as never;
      return { job: 1, code: opts.compileCode ?? 0, firmware: fw as never, durationMs: 1, keymapTests: null };
    }),
  });
  store.useBuildFlashStore.setState({ phase: 'idle', review: [], pressWhy: '' });
}

/** Runs the timers until the run ends (each await in the steps needs a turn). */
async function runToEnd() {
  let ended = false;
  const p = store.useBuildFlashStore.getState().run().then(() => (ended = true));
  for (let i = 0; i < 200 && !ended; i++) await vi.advanceTimersByTimeAsync(500);
  await p;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('build + flash', () => {
  it('with the tick: writes changed files, builds, sends the reboot packet, flashes the UF2 drive, waits for the keyboard', async () => {
    setup({ disk: [] });
    vi.mocked(raw.sendRawPacket).mockImplementation(async () => {
      calls.push('reboot');
      scans = [{ ...empty(), uf2Drives: [drive] }, keyboardBack()];
      return { sent: true, device: { vendorId: 0xfeed, productId: 1, productName: 'kb' } };
    });
    scans = [empty()];
    await runToEnd();
    expect(calls).toEqual([`write ${generatedNow.map((f) => f.name).join(',')}`, 'compile', 'reboot', 'uf2']);
    expect(toasts.useToastStore.getState().toasts.filter((t) => t.tone === 'error')).toEqual([]);
    expect(store.useBuildFlashStore.getState().phase).toBe('idle');
  });

  it('files already on disk as NAVI wrote them: nothing written, no question', async () => {
    setup({ disk: 'navi' });
    scans = [{ ...empty(), uf2Drives: [drive] }, keyboardBack()];
    await runToEnd();
    expect(calls).toEqual(['compile', 'uf2']); // already in the bootloader: no packet
    expect(raw.sendRawPacket).not.toHaveBeenCalled();
  });

  it('a file edited outside NAVI: stops for its diff; “stop” writes and builds nothing', async () => {
    setup({ disk: [{ name: 'keymap.c', text: '// my hand edit', navi: false }] });
    scans = [empty()];
    const p = store.useBuildFlashStore.getState().run();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.useBuildFlashStore.getState().phase).toBe('review');
    expect(store.useBuildFlashStore.getState().review.map((f) => f.name)).toEqual(['keymap.c']);
    store.useBuildFlashStore.getState().answerReview(false);
    await p;
    expect(calls).toEqual([]);
    expect(store.useBuildFlashStore.getState().phase).toBe('idle');
  });

  it('a file NAVI wrote but the project changed since: written without a question', async () => {
    setup({ disk: [{ name: 'keymap.c', text: '// older NAVI output', navi: true }] });
    scans = [{ ...empty(), uf2Drives: [drive] }, keyboardBack()];
    await runToEnd();
    expect(calls[0]).toMatch(/^write /);
  });

  it('no tick: asks for QK_BOOT and flashes once the bootloader shows up', async () => {
    setup({ disk: 'navi', tick: false });
    scans = [empty(), empty(), empty()];
    const p = store.useBuildFlashStore.getState().run();
    await vi.advanceTimersByTimeAsync(2500);
    expect(store.useBuildFlashStore.getState().phase).toBe('press');
    expect(raw.sendRawPacket).not.toHaveBeenCalled();
    scans = [{ ...empty(), uf2Drives: [drive] }, keyboardBack()];
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(500);
    await p;
    expect(calls).toEqual(['compile', 'uf2']);
  });

  it('the packet gets no restart (old firmware): falls back to QK_BOOT after the wait', async () => {
    setup({ disk: 'navi' });
    vi.mocked(raw.sendRawPacket).mockResolvedValue({ sent: true, device: { vendorId: 0xfeed, productId: 1, productName: 'kb' } });
    scans = [empty()];
    const p = store.useBuildFlashStore.getState().run();
    await vi.advanceTimersByTimeAsync(store.REBOOT_WAIT_MS - 1000);
    expect(store.useBuildFlashStore.getState().phase).toBe('restarting');
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.useBuildFlashStore.getState().phase).toBe('press');
    store.useBuildFlashStore.getState().cancel();
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(calls).toEqual(['compile']);
    expect(store.useBuildFlashStore.getState().phase).toBe('idle');
  });

  it('a failed build stops before anything reaches the keyboard', async () => {
    setup({ disk: 'navi', compileCode: 2 });
    scans = [{ ...empty(), uf2Drives: [drive] }];
    await runToEnd();
    expect(calls).toEqual(['compile']);
    expect(toasts.useToastStore.getState().toasts.some((t) => t.tone === 'error' && /exit code 2|код 2/.test(t.message))).toBe(true);
  });

  describe('the keymap’s own tests fail in the build', () => {
    const failed = { failures: [{ where: 's.txt:1', scenario: 'a b', expected: 'x', actual: 'y' }], more: 0 };

    it('asks; accepting builds again with acceptTests and the run goes on', async () => {
      setup({ disk: 'navi', keymapTests: failed });
      scans = [{ ...empty(), uf2Drives: [drive] }, keyboardBack()];
      const p = store.useBuildFlashStore.getState().run();
      await vi.advanceTimersByTimeAsync(0);
      expect(store.useBuildFlashStore.getState().phase).toBe('tests-failed');
      expect(store.useBuildFlashStore.getState().testFailures).toEqual(failed);
      store.useBuildFlashStore.getState().answerTests(true);
      for (let i = 0; i < 200 && store.useBuildFlashStore.getState().phase !== 'idle'; i++) await vi.advanceTimersByTimeAsync(500);
      await p;
      expect(calls).toEqual(['compile', 'compile accept', 'uf2']);
    });

    it('stop: no second build, nothing flashed', async () => {
      setup({ disk: 'navi', keymapTests: failed });
      scans = [empty()];
      const p = store.useBuildFlashStore.getState().run();
      await vi.advanceTimersByTimeAsync(0);
      store.useBuildFlashStore.getState().answerTests(false);
      await p;
      expect(calls).toEqual(['compile']);
      expect(store.useBuildFlashStore.getState().phase).toBe('idle');
      expect(toasts.useToastStore.getState().toasts.filter((x) => x.tone === 'error')).toEqual([]);
    });

    it('cancel while asking ends the run quietly', async () => {
      setup({ disk: 'navi', keymapTests: failed });
      scans = [empty()];
      const p = store.useBuildFlashStore.getState().run();
      await vi.advanceTimersByTimeAsync(0);
      store.useBuildFlashStore.getState().cancel();
      await p;
      expect(calls).toEqual(['compile']);
      expect(store.useBuildFlashStore.getState().phase).toBe('idle');
    });
  });

  it('first flash of a board without a saved CURRENT.UF2: saves it, then flashes', async () => {
    setup({ disk: 'navi' });
    qmkStore.useQmkStore.setState({ firmware: [] });
    scans = [{ ...empty(), uf2Drives: [drive] }, keyboardBack()];
    await runToEnd();
    expect(calls).toEqual(['compile', 'backup E:\\', 'uf2']);
    expect(toasts.useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(false);
  });

  it('a bootloader without CURRENT.UF2 (the RP2040 ROM) and no backup: stops before flashing, says how to save one', async () => {
    setup({ disk: 'navi' });
    qmkStore.useQmkStore.setState({ firmware: [] });
    scans = [{ ...empty(), uf2Drives: [{ ...drive, current: false }] }];
    await runToEnd();
    expect(calls).toEqual(['compile']);
    expect(toasts.useToastStore.getState().toasts.some((t) => t.tone === 'error' && /picotool/.test(t.message))).toBe(true);
  });

  it('no CURRENT.UF2 but a picotool copy added as the backup: flashes', async () => {
    setup({ disk: 'navi' });
    qmkStore.useQmkStore.setState({ firmware: [{ id: 'pt', file: 'backup-left.uf2', source: 'backup', boardId: 'RPI-RP2' }] as never });
    scans = [{ ...empty(), uf2Drives: [{ ...drive, current: false }] }, keyboardBack()];
    await runToEnd();
    expect(calls).toEqual(['compile', 'uf2']);
    expect(toasts.useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(false);
  });

  it('no CURRENT.UF2, no backup, but the user once chose “flash anyway” for this board type: flashes', async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) });
    try {
      const { acceptNoBackup } = await import('../lib/flashSteps');
      acceptNoBackup('RPI-RP2');
      setup({ disk: 'navi' });
      qmkStore.useQmkStore.setState({ firmware: [] });
      scans = [{ ...empty(), uf2Drives: [{ ...drive, current: false }] }, keyboardBack()];
      await runToEnd();
      expect(calls).toEqual(['compile', 'uf2']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a failed CURRENT.UF2 save stops before flashing', async () => {
    setup({ disk: 'navi' });
    qmkStore.useQmkStore.setState({ firmware: [] });
    fakeNavi.flash.backupUf2.mockRejectedValueOnce(new Error('read error'));
    scans = [{ ...empty(), uf2Drives: [drive] }];
    await runToEnd();
    expect(calls).toEqual(['compile']);
    expect(toasts.useToastStore.getState().toasts.some((t) => t.tone === 'error' && !!t.detail?.includes('read error'))).toBe(true);
  });

  describe('firmware tests before flashing (firmware.runTests)', () => {
    const errors = () => toasts.useToastStore.getState().toasts.filter((t) => t.tone === 'error');

    it('a pass: the tests run after the write and before the build, then it flashes', async () => {
      setup({ disk: 'navi', runTests: true });
      scans = [{ ...empty(), uf2Drives: [drive] }, keyboardBack()];
      await runToEnd();
      expect(calls).toEqual(['tests', 'compile', 'uf2']);
      expect(errors()).toEqual([]);
    });

    it('a mismatch stops before the build, with the mismatch lines as details and a way to Firmware → flash', async () => {
      const failure = 'navi_tests.txt:7: r0c1\n  expected: x\n  actual: b';
      setup({ disk: 'navi', runTests: true, testResult: { status: 'fail', passed: 2, failed: 1, failures: [failure] } });
      scans = [{ ...empty(), uf2Drives: [drive] }];
      await runToEnd();
      expect(calls).toEqual(['tests']);
      expect(errors()).toHaveLength(1);
      expect(errors()[0].detail).toBe(failure);
      expect(errors()[0].action).toBeDefined();
    });

    it('tests that can’t build stop it too, with the compiler errors as details', async () => {
      setup({ disk: 'navi', runTests: true, testResult: { status: 'cant-build', errors: ['own.c:5: error: implicit declaration'] } });
      scans = [{ ...empty(), uf2Drives: [drive] }];
      await runToEnd();
      expect(calls).toEqual(['tests']);
      expect(errors()[0].detail).toContain('implicit declaration');
    });

    it('the tick without “Write firmware tests”, or on QMK MSYS: stops without running or building anything', async () => {
      setup({ disk: 'navi', runTests: true, tests: false });
      scans = [{ ...empty(), uf2Drives: [drive] }];
      await runToEnd();
      expect(calls).toEqual([]);
      expect(errors()).toHaveLength(1);
      setup({ disk: 'navi', runTests: true, runner: 'msys' });
      await runToEnd();
      expect(calls).toEqual([]);
      expect(errors()).toHaveLength(1);
    });

    it('the tick off: no tests', async () => {
      setup({ disk: 'navi' });
      scans = [{ ...empty(), uf2Drives: [drive] }, keyboardBack()];
      await runToEnd();
      expect(calls).toEqual(['compile', 'uf2']);
    });
  });
});
