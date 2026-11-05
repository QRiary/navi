/**
 * ADVANCED FEATURES: checks of tap dance, combos, key overrides and own keycodes.
 * They are all code in keymap.c (generator: core/qmk/generate.ts), so they work only
 * in your own firmware build; here is what can be checked in advance.
 */
import { decode } from '../keycodes/codec';
import type { KeycodeSpec } from '../keycodes/spec';
import type { Combo, KeyOverride, Project, TapDance } from '../project/types';
import { TAP_DANCE_MAX_STEPS, TAP_DANCE_VARIANTS } from '../project/types';
import { tapDanceKind } from '../project/tapDances';
import { validCIdentifier } from '../qmk/customCode';
import type { Text } from './registry';

export interface AdvancedIssue {
  level: 'error' | 'warning';
  where: string;
  message: Text;
}

/**
 * Which keycodes a leader action can run (the generated code calls tap_code16). The rest (QK_BOOT, macros, RGB…)
 * is not. Tap dances play any keycode as a key event (checkTapDances).
 */
export function tapDanceActionSupported(spec: KeycodeSpec, value: number): boolean {
  if (value === 0) return true;
  const d = decode(spec, value);
  switch (d.kind) {
    case 'basic':
      return d.value >= 0x04;
    case 'mods':
      return true;
    case 'layer':
      return d.fn === 'MO' || d.fn === 'TG' || d.fn === 'TO' || d.fn === 'DF';
    case 'one-shot-mod':
      return true;
    default:
      return false;
  }
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

const NESTED_TD = { en: 'A tap dance can’t be inside another tap dance.', ru: 'Tap dance не может быть внутри другого tap dance.' };

/**
 * Tap dance checks. Slots and every-tap steps take any keycode (played as a key event), except another TD(…).
 * reserved: names an own-C function must not take (NAVI's generated symbols, layer / keycode / tap dance names).
 */
export function checkTapDances(spec: KeycodeSpec, tds: TapDance[], reserved: ReadonlySet<string> = new Set()): AdvancedIssue[] {
  const out: AdvancedIssue[] = [];
  const names = new Set<string>();
  const indexes = new Set<number>();
  const isTd = (v: number) => v !== 0 && decode(spec, v).kind === 'tap-dance';
  for (const td of tds) {
    const where = `TD(${td.name})`;
    if (!IDENT.test(td.name)) out.push({ level: 'error', where, message: { en: 'Name must be a C identifier (letters, digits, _).', ru: 'Имя — C-идентификатор (буквы, цифры, _).' } });
    if (names.has(td.name)) out.push({ level: 'error', where, message: { en: 'Duplicate name.', ru: 'Имя повторяется.' } });
    if (indexes.has(td.index)) out.push({ level: 'error', where, message: { en: 'Duplicate index.', ru: 'Номер повторяется.' } });
    names.add(td.name);
    indexes.add(td.index);
    const kind = tapDanceKind(td);
    if (kind === 'slots') {
      if (!td.tap && !td.hold && !td.doubleTap && !td.tapHold) out.push({ level: 'warning', where, message: { en: 'No actions set.', ru: 'Не задано ни одного действия.' } });
      for (const [field, v] of [['tap', td.tap], ['hold', td.hold], ['doubleTap', td.doubleTap], ['tapHold', td.tapHold]] as const) {
        if (isTd(v)) out.push({ level: 'error', where: `${where}.${field}`, message: NESTED_TD });
      }
    } else if (kind === 'every-tap') {
      const steps = td.steps ?? [];
      if (steps.length < 1 || steps.length > TAP_DANCE_MAX_STEPS) {
        out.push({ level: 'error', where, message: { en: `An every-tap dance has 1–${TAP_DANCE_MAX_STEPS} steps.`, ru: `У tap dance «каждое нажатие» 1–${TAP_DANCE_MAX_STEPS} шага.` } });
      }
      steps.forEach((st, i) => {
        for (const v of TAP_DANCE_VARIANTS) {
          if ((st[v] ?? []).some((s) => (s.type === 'tap' || s.type === 'down' || s.type === 'up') && isTd(s.keycode))) out.push({ level: 'error', where: `${where} · step ${i + 1} · ${v}`, message: NESTED_TD });
        }
      });
    } else {
      const fns = [td.ownC?.onEachTap, td.ownC?.onFinished, td.ownC?.onReset].filter((f): f is string => f !== undefined && f !== '');
      if (!fns.length) out.push({ level: 'error', where, message: { en: 'Name at least one of your own C functions.', ru: 'Укажите хотя бы одну свою функцию C.' } });
      for (const f of fns) {
        if (!validCIdentifier(f)) {
          out.push({ level: 'error', where: `${where} · ${f}`, message: { en: `“${f}” is not a C identifier (letters, digits, _; not starting with a digit; not a C keyword; up to 64 characters).`, ru: `«${f}» — не идентификатор C (буквы, цифры, _; не с цифры; не ключевое слово C; до 64 символов).` } });
        } else if (reserved.has(f) || /^navi_/i.test(f) || tds.some((t) => t.name === f)) {
          out.push({ level: 'error', where: `${where} · ${f}`, message: { en: `“${f}” is already a name NAVI generates (a layer, keycode, tap dance or NAVI function; navi_… names are NAVI's).`, ru: `«${f}» уже занято тем, что создаёт NAVI (слой, keycode, tap dance или функция NAVI; имена navi_… — для NAVI).` } });
        }
      }
    }
  }
  return out;
}

export function checkCombos(project: Project, combos: Combo[], refLayer = 0): AdvancedIssue[] {
  const out: AdvancedIssue[] = [];
  const km = project.keymaps.find((k) => k.id === project.activeKeymapId) ?? project.keymaps[0];
  const cols = project.hardware.matrix.cols;
  const keyOf = (r: number, c: number) => km.layers[refLayer]?.keys[r * cols + c] ?? 0;
  const sets = new Map<string, string>();
  const names = new Set<string>();
  for (const combo of combos) {
    const where = combo.name;
    if (!IDENT.test(combo.name)) out.push({ level: 'error', where, message: { en: 'Name must be a C identifier.', ru: 'Имя — C-идентификатор.' } });
    if (names.has(combo.name)) out.push({ level: 'error', where, message: { en: 'Duplicate name.', ru: 'Имя повторяется.' } });
    names.add(combo.name);
    if (combo.keys.length < 2) out.push({ level: 'error', where, message: { en: 'A combo needs at least 2 keys.', ru: 'В комбо нужно минимум 2 клавиши.' } });
    if (!combo.result) out.push({ level: 'warning', where, message: { en: 'No result keycode.', ru: 'Не задан результат.' } });
    // QMK matches combos by keycodes of the reference layer: empty/transparent and identical ones do not work.
    const codes = combo.keys.map(([r, c]) => keyOf(r, c));
    if (codes.some((v) => v === 0 || v === 1)) {
      out.push({
        level: 'error',
        where,
        message: {
          en: `A combo key is empty or transparent on layer ${refLayer} — QMK matches combos by keycodes of that layer.`,
          ru: `Клавиша комбо пустая или прозрачная на слое ${refLayer} — QMK сравнивает комбо по keycodes этого слоя.`,
        },
      });
    }
    if (new Set(codes).size !== codes.length) {
      out.push({ level: 'error', where, message: { en: 'Two combo keys have the same keycode — QMK cannot tell them apart.', ru: 'У двух клавиш комбо одинаковый keycode — QMK их не различит.' } });
    }
    const keySet = [...combo.keys.map(([r, c]) => `${r},${c}`)].sort().join('|');
    const other = sets.get(keySet);
    if (other) out.push({ level: 'error', where, message: { en: `Same keys as combo “${other}”.`, ru: `Те же клавиши, что в комбо «${other}».` } });
    else sets.set(keySet, combo.name);
  }
  // Overlaps: combos whose keys are part of another combo fire earlier (depends on timing).
  const list = [...sets.entries()].map(([k, name]) => ({ keys: new Set(k.split('|')), name }));
  for (const a of list) {
    for (const b of list) {
      if (a === b || a.keys.size >= b.keys.size) continue;
      if ([...a.keys].every((k) => b.keys.has(k))) {
        out.push({
          level: 'warning',
          where: a.name,
          message: { en: `Its keys are a subset of “${b.name}”: the longer combo needs all keys within the combo term.`, ru: `Его клавиши — часть комбо «${b.name}»: длинное комбо сработает, только если нажать все клавиши в пределах времени комбо.` },
        });
      }
    }
  }
  return out;
}

export function checkKeyOverrides(overrides: KeyOverride[]): AdvancedIssue[] {
  const out: AdvancedIssue[] = [];
  const seen = new Set<string>();
  for (const o of overrides) {
    if (!IDENT.test(o.name)) out.push({ level: 'error', where: o.name, message: { en: 'Name must be a C identifier.', ru: 'Имя — C-идентификатор.' } });
    const k = `${o.mods}:${o.trigger}`;
    if (seen.has(k)) out.push({ level: 'error', where: o.name, message: { en: 'The same modifiers + key are already overridden.', ru: 'Те же модификаторы + клавиша уже подменены.' } });
    seen.add(k);
    // Any keycode is a valid trigger: QMK compares the pressed key's full keycode (C(KC_Z), LT(…), a custom key).
  }
  return out;
}

const LEADER_FNS = ['one', 'two', 'three', 'four', 'five'];

/** QMK function name for checking a sequence: leader_sequence_two_keys … */
export function leaderFunction(length: number): string {
  return `leader_sequence_${LEADER_FNS[length - 1]}_key${length > 1 ? 's' : ''}`;
}

/**
 * Leader key sequences. After QK_LEAD QMK remembers up to 5 keycodes; for MT/LT only
 * the “tap” (low byte), so a sequence holds only basic keys (KC_A…).
 */
export function checkLeaderSequences(spec: KeycodeSpec, project: Project): AdvancedIssue[] {
  const out: AdvancedIssue[] = [];
  const seen = new Map<string, number>();
  project.leaderSequences.forEach((s, i) => {
    const where = `leader #${i + 1}`;
    if (s.keys.length < 1 || s.keys.length > 5) out.push({ level: 'error', where, message: { en: 'A sequence has 1 to 5 keys.', ru: 'В последовательности от 1 до 5 клавиш.' } });
    if (s.keys.some((k) => k < 0x04 || k > 0xff)) {
      out.push({ level: 'error', where, message: { en: 'Only plain keys (letters, digits, punctuation, F-keys…) — QMK compares the tapped key.', ru: 'Только простые клавиши (буквы, цифры, знаки, F-клавиши…) — QMK сравнивает нажатую клавишу.' } });
    }
    const sig = s.keys.join(',');
    if (seen.has(sig)) out.push({ level: 'error', where, message: { en: `Same keys as sequence #${seen.get(sig)! + 1}.`, ru: `Те же клавиши, что в последовательности №${seen.get(sig)! + 1}.` } });
    else seen.set(sig, i);
    if (s.action.type === 'none' || (s.action.type === 'send-string' && !s.action.text)) {
      out.push({ level: 'warning', where, message: { en: 'No action: the sequence does nothing.', ru: 'Нет действия: последовательность ничего не делает.' } });
    }
    if (s.action.type === 'tap' && !tapDanceActionSupported(spec, s.action.keycode)) {
      out.push({ level: 'error', where, message: { en: 'The action supports keys and modifier combos.', ru: 'Действие — клавиша или сочетание с модификаторами.' } });
    }
  });
  if (project.leaderSequences.length) {
    const lead = spec.byName.get('QK_LEAD')?.value;
    const used = lead !== undefined && project.keymaps.some((km) => km.layers.some((l) => l.keys.includes(lead)));
    if (!used) out.push({ level: 'warning', where: 'QK_LEAD', message: { en: 'No key has QK_LEAD (Leader) — sequences cannot start. Assign it in the editor.', ru: 'Ни на одной клавише нет QK_LEAD (лидер) — последовательности не начать. Назначьте её в редакторе.' } });
  }
  return out;
}

/** Unicode map (UNICODEMAP) and the UM(i) / UP(i, j) references to it. */
export function checkUnicodeMap(spec: KeycodeSpec, project: Project): AdvancedIssue[] {
  const out: AdvancedIssue[] = [];
  const names = new Set<string>();
  project.unicodeMap.forEach((u, i) => {
    const where = `unicode_map[${i}]`;
    if (!IDENT.test(u.name)) out.push({ level: 'error', where, message: { en: 'Name must be a C identifier.', ru: 'Имя — C-идентификатор.' } });
    if (names.has(u.name)) out.push({ level: 'error', where, message: { en: 'Duplicate name.', ru: 'Имя повторяется.' } });
    names.add(u.name);
    if ((u.codepoint >= 0xd800 && u.codepoint <= 0xdfff) || u.codepoint > 0x10ffff) out.push({ level: 'error', where, message: { en: 'Not a valid character code.', ru: 'Недопустимый код символа.' } });
  });
  if (project.firmware.unicode !== 'unicodemap') {
    if (project.unicodeMap.length) out.push({ level: 'warning', where: 'unicode', message: { en: 'The table is used only in “Unicode map” mode (UM/UP keys).', ru: 'Таблица используется только в режиме «таблица юникода» (клавиши UM/UP).' } });
    return out;
  }
  const n = project.unicodeMap.length;
  const missing = new Set<string>();
  for (const km of project.keymaps) {
    for (const l of km.layers) {
      for (const v of [...l.keys, ...l.encoders.flatMap((e) => [e.cw, e.ccw])]) {
        const d = decode(spec, v, { unicode: 'unicodemap' });
        if (d.kind === 'unicode-map' && d.index >= n) missing.add(`UM(${d.index})`);
        if (d.kind === 'unicode-map-pair' && (d.unshifted >= n || d.shifted >= n)) missing.add(`UP(${d.unshifted}, ${d.shifted})`);
      }
    }
  }
  for (const m of missing) out.push({ level: 'error', where: m, message: { en: `The key refers to a table entry that does not exist (the table has ${n}).`, ru: `Клавиша ссылается на несуществующую строку таблицы (в таблице ${n}).` } });
  return out;
}
