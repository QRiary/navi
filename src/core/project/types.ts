/**
 * PROJECT MODEL — everything the user configures, in one document.
 *
 * Main principle: GEOMETRY (where keys physically are) is separate from ASSIGNMENTS (what they do).
 *  • Assignments (keymap) are stored by firmware matrix position: row × column. The keyboard itself
 *    stores them the same way (VIA), and QMK writes them the same way (keymaps[layer][row][col]).
 *  • Geometry only points to a matrix position. Changing the shape/place of a key, adding a geometry
 *    variant or importing another layout does not touch the keymap.
 *
 * A project file is JSON with format/schemaVersion fields; old versions are upgraded by migrations (migrate.ts).
 */
import type { Evidence, FeatureId, FlagInfo } from '../features/registry';

export const PROJECT_FORMAT = 'navi.project';
export const PROJECT_SCHEMA_VERSION = 3;

/** [row, column] in the firmware matrix. */
export type MatrixPos = [number, number];

// ── Geometry ──────────────────────────────────────────────────────────

export type Half = 'left' | 'right' | 'center';

/** A key on the drawing. Units are “u” (key pitch, 19.05 mm). Rotation is around (rx, ry). */
export interface KeyGeom {
  id: string;
  /** Matrix position. null — the key is on the drawing but not wired (decoration/unknown). */
  matrix: MatrixPos | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation angle, degrees (clockwise). */
  r: number;
  rx: number;
  ry: number;
  shape: 'rect' | 'circle';
  half: Half;
  /** Hardware label of the position (L00, R43 …) — from the keyboard definition. */
  label?: string;
  /** The position is not confirmed (approximate template) — highlighted in the geometry editor. */
  approximate?: boolean;
}

/** An encoder on the drawing. index — encoder number in the firmware (as in encoder map / VIA). */
export interface EncoderGeom {
  id: string;
  index: number;
  x: number;
  y: number;
  /** Knob diameter, u. */
  d: number;
  half: Half;
  /** Matrix position of the encoder press (if the encoder has a button and it is in the matrix). */
  pressMatrix: MatrixPos | null;
  label?: string;
  approximate?: boolean;
}

export type ControlKind = 'trackpad' | 'trackball' | 'display' | 'button' | 'other';

/** Other controls: trackpad, display, etc. — for the drawing and the hardware description. */
export interface ControlGeom {
  id: string;
  kind: ControlKind;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'rect' | 'circle';
  half: Half;
  label: string;
  notes?: string;
  approximate?: boolean;
}

export interface Geometry {
  id: string;
  name: string;
  keys: KeyGeom[];
  encoders: EncoderGeom[];
  controls: ControlGeom[];
  source: { kind: 'template' | 'qmk' | 'kle' | 'via' | 'manual'; ref?: string; note?: string };
}

// ── Hardware profile ──────────────────────────────────────────────────

/** An established fact about the keyboard and where it is known from. */
export interface Fact {
  /** What exactly: 'matrix', 'mcu', 'encoders', 'via.protocol' … */
  key: string;
  value: string;
  evidence: Evidence;
  /** When it was established (ISO). */
  at: string;
  note?: string;
}

export type SplitTransport = 'serial' | 'i2c' | 'wireless' | 'none' | 'unknown';
export type LightingKind = 'rgb_matrix' | 'rgblight' | 'led_matrix' | 'backlight' | 'none' | 'unknown';
export type PointingKind = 'none' | 'cirque' | 'trackball' | 'trackpoint' | 'other' | 'unknown';

export interface HardwareProfile {
  /** Model name. */
  name: string;
  manufacturer: string;
  usb: { vid: number | null; pid: number | null; manufacturer?: string; product?: string; deviceVersion?: string };
  matrix: { rows: number; cols: number };
  split: { enabled: boolean; transport: SplitTransport };
  /** Microcontroller: RP2040, STM32F411, atmega32u4 … null — unknown. */
  processor: string | null;
  /** Bootloader in QMK terms: rp2040, stm32-dfu, caterina, atmel-dfu … */
  bootloader: string | null;
  encoders: { count: number | null; withPress: boolean | null };
  lighting: { kind: LightingKind; ledCount: number | null };
  pointing: { kind: PointingKind; notes?: string };
  /** Other hardware: displays, buttons — free text. */
  extras: string;
  /** Free notes. */
  notes: string;
  facts: Fact[];
  /** Board pins for your own firmware (own QMK target). null — not described. Since format 2. */
  pins: PinDefinition | null;
}

export interface EncoderPins {
  a: string;
  b: string;
}

/**
 * How the board is wired to the microcontroller — what QMK needs to build firmware
 * for a keyboard that is not in qmk_firmware (keyboard.json of your own target).
 */
export interface PinDefinition {
  /** Folder in qmk_firmware/keyboards: “navi/dilemma_4x6”. */
  target: string;
  /** ChibiOS board (GENERIC_RP_RP2040 etc.), if needed. */
  board?: string;
  diodeDirection: 'COL2ROW' | 'ROW2COL';
  /** Row and column pins (for a split — of one half). */
  rows: string[];
  cols: string[];
  /** The right half has different pins (otherwise the same). */
  rightRows?: string[];
  rightCols?: string[];
  /** Split: the pin linking the halves (serial). */
  serialPin?: string;
  /** How a half knows whether it is left or right. */
  handedness: { kind: 'master-left' } | { kind: 'pin'; pin: string; lowIsLeft: boolean } | { kind: 'eeprom' };
  /** Encoders (for a split — of the left half); the right half — rightEncoders. */
  encoders: EncoderPins[];
  rightEncoders?: EncoderPins[];
  /** Where the pins come from (for example, “copied from bastardkb/dilemma/4x6_4 — a guess”). */
  source?: string;
}

// ── Keymap ────────────────────────────────────────────────────────────

/** Encoder action on a layer: clockwise (cw) and counter-clockwise (ccw) rotation. */
export interface EncoderAction {
  ccw: number;
  cw: number;
}

export interface Layer {
  id: string;
  name: string;
  /** Layer tag color (#rrggbb) or empty. */
  color?: string;
  /** Keycodes row by row: keys[row * cols + col]. Length = rows × cols. */
  keys: number[];
  /** Encoder actions by encoder number. */
  encoders: EncoderAction[];
}

export interface Keymap {
  id: string;
  name: string;
  layers: Layer[];
  /** Default base layer (default layer). */
  defaultLayer: number;
  notes?: string;
}

// ── Advanced features ─────────────────────────────────────────────────

export type MacroStep =
  | { type: 'text'; text: string }
  | { type: 'tap'; keycode: number }
  | { type: 'down'; keycode: number }
  | { type: 'up'; keycode: number }
  | { type: 'delay'; ms: number };

export interface Macro {
  id: string;
  /** Macro slot: QK_MACRO_n (MC_n) and the slot in the keyboard memory (VIA). */
  index: number;
  name: string;
  steps: MacroStep[];
}

/** Tap dance: actions for taps/holds. 0 = nothing. Generated into keymap.c. */
export interface TapDance {
  id: string;
  index: number;
  /** Name for keymap.c (a C identifier). */
  name: string;
  tap: number;
  hold: number;
  doubleTap: number;
  tapHold: number;
  /** Own tapping term for this tap dance, ms (otherwise the global one). */
  tappingTerm?: number;
}

/** Combo: several physical keys together → result. Generated into keymap.c. */
export interface Combo {
  id: string;
  name: string;
  keys: MatrixPos[];
  result: number;
  /** Own trigger window, ms. */
  term?: number;
  /** Layers it works on (empty — all). */
  layers?: number[];
}

/** Key override: modifiers + key → another key. */
export interface KeyOverride {
  id: string;
  name: string;
  mods: number;
  trigger: number;
  replacement: number;
  layers?: number[];
}

export type CustomAction = { type: 'none' } | { type: 'send-string'; text: string } | { type: 'tap'; keycode: number };

/** Leader key sequence: QK_LEAD, then 1–5 keys → action. */
export interface LeaderSequence {
  id: string;
  /** Basic keycodes (KC_A…): QMK compares pressed keys with them (for MT/LT — their “tap”). */
  keys: number[];
  action: CustomAction;
}

/** A unicode map entry (UNICODEMAP). */
export interface UnicodeEntry {
  id: string;
  /** Name for enum unicode_names in keymap.c (a C identifier). */
  name: string;
  /** Code point, up to 0x10FFFF. */
  codepoint: number;
}

/** Own keycode (QK_USER_n): name and what it does (the code is generated into keymap.c). */
export interface CustomKeycode {
  id: string;
  /** C identifier: MY_KEY. */
  name: string;
  description: string;
  action: CustomAction;
}

// ── Lighting ──────────────────────────────────────────────────────────

export interface LightingState {
  brightness: number;
  effect: number;
  speed: number;
  hue: number;
  sat: number;
}

export interface LightingConfig {
  /** Saved state for RGB Matrix / RGB Light (VIA values 0–255). */
  rgbMatrix: LightingState | null;
  rgblight: LightingState | null;
  /**
   * Effects enabled in the firmware, in order (QMK ids: SOLID_COLOR, BREATHING …).
   * Needed to turn an effect number into a name. null — unknown.
   */
  rgbMatrixEffects: string[] | null;
  effectsEvidence?: Evidence;
}

// ── Firmware ──────────────────────────────────────────────────────────

export interface FirmwareConfig {
  /** QMK keyboard target: 'bastardkb/dilemma/4x6_4'. */
  keyboard: string | null;
  /** Keymap name for the build. */
  keymap: string;
  /** Keycode spec version the firmware on the keyboard was built with. */
  keycodeSpec: string;
  /** How to read 0x8000+: UC or UM/UP. */
  unicode: 'unicode' | 'unicodemap';
  /** What is known about the firmware that is on the keyboard NOW. */
  flags: Partial<Record<FeatureId, FlagInfo>>;
  /** What to enable in your own build (the keymap's rules.mk). */
  buildFeatures: Partial<Record<FeatureId, boolean>>;
  /** config.h parameters of your own build: TAPPING_TERM, COMBO_TERM … */
  buildConfig: Record<string, string | number | boolean>;
  /** qmk compile parameters: -j (parallel jobs) and -e KEY=VALUE. */
  build?: { parallel?: number; env?: Record<string, string> };
  /** Own lines at the end of keymap.c / rules.mk / config.h (checked by core/qmk/customCode.ts). */
  custom?: { 'keymap.c'?: string; 'rules.mk'?: string; 'config.h'?: string };
  /**
   * Own lines came from an imported file and have not been reviewed by the user yet:
   * while true they are not written to files. Set by the import (not by the file itself), cleared by the “allow” button.
   */
  customReview?: boolean;
}

// ── Project ───────────────────────────────────────────────────────────

export interface Project {
  format: typeof PROJECT_FORMAT;
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  hardware: HardwareProfile;
  geometries: Geometry[];
  activeGeometryId: string;
  keymaps: Keymap[];
  activeKeymapId: string;
  macros: Macro[];
  tapDances: TapDance[];
  combos: Combo[];
  keyOverrides: KeyOverride[];
  customKeycodes: CustomKeycode[];
  /** Sequences after the leader key (QK_LEAD) — leader_end_user in keymap.c. */
  leaderSequences: LeaderSequence[];
  /** Character table for UM(i)/UP(i,j) (UNICODEMAP): index = position in the list. */
  unicodeMap: UnicodeEntry[];
  lighting: LightingConfig;
  firmware: FirmwareConfig;
  /** Linked keyboard (for hints when connecting). */
  device: { vid: number; pid: number; product?: string } | null;
}

/** Short project description for the list. */
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  keyboard: string;
  layers: number;
  keys: number;
}
