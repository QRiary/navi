/**
 * Line-by-line diff of two texts (LCS) — to preview changes in QMK files
 * before writing. The result is lines marked “+”, “-” or “ ” and folded unchanged chunks.
 */

export interface DiffLine {
  kind: 'add' | 'del' | 'same' | 'skip';
  text: string;
  /** For skip — how many lines are folded. */
  count?: number;
}

export function diffLines(before: string, after: string, context = 3): DiffLine[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const full = alignLines(a, b);

  // Fold long unchanged stretches, keeping context lines around the changes.
  const keep = new Array(full.length).fill(false);
  full.forEach((l, k) => {
    if (l.kind !== 'same') for (let x = Math.max(0, k - context); x <= Math.min(full.length - 1, k + context); x++) keep[x] = true;
  });
  const out: DiffLine[] = [];
  let skipped = 0;
  full.forEach((l, k) => {
    if (keep[k]) {
      if (skipped) out.push({ kind: 'skip', text: '', count: skipped });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped) out.push({ kind: 'skip', text: '', count: skipped });
  return out;
}

/** Most edits Myers' search tries before giving up on aligning (its memory grows with the square). */
const MAX_EDITS = 2000;

/**
 * Myers' O((n + m) · D) diff, D = number of changed lines, so a few edits in a 3000-line `keymap.c` stay cheap
 * (the old LCS table was n · m and gave up on files past ~2450 lines, showing the whole file as replaced).
 * Past MAX_EDITS the unmatched middle is shown as all removed, then all added.
 */
function alignLines(a: string[], b: string[]): DiffLine[] {
  // Common head and tail first: the usual change touches a small middle part.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const same = (text: string) => ({ kind: 'same' as const, text });
  const mid = myers(a.slice(head, a.length - tail), b.slice(head, b.length - tail));
  return [...a.slice(0, head).map(same), ...mid, ...a.slice(a.length - tail).map(same)];
}

function myers(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= Math.min(max, MAX_EDITS) && found < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) found = d;
    }
    trace.push(v.slice(off - d, off + d + 1));
  }
  if (found < 0) return [...a.map((text) => ({ kind: 'del' as const, text })), ...b.map((text) => ({ kind: 'add' as const, text }))];

  // Walk back from the end: each step is one edit plus the matching run (snake) after it.
  const out: DiffLine[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d - 1]; // diagonals -(d-1)..(d-1)
    const at = (k: number) => prev[k + d - 1];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1)); // down = a line of b added
    const pk = down ? k + 1 : k - 1;
    const px = at(pk);
    const py = px - pk;
    const runStart = down ? px : px + 1;
    while (x > runStart) {
      out.push({ kind: 'same', text: a[--x] });
      y--;
    }
    out.push(down ? { kind: 'add', text: b[py] } : { kind: 'del', text: a[px] });
    x = px;
    y = py;
  }
  while (x > 0) out.push({ kind: 'same', text: a[--x] });
  return out.reverse();
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return { added: lines.filter((l) => l.kind === 'add').length, removed: lines.filter((l) => l.kind === 'del').length };
}
