/**
 * READABLE KEYMAP IN keymap.c — the keys of every layer sit as on the drawing, in frames:
 *
 *     [L_BASE] = NAVI_LAYOUT(
 * //     ┌─────────┬─────────┬─────────┐
 *         KC_ESC,   KC_1,     KC_2,
 * //     ├─────────┼─────────┼─────────┤
 *
 * How it works:
 *  • the NAVI_LAYOUT(...) macro takes the keys in drawing order (left to right, top to bottom)
 *    and places them into the matrix [row][col]; positions without a key are KC_NO;
 *  • positions that are not on the drawing but are used in the keymap go to a separate last line —
 *    so the firmware is exactly the same as when written “by the matrix”;
 *  • the frames are only comments, they do not affect the build.
 * The drawing order is for reading: even if it comes out imperfect, the assignments are correct,
 * because the macro matches keys to the matrix by the names k<row>_<col>.
 */
import { keyCenter } from '../layout/geometry';
import type { Geometry, MatrixPos } from '../project/types';

/** A key in the text grid: matrix position and place in the grid (row, column). */
export interface TextCell {
  pos: MatrixPos;
  row: number;
  col: number;
}

export interface TextLayout {
  /** Grid rows from top to bottom; in each — keys from left to right. */
  rows: TextCell[][];
  /** Positions used in the keymap that are not on the drawing (they go to the last line). */
  extras: MatrixPos[];
  /** Average height of each row on the drawing (u) — to separate, for example, the thumb cluster. */
  rowY: number[];
}

interface Placed {
  pos: MatrixPos;
  x: number;
  y: number;
}

/** Height spread inside a matrix row above which the matrix row is not a row of keys on the drawing. */
const ROW_SPREAD_MAX = 1.6;
/** Rows at the same height (closer than this) that do not overlap in x are one grid row (split halves). */
const SAME_ROW_DY = 0.5;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

/** Drawing keys wired to the matrix (one per position). No drawing — a grid by the matrix. */
function placedKeys(geometry: Geometry | null, rows: number, cols: number): Placed[] {
  const out: Placed[] = [];
  const seen = new Set<string>();
  for (const k of geometry?.keys ?? []) {
    if (!k.matrix) continue;
    const [r, c] = k.matrix;
    if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
    const id = `${r},${c}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const p = keyCenter(k);
    out.push({ pos: [r, c], x: p.x, y: p.y });
  }
  if (out.length) return out;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ pos: [r, c], x: c, y: r });
  return out;
}

/** Key groups by rows: usually row = matrix row, otherwise by height on the drawing. */
function groupRows(keys: Placed[]): Placed[][] {
  const byMatrixRow = new Map<number, Placed[]>();
  for (const k of keys) byMatrixRow.set(k.pos[0], [...(byMatrixRow.get(k.pos[0]) ?? []), k]);
  let groups = [...byMatrixRow.values()];
  if (groups.some((g) => spread(g.map((k) => k.y)) > ROW_SPREAD_MAX)) {
    const minY = Math.min(...keys.map((k) => k.y));
    const byY = new Map<number, Placed[]>();
    for (const k of keys) {
      const r = Math.round(k.y - minY);
      byY.set(r, [...(byY.get(r) ?? []), k]);
    }
    groups = [...byY.values()];
  }
  groups.sort((a, b) => mean(a.map((k) => k.y)) - mean(b.map((k) => k.y)));
  // Left and right halves of a split at the same height are one grid row.
  const merged: Placed[][] = [];
  for (const g of groups) {
    const gy = mean(g.map((k) => k.y));
    const gx = [Math.min(...g.map((k) => k.x)), Math.max(...g.map((k) => k.x))];
    const target = merged.find((m) => {
      const mx = [Math.min(...m.map((k) => k.x)), Math.max(...m.map((k) => k.x))];
      const overlap = gx[0] <= mx[1] && mx[0] <= gx[1];
      return !overlap && Math.abs(mean(m.map((k) => k.y)) - gy) < SAME_ROW_DY;
    });
    if (target) target.push(...g);
    else merged.push([...g]);
  }
  merged.sort((a, b) => mean(a.map((k) => k.y)) - mean(b.map((k) => k.y)));
  return merged;
}

/**
 * Grid for keymap.c following the keyboard drawing.
 * used(pos) — whether the position is used on any layer (such positions without a key on the drawing are not lost).
 */
export function textLayout(geometry: Geometry | null, rows: number, cols: number, used: (pos: MatrixPos) => boolean): TextLayout {
  const keys = placedKeys(geometry, rows, cols);
  const minX = Math.min(...keys.map((k) => k.x));
  const textRows: TextCell[][] = [];
  const rowY: number[] = [];
  groupRows(keys).forEach((group, row) => {
    group.sort((a, b) => a.x - b.x);
    let prev = -1;
    // Column = key pitch along x; if two keys land in one column, the right one is moved.
    textRows.push(
      group.map((k) => {
        prev = Math.max(Math.round(k.x - minX), prev + 1);
        return { pos: k.pos, row, col: prev };
      }),
    );
    rowY.push(mean(group.map((k) => k.y)));
  });
  const onDiagram = new Set(keys.map((k) => `${k.pos[0]},${k.pos[1]}`));
  const extras: MatrixPos[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (!onDiagram.has(`${r},${c}`) && used([r, c])) extras.push([r, c]);
  }
  return { rows: textRows, extras, rowY };
}

// ── Drawing ───────────────────────────────────────────────────────────

/** Macro argument name for a matrix position. */
export const paramName = ([r, c]: MatrixPos) => `k${r}_${c}`;

/** Indent of the frames (after “//”) and of the key text. */
const BOX_INDENT = 5;
/** Spaces between split halves (between columns with empty columns in the middle). */
const GAP = 4;
/** Rows farther apart than this (u) get separate frames, like the thumb cluster. */
const SEPARATE_DY = 1.15;

/** Box-drawing character for the lines that meet at a point. */
function junction(up: boolean, down: boolean, left: boolean, right: boolean): string {
  const key = `${up ? 'u' : ''}${down ? 'd' : ''}${left ? 'l' : ''}${right ? 'r' : ''}`;
  const table: Record<string, string> = {
    dr: '┌', dl: '┐', ur: '└', ul: '┘',
    udr: '├', udl: '┤', dlr: '┬', ulr: '┴', udlr: '┼',
    ud: '│', lr: '─', u: '│', d: '│', l: '─', r: '─',
  };
  return table[key] ?? ' ';
}

/** Where a key sits in a text line: left border at start, text from start+1, text width width. */
interface Span {
  start: number;
  width: number;
}
const spanEnd = (s: Span) => s.start + s.width + 2;

/**
 * Rows are split into blocks: rows far apart in height (the thumb cluster) are a separate block
 * with its own frames and column widths, anchored to the columns of the main block.
 */
function blocksOf(layout: TextLayout): number[][] {
  const blocks: number[][] = [];
  layout.rows.forEach((_, i) => {
    if (i === 0 || layout.rowY[i] - layout.rowY[i - 1] > SEPARATE_DY) blocks.push([i]);
    else blocks[blocks.length - 1].push(i);
  });
  return blocks;
}

/**
 * Place of each block column in the line. The main block goes in a row, with a gap between runs
 * (split halves); other blocks go under the same columns of the main block.
 * shift — how far a run had to move right so it does not overlap the previous one.
 */
function placeBlock(cols: number[], width: Map<number, number>, anchor: Map<number, number> | null, gap: number): { offset: Map<number, number>; shift: number } {
  const offset = new Map<number, number>();
  // Runs of neighbouring columns (between split halves there are empty columns, the run breaks there).
  const runs: number[][] = [];
  cols.forEach((col, i) => {
    if (i > 0 && col - cols[i - 1] === 1) runs[runs.length - 1].push(col);
    else runs.push([col]);
  });
  let end = -gap;
  let shift = 0;
  for (const run of runs) {
    const w = (col: number) => width.get(col)! + 2;
    // Run start: under the first column that exists in the main block, otherwise right after the previous run.
    const k = anchor ? run.findIndex((col) => anchor.has(col)) : -1;
    const wanted = k >= 0 ? anchor!.get(run[k])! - run.slice(0, k).reduce((s, col) => s + w(col), 0) : end + gap;
    let start = Math.max(wanted, end + gap, 0);
    if (k >= 0) shift = Math.max(shift, start - wanted);
    for (const col of run) {
      offset.set(col, start);
      start += w(col);
    }
    end = start;
  }
  return { offset, shift };
}

/**
 * keymap.c layers as a grid with frames.
 * text(layer, pos) — the QMK expression of a key; returns the lines of each layer (without “[L] = NAVI_LAYOUT(” and “),”).
 */
export function renderLayers(layout: TextLayout, layerCount: number, text: (layer: number, pos: MatrixPos) => string): string[][] {
  const blocks = blocksOf(layout);
  // Column width in a block — by the longest expression on all layers (+ comma).
  const widths = blocks.map((rows) => {
    const width = new Map<number, number>();
    for (const cell of rows.flatMap((i) => layout.rows[i])) {
      let w = width.get(cell.col) ?? 1;
      for (let l = 0; l < layerCount; l++) w = Math.max(w, text(l, cell.pos).length + 1);
      width.set(cell.col, w);
    }
    return width;
  });
  const cellCount = (b: number) => blocks[b].reduce((s, i) => s + layout.rows[i].length, 0);
  const main = blocks.reduce((best, _, b) => (cellCount(b) > cellCount(best) ? b : best), 0);
  const sortedCols = (b: number) => [...widths[b].keys()].sort((a, c) => a - c);
  // If the thumb cluster reaches into the gap between the halves, move the halves apart.
  let gap = GAP;
  let offsets: Map<number, number>[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const mainOffset = placeBlock(sortedCols(main), widths[main], null, gap).offset;
    const placed = blocks.map((_, b) => (b === main ? { offset: mainOffset, shift: 0 } : placeBlock(sortedCols(b), widths[b], mainOffset, GAP)));
    offsets = placed.map((p) => p.offset);
    const shift = Math.max(...placed.map((p) => p.shift));
    if (shift === 0) break;
    gap += shift;
  }
  const spans = new Map<TextCell, Span>();
  blocks.forEach((rows, b) => {
    for (const cell of rows.flatMap((i) => layout.rows[i])) spans.set(cell, { start: offsets[b].get(cell.col)!, width: widths[b].get(cell.col)! });
  });
  const lineWidth = Math.max(...[...spans.values()].map(spanEnd)) + 1;

  /** Positions of the vertical lines of a row (borders left and right of each key). */
  const borders = (row: TextCell[] | null) => {
    const set = new Set<number>();
    for (const cell of row ?? []) set.add(spans.get(cell)!.start).add(spanEnd(spans.get(cell)!));
    return set;
  };
  /** Where the horizontal line goes (top/bottom of the row's keys). */
  const edges = (row: TextCell[] | null) => {
    const set = new Set<number>();
    for (const cell of row ?? []) for (let p = spans.get(cell)!.start + 1; p < spanEnd(spans.get(cell)!); p++) set.add(p);
    return set;
  };
  /** The line between row above and row below (either may be missing). */
  const boxLine = (above: TextCell[] | null, below: TextCell[] | null) => {
    const up = borders(above);
    const down = borders(below);
    const horiz = new Set([...edges(above), ...edges(below)]);
    let s = '';
    for (let p = 0; p < lineWidth; p++) {
      if (up.has(p) || down.has(p)) s += junction(up.has(p), down.has(p), horiz.has(p - 1), horiz.has(p + 1));
      else s += horiz.has(p) ? '─' : ' ';
    }
    return `//${' '.repeat(BOX_INDENT)}${s}`.trimEnd();
  };

  const lastIndex = layout.extras.length ? -1 : layout.rows.length - 1;
  const result: string[][] = [];
  for (let l = 0; l < layerCount; l++) {
    const lines: string[] = [];
    layout.rows.forEach((row, i) => {
      const prev = i > 0 ? layout.rows[i - 1] : null;
      if (!prev) lines.push(boxLine(null, row));
      else if (layout.rowY[i] - layout.rowY[i - 1] > SEPARATE_DY) lines.push(boxLine(prev, null), '//', boxLine(null, row));
      else lines.push(boxLine(prev, row));
      const chars = Array.from({ length: lineWidth }, () => ' ');
      row.forEach((cell, j) => {
        const last = i === lastIndex && j === row.length - 1;
        const t = `${text(l, cell.pos)}${last ? '' : ','}`;
        for (let k = 0; k < t.length; k++) chars[spans.get(cell)!.start + 1 + k] = t[k];
      });
      lines.push(`  ${' '.repeat(BOX_INDENT)}${chars.join('')}`.trimEnd());
    });
    if (layout.rows.length) lines.push(boxLine(layout.rows[layout.rows.length - 1], null));
    if (layout.extras.length) {
      lines.push(`//${' '.repeat(BOX_INDENT)} matrix positions that are not on the diagram: ${layout.extras.map(([r, c]) => `[${r},${c}]`).join(' ')}`);
      lines.push(`  ${' '.repeat(BOX_INDENT)} ${layout.extras.map((p) => text(l, p)).join(', ')}`);
    }
    result.push(lines);
  }
  return result;
}

/**
 * Definition of the NAVI_LAYOUT macro: arguments in drawing order, body — the rows×cols matrix.
 */
export function layoutMacro(layout: TextLayout, rows: number, cols: number): string[] {
  const order: MatrixPos[] = [...layout.rows.flatMap((row) => row.map((c) => c.pos)), ...layout.extras];
  const known = new Set(order.map((p) => `${p[0]},${p[1]}`));
  const argLines = [...layout.rows.map((row) => row.map((c) => paramName(c.pos))), ...(layout.extras.length ? [layout.extras.map(paramName)] : [])].filter((l) => l.length);
  const out = ['#define NAVI_LAYOUT( \\'];
  argLines.forEach((names, i) => out.push(`    ${names.join(', ')}${i === argLines.length - 1 ? '' : ','} \\`));
  out.push(') { \\');
  for (let r = 0; r < rows; r++) {
    const cells = Array.from({ length: cols }, (_, c) => (known.has(`${r},${c}`) ? paramName([r, c]) : 'KC_NO'));
    out.push(`    { ${cells.join(', ')} }${r === rows - 1 ? '' : ','} \\`);
  }
  out.push('}');
  return out;
}
