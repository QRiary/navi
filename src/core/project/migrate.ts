/**
 * PROJECT FORMAT MIGRATIONS.
 * Each migration moves the data from version N to N+1. When the shape of Project changes:
 *  1) raise PROJECT_SCHEMA_VERSION in types.ts;
 *  2) add a function MIGRATIONS[N] (N → N+1) here;
 *  3) add a test with an old file (project.test.ts).
 * Files NEWER than the app do not open (so unknown fields are not lost).
 */
import { AUTO_REPEAT_DEFAULT } from './factory';
import { PROJECT_SCHEMA_VERSION } from './types';

type Data = Record<string, unknown>;

/** MIGRATIONS[n] moves version n to n + 1. */
export const MIGRATIONS: Record<number, (d: Data) => Data> = {
  // 1 → 2: the hardware profile got board pins (hardware.pins) for an own QMK target.
  1: (d) => {
    const hardware = d.hardware && typeof d.hardware === 'object' && !Array.isArray(d.hardware) ? (d.hardware as Data) : {};
    return { ...d, schemaVersion: 2, hardware: { ...hardware, pins: hardware.pins ?? null } };
  },
  // 2 → 3: leader key sequences and the unicode map (UNICODEMAP).
  2: (d) => ({ ...d, schemaVersion: 3, leaderSequences: Array.isArray(d.leaderSequences) ? d.leaderSequences : [], unicodeMap: Array.isArray(d.unicodeMap) ? d.unicodeMap : [] }),
  // 3 → 4: layer C names (Layer.cName) and “own pipeline” mode (firmware.pipeline); both optional.
  3: (d) => ({ ...d, schemaVersion: 4 }),
  // 4 → 5: key aliases (keyAliases).
  4: (d) => ({ ...d, schemaVersion: 5, keyAliases: Array.isArray(d.keyAliases) ? d.keyAliases : [] }),
  // 5 → 6: “layer keys bring their layer to the top” (firmware.layerKeysOnTop), off for older files.
  5: (d) => {
    const f = d.firmware;
    if (!f || typeof f !== 'object' || Array.isArray(f)) return { ...d, schemaVersion: 6 }; // validate reports it
    return { ...d, schemaVersion: 6, firmware: { ...(f as Data), layerKeysOnTop: false } };
  },
  // 6 → 7: per-keycode tap-hold settings (tapHolds).
  6: (d) => ({ ...d, schemaVersion: 7, tapHolds: Array.isArray(d.tapHolds) ? d.tapHolds : [] }),
  // 7 → 8: tap-hold keys with any action in each slot (tapHoldActions).
  7: (d) => ({ ...d, schemaVersion: 8, tapHoldActions: Array.isArray(d.tapHoldActions) ? d.tapHoldActions : [] }),
  // 8 → 9: tap dance kinds (TapDance.kind, steps, ownC); all optional, undefined kind = the old slots.
  8: (d) => ({ ...d, schemaVersion: 9 }),
  // 9 → 10: per-layer combo reference layer (Layer.comboRef), optional: unset = layer 0, as before.
  9: (d) => ({ ...d, schemaVersion: 10 }),
  // 10 → 11: a tap-hold setting holds several keycodes (keycode → keycodes); named key lists (keyLists).
  10: (d) => ({
    ...d,
    schemaVersion: 11,
    keyLists: Array.isArray(d.keyLists) ? d.keyLists : [],
    tapHolds: Array.isArray(d.tapHolds)
      ? d.tapHolds.map((s: unknown) => {
          if (!s || typeof s !== 'object' || Array.isArray(s)) return s; // validate reports it
          const { keycode, ...rest } = s as Data;
          return 'keycodes' in rest ? rest : { ...rest, keycodes: [keycode] };
        })
      : d.tapHolds,
  }),
  // 11 → 12: auto repeat delay and rate (firmware.autoRepeat), the default for older files; macro / custom keycode `repeat` is optional.
  11: (d) => {
    const f = d.firmware;
    if (!f || typeof f !== 'object' || Array.isArray(f)) return { ...d, schemaVersion: 12 }; // validate reports it
    return { ...d, schemaVersion: 12, firmware: { ...(f as Data), autoRepeat: { ...AUTO_REPEAT_DEFAULT } } };
  },
};

export function migrateProject(input: Data): { data: Data; from: number } | { error: string } {
  const from = typeof input.schemaVersion === 'number' ? input.schemaVersion : NaN;
  if (!Number.isInteger(from) || from < 1) return { error: 'missing or invalid schemaVersion' };
  if (from > PROJECT_SCHEMA_VERSION) {
    return { error: `the file was saved by a newer version of the app (format ${from} > ${PROJECT_SCHEMA_VERSION}) — update the app` };
  }
  let data = input;
  for (let v = from; v < PROJECT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { error: `no migration from format ${v}` };
    data = step(data);
  }
  return { data: { ...data, schemaVersion: PROJECT_SCHEMA_VERSION }, from };
}
