/**
 * KEY ALIASES: a label for a keycode (“Copy” for C(KC_C)). Every key with that value shows the label, and the
 * generated C gets `#define NV_COPY C(KC_C)` so the user's own code can name the key. The C name is derived from
 * the label (NV_ prefix: it is clear where the name comes from, and it cannot clash with QMK's or the user's names).
 */
import type { AdvancedIssue } from '../features/advanced';
import { validCIdentifier } from '../qmk/customCode';
import type { KeyAlias, Project } from './types';

export const KEY_ALIASES_MAX = 512;
export const ALIAS_LABEL_MAX = 32;
export const ALIAS_PREFIX = 'NV_';

// Russian and Ukrainian letters → Latin (for the C name only; the label stays as typed).
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'yo', є: 'ye', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'yi',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** C name of an alias: “Copy line” → NV_COPY_LINE, “Копировать” → NV_KOPIROVAT; null — nothing to name it by. */
export function aliasCName(label: string): string | null {
  const latin = [...label.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join('');
  const body = latin.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return body ? `${ALIAS_PREFIX}${body}` : null;
}

/** KC_NO and KC_TRNS get no alias: the label would land on every empty key. */
const aliasable = (keycode: number) => keycode > 1;

export interface ResolvedAlias {
  label: string;
  cName: string;
}

/**
 * Alias by keycode value. The first alias of a value wins, and of a C name too (the others are reported by
 * checkKeyAliases), so the catalog never lists one C name twice.
 */
export function aliasLookup(aliases: KeyAlias[]): Map<number, ResolvedAlias> {
  const out = new Map<number, ResolvedAlias>();
  const names = new Set<string>();
  for (const a of aliases) {
    const label = a.label.trim();
    const cName = aliasCName(label);
    if (!label || !cName || !aliasable(a.keycode) || out.has(a.keycode) || names.has(cName)) continue;
    out.set(a.keycode, { label, cName });
    names.add(cName);
  }
  return out;
}

/**
 * Aliases that would not work: no label, a C name that is not an identifier or is taken (by another alias, a layer,
 * a custom keycode, a tap dance, a unicode entry), a second alias of the same keycode.
 * defines — the aliases without errors, in order: what the generator writes as #define.
 */
export function checkKeyAliases(project: Project, layerCNames: string[]): { issues: AdvancedIssue[]; defines: { cName: string; keycode: number }[] } {
  const issues: AdvancedIssue[] = [];
  const defines: { cName: string; keycode: number }[] = [];
  const others = new Set<string>([...layerCNames, ...project.customKeycodes.map((c) => c.name), ...project.tapDances.map((t) => t.name), ...project.unicodeMap.map((u) => u.name)]);
  const names = new Set<string>();
  const values = new Set<number>();
  project.keyAliases.forEach((a, i) => {
    const label = a.label.trim();
    const where = `alias ${i + 1}${label ? ` “${label}”` : ''}`;
    const cName = aliasCName(label);
    if (!label) {
      issues.push({ level: 'error', where, message: { en: 'The alias has no label.', ru: 'У псевдонима нет подписи.' } });
    } else if (!aliasable(a.keycode)) {
      issues.push({ level: 'error', where, message: { en: 'Pick the key the alias names (not KC_NO or KC_TRNS).', ru: 'Выберите клавишу для псевдонима (не KC_NO и не KC_TRNS).' } });
    } else if (!cName) {
      issues.push({ level: 'error', where, message: { en: 'The label needs at least one letter or digit: the C name is made from them.', ru: 'В подписи нужна хотя бы одна буква или цифра: из них делается имя C.' } });
    } else if (!validCIdentifier(cName)) {
      issues.push({ level: 'error', where, message: { en: `The C name ${cName} is too long (64 characters at most): shorten the label.`, ru: `Имя C ${cName} слишком длинное (не больше 64 символов): сократите подпись.` } });
    } else if (names.has(cName)) {
      issues.push({ level: 'error', where, message: { en: `Another alias already has the C name ${cName}: change one of the labels.`, ru: `У другого псевдонима уже есть имя C ${cName}: измените одну из подписей.` } });
    } else if (others.has(cName)) {
      issues.push({ level: 'error', where, message: { en: `${cName} is already the C name of a layer, custom keycode, tap dance or unicode entry.`, ru: `${cName} уже занято слоем, своим keycode, tap dance или символом unicode.` } });
    } else {
      defines.push({ cName, keycode: a.keycode });
    }
    if (cName) names.add(cName);
    if (aliasable(a.keycode) && values.has(a.keycode)) {
      issues.push({ level: 'warning', where, message: { en: 'This key already has an alias above; keys show the first one.', ru: 'У этой клавиши уже есть псевдоним выше; на клавишах виден первый.' } });
    }
    values.add(a.keycode);
  });
  return { issues, defines };
}
