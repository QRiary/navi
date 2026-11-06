/**
 * "HOW TO GET HERE": the routes to one layer as sentences ("hold Space on Base, Nav · while held").
 * Routes that read the same are one line; each layer in it is a link that opens that layer on the Keyboard page
 * with the key(s) highlighted. Data: core/project/layerRefs.ts. Shown in the Keyboard page's right panel (no key
 * selected) and on the Layers page.
 */
import { useMemo } from 'react';
import { comboRefOf } from '../../core/features/advanced';
import { friendlyName } from '../../core/keycodes/friendly';
import { modsLabel, type LabelContext } from '../../core/keycodes/labels';
import type { KeycodeSpec } from '../../core/keycodes/spec';
import { decode } from '../../core/keycodes/codec';
import { layerRefs, routesTo, type LayerRef } from '../../core/project/layerRefs';
import type { Keymap, MatrixPos, Project } from '../../core/project/types';
import { useActive, useLabelContext } from '../../lib/projectContext';
import { navigate } from '../../lib/router';
import { useEditorStore } from '../../store/editorStore';
import { useSpec } from '../../store/projectStore';
import { t } from '../../i18n';

/** Every route of the active keymap, recomputed when the project changes. */
export function useLayerRefs(): LayerRef[] {
  const active = useActive();
  const spec = useSpec();
  return useMemo(() => (active ? layerRefs(active.project, spec, active.keymap) : []), [active, spec]);
}

/** Where a click takes you: the layer to open and what to point at there. */
interface Stop {
  layer: number;
  positions: MatrixPos[];
  encoder?: { index: number; dir: 'cw' | 'ccw' };
}

interface Route {
  /** "hold Space", "combo J + K", "double tap TD_NUM". */
  trigger: string;
  /** "while held", "toggles"…; empty when the trigger says it. */
  effect: string;
  /** null = any layer (a combo with no layer limit). */
  stops: Stop[] | null;
  /** The combo's keys, for "any layer". */
  anyPositions?: MatrixPos[];
}

const PRESS: Record<string, () => string> = {
  tap: () => t('tap', 'нажать'),
  hold: () => t('hold', 'удерживать'),
  'double-tap': () => t('double tap', 'двойное нажатие'),
  'tap-hold': () => t('tap, then hold', 'нажать и удержать'),
};

const pressOf = (r: LayerRef): string => {
  if (typeof r.part === 'number') return t(`tap ${r.part}×`, `нажать ${r.part}×`);
  if (r.part) return PRESS[r.part]();
  switch (r.how) {
    case 'MO':
    case 'LT':
    case 'LM':
      return PRESS.hold();
    case 'TT':
      return t('hold or tap', 'удерживать или нажать');
    default:
      return PRESS.tap();
  }
};

function effectOf(r: LayerRef, ctx: LabelContext): string {
  const mods = r.mods ? modsLabel(r.mods, ctx.os) : '';
  switch (r.how) {
    case 'MO':
    case 'LT':
      return r.part && r.part !== 'hold' ? t('while held', 'пока удерживается') : '';
    case 'LM':
      return t(`while held, with ${mods}`, `пока удерживается, с ${mods}`);
    case 'TG':
      return t('toggles it on and off', 'включает и выключает');
    case 'TO':
      return t('switches to it, stays on', 'переключает на него, остаётся');
    case 'TT':
      return t('while held; tapped several times it stays on', 'пока удерживается; несколько нажатий — остаётся');
    case 'OSL':
      return t('for the next key only', 'только на следующую клавишу');
    case 'DF':
      return t('makes it the base layer', 'делает его базовым');
    case 'PDF':
      return t('makes it the base layer, kept after unplugging', 'делает его базовым, сохраняется после отключения');
  }
}

/** The key's name in the sentence: the dance's name, the tap part of an LT, else the key as the user reads it. */
function keyText(spec: KeycodeSpec, r: LayerRef, ctx: LabelContext): string {
  if (r.via?.kind === 'tap-dance') return ctx.tapDanceName?.(r.via.index) ?? `TD ${r.via.index}`;
  const v = r.keycode;
  const alias = ctx.alias?.(v);
  if (alias) return alias.label;
  if (r.via?.kind === 'tap-hold' && r.part === 'hold') {
    const tap = (ctx.tapHoldAction?.(v)?.tap ?? 0) & 0xffff;
    if (tap) return friendlyName(spec, tap, { ...ctx, tapHoldAction: undefined }).text;
  }
  if (!r.via && r.how === 'LT') {
    const d = decode(spec, v);
    if (d.kind === 'layer-tap') return d.base > 1 ? friendlyName(spec, d.base, ctx).text : t('a hold-only key', 'клавишу без нажатия');
  }
  return friendlyName(spec, v, ctx).text;
}

const layerText = (ctx: LabelContext, l: number) => ctx.layerTitle?.(l) ?? `L${l}`;

function comboKeys(spec: KeycodeSpec, project: Project, keymap: Keymap, keys: MatrixPos[], ctx: LabelContext): string {
  // Combo keys read on the layer combos look at from layer 0, as on the combos tab.
  const ref = comboRefOf(keymap, 0);
  const cols = project.hardware.matrix.cols;
  return (
    keys
      .map(([r, c]) => {
        const v = keymap.layers[ref]?.keys[r * cols + c] ?? 0;
        return v > 1 ? friendlyName(spec, v, ctx).text : `[${r},${c}]`;
      })
      .join(' + ') || '—'
  );
}

/** The routes to `layer`, merged into one line per sentence. */
export function buildRoutes(spec: KeycodeSpec, project: Project, keymap: Keymap, refs: readonly LayerRef[], layer: number, ctx: LabelContext): Route[] {
  const byText = new Map<string, Route>();
  for (const r of routesTo(refs, layer)) {
    const s = r.source;
    const press = pressOf(r);
    let trigger: string;
    if (s.kind === 'combo') {
      const keys = comboKeys(spec, project, keymap, s.keys, ctx);
      trigger = r.via ? t(`combo ${keys}, ${press}`, `комбо ${keys}, ${press}`) : t(`combo ${keys}`, `комбо ${keys}`);
    } else if (s.kind === 'encoder') {
      const turn = s.dir === 'cw' ? t('clockwise', 'по часовой') : t('counter-clockwise', 'против часовой');
      trigger = r.via ? t(`turn encoder E${s.encoder} ${turn}, ${press}`, `повернуть энкодер E${s.encoder} ${turn}, ${press}`) : t(`turn encoder E${s.encoder} ${turn}`, `повернуть энкодер E${s.encoder} ${turn}`);
    } else trigger = `${press} ${keyText(spec, r, ctx)}`;
    const effect = effectOf(r, ctx);
    const id = `${s.kind}|${trigger}|${effect}|${s.kind === 'combo' ? s.index : ''}`;
    let route = byText.get(id);
    if (!route) byText.set(id, (route = { trigger, effect, stops: s.kind === 'combo' && !s.layers ? null : [] }));
    if (s.kind === 'combo') {
      if (s.layers) for (const l of s.layers) route.stops!.push({ layer: l, positions: s.keys });
      else route.anyPositions = s.keys;
      continue;
    }
    const stop = route.stops!.find((x) => x.layer === s.layer);
    if (s.kind === 'key') {
      if (stop) stop.positions.push(s.pos);
      else route.stops!.push({ layer: s.layer, positions: [s.pos] });
    } else if (!stop) route.stops!.push({ layer: s.layer, positions: [], encoder: { index: s.encoder, dir: s.dir } });
  }
  for (const r of byText.values()) r.stops?.sort((a, b) => a.layer - b.layer);
  return [...byText.values()];
}

/** Opens `layer` on the Keyboard page and points at the route's key(s). */
function useGoTo() {
  const setLayer = useEditorStore((s) => s.setLayer);
  const setHighlight = useEditorStore((s) => s.setHighlight);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const setEncoderTarget = useEditorStore((s) => s.setEncoderTarget);
  return (stop: Stop) => {
    setLayer(stop.layer);
    if (stop.encoder) setEncoderTarget(stop.encoder);
    else {
      clearSelection();
      setHighlight(stop.positions);
    }
    navigate({ section: 'keyboard' });
  };
}

export function LayerRoutes({ layer, refs, compact = false }: { layer: number; refs: readonly LayerRef[]; compact?: boolean }) {
  const active = useActive();
  const spec = useSpec();
  const ctx = useLabelContext();
  const shown = useEditorStore((s) => s.layer);
  const goTo = useGoTo();
  const routes = useMemo(() => (active && ctx ? buildRoutes(spec, active.project, active.keymap, refs, layer, ctx) : []), [active, ctx, spec, refs, layer]);
  if (!active || !ctx) return null;
  const { keymap } = active;

  if (routes.length === 0) {
    return (
      <p className="field-hint">
        {layer === keymap.defaultLayer
          ? t('Always on: this is the base layer.', 'Всегда включён: это базовый слой.')
          : t('⚠ Nothing leads to this layer: no key, combo, encoder, tap dance or tap-hold key switches it on.', '⚠ На этот слой ничего не ведёт: его не включает ни клавиша, ни комбо, ни энкодер, ни tap dance, ни tap-hold клавиша.')}
      </p>
    );
  }

  const link = (stop: Stop, text: string) => (
    <button
      key={`${stop.layer}`}
      type="button"
      className="route-layer"
      onClick={() => goTo(stop)}
      title={stop.encoder ? t(`Open layer ${stop.layer} and its encoder`, `Открыть слой ${stop.layer} и его энкодер`) : t(`Open layer ${stop.layer} with the key highlighted`, `Открыть слой ${stop.layer} с подсвеченной клавишей`)}
    >
      {text}
    </button>
  );

  return (
    <ul className={`layer-routes ${compact ? 'is-compact' : ''}`}>
      {routes.map((r) => (
        <li key={`${r.trigger}|${r.effect}|${r.stops?.map((s) => s.layer).join(',') ?? 'any'}`}>
          <span className="route-trigger">{r.trigger}</span> {t('on', 'на')}{' '}
          {r.stops === null
            ? link({ layer: layer === shown ? keymap.defaultLayer : shown, positions: r.anyPositions ?? [] }, t('any layer', 'любом слое'))
            : r.stops.map((s, i) => (
                <span key={s.layer}>
                  {i > 0 && ', '}
                  {link(s, layerText(ctx, s.layer))}
                </span>
              ))}
          {r.effect && <span className="route-effect"> · {r.effect}</span>}
        </li>
      ))}
    </ul>
  );
}
