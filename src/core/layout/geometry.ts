/**
 * GEOMETRY: sizes, rotations, mouse hit tests, mirroring.
 * Pure functions over the types from project/types.ts. Units — u (key pitch).
 */
import type { ControlGeom, EncoderGeom, Geometry, KeyGeom, MatrixPos } from '../project/types';

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rotate a point around (cx, cy) by deg degrees (clockwise, as in KLE/QMK). */
export function rotatePoint(p: Point, cx: number, cy: number, deg: number): Point {
  if (!deg) return p;
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** Key corners with rotation. */
export function keyCorners(k: KeyGeom): Point[] {
  const pts = [
    { x: k.x, y: k.y },
    { x: k.x + k.w, y: k.y },
    { x: k.x + k.w, y: k.y + k.h },
    { x: k.x, y: k.y + k.h },
  ];
  return pts.map((p) => rotatePoint(p, k.rx, k.ry, k.r));
}

/** Key center (after rotation). */
export function keyCenter(k: KeyGeom): Point {
  return rotatePoint({ x: k.x + k.w / 2, y: k.y + k.h / 2 }, k.rx, k.ry, k.r);
}

function boxOfPoints(pts: Point[]): Box {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Box around the whole geometry. Empty geometry → 0×0. */
export function geometryBounds(g: Pick<Geometry, 'keys' | 'encoders' | 'controls'>): Box {
  const pts: Point[] = [];
  for (const k of g.keys) pts.push(...keyCorners(k));
  for (const e of g.encoders) pts.push({ x: e.x - e.d / 2, y: e.y - e.d / 2 }, { x: e.x + e.d / 2, y: e.y + e.d / 2 });
  for (const c of g.controls) pts.push({ x: c.x, y: c.y }, { x: c.x + c.w, y: c.y + c.h });
  if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  return boxOfPoints(pts);
}

/** Whether a point is inside a key (with rotation and shape). */
export function hitKey(k: KeyGeom, p: Point): boolean {
  const local = rotatePoint(p, k.rx, k.ry, -k.r);
  if (k.shape === 'circle') {
    const cx = k.x + k.w / 2;
    const cy = k.y + k.h / 2;
    return ((local.x - cx) / (k.w / 2)) ** 2 + ((local.y - cy) / (k.h / 2)) ** 2 <= 1;
  }
  return local.x >= k.x && local.x <= k.x + k.w && local.y >= k.y && local.y <= k.y + k.h;
}

/** Keys whose center falls into a rectangle (frame selection). */
export function keysInBox(keys: KeyGeom[], box: Box): KeyGeom[] {
  return keys.filter((k) => {
    const c = keyCenter(k);
    return c.x >= box.x && c.x <= box.x + box.w && c.y >= box.y && c.y <= box.y + box.h;
  });
}

/** Normalizes a rectangle given by two points. */
export function boxFromPoints(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

let idCounter = 0;
/** Short unique id (for keys, layers etc.). */
export function newId(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

/**
 * Mirror copy of keys around the vertical axis axisX (for the second half of a split).
 * Rotations are mirrored, matrix positions are set by mapMatrix (or null).
 */
export function mirrorKeys(keys: KeyGeom[], axisX: number, mapMatrix: (m: MatrixPos | null) => MatrixPos | null, half: KeyGeom['half']): KeyGeom[] {
  return keys.map((k) => ({
    ...k,
    id: newId('key'),
    matrix: mapMatrix(k.matrix),
    x: 2 * axisX - (k.x + k.w),
    rx: 2 * axisX - k.rx,
    r: -k.r || 0,
    half,
  }));
}

/** Snap to the grid: step in u (0 — no snapping). */
export function snap(v: number, step: number): number {
  if (!step) return Math.round(v * 1000) / 1000;
  return Math.round(v / step) * step;
}

/** Geometry checks against the matrix size. */
export interface GeometryIssue {
  level: 'error' | 'warning';
  keyId?: string;
  message: { en: string; ru: string };
}

export function checkGeometry(g: Geometry, rows: number, cols: number): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  const seen = new Map<string, string>();
  for (const k of g.keys) {
    if (!k.matrix) continue;
    const [r, c] = k.matrix;
    if (r < 0 || r >= rows || c < 0 || c >= cols) {
      issues.push({ level: 'error', keyId: k.id, message: { en: `Key ${k.label ?? k.id}: matrix [${r},${c}] is outside ${rows}×${cols}`, ru: `Клавиша ${k.label ?? k.id}: позиция [${r},${c}] вне матрицы ${rows}×${cols}` } });
      continue;
    }
    const key = `${r},${c}`;
    const other = seen.get(key);
    if (other) {
      issues.push({ level: 'error', keyId: k.id, message: { en: `Two keys share matrix position [${r},${c}]`, ru: `Две клавиши на одной позиции матрицы [${r},${c}]` } });
    } else seen.set(key, k.id);
    if (k.w <= 0 || k.h <= 0) issues.push({ level: 'error', keyId: k.id, message: { en: 'Key size must be positive', ru: 'Размер клавиши должен быть больше нуля' } });
  }
  for (const e of g.encoders) {
    // A round key right under the knob is its press, not an overlap.
    if (e.pressMatrix && seen.has(`${e.pressMatrix[0]},${e.pressMatrix[1]}`) && !knobKey(g, e)) {
      issues.push({ level: 'warning', message: { en: `Encoder ${e.index} press shares a key position`, ru: `Нажатие энкодера ${e.index} совпадает с позицией клавиши` } });
    }
  }
  const unwired = g.keys.filter((k) => !k.matrix).length;
  if (unwired) issues.push({ level: 'warning', message: { en: `${unwired} key(s) have no matrix position`, ru: `У ${unwired} клав. нет позиции в матрице` } });
  return issues;
}

/**
 * Knob press key: its position = pressMatrix and its center lies inside the knob.
 * The drawing puts such a key under the knob, and it is assigned like a normal key.
 */
export function knobKey(g: Pick<Geometry, 'keys'>, e: EncoderGeom): KeyGeom | undefined {
  const pm = e.pressMatrix;
  if (!pm) return undefined;
  return g.keys.find((k) => {
    if (!k.matrix || k.matrix[0] !== pm[0] || k.matrix[1] !== pm[1]) return false;
    const c = keyCenter(k);
    return Math.hypot(c.x - e.x, c.y - e.y) <= e.d / 2;
  });
}

export function cloneGeometry(g: Geometry, name: string): Geometry {
  return {
    ...structuredClone(g),
    id: newId('geo'),
    name,
  };
}

export type { ControlGeom, EncoderGeom, KeyGeom };
