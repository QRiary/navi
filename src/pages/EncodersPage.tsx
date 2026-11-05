/**
 * ENCODERS SECTION: what each encoder does on each layer (clockwise / counter-clockwise),
 * quick presets, copying to other layers, the encoder press (if it is in the matrix).
 * Whether actions work “right away” depends on the encoder map in the firmware (ENCODER_MAP_ENABLE + VIA).
 */
import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { tryParseQmk } from '../core/keycodes/codec';
import { friendlyName } from '../core/keycodes/friendly';
import { keyLabel } from '../core/keycodes/labels';
import { featureStatus } from '../core/features/registry';
import { copyEncoderToLayers, setEncoder, resizeEncoders } from '../core/project/ops';
import { hardwareFacts } from '../lib/hardwareFacts';
import { useActive, useLabelContext } from '../lib/projectContext';
import { href, navigate } from '../lib/router';
import { QMK_DOCS } from '../lib/qmkDocs';
import { resolveBlur } from '../lib/encoderEdit';
import { CatalogButton, typedMeaning } from '../components/advanced/common';
import { EmptyState } from '../components/EmptyState';
import { ListFilter } from '../components/ListFilter';
import { matchesQuery, useListFilter } from '../lib/find';
import { Hint } from '../components/InfoTip';
import { useEditorStore } from '../store/editorStore';
import { useProjectStore, useSpec } from '../store/projectStore';
import { StatusChip } from '../components/inspector/KeyInspector';
import { getLanguage, t } from '../i18n';

const PRESETS: { name: () => string; ccw: string; cw: string }[] = [
  { name: () => t('volume', 'громкость'), ccw: 'KC_VOLD', cw: 'KC_VOLU' },
  { name: () => t('mouse wheel', 'колесо мыши'), ccw: 'MS_WHLD', cw: 'MS_WHLU' },
  { name: () => t('horizontal wheel', 'колесо вбок'), ccw: 'MS_WHLL', cw: 'MS_WHLR' },
  { name: () => t('tracks', 'треки'), ccw: 'KC_MPRV', cw: 'KC_MNXT' },
  { name: () => t('screen brightness', 'яркость экрана'), ccw: 'KC_BRID', cw: 'KC_BRIU' },
  { name: () => t('arrows ←→', 'стрелки ←→'), ccw: 'KC_LEFT', cw: 'KC_RGHT' },
  { name: () => t('arrows ↑↓', 'стрелки ↑↓'), ccw: 'KC_UP', cw: 'KC_DOWN' },
  { name: () => t('undo / redo', 'отмена / повтор'), ccw: 'C(KC_Z)', cw: 'C(KC_Y)' },
  { name: () => t('tabs', 'вкладки'), ccw: 'C(S(KC_TAB))', cw: 'C(KC_TAB)' },
  { name: () => t('zoom', 'масштаб'), ccw: 'C(KC_MINS)', cw: 'C(KC_EQL)' },
  { name: () => t('RGB effect', 'эффект RGB'), ccw: 'RM_PREV', cw: 'RM_NEXT' },
  { name: () => t('RGB brightness', 'яркость RGB'), ccw: 'RM_VALD', cw: 'RM_VALU' },
];

function CodeCell({ value, onSet }: { value: number; onSet: (v: number) => void }) {
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!labelCtx) return null;
  const l = keyLabel(spec, value, labelCtx);
  const name = friendlyName(spec, value, labelCtx);
  const cancel = () => {
    setEditing(null);
    setError(null);
  };
  /** Leaving the field commits a valid expression; an invalid one stays open with its error. */
  const onBlur = () => {
    const r = resolveBlur(spec, editing ?? '', value);
    if (r.action === 'error') return setError(r.error);
    if (r.action === 'commit') onSet(r.value);
    cancel();
  };
  if (editing !== null) {
    // Like every keycode field: the expression with what it means beside it, and the catalog button. Focus moving
    // between the box, the button and the catalog it opens (a portal) isn't leaving the field.
    const preview = error ?? typedMeaning(spec, labelCtx, editing);
    return (
      <span
        className="kc-field"
        onBlur={(e) => {
          const to = e.relatedTarget as Element | null;
          if (to && (e.currentTarget.contains(to) || to.closest('.kc-popover'))) return;
          onBlur();
        }}
      >
        <form
          className={`expr-input ${error ? 'is-error' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            const r = tryParseQmk(spec, editing);
            if ('error' in r) return setError(r.error);
            onSet(r.value);
            cancel();
          }}
        >
          <input autoFocus value={editing} onChange={(e) => setEditing(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && cancel()} spellCheck={false} aria-label={t('Keycode', 'Keycode')} />
          {preview && (
            <span className="expr-result" title={preview}>
              {preview}
            </span>
          )}
        </form>
        <CatalogButton
          current={value}
          onPick={(v) => {
            onSet(v);
            cancel();
          }}
        />
      </span>
    );
  }
  return (
    <button className="kc-tile" style={{ minHeight: 34, cursor: 'text' }} onClick={() => setEditing(l.qmk)} title={[name.text, l.description, name.qmk].filter((s, i, all) => s && all.indexOf(s) === i).join('\n')}>
      <span className="kc-tile-label">{l.kind === 'transparent' ? '▽' : l.main || '∅'}</span>
      <span className="kc-tile-name">{name.text}</span>
    </button>
  );
}

export function EncodersPage() {
  const active = useActive();
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const apply = useProjectStore((s) => s.apply);
  const setEncoderTarget = useEditorStore((s) => s.setEncoderTarget);
  const setLayer = useEditorStore((s) => s.setLayer);
  const [presetEnc, setPresetEnc] = useState(0);
  const [query, setQuery] = useListFilter();
  const [presetLayer, setPresetLayer] = useState(0);

  const count = useMemo(() => {
    if (!active) return 0;
    const fromHw = active.project.hardware.encoders.count ?? 0;
    const fromGeo = Math.max(-1, ...active.geometry.encoders.map((e) => e.index)) + 1;
    const fromKm = Math.max(0, ...active.keymap.layers.map((l) => l.encoders.length));
    return Math.max(fromHw, fromGeo, fromKm);
  }, [active]);

  if (!active || !labelCtx) return null;
  const { project, keymap, geometry } = active;
  const lang = getLanguage();
  const hw = hardwareFacts(project);
  const mapStatus = featureStatus('encoder_map', project.firmware.flags, hw);
  const encStatus = featureStatus('encoder', project.firmware.flags, hw);
  const cols = project.hardware.matrix.cols;

  if (count === 0) {
    return (
      <EmptyState
        what={t(
          'An encoder is a rotary knob; here you choose what turning it each way does on each layer. This project has none yet: set their number in “Hardware” and place them on the layout.',
          'Энкодер — поворотная ручка; здесь выбирают, что делает поворот в каждую сторону на каждом слое. В проекте их пока нет: укажите число в разделе «Железо» и поставьте на схему.',
        )}
        example={t('clockwise = volume up, counter-clockwise = volume down.', 'по часовой — громче, против часовой — тише.')}
      >
        <a className="btn" href={href({ section: 'hardware', tab: 'profile' })}>
          {t('hardware profile', 'профиль железа')}
        </a>
      </EmptyState>
    );
  }

  const set = (layer: number, enc: number, dir: 'cw' | 'ccw', v: number) => apply((p) => setEncoder(p, keymap.id, layer, enc, dir, v), `E${enc} ${dir}`);

  // A layer row matches by number, name, or what its encoders do (readable name and QMK code).
  const actionText = (v: number) => {
    const n = friendlyName(spec, v, labelCtx);
    return `${n.text} ${n.qmk}`;
  };
  const shownLayers = keymap.layers
    .map((l, li) => ({ l, li }))
    .filter(({ l, li }) => matchesQuery(query, li, `L${li}`, l.name, ...Array.from({ length: count }, (_, e) => (l.encoders[e] ? `${actionText(l.encoders[e].ccw)} ${actionText(l.encoders[e].cw)}` : null))));

  return (
    <div className="page">
      <div className="notice" role="status">
        <span>
          <strong>
            <Hint
              docs={QMK_DOCS.encoderMap}
              tip={t(
                'The encoder map is a table in the firmware that gives each encoder a key for clockwise and for counter-clockwise on every layer. With it (and VIA) the actions can be changed without rebuilding.',
                'Карта энкодеров — таблица в прошивке: для каждого энкодера и каждого слоя клавиша на поворот по часовой и против. Если она есть (и VIA), действия меняются без пересборки.',
              )}
            >
              {t('Encoder map', 'Карта энкодеров')}
            </Hint>
          </strong>{' '}
          <StatusChip state={mapStatus.state} likely={mapStatus.likely} text={lang === 'ru' ? mapStatus.reason.ru : mapStatus.reason.en} /> · {t('Encoders', 'Энкодеры')}{' '}
          <StatusChip state={encStatus.state} likely={encStatus.likely} text={lang === 'ru' ? encStatus.reason.ru : encStatus.reason.en} />
          <br />
          {mapStatus.state === 'available'
            ? t('Actions below can be written to the keyboard over VIA right away (bottom bar → “to keyboard”).', 'Действия ниже можно сразу записать в клавиатуру по VIA (внизу → «в клавиатуру»).')
            : t(
                'Without an encoder map in the firmware, these actions go only into your own firmware build (keymap.c → encoder_map).',
                'Без карты энкодеров в прошивке эти действия попадут только в вашу сборку (keymap.c → encoder_map).',
              )}
        </span>
      </div>
      <ListFilter
        value={query}
        onChange={setQuery}
        label={t('Filter encoder layers', 'Фильтр слоёв энкодеров')}
        placeholder={t('Filter by layer or action', 'Фильтр по слою или действию')}
        shown={shownLayers.length}
        total={keymap.layers.length}
      />
      {shownLayers.length === 0 && <p className="field-hint">{t('Nothing matches the filter.', 'Под фильтр ничего не подходит.')}</p>}
      <div className="panel-box" hidden={shownLayers.length === 0}>
        <div className="rows">
          <div className="row" style={{ ['--row-cols' as string]: `120px repeat(${count}, minmax(0, 1fr))` }}>
            <span className="kicker">{t('layer', 'слой')}</span>
            {Array.from({ length: count }, (_, e) => {
              const g = geometry.encoders.find((x) => x.index === e);
              return (
                <span key={e} className="kicker">
                  E{e} {g ? `· ${g.half}` : ''} — ↺ {t('ccw', 'против')} / ↻ {t('cw', 'по час.')}
                </span>
              );
            })}
          </div>
          {shownLayers.map(({ l, li }) => (
            <div key={l.id} className="row" style={{ ['--row-cols' as string]: `120px repeat(${count}, minmax(0, 1fr))` }}>
              <span>
                <span className="num">L{li}</span> {l.name}
              </span>
              {Array.from({ length: count }, (_, e) => {
                const a = l.encoders[e] ?? { ccw: li === 0 ? 0 : 1, cw: li === 0 ? 0 : 1 };
                return (
                  <div key={e} className="field-row" style={{ flexWrap: 'nowrap' }}>
                    <CodeCell value={a.ccw} onSet={(v) => set(li, e, 'ccw', v)} />
                    <CodeCell value={a.cw} onSet={(v) => set(li, e, 'cw', v)} />
                    <button
                      className="icon-btn"
                      title={t('Copy to all other layers', 'Скопировать на все остальные слои')}
                      aria-label={t('Copy to other layers', 'На другие слои')}
                      onClick={() =>
                        apply(
                          (p) =>
                            copyEncoderToLayers(
                              p,
                              keymap.id,
                              li,
                              e,
                              keymap.layers.map((_, i) => i).filter((i) => i !== li),
                            ),
                          t('copy encoder', 'копия энкодера'),
                        )
                      }
                    >
                      <Copy size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>{t('quick presets', 'быстрые наборы')}</h2>
          <div className="field-row">
            <select className="select" value={presetEnc} onChange={(e) => setPresetEnc(Number(e.target.value))} aria-label={t('Encoder', 'Энкодер')}>
              {Array.from({ length: count }, (_, e) => (
                <option key={e} value={e}>
                  E{e}
                </option>
              ))}
            </select>
            <select className="select" value={presetLayer} onChange={(e) => setPresetLayer(Number(e.target.value))} aria-label={t('Layer', 'Слой')}>
              {keymap.layers.map((l, i) => (
                <option key={l.id} value={i}>
                  L{i} · {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="chips">
          {PRESETS.map((p) => (
            <button
              key={p.ccw + p.cw}
              className="chip"
              onClick={() => {
                const ccw = tryParseQmk(spec, p.ccw);
                const cw = tryParseQmk(spec, p.cw);
                if ('value' in ccw && 'value' in cw) {
                  apply((pr) => setEncoder(setEncoder(pr, keymap.id, presetLayer, presetEnc, 'ccw', ccw.value), keymap.id, presetLayer, presetEnc, 'cw', cw.value), `E${presetEnc}: ${p.name()}`);
                }
              }}
            >
              {p.name()}{' '}
              <span className="kicker" title={`${p.ccw} / ${p.cw}`}>
                {[p.ccw, p.cw].map((x) => { const r = tryParseQmk(spec, x); return 'value' in r ? friendlyName(spec, r.value, labelCtx).text : x; }).join(' / ')}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            <Hint
              tip={t(
                'Many encoders also click when pushed in. The click is an ordinary key in the matrix, so it is assigned like any key on the Keyboard page, not in the encoder map.',
                'Многие энкодеры ещё и нажимаются. Нажатие — обычная клавиша матрицы: его назначают как любую клавишу на странице «Клавиатура», а не в карте энкодеров.',
              )}
            >
              {t('encoder press', 'нажатие энкодера')}
            </Hint>
          </h2>
        </div>
        <div className="panel-box rows">
          {Array.from({ length: count }, (_, e) => {
            const g = geometry.encoders.find((x) => x.index === e);
            const pos = g?.pressMatrix;
            return (
              <div key={e} className="row" style={{ ['--row-cols' as string]: '60px minmax(0,1fr) auto' }}>
                <span className="num">E{e}</span>
                <span className="field-hint" title={pos ? ((n) => (n.text === n.qmk ? n.qmk : `${n.text}\n${n.qmk}`))(friendlyName(spec, keymap.layers[0].keys[pos[0] * cols + pos[1]], labelCtx)) : undefined}>
                  {pos
                    ? `${t('matrix', 'матрица')} [${pos[0]},${pos[1]}] · L0: ${friendlyName(spec, keymap.layers[0].keys[pos[0] * cols + pos[1]], labelCtx).text}`
                    : t(
                        'The press is not linked to a matrix position (unknown or no button). Link it in “Hardware → geometry”.',
                        'Нажатие не связано с позицией матрицы (неизвестно или кнопки нет). Свяжите в «Железо → геометрия».',
                      )}
                </span>
                {pos && (
                  <button
                    className="btn"
                    onClick={() => {
                      const key = geometry.keys.find((k) => k.matrix && k.matrix[0] === pos[0] && k.matrix[1] === pos[1]);
                      setLayer(0);
                      if (key) useEditorStore.getState().select([key.id], 'replace');
                      navigate({ section: 'keyboard' });
                    }}
                  >
                    {t('edit', 'изменить')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <div className="field-row" style={{ marginTop: 'var(--gap)' }}>
        <button
          className="btn"
          onClick={() => {
            setEncoderTarget({ index: 0, dir: 'cw' });
            navigate({ section: 'keyboard' });
          }}
        >
          {t('assign on the layout (catalog)', 'назначать на схеме (каталог)')}
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => apply((p) => ({ ...p, keymaps: p.keymaps.map((k) => (k.id === keymap.id ? resizeEncoders(k, count) : k)) }), t('encoder slots', 'слоты энкодеров'))}
        >
          {t('fill missing slots', 'дополнить пустые места')}
        </button>
      </div>
    </div>
  );
}
