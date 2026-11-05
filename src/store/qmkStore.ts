/**
 * QMK: environment, sources of the chosen keyboard, build (log line by line), firmware archive, flashing.
 * All of these are real calls to the main process (electron/qmk.cjs, flash.cjs); not available in a browser.
 */
import { create } from 'zustand';
import { analyzeKeyboard, type KeyboardSourceInfo } from '../core/qmk/sources';
import type { OwnCodeFile } from '../core/project/tapHoldActions';
import { navi, type CompileResult, type FirmwareInfo, type FlashScan, type KeyboardSources, type KeymapSources, type QmkEnvironment, type TrustState } from '../desktop/bridge';
import { getLanguage } from '../i18n';
import { useSettingsStore } from './settingsStore';

export interface LogLine {
  stream: 'stdout' | 'stderr' | 'app';
  text: string;
}

export interface QmkState {
  env: QmkEnvironment | null;
  detecting: boolean;
  keyboards: string[] | null;
  sources: { keyboard: string; keymap: string; raw: KeyboardSources; info: KeyboardSourceInfo } | null;
  keymapSources: KeymapSources | null;
  /** The user's own C of the target's build folders (stand-in bases it names are never taken), null = not read. */
  ownCode: { keyboard: string; keymap: string; files: OwnCodeFile[] } | null;
  trust: TrustState | null;
  trustedFolders: string[];
  job: { id: number | null; kind: string; running: boolean; startedAt: number } | null;
  log: LogLine[];
  lastCompile: CompileResult | null;
  firmware: FirmwareInfo[];
  scan: FlashScan | null;
  error: string | null;

  detect(): Promise<void>;
  home(): string | null;
  userspace(): string | null;
  loadKeyboards(): Promise<void>;
  loadSources(keyboard: string, keymap: string): Promise<void>;
  loadOwnCode(keyboard: string, keymap: string): Promise<void>;
  /** loadOwnCode only when the last read is for another target or may be stale (see ownCodeStale). */
  ensureOwnCode(keyboard: string, keymap: string): Promise<void>;
  loadTrust(keyboard: string, keymap: string): Promise<void>;
  loadTrustedFolders(): Promise<void>;
  grantTrust(keyboard: string, keymap: string): Promise<void>;
  revokeTrust(dir: string): Promise<void>;
  compile(keyboard: string, keymap: string, env?: Record<string, string>, parallel?: number): Promise<CompileResult | null>;
  runDiagnostic(cmd: 'doctor' | 'version' | 'env'): Promise<void>;
  cancel(): Promise<void>;
  refreshFirmware(): Promise<void>;
  scanDevices(): Promise<FlashScan | null>;
  appendLog(line: LogLine): void;
  clearLog(): void;
}

function qmkSettings() {
  const s = useSettingsStore.getState().settings.qmk;
  return { home: s.home, msys: s.msys, wsl: s.wsl };
}

let subscribed = false;
/** The own-code read in flight (loadOwnCode), keyed by keyboard + keymap. */
let ownCodeRead: { key: string; promise: Promise<void> } | null = null;
/**
 * The own code may have changed since it was read. Only an editor outside NAVI changes it (NAVI's own keymap.c / navi.h
 * are left out of it), and the user has to leave the window for that: a read stays good until the window loses focus.
 */
let ownCodeStale = true;
if (typeof window !== 'undefined') window.addEventListener('blur', () => (ownCodeStale = true));

/** By default the build uses the number of CPU cores (up to 16): without -j QMK builds in one thread, many times slower. */
export function autoJobs(): number {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
  return Math.max(1, Math.min(16, Number.isInteger(n) ? n : 1));
}

export const useQmkStore = create<QmkState>()((set, get) => {
  if (navi && !subscribed) {
    subscribed = true;
    navi.qmk.onStarted((e) => set({ job: { id: e.job, kind: e.kind, running: true, startedAt: Date.now() } }));
    navi.qmk.onLog((e) => {
      const job = get().job;
      if (job && e.job !== null && job.id !== null && e.job !== job.id) return;
      get().appendLog({ stream: e.stream, text: e.line });
    });
    navi.qmk.onDone((e) => {
      const job = get().job;
      if (job && (job.id === e.job || job.id === null)) set({ job: { ...job, running: false } });
    });
  }

  return {
    env: null,
    detecting: false,
    keyboards: null,
    sources: null,
    keymapSources: null,
    ownCode: null,
    trust: null,
    trustedFolders: [],
    job: null,
    log: [],
    lastCompile: null,
    firmware: [],
    scan: null,
    error: null,

    async detect() {
      if (!navi) return;
      set({ detecting: true, error: null });
      try {
        const env = await navi.qmk.detect(qmkSettings());
        set({ env, detecting: false });
      } catch (err) {
        set({ detecting: false, error: (err as Error).message });
      }
    },

    home() {
      const env = get().env;
      return env?.homeValid ? env.home : null;
    },

    userspace() {
      return get().env?.userspace ?? null;
    },

    async loadKeyboards() {
      const home = get().home();
      if (!navi || !home) return;
      try {
        set({ keyboards: await navi.qmk.listKeyboards(home), error: null });
      } catch (err) {
        set({ error: (err as Error).message });
      }
    },

    async loadSources(keyboard, keymap) {
      const home = get().home();
      if (!navi || !home) return;
      try {
        const userspace = get().userspace();
        const raw = await navi.qmk.readKeyboard(home, userspace, keyboard);
        const km = await navi.qmk.readKeymap(home, userspace, keyboard, keymap);
        const info = analyzeKeyboard(
          raw.files,
          km.files.map((f) => ({ path: f.name, text: f.text })),
        );
        set({ sources: { keyboard, keymap, raw, info }, keymapSources: km, error: null });
        await get().loadTrust(keyboard, keymap);
        await get().loadOwnCode(keyboard, keymap);
      } catch (err) {
        set({ sources: null, keymapSources: null, trust: null, error: (err as Error).message });
      }
    },

    loadOwnCode(keyboard, keymap) {
      // A read already running for the same target is joined, not repeated (the Firmware page and a stand-in pick can overlap).
      const key = `${keyboard}\n${keymap}`;
      if (ownCodeRead?.key === key) return ownCodeRead.promise;
      ownCodeStale = false; // a blur from now on makes this read stale again
      const promise = (async () => {
        if (!navi) return;
        if (!get().env && !get().detecting) await get().detect();
        const home = get().home();
        if (!home) return;
        try {
          set({ ownCode: { keyboard, keymap, files: await navi.qmk.readOwnCode(home, get().userspace(), keyboard, keymap) } });
        } catch {
          // Not read: stand-ins are then picked without it, and the Firmware page reads it again.
        }
      })().finally(() => {
        if (ownCodeRead?.promise === promise) ownCodeRead = null;
      });
      ownCodeRead = { key, promise };
      return promise;
    },

    ensureOwnCode(keyboard, keymap) {
      const own = get().ownCode;
      if (!ownCodeStale && own?.keyboard === keyboard && own.keymap === keymap && !ownCodeRead) return Promise.resolve();
      return get().loadOwnCode(keyboard, keymap);
    },

    async loadTrust(keyboard, keymap) {
      const home = get().home();
      if (!navi || !home) {
        set({ trust: null });
        return;
      }
      try {
        set({ trust: await navi.trust.state(home, get().userspace(), keyboard, keymap) });
      } catch (err) {
        set({ trust: null, error: (err as Error).message });
      }
    },

    async loadTrustedFolders() {
      if (!navi) return;
      try {
        set({ trustedFolders: await navi.trust.list() });
      } catch (err) {
        set({ error: (err as Error).message });
      }
    },

    async grantTrust(keyboard, keymap) {
      const home = get().home();
      if (!navi || !home) return;
      try {
        // The main process works out the folders from the target and names them all in its dialog.
        await navi.trust.grant(home, get().userspace(), keyboard, keymap, getLanguage());
        await get().loadTrustedFolders();
        await get().loadTrust(keyboard, keymap);
      } catch (err) {
        set({ error: (err as Error).message });
      }
    },

    async revokeTrust(dir) {
      if (!navi) return;
      try {
        await navi.trust.revoke(dir);
        await get().loadTrustedFolders();
        const s = get().sources;
        if (s) await get().loadTrust(s.keyboard, s.keymap);
      } catch (err) {
        set({ error: (err as Error).message });
      }
    },

    async compile(keyboard, keymap, env, requested) {
      const home = get().home();
      if (!navi || !home) return null;
      const parallel = requested ?? autoJobs();
      const extra = `${parallel ? ` -j ${parallel}` : ''}${Object.entries(env ?? {}).map(([k, v]) => ` -e ${k}=${v}`).join('')}`;
      set({ log: [{ stream: 'app', text: `$ qmk compile -kb ${keyboard} -km ${keymap}${extra}` }], lastCompile: null, error: null, job: { id: null, kind: 'compile', running: true, startedAt: Date.now() } });
      try {
        // The build must use the folder the user sees (the main process checks it against NAVI's lookup and QMK's dry run).
        const s = get().sources;
        if (!get().keymapSources || s?.keyboard !== keyboard || s.keymap !== keymap) await get().loadSources(keyboard, keymap);
        const keymapDir = get().keymapSources?.dir;
        if (!keymapDir) throw new Error(get().error ?? 'Could not resolve the keymap folder');
        const res = await navi.qmk.compile(qmkSettings(), { home, userspace: get().userspace(), keyboard, keymap, keymapDir, env, parallel });
        set({ lastCompile: res, job: { ...(get().job ?? { kind: 'compile', startedAt: Date.now() }), id: res.job, running: false } });
        await get().refreshFirmware();
        return res;
      } catch (err) {
        const message = (err as Error).message;
        // A refused build: show the folder as it is now, so the next build is a choice made on what's on screen.
        await get().loadSources(keyboard, keymap);
        set({ error: message, job: null });
        return null;
      }
    },

    async runDiagnostic(cmd) {
      if (!navi) return;
      set({ log: [{ stream: 'app', text: `$ qmk ${cmd === 'version' ? '--version' : cmd}` }], error: null, job: { id: null, kind: cmd, running: true, startedAt: Date.now() } });
      try {
        await navi.qmk.run(qmkSettings(), cmd);
      } catch (err) {
        set({ error: (err as Error).message });
      } finally {
        const job = get().job;
        if (job) set({ job: { ...job, running: false } });
      }
    },

    async cancel() {
      const job = get().job;
      if (navi && job?.id !== null && job?.id !== undefined) {
        await navi.qmk.cancel(job.id);
        get().appendLog({ stream: 'app', text: '— cancelled —' });
      }
    },

    async refreshFirmware() {
      if (!navi) return;
      set({ firmware: await navi.firmware.list() });
    },

    async scanDevices() {
      if (!navi) return null;
      try {
        const scan = await navi.flash.scan();
        set({ scan });
        return scan;
      } catch (err) {
        set({ error: (err as Error).message });
        return null;
      }
    },

    appendLog(line) {
      set((s) => ({ log: s.log.length > 20000 ? [...s.log.slice(-15000), line] : [...s.log, line] }));
    },
    clearLog: () => set({ log: [] }),
  };
});
