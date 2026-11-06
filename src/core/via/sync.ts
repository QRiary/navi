/**
 * SYNC between the project and the keyboard over VIA.
 *  • planWrite — what exactly changes in the keyboard (shown to the user BEFORE writing);
 *  • applyWrite — writing by the plan + read-back verification. Success is reported only
 *    if what was read matches what was written.
 *  • snapshotToKeymap — assignments read from the keyboard as project layers.
 */
import type { KeycodeSpec } from '../keycodes/spec';
import { keycodeNeeds, needStatus, needsCode } from '../keycodes/requirements';
import { type FeatureId, type HardwareFacts } from '../features/registry';
import type { Keymap, Macro, Project } from '../project/types';
import type { ViaClient } from './client';
import { encodeMacroBuffer } from './macros';
import type { DeviceSnapshot } from './probe';

export interface KeyWrite {
  layer: number;
  row: number;
  col: number;
  before: number;
  after: number;
}

export interface EncoderWrite {
  layer: number;
  encoder: number;
  clockwise: boolean;
  before: number;
  after: number;
}

export interface WriteWarning {
  level: 'error' | 'warning';
  message: { en: string; ru: string };
}

export interface WritePlan {
  keys: KeyWrite[];
  encoders: EncoderWrite[];
  macros: { changed: boolean; buffer: Uint8Array | null };
  warnings: WriteWarning[];
  /** Whether writing is possible (no errors). */
  ok: boolean;
}

export interface PlanInput {
  project: Project;
  keymap: Keymap;
  snapshot: DeviceSnapshot;
  spec: KeycodeSpec;
  hardware: HardwareFacts;
  includeMacros: boolean;
}

/** What changes in the keyboard if the project keymap is written. The keyboard is not touched. */
export function planWrite({ project, keymap, snapshot, spec, hardware, includeMacros }: PlanInput): WritePlan {
  const warnings: WriteWarning[] = [];
  const { rows, cols } = project.hardware.matrix;
  if (rows !== snapshot.rows || cols !== snapshot.cols) {
    warnings.push({
      level: 'error',
      message: {
        en: `Matrix size differs: project ${rows}×${cols}, keyboard ${snapshot.rows}×${snapshot.cols}.`,
        ru: `Размер матрицы не совпадает: в проекте ${rows}×${cols}, в клавиатуре ${snapshot.rows}×${snapshot.cols}.`,
      },
    });
    return { keys: [], encoders: [], macros: { changed: false, buffer: null }, warnings, ok: false };
  }
  const devLayers = snapshot.capabilities.layers;
  if (keymap.layers.length > devLayers) {
    warnings.push({
      level: 'warning',
      message: {
        en: `The keyboard firmware has ${devLayers} layers; layers ${devLayers}…${keymap.layers.length - 1} of the project are not written (more layers need a firmware rebuild: DYNAMIC_KEYMAP_LAYER_COUNT).`,
        ru: `В прошивке клавиатуры ${devLayers} слоя; слои ${devLayers}…${keymap.layers.length - 1} проекта не записываются (больше слоёв — только пересборкой прошивки: DYNAMIC_KEYMAP_LAYER_COUNT).`,
      },
    });
  }
  const keys: KeyWrite[] = [];
  const unsupported = new Map<FeatureId, number>();
  let needCode = 0;
  const standIns = new Set(project.tapHoldActions.map((a) => a.keycode));
  for (let l = 0; l < Math.min(devLayers, keymap.layers.length); l++) {
    const proj = keymap.layers[l].keys;
    const dev = snapshot.keymap[l];
    for (let i = 0; i < rows * cols; i++) {
      const after = proj[i] ?? 0;
      if (after !== dev[i]) keys.push({ layer: l, row: Math.floor(i / cols), col: i % cols, before: dev[i], after });
      for (const need of keycodeNeeds(spec, after, { unicode: project.firmware.unicode })) {
        const { feature, status } = needStatus(need, project.firmware.flags, hardware);
        if (status.state !== 'available') unsupported.set(feature, (unsupported.get(feature) ?? 0) + 1);
      }
      if (needsCode(spec, after) || standIns.has(after)) needCode++;
    }
  }
  for (const [f, n] of unsupported) {
    warnings.push({
      level: 'warning',
      message: {
        en: `${n} key(s) need “${f}”, which the current firmware may not have — they will be written but may do nothing.`,
        ru: `${n} клав. требуют «${f}», которого в текущей прошивке может не быть — запишутся, но могут не работать.`,
      },
    });
  }
  if (needCode) {
    warnings.push({
      level: 'warning',
      message: {
        en: `${needCode} key(s) are tap dance / custom keycodes / tap-hold keys with actions: they work only if the firmware has code for them.`,
        ru: `${needCode} клав. — tap dance, свои keycodes или тап-холд клавиши с действиями: работают, только если в прошивке есть их код.`,
      },
    });
  }

  const encoders: EncoderWrite[] = [];
  if (snapshot.capabilities.encoderMap) {
    for (let l = 0; l < Math.min(devLayers, keymap.layers.length); l++) {
      const proj = keymap.layers[l].encoders;
      for (let e = 0; e < Math.min(proj.length, snapshot.encoderCount); e++) {
        const dev = snapshot.encoders[l]?.[e] ?? { cw: 0, ccw: 0 };
        if (proj[e].cw !== dev.cw) encoders.push({ layer: l, encoder: e, clockwise: true, before: dev.cw, after: proj[e].cw });
        if (proj[e].ccw !== dev.ccw) encoders.push({ layer: l, encoder: e, clockwise: false, before: dev.ccw, after: proj[e].ccw });
      }
    }
  } else if (keymap.layers.some((l) => l.encoders.some((e) => e.cw || e.ccw))) {
    warnings.push({
      level: 'warning',
      message: {
        en: 'The keyboard firmware has no encoder map: encoder actions are kept in the project and go into your own firmware build.',
        ru: 'В прошивке клавиатуры нет карты энкодеров: действия энкодеров хранятся в проекте и попадут в вашу сборку прошивки.',
      },
    });
  }

  let macros: WritePlan['macros'] = { changed: false, buffer: null };
  if (includeMacros && snapshot.capabilities.macros && snapshot.macros) {
    const { count, bufferSize } = snapshot.capabilities.macros;
    const usable = project.macros.filter((m: Macro) => m.index < count);
    if (project.macros.length > usable.length) {
      warnings.push({ level: 'warning', message: { en: `Only ${count} macros fit into the keyboard; the rest are not written.`, ru: `В клавиатуре ${count} макросов; остальные не записываются.` } });
    }
    try {
      const buffer = encodeMacroBuffer(usable, count, bufferSize);
      const current = encodeMacroBuffer(
        snapshot.macros.map((steps, index) => ({ index, steps })),
        count,
        bufferSize,
      );
      const changed = buffer.some((b, i) => b !== current[i]);
      macros = { changed, buffer: changed ? buffer : null };
    } catch (err) {
      warnings.push({ level: 'error', message: { en: `Macros: ${(err as Error).message}`, ru: `Макросы: ${(err as Error).message}` } });
    }
  }
  return { keys, encoders, macros, warnings, ok: !warnings.some((w) => w.level === 'error') };
}

export interface ApplyResult {
  written: { keys: number; encoders: number; macros: boolean };
  /** Positions where something other than what was written was read back. */
  mismatches: string[];
  verified: boolean;
}

/**
 * Write the plan to the keyboard and verify by reading. If the keyboard is unplugged mid-write —
 * an exception (part of the changes may have been written: compare again on the next connection).
 */
export async function applyWrite(client: ViaClient, plan: WritePlan, snapshot: DeviceSnapshot, onProgress?: (part: number) => void): Promise<ApplyResult> {
  if (!plan.ok) throw new Error('the write plan has errors');
  const { rows, cols } = snapshot;
  const total = plan.keys.length + plan.encoders.length + (plan.macros.buffer ? 1 : 0);
  let done = 0;
  const step = () => onProgress?.(total ? ++done / total : 1);

  // Many changes — one buffer per layer (faster), few — key by key.
  const byLayer = new Map<number, KeyWrite[]>();
  for (const k of plan.keys) byLayer.set(k.layer, [...(byLayer.get(k.layer) ?? []), k]);
  for (const [layer, changes] of byLayer) {
    if (changes.length > (rows * cols) / 3) {
      const words = [...snapshot.keymap[layer]];
      for (const c of changes) words[c.row * cols + c.col] = c.after;
      const bytes = new Uint8Array(words.length * 2);
      words.forEach((w, i) => {
        bytes[i * 2] = w >> 8;
        bytes[i * 2 + 1] = w & 0xff;
      });
      await client.writeKeymapBuffer(layer * rows * cols * 2, bytes);
      changes.forEach(step);
    } else {
      for (const c of changes) {
        await client.setKeycode(c.layer, c.row, c.col, c.after);
        step();
      }
    }
  }
  for (const e of plan.encoders) {
    await client.setEncoder(e.layer, e.encoder, e.clockwise, e.after);
    step();
  }
  if (plan.macros.buffer) {
    await client.writeMacroBuffer(plan.macros.buffer);
    step();
  }

  // Verification: read back everything that was written.
  const mismatches: string[] = [];
  for (const c of plan.keys) {
    const v = await client.getKeycode(c.layer, c.row, c.col);
    if (v !== c.after) mismatches.push(`L${c.layer} [${c.row},${c.col}]: 0x${v.toString(16)} ≠ 0x${c.after.toString(16)}`);
  }
  for (const e of plan.encoders) {
    const v = await client.getEncoder(e.layer, e.encoder, e.clockwise);
    if (v !== e.after) mismatches.push(`L${e.layer} E${e.encoder} ${e.clockwise ? 'cw' : 'ccw'}: 0x${(v ?? 0).toString(16)} ≠ 0x${e.after.toString(16)}`);
  }
  if (plan.macros.buffer) {
    const back = await client.readMacroBuffer(plan.macros.buffer.length);
    if (back.some((b, i) => b !== plan.macros.buffer![i])) mismatches.push('macros buffer');
  }
  return { written: { keys: plan.keys.length, encoders: plan.encoders.length, macros: !!plan.macros.buffer }, mismatches, verified: mismatches.length === 0 };
}

/** Apply what was read from the keyboard to the project keymap (new layer and encoder values). */
export function snapshotToKeymap(keymap: Keymap, snapshot: DeviceSnapshot): Keymap {
  const layers = snapshot.keymap.map((keys, l) => {
    const existing = keymap.layers[l];
    const encoders = snapshot.encoders[l] ?? existing?.encoders ?? [];
    return {
      id: existing?.id ?? `layer_dev_${l}`,
      name: existing?.name ?? (l === 0 ? 'Base' : `Layer ${l}`),
      color: existing?.color,
      keys: [...keys],
      encoders: encoders.map((e) => ({ ...e })),
    };
  });
  return { ...keymap, layers, defaultLayer: Math.min(keymap.defaultLayer, layers.length - 1) };
}
