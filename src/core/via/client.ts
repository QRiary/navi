/**
 * VIA CLIENT: protocol commands on top of a transport (WebHID in the app, a simulator in tests).
 * Commands run strictly one at a time (a queue): VIA has no request ids, the answer is the next
 * incoming report. A timeout and a disconnected device become clear errors.
 */
import {
  BUFFER_CHUNK,
  CHANNEL,
  CMD,
  KEYBOARD_VALUE,
  REPORT_SIZE,
  ViaDisconnectedError,
  ViaError,
  ViaUnhandledError,
  frame,
  u16,
  u32,
  type ChannelId,
} from './protocol';

export interface TransportInfo {
  vendorId: number;
  productId: number;
  productName: string;
  manufacturer?: string;
  /** Unique device key in this session. */
  key: string;
}

export interface HidTransport {
  readonly info: TransportInfo;
  /** Send 32 bytes and get the answer (32 bytes). */
  exchange(data: Uint8Array, timeoutMs: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface ClientOptions {
  timeoutMs?: number;
  /** Retries on timeout (for reads). Writes are not retried, so they are not doubled. */
  readRetries?: number;
}

export class ViaClient {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly timeoutMs: number;
  private readonly readRetries: number;
  /** Counter of executed commands (for diagnostics). */
  commands = 0;

  constructor(
    readonly transport: HidTransport,
    options: ClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 1000;
    this.readRetries = options.readRetries ?? 1;
  }

  /** Run a command in the queue. unhandledOk — do not treat 0xFF as an error (for support checks). */
  private run(bytes: number[], { write = false, unhandledOk = false } = {}): Promise<Uint8Array> {
    const task = async () => {
      let attempt = 0;
      for (;;) {
        try {
          const res = await this.transport.exchange(frame(...bytes), this.timeoutMs);
          this.commands++;
          if (res.length < REPORT_SIZE) throw new ViaError(`short response (${res.length} bytes)`);
          if (res[0] === CMD.unhandled && bytes[0] !== CMD.unhandled) {
            if (unhandledOk) return res;
            throw new ViaUnhandledError(bytes[0]);
          }
          if (res[0] !== bytes[0]) throw new ViaError(`response for another command: 0x${res[0].toString(16)} ≠ 0x${bytes[0].toString(16)}`);
          return res;
        } catch (err) {
          // Retry only reads and only on a timeout/bad answer; writes are not retried, so they are not doubled.
          const retriable = err instanceof ViaError && !(err instanceof ViaUnhandledError) && !(err instanceof ViaDisconnectedError);
          if (write || !retriable || attempt >= this.readRetries) throw err;
          attempt++;
        }
      }
    };
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  // ── General ──────────────────────────────────────────────────────────

  async protocolVersion(): Promise<number> {
    const r = await this.run([CMD.getProtocolVersion]);
    return u16(r[1], r[2]);
  }

  async uptime(): Promise<number> {
    const r = await this.run([CMD.getKeyboardValue, KEYBOARD_VALUE.uptime]);
    return u32(r, 2);
  }

  async layoutOptions(): Promise<number> {
    const r = await this.run([CMD.getKeyboardValue, KEYBOARD_VALUE.layoutOptions]);
    return u32(r, 2);
  }

  async firmwareVersion(): Promise<number> {
    const r = await this.run([CMD.getKeyboardValue, KEYBOARD_VALUE.firmwareVersion]);
    return u32(r, 2);
  }

  /** Keycode version of the firmware (BCD 0x00000009 = 0.0.9). Protocol 13+ only, otherwise null. */
  async keycodesVersion(): Promise<number | null> {
    const r = await this.run([CMD.getKeyboardValue, KEYBOARD_VALUE.keycodesVersion], { unhandledOk: true });
    return r[0] === CMD.unhandled ? null : u32(r, 2);
  }

  /**
   * Matrix state (key tester). Starting at row offset; as many rows as fit into 28 bytes.
   * Newer QMK without VIA_INSECURE returns zeros — then the key tester is not available.
   */
  async switchMatrixState(offset: number, cols: number): Promise<number[]> {
    const r = await this.run([CMD.getKeyboardValue, KEYBOARD_VALUE.switchMatrixState, offset]);
    const bytesPerRow = Math.ceil(cols / 8);
    const rows = Math.floor(28 / bytesPerRow);
    const out: number[] = [];
    for (let row = 0; row < rows; row++) {
      let v = 0;
      for (let b = 0; b < bytesPerRow; b++) v = (v << 8) | r[3 + row * bytesPerRow + b];
      out.push(v >>> 0);
    }
    return out;
  }

  /** Ask the keyboard to blink (to tell which one is connected). May be unsupported. */
  async deviceIndication(value = 0): Promise<boolean> {
    const r = await this.run([CMD.setKeyboardValue, KEYBOARD_VALUE.deviceIndication, value], { write: true, unhandledOk: true });
    return r[0] !== CMD.unhandled;
  }

  // ── Keymap ───────────────────────────────────────────────────────────

  async layerCount(): Promise<number> {
    const r = await this.run([CMD.getLayerCount]);
    return r[1];
  }

  async getKeycode(layer: number, row: number, col: number): Promise<number> {
    const r = await this.run([CMD.getKeycode, layer, row, col]);
    return u16(r[4], r[5]);
  }

  async setKeycode(layer: number, row: number, col: number, keycode: number): Promise<void> {
    await this.run([CMD.setKeycode, layer, row, col, (keycode >> 8) & 0xff, keycode & 0xff], { write: true });
  }

  /** Read the keymap buffer: bytes [offset, offset+length). Order: layer → row → column, 2 bytes each (big-endian). */
  async readKeymapBuffer(offset: number, length: number, onProgress?: (done: number) => void): Promise<Uint8Array> {
    const out = new Uint8Array(length);
    for (let done = 0; done < length; done += BUFFER_CHUNK) {
      const n = Math.min(BUFFER_CHUNK, length - done);
      const at = offset + done;
      const r = await this.run([CMD.keymapGetBuffer, (at >> 8) & 0xff, at & 0xff, n]);
      out.set(r.subarray(4, 4 + n), done);
      onProgress?.(done + n);
    }
    return out;
  }

  async writeKeymapBuffer(offset: number, data: Uint8Array): Promise<void> {
    for (let done = 0; done < data.length; done += BUFFER_CHUNK) {
      const n = Math.min(BUFFER_CHUNK, data.length - done);
      const at = offset + done;
      await this.run([CMD.keymapSetBuffer, (at >> 8) & 0xff, at & 0xff, n, ...data.subarray(done, done + n)], { write: true });
    }
  }

  /** Reset the keymap to the one built into the firmware. */
  async keymapReset(): Promise<void> {
    await this.run([CMD.keymapReset], { write: true });
  }

  // ── Encoders ─────────────────────────────────────────────────────────

  /** null — the firmware does not support the encoder map (ENCODER_MAP_ENABLE is off). */
  async getEncoder(layer: number, encoder: number, clockwise: boolean): Promise<number | null> {
    const r = await this.run([CMD.getEncoder, layer, encoder, clockwise ? 1 : 0], { unhandledOk: true });
    return r[0] === CMD.unhandled ? null : u16(r[4], r[5]);
  }

  async setEncoder(layer: number, encoder: number, clockwise: boolean, keycode: number): Promise<void> {
    await this.run([CMD.setEncoder, layer, encoder, clockwise ? 1 : 0, (keycode >> 8) & 0xff, keycode & 0xff], { write: true });
  }

  // ── Macros ───────────────────────────────────────────────────────────

  async macroCount(): Promise<number | null> {
    const r = await this.run([CMD.macroGetCount], { unhandledOk: true });
    return r[0] === CMD.unhandled ? null : r[1];
  }

  async macroBufferSize(): Promise<number | null> {
    const r = await this.run([CMD.macroGetBufferSize], { unhandledOk: true });
    return r[0] === CMD.unhandled ? null : u16(r[1], r[2]);
  }

  async readMacroBuffer(size: number, onProgress?: (done: number) => void): Promise<Uint8Array> {
    const out = new Uint8Array(size);
    for (let done = 0; done < size; done += BUFFER_CHUNK) {
      const n = Math.min(BUFFER_CHUNK, size - done);
      const r = await this.run([CMD.macroGetBuffer, (done >> 8) & 0xff, done & 0xff, n]);
      out.set(r.subarray(4, 4 + n), done);
      onProgress?.(done + n);
    }
    return out;
  }

  /**
   * Write the whole macro buffer. Like VIA: first the last byte = 0xFF (“write in progress” —
   * the firmware will not run a macro from a half-written buffer), then the data, then the last byte = 0.
   */
  async writeMacroBuffer(data: Uint8Array, onProgress?: (done: number) => void): Promise<void> {
    const size = data.length;
    if (size === 0) return;
    const last = size - 1;
    await this.run([CMD.macroSetBuffer, (last >> 8) & 0xff, last & 0xff, 1, 0xff], { write: true });
    for (let done = 0; done < last; done += BUFFER_CHUNK) {
      const n = Math.min(BUFFER_CHUNK, last - done);
      await this.run([CMD.macroSetBuffer, (done >> 8) & 0xff, done & 0xff, n, ...data.subarray(done, done + n)], { write: true });
      onProgress?.(done + n);
    }
    await this.run([CMD.macroSetBuffer, (last >> 8) & 0xff, last & 0xff, 1, 0], { write: true });
    onProgress?.(size);
  }

  // ── Lighting and other “custom values” ───────────────────────────────

  /** null — the channel is not supported by the firmware. */
  async customGet(channel: ChannelId, valueId: number): Promise<Uint8Array | null> {
    const r = await this.run([CMD.customGetValue, channel, valueId], { unhandledOk: true });
    return r[0] === CMD.unhandled ? null : r.slice(3);
  }

  async customSet(channel: ChannelId, valueId: number, ...data: number[]): Promise<void> {
    await this.run([CMD.customSetValue, channel, valueId, ...data], { write: true });
  }

  /** Save the current channel values to the keyboard memory (EEPROM). */
  async customSave(channel: ChannelId): Promise<void> {
    await this.run([CMD.customSave, channel], { write: true });
  }

  // ── Dangerous ────────────────────────────────────────────────────────

  /** Reboot the keyboard into the bootloader. The connection drops — do not wait for an answer beyond the timeout. */
  async bootloaderJump(): Promise<void> {
    try {
      await this.run([CMD.bootloaderJump], { write: true });
    } catch (err) {
      // The keyboard may enter the bootloader before answering — that is normal.
      if (err instanceof ViaUnhandledError) throw err;
    }
  }
}

export { CHANNEL };
