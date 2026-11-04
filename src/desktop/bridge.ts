/**
 * Bridge to the desktop app (Electron). Implementation — electron/preload.cjs.
 * In a normal browser (npm run dev) there is no window.navi — then projects are kept in localStorage,
 * and building, flashing and access to QMK files are unavailable (and the interface says so honestly).
 */
import type { ProjectSummary } from '../core/project/types';

export interface NaviInfo {
  dataDir: string;
  projectsDir: string;
  firmwareDir: string;
  configPath: string;
  version: string;
  platform: string;
  probeMode: boolean;
}

export interface StoredSummary extends ProjectSummary {
  unsaved: boolean;
  broken?: boolean;
}

export interface Revision {
  file: string;
  at: string;
  label: string | null;
  size: number;
}

export interface QmkSettings {
  home: string;
  msys: string;
  wsl: string;
}

export interface QmkEnvironment {
  runner: { kind: 'msys' | 'path' | 'wsl'; path: string } | null;
  wsl: { name: string; hasQmk: boolean }[] | null;
  cliVersion: string | null;
  home: string | null;
  homeSource: 'settings' | 'qmk-config' | 'default-folder' | null;
  homeValid: boolean;
  git: { commit: string; date: string } | null;
  errors: string[];
}

export interface SourceFile {
  path: string;
  text: string;
}

export interface KeyboardSources {
  files: SourceFile[];
  keymaps: { name: string; at: string; files: string[] }[];
}

export interface KeymapSources {
  dir: string;
  exists: boolean;
  files: { name: string; text: string }[];
}

export interface FirmwareInfo {
  id: string;
  file: string;
  sha256: string;
  size: number;
  createdAt: string;
  format: 'uf2' | 'hex' | 'bin';
  uf2Family?: number | null;
  /** backup — a copy of the whole board memory taken from the bootloader drive (CURRENT.UF2). */
  source: 'build' | 'import' | 'backup';
  keyboard?: string;
  keymap?: string;
  durationMs?: number;
  originalPath?: string;
  boardId?: string;
  model?: string;
  /** For backups: which memory range is in the file. */
  flash?: { start: number; end: number; bytes: number; blocks: number };
}

export interface CompileResult {
  job: number | null;
  code: number | null;
  firmware: FirmwareInfo | null;
  durationMs: number;
}

export interface LogEvent {
  job: number | null;
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface BootloaderDevice {
  type: string;
  vid: string;
  pid: string;
  name: string;
  device: string;
  status: string;
}

export interface Uf2Drive {
  root: string;
  model: string;
  boardId: string;
  info: string;
}

export interface FlashScan {
  usb: { vid: string; pid: string; name: string; status: string; instanceId: string }[];
  bootloaders: BootloaderDevice[];
  uf2Drives: Uf2Drive[];
  scannedAt: string;
}

export interface Uf2Check {
  ok: boolean;
  reason?: 'not-uf2' | 'family-mismatch';
  unverified?: boolean;
  /** A backup from a bootloader of the same type — fits this board. */
  backup?: boolean;
  desc: { format: string; size: number; uf2Family?: number | null };
  expected?: number[];
}

export interface NaviBridge {
  platform: string;
  info(): Promise<NaviInfo>;
  readConfig(): Promise<string | null>;
  writeConfig(text: string): Promise<void>;
  onConfigChanged(cb: (text: string) => void): () => void;
  setTitleBarColors(colors: { color: string; symbolColor: string }): Promise<void>;
  openPath(which: 'data' | 'projects' | 'firmware' | 'config'): Promise<string>;
  openExternal(url: string): Promise<void>;
  saveFile(opts: { name: string; text: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
  openFile(opts: { filters?: { name: string; extensions: string[] }[] }): Promise<{ name: string; path: string; text: string } | null>;
  probeResult(result: unknown): Promise<void>;
  projects: {
    list(): Promise<StoredSummary[]>;
    read(id: string): Promise<{ saved: string | null; draft: string | null }>;
    saveDraft(id: string, text: string): Promise<void>;
    discardDraft(id: string): Promise<void>;
    save(id: string, text: string, label?: string): Promise<void>;
    revisions(id: string): Promise<Revision[]>;
    readRevision(id: string, file: string): Promise<string>;
    remove(id: string): Promise<void>;
  };
  qmk: {
    detect(settings: QmkSettings): Promise<QmkEnvironment>;
    listKeyboards(home: string): Promise<string[]>;
    readKeyboard(home: string, kb: string): Promise<KeyboardSources>;
    readKeymap(home: string, kb: string, km: string): Promise<KeymapSources>;
    writeKeymap(home: string, kb: string, km: string, files: { name: string; text: string }[]): Promise<{ dir: string; backup: string | null }>;
    writeKeyboard(home: string, kb: string, files: { name: string; text: string }[]): Promise<{ dir: string; backup: string | null }>;
    compile(settings: QmkSettings, opts: { home: string; keyboard: string; keymap: string; env?: Record<string, string>; parallel?: number }): Promise<CompileResult>;
    run(settings: QmkSettings, command: 'doctor' | 'version' | 'env'): Promise<{ job: number | null; code: number | null }>;
    cancel(job: number): Promise<boolean>;
    onStarted(cb: (e: { job: number; kind: string; args: string[] }) => void): () => void;
    onLog(cb: (e: LogEvent) => void): () => void;
    onDone(cb: (e: { job: number | null; code: number | null }) => void): () => void;
  };
  firmware: {
    list(): Promise<FirmwareInfo[]>;
    remove(id: string): Promise<void>;
    import(): Promise<FirmwareInfo | null>;
    export(id: string): Promise<string | null>;
  };
  flash: {
    scan(): Promise<FlashScan>;
    checkUf2(firmwareId: string, driveRoot: string): Promise<Uf2Check>;
    /** Save the board's current firmware (CURRENT.UF2 from the bootloader drive) to the archive. */
    backupUf2(driveRoot: string): Promise<FirmwareInfo>;
    uf2(firmwareId: string, driveRoot: string, opts?: { allowUnverified?: boolean }): Promise<{ copied: boolean; copyError: string | null; driveGone: boolean; bytes: number }>;
    qmk(settings: QmkSettings, firmwareId: string, bootloader?: string): Promise<{ job: number; code: number | null; output: string }>;
    cancel(job: number): Promise<boolean>;
    onProgress(cb: (e: { done: number; total: number }) => void): () => void;
  };
}

declare global {
  interface Window {
    navi?: NaviBridge;
  }
}

export const navi: NaviBridge | undefined = typeof window !== 'undefined' ? window.navi : undefined;
export const isDesktop = Boolean(navi);
