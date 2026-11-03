/**
 * PROJECT FORMAT MIGRATIONS.
 * Each migration moves the data from version N to N+1. When the shape of Project changes:
 *  1) raise PROJECT_SCHEMA_VERSION in types.ts;
 *  2) add a function MIGRATIONS[N] (N → N+1) here;
 *  3) add a test with an old file (project.test.ts).
 * Files NEWER than the app do not open (so unknown fields are not lost).
 */
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
