// “Build + flash” end to end against a fake main process: which steps run, what is asked, and what stops it.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../core/project/types';

vi.mock('../device/rawHid', () => ({ sendRawPacket: vi.fn() }));

type Scan = { usb: { vid: string; pid: string; name: string; status: string; instanceId: string }[]; bootloaders: unknown[]; uf2Drives: { root: string; boardId: string; model: string }[]; scannedAt: string };
const empty = (): Scan => ({ usb: [], bootloaders: [], uf2Drives: [], scannedAt: '' });
const drive = { root: 'E:\\', boardId: 'RPI-RP2', model: 'RP2' };
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
function setup(opts: { disk?: { name: string; text: string; navi?: boolean }[] | 'navi'; tick?: boolean; compileCode?: number } = {}) {
  calls.length = 0;
  vi.mocked(raw.sendRawPacket).mockReset();
  toasts.useToastStore.setState({ toasts: [] });
  const p = { ...project, firmware: { ...project.firmware, bootloaderReboot: opts.tick ?? true } };
  const disk = opts.disk === 'navi' ? generate(p).map((f) => ({ ...f, navi: true })) : (opts.disk ?? []);
  projectStore.useProjectStore.setState({ project: p, saved: p });
  deviceStore.useDeviceStore.setState({ refresh: async () => {} });
  const fw = { id: 'fw1', file: 'kb.uf2', source: 'build' };
  qmkStore.useQmkStore.setState({
    env: { runner: 'msys', homeValid: true, home: 'C:/qmk', userspace: null } as never,
    keymapSources: { dir: 'D', exists: true, root: 'firmware', files: disk },
    sources: null,
    ownCode: null,
    firmware: [{ id: 'bk', file: 'CURRENT.UF2', source: 'backup', boardId: 'RPI-RP2' }] as never,
    loadSources: async () => {},
    ensureOwnCode: async () => {},
    refreshFirmware: async () => {},
    compile: vi.fn(async () => {
      calls.push('compile');
      return { job: 1, code: opts.compileCode ?? 0, firmware: fw as never, durationMs: 1 };
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

  it('first flash of a board without a saved CURRENT.UF2: stops before flashing', async () => {
    setup({ disk: 'navi' });
    qmkStore.useQmkStore.setState({ firmware: [] });
    scans = [{ ...empty(), uf2Drives: [drive] }];
    await runToEnd();
    expect(calls).toEqual(['compile']);
    expect(toasts.useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true);
  });
});
