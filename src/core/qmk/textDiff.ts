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
  const n = a.length;
  const m = b.length;
  if (n * m > 6_000_000) {
    // Files too large — no alignment: everything old removed, everything new added.
    return [...a.map((text) => ({ kind: 'del' as const, text })), ...b.map((text) => ({ kind: 'add' as const, text }))];
  }
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const full: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      full.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) full.push({ kind: 'del', text: a[i++] });
    else full.push({ kind: 'add', text: b[j++] });
  }
  while (i < n) full.push({ kind: 'del', text: a[i++] });
  while (j < m) full.push({ kind: 'add', text: b[j++] });

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

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return { added: lines.filter((l) => l.kind === 'add').length, removed: lines.filter((l) => l.kind === 'del').length };
}
