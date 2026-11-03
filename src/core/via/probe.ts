/**
 * WHAT THE CONNECTED KEYBOARD CAN DO and reading its whole state.
 *
 * VIA does not report the matrix size directly. It is derived like this (read-only):
 *  • the keymap buffer goes “layer → row → column”, so cell (0, r, c) is in the buffer
 *    at address r·C + c, where C is the number of columns;
 *  • a per-position read (id_dynamic_keymap_get_keycode) outside the matrix returns 0 (KC_NO);
 *  • the fitting (R, C) are those for which the per-position reads match the buffer.
 * That is how the owner's keyboard was read: 10 × 6.
 */
import { CHANNEL, LIGHT_VALUE, ViaUnhandledError } from './protocol';
import type { ViaClient } from './client';
import { decodeMacroBuffer } from './macros';
import type { LightingState, MacroStep } from '../project/types';

export interface LightingChannels {
  backlight: boolean;
  rgblight: boolean;
  rgbMatrix: boolean;
  ledMatrix: boolean;
  audio: boolean;
}

export interface DeviceCapabilities {
  protocol: number;
  /** Keycode version (protocol 13+ only): '0.0.9'. */
  keycodesVersion: string | null;
  firmwareVersion: number;
  layoutOptions: number;
  layers: number;
  encoderMap: boolean;
  macros: { count: number; bufferSize: number } | null;
  lighting: LightingChannels;
}

export interface MatrixDetection {
  rows: number;
  cols: number;
  /** All fitting variants (usually one). */
  candidates: [number, number][];
}

export interface DeviceSnapshot {
  readAt: string;
  capabilities: DeviceCapabilities;
  rows: number;
  cols: number;
  /** keymap[layer][row * cols + col] */
  keymap: number[][];
  /** encoders[layer][encoder] — empty if there is no encoder map. */
  encoders: { ccw: number; cw: number }[][];
  encoderCount: number;
  macros: MacroStep[][] | null;
  macroIssues: string[];
  rgbMatrix: LightingState | null;
  rgblight: LightingState | null;
}

function bcdVersion(v: number): string {
  // QMK_KEYCODES_VERSION_BCD: 0x00000009 → 0.0.9 (one byte per part, as in QMK).
  return `${(v >> 16) & 0xff}.${(v >> 8) & 0xff}.${v & 0xff}`;
}

export async function probeCapabilities(client: ViaClient): Promise<DeviceCapabilities> {
  const protocol = await client.protocolVersion();
  const kcv = protocol >= 13 ? await client.keycodesVersion() : null;
  const firmwareVersion = await client.firmwareVersion().catch(() => 0);
  const layoutOptions = await client.layoutOptions().catch(() => 0);
  const layers = await client.layerCount();
  const encoderMap = (await client.getEncoder(0, 0, true)) !== null;
  const count = await client.macroCount();
  const size = count !== null ? await client.macroBufferSize() : null;
  const channel = async (ch: (typeof CHANNEL)[keyof typeof CHANNEL]) => (await client.customGet(ch, LIGHT_VALUE.brightness)) !== null;
  const lighting: LightingChannels = {
    backlight: await channel(CHANNEL.backlight),
    rgblight: await channel(CHANNEL.rgblight),
    rgbMatrix: await channel(CHANNEL.rgbMatrix),
    ledMatrix: await channel(CHANNEL.ledMatrix),
    audio: await channel(CHANNEL.audio),
  };
  return {
    protocol,
    keycodesVersion: kcv === null ? null : bcdVersion(kcv),
    firmwareVersion,
    layoutOptions,
    layers,
    encoderMap,
    macros: count !== null && size !== null ? { count, bufferSize: size } : null,
    lighting,
  };
}

/** Detect the matrix size (read-only). May take ~0.5 s. */
export async function detectMatrix(client: ViaClient, maxRows = 24, maxCols = 24, onProgress?: (part: number) => void): Promise<MatrixDetection> {
  const bytes = await client.readKeymapBuffer(0, maxRows * maxCols * 2);
  const w: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) w.push((bytes[i] << 8) | bytes[i + 1]);
  const at = (i: number) => (i < w.length ? w[i] : 0);

  // Rows 0 and 1 by position — to find the number of columns.
  const probeRow = async (r: number, upTo: number) => {
    const out: number[] = [];
    for (let c = 0; c < upTo; c++) out.push(await client.getKeycode(0, r, c));
    return out;
  };
  const row0 = await probeRow(0, maxCols);
  const row1 = maxRows > 1 ? await probeRow(1, maxCols) : [];
  onProgress?.(0.3);
  const colCandidates: number[] = [];
  for (let C = 1; C <= maxCols; C++) {
    let ok = true;
    for (let c = 0; c < maxCols && ok; c++) {
      if (row0[c] !== (c < C ? at(c) : 0)) ok = false;
      if (row1.length && row1[c] !== (c < C ? at(C + c) : 0)) ok = false;
    }
    if (ok) colCandidates.push(C);
  }

  const candidates: [number, number][] = [];
  for (const C of colCandidates) {
    const rowsData: number[][] = [row0.slice(0, C), row1.slice(0, C)];
    for (let r = 2; r < maxRows; r++) rowsData.push(await probeRow(r, C));
    for (let R = 1; R <= maxRows; R++) {
      let ok = true;
      for (let r = 0; r < maxRows && ok; r++) {
        for (let c = 0; c < C && ok; c++) {
          const expected = r < R ? at(r * C + c) : 0;
          if ((rowsData[r]?.[c] ?? 0) !== expected) ok = false;
        }
      }
      if (ok) candidates.push([R, C]);
    }
  }
  onProgress?.(1);
  if (candidates.length === 0) throw new Error('could not determine the matrix size from the keyboard');
  // The smallest fitting size: extra empty rows/columns give nothing.
  candidates.sort((a, b) => a[0] * a[1] - b[0] * b[1]);
  return { rows: candidates[0][0], cols: candidates[0][1], candidates };
}

async function readLighting(client: ViaClient, channel: (typeof CHANNEL)['rgbMatrix'] | (typeof CHANNEL)['rgblight']): Promise<LightingState | null> {
  const b = await client.customGet(channel, LIGHT_VALUE.brightness);
  if (!b) return null;
  const e = await client.customGet(channel, LIGHT_VALUE.effect);
  const s = await client.customGet(channel, LIGHT_VALUE.speed);
  const c = await client.customGet(channel, LIGHT_VALUE.color);
  return { brightness: b[0], effect: e?.[0] ?? 0, speed: s?.[0] ?? 0, hue: c?.[0] ?? 0, sat: c?.[1] ?? 0 };
}

export interface ReadOptions {
  rows: number;
  cols: number;
  /** How many encoders to read (from the project); null — detect by non-zero values. */
  encoderCount: number | null;
  onProgress?: (part: number, what: string) => void;
}

/** Read everything VIA gives from the keyboard. Writes nothing. */
export async function readSnapshot(client: ViaClient, caps: DeviceCapabilities, opts: ReadOptions): Promise<DeviceSnapshot> {
  const { rows, cols } = opts;
  const total = caps.layers * rows * cols * 2;
  const bytes = await client.readKeymapBuffer(0, total, (done) => opts.onProgress?.((done / total) * 0.6, 'keymap'));
  const keymap: number[][] = [];
  for (let l = 0; l < caps.layers; l++) {
    const layer: number[] = [];
    for (let i = 0; i < rows * cols; i++) {
      const at = (l * rows * cols + i) * 2;
      layer.push((bytes[at] << 8) | bytes[at + 1]);
    }
    keymap.push(layer);
  }

  let encoders: { ccw: number; cw: number }[][] = [];
  let encoderCount = 0;
  if (caps.encoderMap) {
    const probeCount = opts.encoderCount ?? 8;
    for (let l = 0; l < caps.layers; l++) {
      const row: { ccw: number; cw: number }[] = [];
      for (let e = 0; e < probeCount; e++) {
        const cw = (await client.getEncoder(l, e, true)) ?? 0;
        const ccw = (await client.getEncoder(l, e, false)) ?? 0;
        row.push({ ccw, cw });
      }
      encoders.push(row);
      opts.onProgress?.(0.6 + ((l + 1) / caps.layers) * 0.15, 'encoders');
    }
    if (opts.encoderCount === null) {
      // Outside the range the firmware returns 0 — take the last encoder that has anything assigned.
      let last = -1;
      for (const row of encoders) row.forEach((e, i) => (e.cw || e.ccw ? (last = Math.max(last, i)) : null));
      encoderCount = last + 1;
      encoders = encoders.map((row) => row.slice(0, encoderCount));
    } else encoderCount = probeCount;
  }

  let macros: MacroStep[][] | null = null;
  let macroIssues: string[] = [];
  if (caps.macros) {
    const buf = await client.readMacroBuffer(caps.macros.bufferSize, (done) => opts.onProgress?.(0.75 + (done / caps.macros!.bufferSize) * 0.2, 'macros'));
    const decoded = decodeMacroBuffer(buf, caps.macros.count);
    macros = decoded.macros;
    macroIssues = decoded.issues;
  }

  const rgbMatrix = caps.lighting.rgbMatrix ? await readLighting(client, CHANNEL.rgbMatrix) : null;
  const rgblight = caps.lighting.rgblight ? await readLighting(client, CHANNEL.rgblight) : null;
  opts.onProgress?.(1, 'done');
  return { readAt: new Date().toISOString(), capabilities: caps, rows, cols, keymap, encoders, encoderCount, macros, macroIssues, rgbMatrix, rgblight };
}

/**
 * How many RGB Matrix effects the firmware has: ask for effect 255, the firmware clamps it to the last one,
 * then restore the previous one. The lighting changes for a split second, nothing is saved (noeeprom).
 */
export async function probeRgbMatrixEffectCount(client: ViaClient): Promise<number> {
  const current = await client.customGet(CHANNEL.rgbMatrix, LIGHT_VALUE.effect);
  if (!current) throw new ViaUnhandledError(0x08);
  await client.customSet(CHANNEL.rgbMatrix, LIGHT_VALUE.effect, 255);
  const max = await client.customGet(CHANNEL.rgbMatrix, LIGHT_VALUE.effect);
  await client.customSet(CHANNEL.rgbMatrix, LIGHT_VALUE.effect, current[0]);
  return max?.[0] ?? 0;
}
