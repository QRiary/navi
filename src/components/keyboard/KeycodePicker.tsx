/**
 * KEYCODE CATALOG: categories on the left, tiles on the right, search and a field for any QMK expression.
 * Click a tile — assign it to the selected keys; a tile can be dragged onto a key.
 * The mark in the tile corner — a firmware feature that is missing or unknown (see the tooltip).
 */
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { buildCatalog, CATEGORIES, searchCatalog, type CategoryId } from '../../core/keycodes/catalog';
import { tryParseQmk, toQmk } from '../../core/keycodes/codec';
import { friendlyName } from '../../core/keycodes/friendly';
import { keycodeNeeds, needStatus } from '../../core/keycodes/requirements';
import { FEATURE_BY_ID, type FeatureState } from '../../core/features/registry';
import { catalogContext, useLabelContext, useParseContext } from '../../lib/projectContext';
import { hardwareFacts } from '../../lib/hardwareFacts';
import { assignToSelection } from '../../lib/keymapActions';
import { useDeviceStore } from '../../store/deviceStore';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { t, getLanguage } from '../../i18n';
import { KEYCODE_DRAG_TYPE } from './KeyboardCanvas';

/** `onPick` given: a pick goes to the caller (a keycode field's popover) instead of the selected keys. */
export function KeycodePicker({ currentKeycode, onPick }: { currentKeycode: number | null; onPick?: (value: number) => void }) {
  const project = useProjectStore((s) => s.project);
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const parseCtx = useParseContext();
  const macroCount = useDeviceStore((s) => s.caps?.macros?.count);
  const category = useEditorStore((s) => s.pickerCategory);
  const query = useEditorStore((s) => s.pickerQuery);
  const setPicker = useEditorStore((s) => s.setPicker);
  const setQuery = useEditorStore((s) => s.setQuery);
  const [expr, setExpr] = useState('');

  const items = useMemo(() => {
    if (!project || !labelCtx) return [];
    return buildCatalog(spec, catalogContext(project, spec, labelCtx, macroCount ?? 16));
  }, [project, spec, labelCtx, macroCount]);

  const counts = useMemo(() => {
    const m = new Map<CategoryId, number>();
    for (const it of items) m.set(it.category, (m.get(it.category) ?? 0) + 1);
    return m;
  }, [items]);

  const visible = useMemo(() => (query.trim() ? searchCatalog(items, query).slice(0, 400) : items.filter((it) => it.category === category)), [items, query, category]);

  const statusOf = useMemo(() => {
    if (!project) return (): { state: FeatureState; text: string } | null => null;
    const hw = hardwareFacts(project);
    const cache = new Map<number, { state: FeatureState; text: string } | null>();
    return (value: number) => {
      if (cache.has(value)) return cache.get(value)!;
      const req = keycodeNeeds(spec, value, { unicode: project.firmware.unicode });
      let worst: { state: FeatureState; text: string } | null = null;
      for (const need of req) {
        const { feature: f, status: st } = needStatus(need, project.firmware.flags, hw);
        if (st.state === 'available') continue;
        const info = FEATURE_BY_ID.get(f);
        const text = `${getLanguage() === 'ru' ? info?.title.ru : info?.title.en}: ${getLanguage() === 'ru' ? st.reason.ru : st.reason.en}`;
        if (!worst || st.state === 'unsupported') worst = { state: st.state, text };
      }
      cache.set(value, worst);
      return worst;
    };
  }, [project, spec]);

  const parsed = expr.trim() ? tryParseQmk(spec, expr, parseCtx) : null;
  const applyExpr = () => {
    if (!parsed || !('value' in parsed)) return;
    if (onPick) onPick(parsed.value);
    else if (assignToSelection(parsed.value)) setExpr('');
  };

  if (!project) return null;
  // the readable name shows; the QMK expression and the raw value go to the tooltip
  const parsedName = (v: number) => {
    const qmk = toQmk(spec, v);
    const n = labelCtx ? friendlyName(spec, v, labelCtx) : null;
    return { text: n ? n.text : qmk, title: `${qmk} · 0x${v.toString(16).toUpperCase().padStart(4, '0')}` };
  };
  const title =(c: (typeof CATEGORIES)[number]) => (getLanguage() === 'ru' ? c.title.ru : c.title.en);

  return (
    <div className="picker" data-key-shortcuts="">
      <nav className="picker-cats" aria-label={t('Keycode categories', 'Категории keycodes')}>
        {CATEGORIES.filter((c) => (counts.get(c.id) ?? 0) > 0).map((c) => (
          <button
            key={c.id}
            className={`picker-cat ${!query && category === c.id ? 'is-active' : ''}`}
            onClick={() => {
              setPicker(c.id, '');
            }}
          >
            <span>{title(c)}</span>
            <span className="picker-cat-count">{counts.get(c.id)}</span>
          </button>
        ))}
      </nav>
      <div className="picker-main">
        <div className="picker-head">
          <label className="search-box" style={{ maxWidth: 300, height: 30 }}>
            <Search size={14} strokeWidth={1.5} aria-hidden="true" />
            <input
              id="keycode-search"
              type="search"
              placeholder={t('search: name, code, category…', 'поиск: имя, код, категория…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('Search keycodes', 'Поиск keycodes')}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label={t('Clear', 'Очистить')} onClick={() => setQuery('')}>
                <X size={13} strokeWidth={1.5} />
              </button>
            )}
          </label>
          <form
            className={`expr-input ${parsed && 'error' in parsed ? 'is-error' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              applyExpr();
            }}
          >
            <input
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              placeholder={t('any QMK expression: LT(1, KC_SPC), C(KC_C), 0x7C00 — Enter', 'любое выражение QMK: LT(1, KC_SPC), C(KC_C), 0x7C00 — Enter')}
              aria-label={t('QMK expression', 'Выражение QMK')}
              spellCheck={false}
            />
            {parsed && (
              <span className="expr-result" title={'value' in parsed ? parsedName(parsed.value).title : undefined}>
                {'value' in parsed ? `→ ${parsedName(parsed.value).text}` : parsed.error}
              </span>
            )}
          </form>
        </div>
        <div className="picker-grid" role="list">
          {visible.length === 0 && <div className="picker-empty">{t('nothing found', 'ничего не найдено')}</div>}
          {visible.map((it) => {
            const st = statusOf(it.value);
            return (
              <button
                key={`${it.category}:${it.value}`}
                role="listitem"
                className={`kc-tile ${currentKeycode === it.value ? 'is-current' : ''}`}
                title={`${it.name}\n${it.description}${st ? `\n\n⚠ ${st.text}` : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(KEYCODE_DRAG_TYPE, String(it.value));
                  e.dataTransfer.setData('text/plain', it.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => (onPick ? onPick(it.value) : assignToSelection(it.value))}
              >
                <span className="kc-tile-label">{it.label}</span>
                <span className="kc-tile-name">{it.name}</span>
                {st && <i className={`kc-tile-flag kc-tile-flag--${st.state}`} aria-label={st.state} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
