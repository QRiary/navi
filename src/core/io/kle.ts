/**
 * KLE (keyboard-layout-editor.com) “raw data” → keys with coordinates and labels.
 * The positioning logic is as in kle-serial (the library KLE and VIA use):
 *  • a row = an array; an object before a key sets its properties (x, y — offset; w, h; r, rx, ry);
 *  • rx/ry set the rotation center and reset the “cursor” to (rx, ry);
 *  • at the end of a row y += 1, x = rx.
 * VIA keyboard definitions are KLE where the first key label = the matrix “row,col”.
 */

export interface KleKey {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  rx: number;
  ry: number;
  labels: string[];
  decal: boolean;
  ghost: boolean;
}

export class KleError extends Error {}

/** Parses a KLE array (the first element may be a metadata object). */
export function parseKle(rows: unknown): { keys: KleKey[]; meta: Record<string, unknown> } {
  if (!Array.isArray(rows)) throw new KleError('KLE data must be an array of rows');
  const keys: KleKey[] = [];
  let meta: Record<string, unknown> = {};
  const cur = { x: 0, y: 0, w: 1, h: 1, r: 0, rx: 0, ry: 0, decal: false, ghost: false };
  const cluster = { x: 0, y: 0 };
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!Array.isArray(row)) {
      if (ri === 0 && row && typeof row === 'object') meta = row as Record<string, unknown>;
      continue;
    }
    for (let k = 0; k < row.length; k++) {
      const item = row[k];
      if (typeof item === 'string') {
        keys.push({ x: cur.x, y: cur.y, w: cur.w, h: cur.h, r: cur.r, rx: cur.rx, ry: cur.ry, labels: item.split('\n'), decal: cur.decal, ghost: cur.ghost });
        cur.x += cur.w;
        cur.w = 1;
        cur.h = 1;
        cur.decal = false;
      } else if (item && typeof item === 'object') {
        const p = item as Record<string, unknown>;
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
        if (num(p.r) !== undefined) cur.r = num(p.r)!;
        if (num(p.rx) !== undefined) cur.rx = cluster.x = num(p.rx)!;
        if (num(p.ry) !== undefined) cur.ry = cluster.y = num(p.ry)!;
        if (num(p.rx) !== undefined || num(p.ry) !== undefined) {
          cur.x = cluster.x;
          cur.y = cluster.y;
        }
        if (num(p.x)) cur.x += num(p.x)!;
        if (num(p.y)) cur.y += num(p.y)!;
        if (num(p.w)) cur.w = num(p.w)!;
        if (num(p.h)) cur.h = num(p.h)!;
        if (p.d === true) cur.decal = true;
        if (typeof p.g === 'boolean') cur.ghost = p.g;
      } else {
        throw new KleError(`unexpected item in row ${ri}`);
      }
    }
    cur.y += 1;
    cur.x = cur.rx;
  }
  return { keys, meta };
}

/**
 * Keys → KLE raw data (for geometry export). label — the label (for VIA — “row,col”).
 * Every key gets explicit r/rx/ry: the KLE cursor then moves to (rx, ry), and the key's x/y
 * are written relative to it — so the result is unambiguous and reads in KLE and VIA without loss.
 */
export function serializeKle(keys: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number; label: string }[]): unknown[] {
  return keys.map((k) => {
    const props: Record<string, number> = { r: k.r, rx: round(k.rx), ry: round(k.ry) };
    const x = round(k.x - k.rx);
    const y = round(k.y - k.ry);
    if (x) props.x = x;
    if (y) props.y = y;
    if (k.w !== 1) props.w = k.w;
    if (k.h !== 1) props.h = k.h;
    return [props, k.label];
  });
}

function round(n: number) {
  return Math.round(n * 10000) / 10000;
}
