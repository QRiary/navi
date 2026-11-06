/**
 * Caps Word key rules (firmware.capsWordRules): NAVI's own C for keymap.c. QMK calls caps_word_press_user() for every
 * key pressed while Caps Word is on: true keeps it on (add_weak_mods(MOD_BIT(KC_LSFT)) first shifts the key), false
 * ends it. Rules with layers come first, then the first every-layer rule (see core/project/capsWord.ts).
 */
import { capsWordEveryLayer, capsWordRuleKeys } from '../project/capsWord';
import type { CapsWordRule, KeyList } from '../project/types';

/** What happens to one key: the layer rules that hold it (in list order), then the every-layer rule's shift, if any. */
interface Chain {
  layered: { layers: number[]; shift: boolean }[];
  rest: boolean | null;
}

const chainOf = (rules: CapsWordRule[], keys: number[][], value: number): Chain => {
  const layered: Chain['layered'] = [];
  let rest: boolean | null = null;
  rules.forEach((r, i) => {
    if (!keys[i].includes(value)) return;
    if (capsWordEveryLayer(r)) rest ??= r.shift;
    else layered.push({ layers: r.layers!, shift: r.shift });
  });
  return { layered, rest };
};

const SHIFT = 'add_weak_mods(MOD_BIT(KC_LSFT));';

/** `layerIds`: the C names of the layers (an unknown one prints as its number). `kc`: a keycode as C. */
export function capsWordCode({
  rules,
  keyLists,
  kc,
  layerIds,
  fn,
}: {
  rules: CapsWordRule[];
  keyLists: KeyList[];
  kc: (value: number) => string;
  layerIds: string[];
  fn: string;
}): string[] {
  const keys = rules.map((r) => capsWordRuleKeys({ keyLists }, r));
  const all = [...new Set(keys.flat())].filter((v) => v !== 0).sort((a, b) => a - b);
  // Keys with the same outcome share one body; runs of three or more consecutive values become `case A ... B:`.
  const groups = new Map<string, { chain: Chain; values: number[] }>();
  for (const v of all) {
    const chain = chainOf(rules, keys, v);
    const id = JSON.stringify(chain);
    const g = groups.get(id);
    if (g) g.values.push(v);
    else groups.set(id, { chain, values: [v] });
  }
  const layered = [...groups.values()].some((g) => g.chain.layered.length > 0);
  const mask = (layers: number[]) => layers.map((l) => `(layer_state_t)1 << ${layerIds[l] ?? l}`).join(' | ');
  const out = [
    '// ── Caps Word key rules (NAVI additions): keys that keep Caps Word on, and which of them it shifts; any other key ends it ──',
    `bool ${fn}(uint16_t keycode) {`,
  ];
  if (layered) out.push('    layer_state_t top = (layer_state_t)1 << get_highest_layer(layer_state | default_layer_state);');
  out.push('    switch (keycode) {');
  for (const { chain, values } of groups.values()) {
    for (let i = 0; i < values.length; ) {
      let j = i;
      while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
      if (j - i >= 2) {
        out.push(`        case ${kc(values[i])} ... ${kc(values[j])}:`);
        i = j + 1;
      } else {
        out.push(`        case ${kc(values[i])}:`);
        i++;
      }
    }
    for (const l of chain.layered) {
      const layers = l.layers.length > 1 ? `(${mask(l.layers)})` : `((layer_state_t)1 << ${layerIds[l.layers[0]] ?? l.layers[0]})`;
      out.push(`            if (top & ${layers}) {`);
      if (l.shift) out.push(`                ${SHIFT}`);
      out.push('                return true;', '            }');
    }
    if (chain.rest === null) out.push('            return false;');
    else {
      if (chain.rest) out.push(`            ${SHIFT}`);
      out.push('            return true;');
    }
  }
  out.push('        default:', '            return false;', '    }', '}', '');
  return out;
}
