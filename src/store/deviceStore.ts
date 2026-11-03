/**
 * CONNECTED KEYBOARD (VIA over WebHID).
 * The connection state is only real: “connected” means the keyboard answered
 * the protocol version request; “written” means the write was verified by reading back.
 */
import { create } from 'zustand';
import { ViaClient } from '../core/via/client';
import { detectMatrix, probeCapabilities, probeRgbMatrixEffectCount, readSnapshot, type DeviceCapabilities, type DeviceSnapshot, type MatrixDetection } from '../core/via/probe';
import { CHANNEL, LIGHT_VALUE, ViaDisconnectedError, ViaError } from '../core/via/protocol';
import { applyWrite, type ApplyResult, type WritePlan } from '../core/via/sync';
import type { LightingState } from '../core/project/types';
import { deviceKey, hidSupported, listViaDevices, WebHidTransport } from '../device/webhid';

export interface DeviceListItem {
  key: string;
  vendorId: number;
  productId: number;
  productName: string;
}

export type DeviceStatus = 'idle' | 'connecting' | 'connected' | 'busy' | 'disconnected' | 'error';

export interface DeviceState {
  supported: boolean;
  devices: DeviceListItem[];
  status: DeviceStatus;
  current: DeviceListItem | null;
  caps: DeviceCapabilities | null;
  matrix: MatrixDetection | null;
  snapshot: DeviceSnapshot | null;
  progress: { part: number; what: string } | null;
  error: string | null;
  lastWrite: (ApplyResult & { at: string }) | null;
  testerActive: boolean;
  /** Key tester: whether non-zero data ever came (if not, the firmware has probably disabled it). */
  testerSawData: boolean;

  refresh(): Promise<void>;
  connect(key: string): Promise<boolean>;
  disconnect(): Promise<void>;
  reread(): Promise<void>;
  write(plan: WritePlan): Promise<ApplyResult>;
  setLighting(channel: 'rgbMatrix' | 'rgblight', state: Partial<LightingState>): Promise<void>;
  saveLighting(channel: 'rgbMatrix' | 'rgblight'): Promise<void>;
  probeEffectCount(): Promise<number>;
  startTester(onPressed: (pressed: Set<string>) => void): void;
  stopTester(): void;
}

let client: ViaClient | null = null;
let transport: WebHidTransport | null = null;
let testerTimer: ReturnType<typeof setTimeout> | null = null;
const hidByKey = new Map<string, HIDDevice>();

function describe(d: HIDDevice): DeviceListItem {
  return { key: deviceKey(d), vendorId: d.vendorId, productId: d.productId, productName: d.productName };
}

export const useDeviceStore = create<DeviceState>()((set, get) => {
  const fail = (err: unknown) => {
    const disconnected = err instanceof ViaDisconnectedError;
    set({ status: disconnected ? 'disconnected' : 'error', error: (err as Error).message, progress: null });
    if (disconnected) {
      client = null;
      transport = null;
    }
  };

  const busy = async <T,>(what: string, fn: () => Promise<T>): Promise<T> => {
    if (!client) throw new ViaError('the keyboard is not connected');
    set({ status: 'busy', progress: { part: 0, what }, error: null });
    try {
      const res = await fn();
      set({ status: 'connected', progress: null });
      return res;
    } catch (err) {
      fail(err);
      throw err;
    }
  };

  if (hidSupported()) {
    navigator.hid.addEventListener('connect', () => void get().refresh());
    navigator.hid.addEventListener('disconnect', (e) => {
      const key = deviceKey(e.device);
      if (get().current?.key === key && transport?.hidDevice === e.device) {
        get().stopTester();
        client = null;
        transport = null;
        set({ status: 'disconnected', error: null, progress: null });
      }
      void get().refresh();
    });
  }

  return {
    supported: hidSupported(),
    devices: [],
    status: 'idle',
    current: null,
    caps: null,
    matrix: null,
    snapshot: null,
    progress: null,
    error: null,
    lastWrite: null,
    testerActive: false,
    testerSawData: false,

    async refresh() {
      const list = await listViaDevices();
      hidByKey.clear();
      for (const d of list) hidByKey.set(deviceKey(d), d);
      set({ devices: list.map(describe) });
    },

    async connect(key) {
      const device = hidByKey.get(key);
      if (!device) {
        set({ status: 'error', error: 'device not found — reconnect it and refresh' });
        return false;
      }
      await get().disconnect();
      set({ status: 'connecting', error: null, current: describe(device), progress: { part: 0, what: 'protocol' } });
      try {
        transport = await WebHidTransport.open(device);
        client = new ViaClient(transport);
        const caps = await probeCapabilities(client);
        set({ caps, progress: { part: 0.2, what: 'matrix' } });
        const matrix = await detectMatrix(client, 24, 24, (p) => set({ progress: { part: 0.2 + p * 0.3, what: 'matrix' } }));
        const snapshot = await readSnapshot(client, caps, {
          rows: matrix.rows,
          cols: matrix.cols,
          encoderCount: null,
          onProgress: (p, what) => set({ progress: { part: 0.5 + p * 0.5, what } }),
        });
        set({ status: 'connected', matrix, snapshot, progress: null });
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },

    async disconnect() {
      get().stopTester();
      const t = transport;
      client = null;
      transport = null;
      if (t) await t.close();
      set({ status: 'idle', current: null, caps: null, matrix: null, snapshot: null, progress: null, error: null });
    },

    async reread() {
      const { caps, matrix } = get();
      if (!caps || !matrix) return;
      const snapshot = await busy('read', () =>
        readSnapshot(client!, caps, { rows: matrix.rows, cols: matrix.cols, encoderCount: get().snapshot?.encoderCount ?? null, onProgress: (p, what) => set({ progress: { part: p, what } }) }),
      );
      set({ snapshot });
    },

    async write(plan) {
      const snap = get().snapshot;
      if (!snap) throw new ViaError('read the keyboard first');
      const result = await busy('write', () => applyWrite(client!, plan, snap, (p) => set({ progress: { part: p, what: 'write' } })));
      set({ lastWrite: { ...result, at: new Date().toISOString() } });
      await get().reread();
      return result;
    },

    async setLighting(channel, state) {
      if (!client) throw new ViaError('the keyboard is not connected');
      const ch = channel === 'rgbMatrix' ? CHANNEL.rgbMatrix : CHANNEL.rgblight;
      const cur = get().snapshot?.[channel];
      try {
        if (state.brightness !== undefined) await client.customSet(ch, LIGHT_VALUE.brightness, state.brightness);
        if (state.effect !== undefined) await client.customSet(ch, LIGHT_VALUE.effect, state.effect);
        if (state.speed !== undefined) await client.customSet(ch, LIGHT_VALUE.speed, state.speed);
        if (state.hue !== undefined || state.sat !== undefined) await client.customSet(ch, LIGHT_VALUE.color, state.hue ?? cur?.hue ?? 0, state.sat ?? cur?.sat ?? 0);
      } catch (err) {
        fail(err);
        throw err;
      }
      const snap = get().snapshot;
      if (snap && snap[channel]) set({ snapshot: { ...snap, [channel]: { ...snap[channel]!, ...state } } });
    },

    async saveLighting(channel) {
      await busy('save', () => client!.customSave(channel === 'rgbMatrix' ? CHANNEL.rgbMatrix : CHANNEL.rgblight));
    },

    async probeEffectCount() {
      return busy('effects', () => probeRgbMatrixEffectCount(client!));
    },

    startTester(onPressed) {
      const { matrix } = get();
      if (!client || !matrix || get().testerActive) return;
      set({ testerActive: true, testerSawData: false });
      const perRequest = Math.floor(28 / Math.ceil(matrix.cols / 8));
      const poll = async () => {
        if (!client || !get().testerActive) return;
        try {
          const pressed = new Set<string>();
          for (let offset = 0; offset < matrix.rows; offset += perRequest) {
            const rows = await client.switchMatrixState(offset, matrix.cols);
            rows.forEach((bits, i) => {
              const r = offset + i;
              if (r >= matrix.rows) return;
              for (let c = 0; c < matrix.cols; c++) if (bits & (1 << c)) pressed.add(`${r},${c}`);
            });
          }
          if (pressed.size && !get().testerSawData) set({ testerSawData: true });
          onPressed(pressed);
          testerTimer = setTimeout(poll, 40);
        } catch (err) {
          set({ testerActive: false });
          fail(err);
        }
      };
      void poll();
    },

    stopTester() {
      if (testerTimer) clearTimeout(testerTimer);
      testerTimer = null;
      if (get().testerActive) set({ testerActive: false });
    },
  };
});
