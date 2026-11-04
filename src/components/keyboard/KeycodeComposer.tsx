/**
 * KEYCODE COMPOSER: build a compound assignment from parts.
 * The value is always built by the codec (core/keycodes/codec.ts) with the QMK formulas — QMK limits
 * (layers 0–15 for LT/LM, only basic keys for the tap part) are checked there too.
 */
import { useEffect, useMemo, useState } from 'react';
import { decode, encode, KeycodeError, LAYER_FN_RANGES, toQmk, tryParseQmk, type Decoded, type LayerFn } from '../../core/keycodes/codec';
import type { KeycodeSpec } from '../../core/keycodes/spec';
import { preferredName } from '../../core/keycodes/codec';
import type { HoldAction, Project } from '../../core/project/types';
import { ensureTapHold, plainTapHold, tapHoldSlots } from '../../core/project/tapHoldActions';
import { KeycodeField } from '../advanced/common';
import { activeKeymap } from '../../core/project/ops';
import { t } from '../../i18n';

type Kind = 'basic' | 'mods' | 'tap-hold' | 'layer' | 'layer-mod' | 'one-shot' | 'tap-dance' | 'unicode' | 'raw';

const KIND_LABELS = (): Record<Kind, string> => ({
  basic: t('key', 'клавиша'),
  mods: t('mods+key', 'мод+клавиша'),
  'tap-hold': t('tap-hold', 'тап-холд'),
  layer: t('layer', 'слой'),
  'layer-mod': 'LM',
  'one-shot': 'one-shot',
  'tap-dance': 'tap dance',
  unicode: t('unicode', 'юникод'),
  raw: t('expression', 'выражение'),
});

function kindOf(d: Decoded): Kind {
  switch (d.kind) {
    case 'basic':
    case 'named':
      return 'basic';
    case 'mods':
      return 'mods';
    case 'mod-tap':
    case 'layer-tap':
      return 'tap-hold';
    case 'layer':
      return 'layer';
    case 'layer-mod':
      return 'layer-mod';
    case 'one-shot-mod':
      return 'one-shot';
    case 'tap-dance':
      return 'tap-dance';
    case 'unicode':
    case 'unicode-map':
    case 'unicode-map-pair':
      return 'unicode';
    default:
      return 'raw';
  }
}

/** Choice of a basic key (0x00–0xFF), grouped by QMK groups. */
export function BasicKeySelect({ spec, value, onChange, label }: { spec: KeycodeSpec; value: number; onChange: (v: number) => void; label: string }) {
  const groups = useMemo(() => {
    const map = new Map<string, { value: number; name: string; label: string }[]>();
    for (const d of spec.keycodes) {
      if (d.value > 0xff) continue;
      const g = d.group ?? 'other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push({ value: d.value, name: preferredName(d), label: d.label ?? '' });
    }
    return [...map.entries()];
  }, [spec]);
  return (
    <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
      {groups.map(([g, list]) => (
        <optgroup key={g} label={g}>
          {list.map((k) => (
            <option key={k.value} value={k.value}>
              {k.name}
              {k.label && k.label !== k.name ? `  ${k.label}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Modifiers: Ctrl/Shift/Alt/GUI + side. The value is the 5 MOD_* bits. */
export function ModsInput({ mods, onChange }: { mods: number; onChange: (m: number) => void }) {
  const right = (mods & 0x10) !== 0;
  const bit = (b: number, name: string) => (
    <label className="checkbox" key={name}>
      <input type="checkbox" checked={(mods & b) !== 0} onChange={(e) => onChange(e.target.checked ? mods | b : mods & ~b)} />
      {name}
    </label>
  );
  return (
    <div className="field-row">
      {bit(0x01, 'Ctrl')}
      {bit(0x02, 'Shift')}
      {bit(0x04, 'Alt')}
      {bit(0x08, 'GUI')}
      <div className="seg" role="group" aria-label={t('Side', 'Сторона')}>
        <button type="button" className={!right ? 'is-on' : ''} onClick={() => onChange(mods & ~0x10)}>
          {t('left', 'левые')}
        </button>
        <button type="button" className={right ? 'is-on' : ''} onClick={() => onChange(mods | 0x10)}>
          {t('right', 'правые')}
        </button>
      </div>
    </div>
  );
}

export function LayerSelect({ project, value, max, onChange }: { project: Project; value: number; max: number; onChange: (l: number) => void }) {
  const km = activeKeymap(project);
  const count = Math.min(max + 1, Math.max(km.layers.length, value + 1));
  return (
    <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={t('Layer', 'Слой')}>
      {Array.from({ length: count }, (_, i) => (
        <option key={i} value={i}>
          {i} · {km.layers[i]?.name ?? t('(no such layer)', '(нет такого слоя)')}
        </option>
      ))}
    </select>
  );
}

/** The two slots of a tap-hold key: tap = any keycode; hold = modifiers, a layer (+ modifiers) or any keycode. */
function TapHoldSlots({ spec, project, tap, hold, onChange }: { spec: KeycodeSpec; project: Project; tap: number; hold: HoldAction; onChange: (tap: number, hold: HoldAction) => void }) {
  const holdMods = hold.type === 'key' ? 0 : hold.mods;
  const kinds: { type: HoldAction['type']; label: string; make: () => HoldAction }[] = [
    { type: 'mods', label: t('modifiers', 'модификаторы'), make: () => ({ type: 'mods', mods: (holdMods & 0x0f) === 0 ? 0x01 : holdMods }) },
    { type: 'layer', label: t('layer', 'слой'), make: () => ({ type: 'layer', layer: 1, mods: 0 }) },
    { type: 'key', label: t('key', 'клавиша'), make: () => ({ type: 'key', keycode: 0x04 }) },
  ];
  return (
    <>
      <div className="field-row">
        <span className="field-hint">{t('tap:', 'нажатие:')}</span>
        {tap <= 0xff && <BasicKeySelect spec={spec} value={tap} label={t('Tap key', 'Клавиша нажатия')} onChange={(v) => onChange(v, hold)} />}
        <KeycodeField value={tap} label={t('Tap: any keycode', 'Нажатие: любой keycode')} onChange={(v) => onChange(v, hold)} />
      </div>
      <div className="field-row">
        <span className="field-hint">{t('hold:', 'удержание:')}</span>
        <div className="seg" role="group" aria-label={t('Hold action', 'Действие удержания')}>
          {kinds.map((k) => (
            <button key={k.type} type="button" className={hold.type === k.type ? 'is-on' : ''} onClick={() => hold.type !== k.type && onChange(tap, k.make())}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {hold.type === 'mods' && <ModsInput mods={hold.mods} onChange={(m) => onChange(tap, { type: 'mods', mods: m })} />}
      {hold.type === 'layer' && (
        <>
          <div className="field-row">
            <LayerSelect project={project} value={hold.layer} max={15} onChange={(l) => onChange(tap, { ...hold, layer: l })} />
            <span className="field-hint">{t('+ modifiers (optional):', '+ модификаторы (необязательно):')}</span>
          </div>
          <ModsInput mods={hold.mods} onChange={(m) => onChange(tap, { ...hold, mods: (m & 0x0f) === 0 ? 0 : m })} />
        </>
      )}
      {hold.type === 'key' && (
        <div className="field-row">
          <KeycodeField value={hold.keycode} label={t('Hold: any keycode', 'Удержание: любой keycode')} onChange={(v) => onChange(tap, { type: 'key', keycode: v })} />
          <span className="field-hint">{t('held down while you hold', 'зажата, пока держите')}</span>
        </div>
      )}
    </>
  );
}

interface ComposerProps {
  spec: KeycodeSpec;
  project: Project;
  value: number;
  onChange: (value: number) => void;
  /** Tap-hold keys QMK has no keycode for (a stand-in + generated code). Without it only plain MT / LT can be made. */
  onTapHold?: (tap: number, hold: HoldAction) => void;
}

export function KeycodeComposer({ spec, project, value, onChange, onTapHold }: ComposerProps) {
  const decoded = useMemo(() => decode(spec, value, { unicode: project.firmware.unicode }), [spec, value, project.firmware.unicode]);
  const [kind, setKind] = useState<Kind>(kindOf(decoded));
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState(toQmk(spec, value));
  useEffect(() => {
    setKind(kindOf(decoded));
    setRaw(toQmk(spec, value));
    setError(null);
  }, [decoded, spec, value]);

  const base = 'base' in decoded ? decoded.base : decoded.kind === 'basic' ? decoded.value : 0x04;
  const mods = 'mods' in decoded ? decoded.mods : 0x01;
  const layer = 'layer' in decoded ? decoded.layer : 1;
  const fn: LayerFn = decoded.kind === 'layer' ? decoded.fn : 'MO';
  const slots = tapHoldSlots(spec, project, value) ?? { tap: base, hold: { type: 'mods', mods } as HoldAction };

  const commitTapHold = (tap: number, hold: HoldAction) => {
    const plain = plainTapHold(spec, tap, hold);
    try {
      if (plain === null) ensureTapHold(spec, project, tap, hold); // the slot errors
    } catch (err) {
      return setError(err instanceof Error ? err.message : String(err));
    }
    if (plain !== null) onChange(plain);
    else if (onTapHold) onTapHold(tap, hold);
    else return setError(t('Here only what QMK’s MT / LT can say: a basic key tapped, modifiers or a layer 0–15 held.', 'Здесь только то, что умеют MT / LT в QMK: нажатие — обычная клавиша, удержание — модификаторы или слой 0–15.'));
    setError(null);
  };

  const commit = (d: Decoded) => {
    try {
      onChange(encode(spec, d));
      setError(null);
    } catch (err) {
      setError(err instanceof KeycodeError ? err.message : String(err));
    }
  };

  const switchKind = (k: Kind) => {
    setKind(k);
    setError(null);
    switch (k) {
      case 'basic':
        return commit({ kind: 'basic', value: base });
      case 'mods':
        return commit({ kind: 'mods', mods, base });
      case 'tap-hold':
        return commit({ kind: 'mod-tap', mods: (mods & 0x0f) === 0 ? 0x01 : mods, base: base >= 0x04 && base <= 0xe7 ? base : 0x04 });
      case 'layer':
        return commit({ kind: 'layer', fn, layer });
      case 'layer-mod':
        return commit({ kind: 'layer-mod', layer: Math.min(layer, 15), mods });
      case 'one-shot':
        return commit({ kind: 'one-shot-mod', mods });
      case 'tap-dance':
        if (project.tapDances.length) return commit({ kind: 'tap-dance', index: project.tapDances[0].index });
        return setError(t('No tap dances yet — create one in “Advanced”.', 'Tap dance ещё нет — создайте в разделе «Расширенное».'));
      case 'unicode':
        return commit({ kind: 'unicode', codepoint: 0x263a });
      default:
        return;
    }
  };

  const fns = (Object.keys(LAYER_FN_RANGES) as LayerFn[]).filter((f) => spec.rangeByDefine.has(LAYER_FN_RANGES[f]));
  const fnHelp: Record<LayerFn, string> = {
    MO: t('while held', 'пока держите'),
    TG: t('toggle on/off', 'включить/выключить'),
    TO: t('switch to (only this layer)', 'перейти (только этот слой)'),
    TT: t('hold = MO, tap ×5 = toggle', 'держать = MO, 5 нажатий = вкл'),
    OSL: t('for the next key', 'на одну клавишу'),
    DF: t('set base layer (until unplug)', 'базовый слой (до отключения)'),
    PDF: t('set base layer (saved)', 'базовый слой (запоминается)'),
  };

  return (
    <div className="field">
      <span className="field-label">{t('compose', 'собрать')}</span>
      <div className="chips" role="tablist">
        {(Object.keys(KIND_LABELS()) as Kind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={`chip ${kind === k ? 'is-on' : ''}`} onClick={() => switchKind(k)}>
            {KIND_LABELS()[k]}
          </button>
        ))}
      </div>

      {(kind === 'basic' || kind === 'mods') && (
        <div className="field-row">
          <span className="field-hint">{t('key:', 'клавиша:')}</span>
          <BasicKeySelect
            spec={spec}
            value={base}
            label={t('Key', 'Клавиша')}
            onChange={(b) =>
              commit(kind === 'basic' ? { kind: 'basic', value: b } : { kind: 'mods', mods, base: b })
            }
          />
        </div>
      )}
      {(kind === 'mods' || kind === 'one-shot' || kind === 'layer-mod') && (
        <>
          <ModsInput
            mods={mods}
            onChange={(m) =>
              (m & 0x0f) === 0
                ? setError(t('Choose at least one modifier', 'Выберите хотя бы один модификатор'))
                : commit(
                    kind === 'mods'
                      ? { kind: 'mods', mods: m, base }
                      : kind === 'layer-mod'
                          ? { kind: 'layer-mod', layer, mods: m }
                          : { kind: 'one-shot-mod', mods: m },
                  )
            }
          />
        </>
      )}
      {kind === 'tap-hold' && <TapHoldSlots spec={spec} project={project} tap={slots.tap} hold={slots.hold} onChange={commitTapHold} />}
      {kind === 'layer-mod' && (
        <div className="field-row">
          <span className="field-hint">{t('hold → layer:', 'удержание → слой:')}</span>
          <LayerSelect project={project} value={layer} max={15} onChange={(l) => commit({ kind: 'layer-mod', layer: l, mods })} />
        </div>
      )}
      {kind === 'layer' && (
        <>
          <div className="field-row">
            <select className="select" value={fn} onChange={(e) => commit({ kind: 'layer', fn: e.target.value as LayerFn, layer })} aria-label={t('Layer function', 'Функция слоя')}>
              {fns.map((f) => (
                <option key={f} value={f}>
                  {f}() — {fnHelp[f]}
                </option>
              ))}
            </select>
            <LayerSelect project={project} value={layer} max={31} onChange={(l) => commit({ kind: 'layer', fn, layer: l })} />
          </div>
        </>
      )}
      {kind === 'tap-dance' && (
        <select className="select" value={decoded.kind === 'tap-dance' ? decoded.index : ''} onChange={(e) => commit({ kind: 'tap-dance', index: Number(e.target.value) })} aria-label="Tap dance">
          {project.tapDances.map((td) => (
            <option key={td.id} value={td.index}>
              TD({td.name})
            </option>
          ))}
        </select>
      )}
      {kind === 'unicode' && (
        <div className="field-row">
          <input
            className="input"
            style={{ width: 70 }}
            defaultValue={decoded.kind === 'unicode' ? String.fromCodePoint(decoded.codepoint) : ''}
            maxLength={2}
            aria-label={t('Character', 'Символ')}
            onChange={(e) => {
              const cp = e.target.value.codePointAt(0);
              if (cp !== undefined) commit({ kind: 'unicode', codepoint: cp });
            }}
          />
          <span className="field-hint">{t('UC() supports U+0000…U+7FFF (UNICODE_ENABLE).', 'UC() — символы U+0000…U+7FFF (UNICODE_ENABLE).')}</span>
        </div>
      )}
      {kind === 'raw' && (
        <form
          className={`expr-input ${error ? 'is-error' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            const r = tryParseQmk(spec, raw, { unicode: project.firmware.unicode });
            if ('value' in r) {
              onChange(r.value);
              setError(null);
            } else setError(r.error);
          }}
        >
          <input value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} aria-label={t('QMK expression', 'Выражение QMK')} />
          <span className="expr-result">enter</span>
        </form>
      )}
      {error && <p className="field-hint" style={{ color: 'var(--danger-color)' }}>{error}</p>}
    </div>
  );
}
