/**
 * VIA PROTOCOL (Raw HID, usage page 0xFF60 / usage 0x61) — as in QMK quantum/via.h and via.c.
 * Every request and answer is 32 bytes. The answer repeats the request with the data filled in;
 * if the firmware does not support a command, the first answer byte = 0xFF (id_unhandled).
 *
 * Protocol versions: 12 (0x000C) — QMK 2023-02 … 2026-05; 13 (0x000D) — QMK 2026-05+
 * (id_keycodes_version added). The commands below are the same for 12 and 13.
 */

export const REPORT_SIZE = 32;
export const RAW_USAGE_PAGE = 0xff60;
export const RAW_USAGE = 0x61;

export const CMD = {
  getProtocolVersion: 0x01,
  getKeyboardValue: 0x02,
  setKeyboardValue: 0x03,
  getKeycode: 0x04,
  setKeycode: 0x05,
  keymapReset: 0x06,
  customSetValue: 0x07,
  customGetValue: 0x08,
  customSave: 0x09,
  eepromReset: 0x0a,
  bootloaderJump: 0x0b,
  macroGetCount: 0x0c,
  macroGetBufferSize: 0x0d,
  macroGetBuffer: 0x0e,
  macroSetBuffer: 0x0f,
  macroReset: 0x10,
  getLayerCount: 0x11,
  keymapGetBuffer: 0x12,
  keymapSetBuffer: 0x13,
  getEncoder: 0x14,
  setEncoder: 0x15,
  unhandled: 0xff,
} as const;

export const KEYBOARD_VALUE = {
  uptime: 0x01,
  layoutOptions: 0x02,
  switchMatrixState: 0x03,
  firmwareVersion: 0x04,
  deviceIndication: 0x05,
  /** Protocol 13+ only. */
  keycodesVersion: 0x06,
} as const;

/** “Custom value” channels — lighting and audio. */
export const CHANNEL = {
  custom: 0,
  backlight: 1,
  rgblight: 2,
  rgbMatrix: 3,
  audio: 4,
  ledMatrix: 5,
} as const;

export type ChannelId = (typeof CHANNEL)[keyof typeof CHANNEL];

/** Values inside the lighting channels (rgblight / rgb matrix / led matrix / backlight). */
export const LIGHT_VALUE = {
  brightness: 1,
  effect: 2,
  speed: 3,
  color: 4,
} as const;

/** Maximum data in one buffer request (32 − 4 header bytes). */
export const BUFFER_CHUNK = 28;

export class ViaError extends Error {
  override name = 'ViaError';
}
export class ViaTimeoutError extends ViaError {
  override name = 'ViaTimeoutError';
}
export class ViaDisconnectedError extends ViaError {
  override name = 'ViaDisconnectedError';
}
export class ViaUnhandledError extends ViaError {
  override name = 'ViaUnhandledError';
  constructor(public readonly command: number) {
    super(`command 0x${command.toString(16).padStart(2, '0')} is not supported by the firmware`);
  }
}

/** Build a 32-byte request. */
export function frame(...bytes: number[]): Uint8Array {
  if (bytes.length > REPORT_SIZE) throw new ViaError('report is longer than 32 bytes');
  const out = new Uint8Array(REPORT_SIZE);
  bytes.forEach((b, i) => (out[i] = b & 0xff));
  return out;
}

export const u16 = (hi: number, lo: number) => ((hi & 0xff) << 8) | (lo & 0xff);
export const u32 = (b: ArrayLike<number>, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
