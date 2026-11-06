/**
 * LAYERS SECTION: create, insert, copy, rename, move, delete a layer;
 * the base layer; fill with transparent/empty keys; copy assignments; compare two layers;
 * “how to reach a layer” — which keys lead to it (MO/TG/TO/TT/OSL/LT/LM…).
 * Layer numbers in references are renumbered on moving and deleting (core/project/ops.ts).
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, CopyPlus, Eraser, Plus, SquareDashed, Star, Trash2 } from 'lucide-react';
import { LayoutPreview } from '../components/keyboard/LayoutPreview';
import { KeymapManager } from '../components/project/KeymapManager';
import { LayerKeysOnTopRow } from '../components/advanced/LayerKeysOnTop';
import { LayerRoutes, useLayerRefs } from '../components/layers/LayerRoutes';
import { keyLabel } from '../core/keycodes/labels';
import { KC_NO, KC_TRNS } from '../core/project/factory';
import { compareLayers, copyLayerKeys, duplicateLayer, fillLayer, insertLayer, moveLayer, removeLayer, renameLayer, setDefaultLayer, setLayerColor, setLayerCName } from '../core/project/ops';
import { layerIdentifiers } from '../core/qmk/generate';
import { useActive, useLabelContext } from '../lib/projectContext';
import { href, navigate } from '../lib/router';
import { useEditorStore } from '../store/editorStore';
import { useProjectStore, useSpec } from '../store/projectStore';
import { t } from '../i18n';
import { deletedToast } from '../lib/undoToast';
import { QMK_DOCS } from '../lib/qmkDocs';
import { whyDisabled } from '../lib/whyDisabled';
import { Hint, InfoTip } from '../components/InfoTip';
import { ListFilter } from '../components/ListFilter';
import { findAttr, matchesQuery, useListFilter } from '../lib/find';

const ICON = { size: 14, strokeWidth: 1.5 };
const COLORS = ['', '#6ec6ff', '#7fe3a8', '#ffb000', '#ff5d6c', '#c792ea', '#e8e8e8'];

export function LayersPage() {
  const active = useActive();
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const apply = useProjectStore((s) => s.apply);
  const setLayer = useEditorStore((s) => s.setLayer);
  const setCompare = useEditorStore((s) => s.setCompare);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [cmpA, setCmpA] = useState(0);
  const [cmpB, setCmpB] = useState(1);
  const [copyFrom, setCopyFrom] = useState(0);

  const refs = useLayerRefs();
  const [query, setQuery] = useListFilter();

  if (!active || !labelCtx) return null;
  const { project, keymap, geometry } = active;
  const cols = project.hardware.matrix.cols;
  const id = keymap.id;
  // What each layer's C name would be if its own name were empty (the input's placeholder).
  const defaultIds = layerIdentifiers({ ...keymap, layers: keymap.layers.map(({ cName: _cName, ...l }) => l) });
  const n = keymap.layers.length;
  const diff = cmpA < n && cmpB < n ? compareLayers(project, keymap, cmpA, cmpB) : [];
  const diffSet = new Set(diff.map((p) => `${p[0]},${p[1]}`));
  const shownLayers = keymap.layers.map((l, i) => ({ l, i })).filter(({ l, i }) => matchesQuery(query, i, `L${i}`, l.name, l.cName, defaultIds[i]));

  return (
    <div className="page">
      <p className="page-lead">
        {t(
          'QMK checks layers from the highest switched-on one down; a transparent key (▽) falls through to the next switched-on layer, the base layer is always at the bottom. Layer numbers in MO()/LT()/TG()… are renumbered automatically when you move or delete layers.',
          'QMK смотрит слои от самого верхнего включённого вниз; прозрачная клавиша (▽) пропускает к следующему включённому слою, базовый слой всегда снизу. Номера слоёв в MO()/LT()/TG()… пересчитываются сами при перестановке и удалении.',
        )}{' '}
        <InfoTip docs={QMK_DOCS.layers} label={t('layers', 'слои')}>
          {t(
            'A layer is a full set of key assignments. The base layer is always on; other layers are switched on by keys (MO, TG, LT…) while the base stays underneath. The number is the layer’s place in the list: layer 0 is the lowest.',
            'Слой — полный набор назначений клавиш. Базовый слой включён всегда; остальные включаются клавишами (MO, TG, LT…), а базовый остаётся под ними. Номер — место слоя в списке: слой 0 самый нижний.',
          )}
        </InfoTip>
      </p>
      <div className="panel-box rows">
        <LayerKeysOnTopRow project={project} />
      </div>
      <KeymapManager />
      <div className="toolbar">
        <span className="kicker">
          {n} {t('layers', 'слоёв')} ·{' '}
          <Hint
            tip={t(
              'The base (default) layer is the one active when nothing else is switched on; transparent keys on other layers fall through to it. Pick it with the star on a layer. QMK allows up to 32 layers.',
              'Базовый слой (по умолчанию) действует, когда ничего другого не включено; прозрачные клавиши других слоёв пропускают к нему. Выбирается звёздочкой на слое. В QMK не больше 32 слоёв.',
            )}
          >
            {t('base', 'базовый')}
          </Hint>
          : {keymap.defaultLayer}
        </span>
        <div className="toolbar-actions">
          <button
            className="btn btn--primary"
            {...whyDisabled(n >= 32 && t('At most 32 layers', 'Не больше 32 слоёв'))}
            onClick={() => apply((p) => insertLayer(p, id, spec, `Layer ${n}`, n), t('add layer', 'новый слой'))}
          >
            <Plus {...ICON} /> {t('add layer', 'добавить слой')}
          </button>
        </div>
      </div>
      <ListFilter
        value={query}
        onChange={setQuery}
        label={t('Filter layers', 'Фильтр слоёв')}
        placeholder={t('Filter by number or name', 'Фильтр по номеру или имени')}
        shown={shownLayers.length}
        total={n}
      />
      {shownLayers.length === 0 && <p className="field-hint">{t('Nothing matches the filter.', 'Под фильтр ничего не подходит.')}</p>}
      <div className="panel-box" hidden={shownLayers.length === 0}>
        <div className="rows">
          {shownLayers.map(({ l, i }) => {
            return (
              <div key={l.id} {...findAttr('layer:' + l.id)} className="row" style={{ ['--row-cols' as string]: '34px minmax(0,1fr) minmax(0,2fr) auto', alignItems: 'start', paddingTop: 12, paddingBottom: 12 }}>
                <span className="num" style={{ paddingTop: 6 /* grid-ok: lines the number up with the 30px inputs beside it */ }}>
                  L{i}
                </span>
                <div className="field">
                  <div className="field-row">
                    <input
                      className="input"
                      value={l.name}
                      maxLength={40}
                      onChange={(e) => apply((p) => renameLayer(p, id, i, e.target.value), t('rename layer', 'имя слоя'), { coalesce: `rename:${l.id}` })}
                      aria-label={t('Layer name', 'Имя слоя')}
                    />
                    <input
                      className="input"
                      style={{ maxWidth: 130, fontFamily: 'var(--mono, monospace)' }}
                      value={l.cName ?? ''}
                      maxLength={40}
                      placeholder={defaultIds[i]}
                      spellCheck={false}
                      onChange={(e) => apply((p) => setLayerCName(p, id, i, e.target.value.replace(/[^A-Za-z0-9_]/g, '')), t('layer C name', 'C-имя слоя'), { coalesce: `cname:${l.id}` })}
                      aria-label={t('C name (in keymap.c / navi.h)', 'C-имя (в keymap.c / navi.h)')}
                      title={t('C name (in keymap.c / navi.h)', 'C-имя (в keymap.c / navi.h)')}
                    />
                    {i === keymap.defaultLayer && <span className="badge badge--ok">{t('base', 'базовый')}</span>}
                  </div>
                  <div className="field-row">
                    {COLORS.map((c) => (
                      <button
                        key={c || 'none'}
                        className={`chip ${(l.color ?? '') === c ? 'is-on' : ''}`}
                        style={{ minWidth: 26, color: c || undefined }}
                        onClick={() => apply((p) => setLayerColor(p, id, i, c || undefined), t('layer color', 'цвет слоя'))}
                        aria-label={c || t('no color', 'без цвета')}
                      >
                        {c ? '■' : '∅'}
                      </button>
                    ))}
                  </div>
                  <div className="field">
                    <span className="kicker">{t('how to get here', 'как сюда попасть')}</span>
                    <LayerRoutes layer={i} refs={refs} compact />
                  </div>
                </div>
                <button
                  onClick={() => {
                    setLayer(i);
                    navigate({ section: 'keyboard' });
                  }}
                  title={t('Edit this layer', 'Редактировать слой')}
                  style={{ display: 'block', width: '100%' }}
                >
                  <LayoutPreview geometry={geometry} label={([r, c]) => keyLabel(spec, l.keys[r * cols + c], labelCtx)} height="auto" maxHeight={300} />
                </button>
                <div className="row-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div className="row-actions">
                    <button
                      className="icon-btn"
                      {...whyDisabled(i === 0 && t('Already the first layer', 'Уже первый слой'), t('Move up (lower number)', 'Выше (меньший номер)'))}
                      aria-label={t('Move up', 'Выше')}
                      onClick={() => apply((p) => moveLayer(p, id, spec, i, i - 1), t('move layer', 'перестановка слоя'))}
                    >
                      <ArrowUp {...ICON} />
                    </button>
                    <button
                      className="icon-btn"
                      {...whyDisabled(i === n - 1 && t('Already the last layer', 'Уже последний слой'), t('Move down (higher number)', 'Ниже (больший номер)'))}
                      aria-label={t('Move down', 'Ниже')}
                      onClick={() => apply((p) => moveLayer(p, id, spec, i, i + 1), t('move layer', 'перестановка слоя'))}
                    >
                      <ArrowDown {...ICON} />
                    </button>
                    <button
                      className="icon-btn"
                      {...whyDisabled(n >= 32 && t('At most 32 layers', 'Не больше 32 слоёв'), t('Duplicate', 'Копия слоя'))}
                      aria-label={t('Duplicate', 'Копия')}
                      onClick={() => apply((p) => duplicateLayer(p, id, spec, i), t('duplicate layer', 'копия слоя'))}
                    >
                      <CopyPlus {...ICON} />
                    </button>
                    <button
                      className={`icon-btn ${confirmDelete === i ? 'is-danger' : ''}`}
                      {...whyDisabled(
                        n <= 1 && t('A keymap needs at least one layer', 'В раскладке должен остаться хотя бы один слой'),
                        confirmDelete === i ? t('Click again: delete (references become KC_NO)', 'Ещё раз: удалить (ссылки станут KC_NO)') : t('Delete layer', 'Удалить слой'),
                      )}
                      aria-label={t('Delete layer', 'Удалить слой')}
                      onClick={() => {
                        if (confirmDelete !== i) {
                          setConfirmDelete(i);
                          setTimeout(() => setConfirmDelete(null), 4000);
                          return;
                        }
                        apply((p) => removeLayer(p, id, spec, i), t('delete layer', 'удаление слоя'));
                        setConfirmDelete(null);
                        deletedToast(t('layer', 'слой'));
                      }}
                    >
                      <Trash2 {...ICON} />
                    </button>
                  </div>
                  <div className="row-actions">
                    <button
                      className="icon-btn"
                      {...whyDisabled(i === keymap.defaultLayer && t('Already the base layer', 'Уже базовый слой'), t('Make base layer', 'Сделать базовым'))}
                      aria-label={t('Make base', 'Базовый')}
                      onClick={() => apply((p) => setDefaultLayer(p, id, i), t('base layer', 'базовый слой'))}
                    >
                      <Star {...ICON} />
                    </button>
                    <button
                      className="icon-btn"
                      title={t('Fill with transparent', 'Залить прозрачными')}
                      aria-label={t('Transparent', 'Прозрачные')}
                      onClick={() => apply((p) => fillLayer(p, id, i, KC_TRNS), t('fill transparent', 'заливка прозрачными'))}
                    >
                      <SquareDashed {...ICON} />
                    </button>
                    <button
                      className="icon-btn"
                      title={t('Fill with empty (KC_NO)', 'Залить пустыми (KC_NO)')}
                      aria-label={t('Empty', 'Пустые')}
                      onClick={() => apply((p) => fillLayer(p, id, i, KC_NO), t('fill empty', 'заливка пустыми'))}
                    >
                      <Eraser {...ICON} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 'var(--gap)' }}>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('compare layers', 'сравнить слои')}</span>
          </div>
          <div className="panel-box-body field">
            <div className="field-row">
              <select className="select" value={cmpA} onChange={(e) => setCmpA(Number(e.target.value))} aria-label="A">
                {keymap.layers.map((l, i) => (
                  <option key={l.id} value={i}>
                    {i} · {l.name}
                  </option>
                ))}
              </select>
              <span>⇄</span>
              <select className="select" value={cmpB} onChange={(e) => setCmpB(Number(e.target.value))} aria-label="B">
                {keymap.layers.map((l, i) => (
                  <option key={l.id} value={i}>
                    {i} · {l.name}
                  </option>
                ))}
              </select>
              <span className="kicker">
                {diff.length} {t('differ', 'отличий')}
              </span>
            </div>
            <LayoutPreview geometry={geometry} label={([r, c]) => keyLabel(spec, keymap.layers[cmpB]?.keys[r * cols + c] ?? 0, labelCtx)} marked={diffSet} height="auto" maxHeight={300} />
            <button
              className="btn"
              onClick={() => {
                setLayer(cmpB);
                setCompare('layer', cmpA);
                navigate({ section: 'keyboard' });
              }}
            >
              {t('open in the editor with differences marked', 'открыть в редакторе с отметкой отличий')}
            </button>
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('copy keys between layers', 'перенос назначений между слоями')}</span>
          </div>
          <div className="panel-box-body field">
            <p className="field-hint">
              {t(
                'All keys of one layer are copied to the selected layer (undo with Ctrl+Z). To copy only some keys, select them in the editor and use Ctrl+C / Ctrl+V on another layer.',
                'Все клавиши одного слоя копируются в выбранный (отмена — Ctrl+Z). Чтобы перенести часть, выделите клавиши в редакторе и используйте Ctrl+C / Ctrl+V на другом слое.',
              )}
            </p>
            <div className="field-row">
              <select className="select" value={copyFrom} onChange={(e) => setCopyFrom(Number(e.target.value))} aria-label={t('From', 'Откуда')}>
                {keymap.layers.map((l, i) => (
                  <option key={l.id} value={i}>
                    {t('from', 'из')} {i} · {l.name}
                  </option>
                ))}
              </select>
              <span>→</span>
              {keymap.layers.map((l, i) =>
                i === copyFrom ? null : (
                  <button key={l.id} className="btn" onClick={() => apply((p) => copyLayerKeys(p, id, copyFrom, i), t('copy layer keys', 'перенос слоя'))}>
                    <Copy {...ICON} /> {i}
                  </button>
                ),
              )}
            </div>
          </div>
        </section>
      </div>
      <p className="field-hint" style={{ marginTop: 'var(--gap)' }}>
        {t('More layers than the keyboard firmware has can be kept in the project, but only', 'Слоёв в проекте может быть больше, чем в прошивке клавиатуры, но записать по VIA можно только')}{' '}
        <a href={href({ section: 'device' })}>{t('as many as the firmware supports', 'столько, сколько поддерживает прошивка')}</a> {t('can be written over VIA.', '.')}
      </p>
    </div>
  );
}
