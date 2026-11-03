/**
 * VIA FIRMWARE SIMULATOR — only for automated tests (not used in the app).
 * Repeats the behavior of QMK quantum/via.c + dynamic_keymap.c (protocol 12/13): the same commands,
 * the same answers to requests outside the matrix (0), the same “0xFF — not supported”.
 * So the protocol and sync are tested without a keyboard, and on a real keyboard —
 * separately (npm run device:probe).
 */
import type { HidTransport, TransportInfo } from './client';
import { CHANNEL, CMD, KEYBOARD_VALUE, LIGHT_VALUE, REPORT_SIZE, ViaDisconnectedError, ViaTimeoutError } from './protocol';

export interface SimOptions {
  protocol?: number;
  layers: number;
  rows: number;
  cols: number;
  encoders?: number;
  encoderMap?: boolean;
  macroCount?: number;
  macroBufferSize?: number;
  rgbMatrix?: boolean;
  rgbMatrixEffects?: number;
  /** Whether the firmware returns the matrix state (VIA_INSECURE / old QMK). */
  matrixTester?: boolean;
}

export class ViaSimulator {
  readonly opts: Required<SimOptions>;
  keymap: Uint16Array;
  encoders: Uint16Array;
  macros: Uint8Array;
  rgb = { enabled: true, mode: 1, val: 200, speed: 128, hue: 0, sat: 0 };
  savedRgb = { ...this.rgb };
  pressed = new Set<string>();
  /** Disconnect the “keyboard” after this many commands (for disconnect tests). */
  disconnectAfter = Infinity;
  /** Do not answer the command with this number (for the timeout test). */
  silentOnce: number | null = null;
  inBootloader = false;
  log: number[][] = [];

  constructor(options: SimOptions) {
    this.opts = {
      protocol: 12,
      encoders: 0,
      encoderMap: false,
      macroCount: 0,
      macroBufferSize: 0,
      rgbMatrix: false,
      rgbMatrixEffects: 44,
      matrixTester: false,
      ...options,
    };
    const { layers, rows, cols } = this.opts;
    this.keymap = new Uint16Array(layers * rows * cols);
    this.encoders = new Uint16Array(layers * this.opts.encoders * 2);
    this.macros = new Uint8Array(this.opts.macroBufferSize);
  }

  private kmIndex(l: number, r: number, c: number) {
    return (l * this.opts.rows + r) * this.opts.cols + c;
  }

  getKey(l: number, r: number, c: number): number {
    const { layers, rows, cols } = this.opts;
    if (l >= layers || r >= rows || c >= cols) return 0;
    return this.keymap[this.kmIndex(l, r, c)];
  }

  setKey(l: number, r: number, c: number, v: number) {
    const { layers, rows, cols } = this.opts;
    if (l >= layers || r >= rows || c >= cols) return;
    this.keymap[this.kmIndex(l, r, c)] = v;
  }

  private encIndex(l: number, e: number, cw: boolean) {
    return (l * this.opts.encoders + e) * 2 + (cw ? 0 : 1);
  }

  getEncoder(l: number, e: number, cw: boolean): number {
    if (l >= this.opts.layers || e >= this.opts.encoders) return 0;
    return this.encoders[this.encIndex(l, e, cw)];
  }

  /** Handle one report like the firmware. null — no answer. */
  handle(input: Uint8Array): Uint8Array | null {
    const data = new Uint8Array(REPORT_SIZE);
    data.set(input.subarray(0, REPORT_SIZE));
    this.log.push([...data.subarray(0, 6)]);
    const cmd = data[0];
    const d = data.subarray(1);
    const { layers, rows, cols } = this.opts;
    const kmBytes = layers * rows * cols * 2;
    switch (cmd) {
      case CMD.getProtocolVersion:
        d[0] = this.opts.protocol >> 8;
        d[1] = this.opts.protocol & 0xff;
        break;
      case CMD.getKeyboardValue:
        switch (d[0]) {
          case KEYBOARD_VALUE.uptime:
            d.set([0, 0, 0x10, 0], 1);
            break;
          case KEYBOARD_VALUE.layoutOptions:
          case KEYBOARD_VALUE.firmwareVersion:
            d.set([0, 0, 0, 0], 1);
            break;
          case KEYBOARD_VALUE.switchMatrixState: {
            const offset = d[1];
            const bytesPerRow = Math.ceil(cols / 8);
            const n = Math.floor(28 / bytesPerRow);
            let i = 2;
            for (let r = 0; r < n && r + offset < rows; r++) {
              let v = 0;
              if (this.opts.matrixTester) for (let c = 0; c < cols; c++) if (this.pressed.has(`${r + offset},${c}`)) v |= 1 << c;
              for (let b = bytesPerRow - 1; b >= 0; b--) d[i++] = (v >> (b * 8)) & 0xff;
            }
            break;
          }
          case KEYBOARD_VALUE.keycodesVersion:
            if (this.opts.protocol >= 13) d.set([0, 0, 0, 9], 1);
            else data[0] = CMD.unhandled;
            break;
          default:
            data[0] = CMD.unhandled;
        }
        break;
      case CMD.setKeyboardValue:
        if (d[0] !== KEYBOARD_VALUE.layoutOptions && d[0] !== KEYBOARD_VALUE.deviceIndication) data[0] = CMD.unhandled;
        break;
      case CMD.getKeycode: {
        const v = this.getKey(d[0], d[1], d[2]);
        d[3] = v >> 8;
        d[4] = v & 0xff;
        break;
      }
      case CMD.setKeycode:
        this.setKey(d[0], d[1], d[2], (d[3] << 8) | d[4]);
        break;
      case CMD.getLayerCount:
        d[0] = layers;
        break;
      case CMD.keymapGetBuffer: {
        const offset = (d[0] << 8) | d[1];
        const size = d[2];
        for (let i = 0; i < size; i++) {
          const at = offset + i;
          const word = this.keymap[at >> 1] ?? 0;
          d[3 + i] = at < kmBytes ? (at % 2 === 0 ? word >> 8 : word & 0xff) : 0;
        }
        break;
      }
      case CMD.keymapSetBuffer: {
        const offset = (d[0] << 8) | d[1];
        const size = d[2];
        for (let i = 0; i < size; i++) {
          const at = offset + i;
          if (at >= kmBytes) continue;
          const w = this.keymap[at >> 1];
          this.keymap[at >> 1] = at % 2 === 0 ? (d[3 + i] << 8) | (w & 0xff) : (w & 0xff00) | d[3 + i];
        }
        break;
      }
      case CMD.getEncoder:
      case CMD.setEncoder:
        if (!this.opts.encoderMap) {
          data[0] = CMD.unhandled;
          break;
        }
        if (cmd === CMD.getEncoder) {
          const v = this.getEncoder(d[0], d[1], d[2] !== 0);
          d[3] = v >> 8;
          d[4] = v & 0xff;
        } else if (d[0] < layers && d[1] < this.opts.encoders) {
          this.encoders[this.encIndex(d[0], d[1], d[2] !== 0)] = (d[3] << 8) | d[4];
        }
        break;
      case CMD.macroGetCount:
        if (!this.opts.macroCount) data[0] = CMD.unhandled;
        else d[0] = this.opts.macroCount;
        break;
      case CMD.macroGetBufferSize:
        if (!this.opts.macroCount) data[0] = CMD.unhandled;
        else {
          d[0] = this.opts.macroBufferSize >> 8;
          d[1] = this.opts.macroBufferSize & 0xff;
        }
        break;
      case CMD.macroGetBuffer:
      case CMD.macroSetBuffer: {
        if (!this.opts.macroCount) {
          data[0] = CMD.unhandled;
          break;
        }
        const offset = (d[0] << 8) | d[1];
        const size = d[2];
        for (let i = 0; i < size; i++) {
          const at = offset + i;
          if (cmd === CMD.macroGetBuffer) d[3 + i] = at < this.macros.length ? this.macros[at] : 0;
          else if (at < this.macros.length) this.macros[at] = d[3 + i];
        }
        break;
      }
      case CMD.customGetValue:
      case CMD.customSetValue:
      case CMD.customSave:
        if (!this.opts.rgbMatrix || d[0] !== CHANNEL.rgbMatrix) {
          data[0] = CMD.unhandled;
          break;
        }
        this.rgbCommand(cmd, d[1], d.subarray(2));
        break;
      case CMD.bootloaderJump:
        this.inBootloader = true;
        return null;
      default:
        data[0] = CMD.unhandled;
    }
    return data;
  }

  private rgbCommand(cmd: number, valueId: number, v: Uint8Array) {
    if (cmd === CMD.customSave) {
      this.savedRgb = { ...this.rgb };
      return;
    }
    const get = cmd === CMD.customGetValue;
    switch (valueId) {
      case LIGHT_VALUE.brightness:
        if (get) v[0] = this.rgb.val;
        else this.rgb.val = v[0];
        break;
      case LIGHT_VALUE.effect:
        if (get) v[0] = this.rgb.enabled ? this.rgb.mode : 0;
        else if (v[0] === 0) this.rgb.enabled = false;
        else {
          this.rgb.enabled = true;
          this.rgb.mode = Math.min(v[0], this.opts.rgbMatrixEffects);
        }
        break;
      case LIGHT_VALUE.speed:
        if (get) v[0] = this.rgb.speed;
        else this.rgb.speed = v[0];
        break;
      case LIGHT_VALUE.color:
        if (get) {
          v[0] = this.rgb.hue;
          v[1] = this.rgb.sat;
        } else {
          this.rgb.hue = v[0];
          this.rgb.sat = v[1];
        }
        break;
    }
  }

  transport(info: Partial<TransportInfo> = {}): HidTransport {
    let count = 0;
    let closed = false;
    const fullInfo: TransportInfo = { vendorId: 0xafc5, productId: 0xbfc5, productName: 'Simulated', key: 'sim', ...info };
    return {
      info: fullInfo,
      exchange: async (data: Uint8Array) => {
        if (closed || count >= this.disconnectAfter) throw new ViaDisconnectedError('device disconnected');
        count++;
        if (this.silentOnce !== null && data[0] === this.silentOnce) {
          this.silentOnce = null;
          throw new ViaTimeoutError('no response');
        }
        const res = this.handle(data);
        if (!res) throw new ViaTimeoutError('no response');
        return res;
      },
      close: async () => {
        closed = true;
      },
    };
  }
}
