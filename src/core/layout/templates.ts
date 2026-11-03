/**
 * GEOMETRY TEMPLATES.
 *
 * dilemma4x6Clone — starting drawing for the lucky_studio “Dilemma_4X6” keyboard.
 *   Where the numbers come from:
 *    • the 10×6 matrix and the assignments were read from the keyboard itself over VIA (2026-10-22);
 *    • column placement — from the official Dilemma Max definition in QMK
 *      (keyboards/bastardkb/dilemma/4x6_4/keyboard.json, rgb_matrix coordinates), converted to key pitches;
 *      the owner's photo (2026-10-22) confirms it: the right half has the same column stagger as the
 *      official one (pinkies ≈ 1u lower than the middle finger);
 *    • from the photo: under the thumb on each half there is a knob and 3 keys on an arc,
 *      top right near the inner edge — a round trackpad ≈ 40 mm.
 *   Which matrix position is where is a guess (see THUMBS), so everything is marked approximate:
 *   exact places are confirmed with the key tester or fixed in the geometry editor.
 *
 * grid — a simple rows×cols grid when nothing is known about the keyboard.
 */
import type { ControlGeom, EncoderGeom, Geometry, KeyGeom, MatrixPos } from '../project/types';
import { newId } from './geometry';
import { t } from '../../i18n';

/** Column and row pitch in rgb_matrix coordinates of the official Dilemma Max. */
const LED_X = 13.2;
const LED_Y = 10.7;
const X0 = 9;
const Y0 = 6;

/** Key centers of the left half (rgb_matrix coordinates from QMK), [row][column]. */
const LEFT_LED: [number, number][][] = [
  [[9, 16], [22, 16], [35, 10], [49, 6], [62, 9], [75, 10]],
  [[9, 27], [22, 27], [35, 20], [49, 17], [62, 19], [75, 21]],
  [[9, 37], [22, 37], [35, 31], [49, 27], [62, 30], [75, 31]],
  [[9, 48], [22, 48], [35, 41], [49, 38], [62, 40], [75, 42]],
];

/**
 * Thumb arc of the left half (center in u, angle), from outside in.
 * Points 0–3 are LEDs of the official Dilemma Max, point 4 continues the arc.
 * From the clone's photo: there is no point 0, point 1 is the knob, points 2, 3, 4 are keys.
 */
const THUMB_ARC: { cx: number; cy: number; r: number }[] = [
  { cx: 2.36, cy: 4.12, r: 0 },
  { cx: 3.41, cy: 4.21, r: 5 },
  { cx: 4.47, cy: 4.39, r: 15 },
  { cx: 5.45, cy: 4.77, r: 25 },
  { cx: 6.29, cy: 5.42, r: 38 },
];

/**
 * Thumb matrix positions (a guess). The seller filled 5 positions per half:
 * left [4,1…5] = LGUI, LCTL, LGUI, MO(1), SPACE; right [9,0…4] = ENTER, MO(2), BSPC, LALT, RGUI.
 * If the wiring is like the official board (and the clone's right half is mirrored — [5,0] = “6”),
 * then on the arc: left [4,3] (point 0), [4,1], [4,2], [4,4], [4,5]; right [9,2], [9,4], [9,3], [9,1], [9,0].
 * Point 0 does not exist physically, so [4,3] and [9,2] are not on the drawing; the knob presses are [4,1] and [9,4].
 */
const ENCODER_ARC = 1;
const THUMBS = {
  left: { press: [4, 1] as MatrixPos, keys: [[2, 2], [3, 4], [4, 5]] as [number, number][] },
  right: { press: [9, 4] as MatrixPos, keys: [[2, 3], [3, 1], [4, 0]] as [number, number][] },
};

/** Knob diameter (≈ 1u from the photo) and the round “key” of its press. */
const KNOB_D = 1.05;
const PRESS_D = 0.72;

/** Width of the left half up to the symmetry axis (between the inner columns). */
const AXIS = 8.0;

/** A key centered at (cx, cy); roundD — a round key of this diameter (knob press). */
function key(matrix: MatrixPos, cx: number, cy: number, half: KeyGeom['half'], r = 0, label?: string, roundD?: number): KeyGeom {
  const size = roundD ?? 1;
  return {
    id: newId('key'),
    matrix,
    x: round(cx - size / 2),
    y: round(cy - size / 2),
    w: size,
    h: size,
    r,
    rx: round(cx),
    ry: round(cy),
    shape: roundD ? 'circle' : 'rect',
    half,
    label,
    approximate: true,
  };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function dilemma4x6Clone(): Geometry {
  const keys: KeyGeom[] = [];
  const mirror = (x: number) => 2 * AXIS - x;
  // Left half: rows 0–3, columns 0 (outer) … 5 (inner).
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const [lx, ly] = LEFT_LED[r][c];
      keys.push(key([r, c], (lx - X0) / LED_X, (ly - Y0) / LED_Y + 0.5, 'left', 0, `L${r}${c}`));
    }
  }
  // The right half is a mirror; on the clone column 0 is the inner one (the “6” key), 5 is the outer one.
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const [lx, ly] = LEFT_LED[r][5 - c];
      keys.push(key([r + 5, c], mirror((lx - X0) / LED_X), (ly - Y0) / LED_Y + 0.5, 'right', 0, `R${r}${c}`));
    }
  }
  // Thumb: 3 keys per half.
  for (const [arc, col] of THUMBS.left.keys) {
    const t = THUMB_ARC[arc];
    keys.push(key([4, col], t.cx, t.cy + 0.5, 'left', t.r, `L4${col}`));
  }
  for (const [arc, col] of THUMBS.right.keys) {
    const t = THUMB_ARC[arc];
    keys.push(key([9, col], mirror(t.cx), t.cy + 0.5, 'right', -t.r || 0, `R4${col}`));
  }
  // Knob press — a round key under it: assigned like a normal key.
  const knob = THUMB_ARC[ENCODER_ARC];
  keys.push(key(THUMBS.left.press, knob.cx, knob.cy + 0.5, 'left', 0, 'E0', PRESS_D));
  keys.push(key(THUMBS.right.press, mirror(knob.cx), knob.cy + 0.5, 'right', 0, 'E1', PRESS_D));

  // Two knobs (2 in the firmware: 0 — left, 1 — right), from the photo — at the start of the thumb arc.
  const encoders: EncoderGeom[] = [
    { id: newId('enc'), index: 0, x: knob.cx, y: round(knob.cy + 0.5), d: KNOB_D, half: 'left', pressMatrix: THUMBS.left.press, label: 'E0', approximate: true },
    { id: newId('enc'), index: 1, x: round(mirror(knob.cx)), y: round(knob.cy + 0.5), d: KNOB_D, half: 'right', pressMatrix: THUMBS.right.press, label: 'E1', approximate: true },
  ];
  // Round trackpad on the right half (from the photo: ≈ 40 mm, left of the inner column, at rows 0–2).
  const innerRight = mirror((LEFT_LED[1][5][0] - X0) / LED_X);
  const pad = 2.1;
  const controls: ControlGeom[] = [
    {
      id: newId('ctl'),
      kind: 'trackpad',
      x: round(innerRight - 1.7 - pad / 2),
      y: round(2.1 - pad / 2),
      w: pad,
      h: pad,
      shape: 'circle',
      half: 'right',
      label: 'trackpad',
      notes: t('From the photo: a round trackpad ≈ 40 mm (Cirque on the Dilemma Max). Whether it works in the firmware and how it is wired is not checked.', 'По фото: круглый трекпад ≈ 40 мм (у Dilemma Max — Cirque). Работает ли он в прошивке и как подключён — не проверено.'),
      approximate: true,
    },
  ];
  return {
    id: newId('geo'),
    name: 'Dilemma 4x6 (photo)',
    keys,
    encoders,
    controls,
    source: { kind: 'template', ref: 'bastardkb/dilemma/4x6_4 + device read + photo 2026-10-22', note: 'thumb matrix positions are a guess' },
  };
}

/** A simple grid: one key per matrix position (when nothing is known about the layout). */
export function gridGeometry(rows: number, cols: number, split = false): Geometry {
  const keys: KeyGeom[] = [];
  const half = split ? rows / 2 : rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const right = split && r >= half;
      const row = right ? r - half : r;
      const x = right ? cols + 1.5 + c : c;
      keys.push({
        id: newId('key'),
        matrix: [r, c],
        x,
        y: row,
        w: 1,
        h: 1,
        r: 0,
        rx: x,
        ry: row,
        shape: 'rect',
        half: split ? (right ? 'right' : 'left') : 'center',
        label: `${r},${c}`,
      });
    }
  }
  return { id: newId('geo'), name: `Grid ${rows}×${cols}`, keys, encoders: [], controls: [], source: { kind: 'manual' } };
}
