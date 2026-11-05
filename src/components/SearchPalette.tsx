/**
 * GLOBAL SEARCH (Ctrl+K, or the search box in the top bar): one box over pages and tabs, settings, QMK config
 * params and everything in the open project. ↑/↓ pick a result, Enter goes there and the item flashes; a key or
 * an encoder opens its layer on the Keyboard page with the key pointed at. Mouse: hover picks, click goes.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { Modal } from './Modal';
import { jumpTo, useFindStore } from '../lib/find';
import { navigate } from '../lib/router';
import { buildSearchIndex, kindLabel, searchItems, type SearchItem } from '../lib/searchIndex';
import { useLabelContext } from '../lib/projectContext';
import { useEditorStore } from '../store/editorStore';
import { useProjectStore, useSpec } from '../store/projectStore';
import { t } from '../i18n';

/** Goes where a result points. */
export function goToResult(item: SearchItem) {
  const k = item.keyboard;
  if (!k) {
    jumpTo(item.route, item.findId);
    return;
  }
  const editor = useEditorStore.getState();
  editor.setLayer(k.layer);
  if (k.encoder) editor.setEncoderTarget(k.encoder);
  else {
    editor.clearSelection();
    if (k.pos) editor.setHighlight([k.pos]);
  }
  navigate({ section: 'keyboard' });
}

export function SearchPalette() {
  const open = useFindStore((s) => s.open);
  const setOpen = useFindStore((s) => s.setOpen);
  if (!open) return null;
  return <PaletteBody onClose={() => setOpen(false)} />;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const projects = useProjectStore((s) => s.list);
  const spec = useSpec();
  const ctx = useLabelContext();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();

  const index = useMemo(() => buildSearchIndex({ project, spec, ctx, projects }), [project, spec, ctx, projects]);
  const results = useMemo(() => searchItems(index, query), [index, query]);
  const at = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const go = (item: SearchItem | undefined) => {
    if (!item) return;
    onClose();
    goToResult(item);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((at + step + results.length) % results.length);
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      setActive(Math.max(0, Math.min(results.length - 1, at + (e.key === 'PageDown' ? 8 : -8))));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[at]);
    }
  };

  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const empty = !query.trim();

  return (
    <Modal
      title={t('Search', 'Поиск')}
      onClose={onClose}
      className="modal--search"
      footer={
        <span className="search-keys field-hint">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> {t('choose', 'выбрать')}
          </span>
          <span>
            <kbd>Enter</kbd> {t('go there', 'перейти')}
          </span>
          <span>
            <kbd>Esc</kbd> {t('close', 'закрыть')}
          </span>
        </span>
      }
    >
      <label className="search-box search-palette-box">
        <Search size={16} strokeWidth={1.5} aria-hidden="true" />
        <input
          data-autofocus
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${baseId}-list`}
          aria-activedescendant={results.length ? optionId(at) : undefined}
          aria-autocomplete="list"
          aria-label={t('Search everywhere', 'Поиск везде')}
          placeholder={project ? t('Key, layer, combo, setting, page…', 'Клавиша, слой, комбо, настройка, страница…') : t('Setting, page, project…', 'Настройка, страница, проект…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      {empty && <p className="field-hint">{t('Pages of the app. Type to search keys, layers, combos, tap dances, macros, settings and QMK settings.', 'Страницы приложения. Начните печатать, чтобы искать клавиши, слои, комбо, tap dance, макросы, настройки и настройки QMK.')}</p>}
      {!empty && results.length === 0 && <p className="field-hint">{t(`Nothing found for “${query.trim()}”.`, `По запросу «${query.trim()}» ничего не найдено.`)}</p>}
      {results.length > 0 && (
        <ul className="search-results" id={`${baseId}-list`} role="listbox" aria-label={t('Results', 'Результаты')} ref={listRef}>
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.findId ?? r.title}-${i}`}
              id={optionId(i)}
              data-index={i}
              role="option"
              aria-selected={i === at}
              className={`search-result ${i === at ? 'is-active' : ''}`}
              onMouseMove={() => i !== at && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(r)}
            >
              <span className="search-result-main">
                <span className="search-result-title">{r.title}</span>
                {r.detail && <span className="search-result-detail">{r.detail}</span>}
              </span>
              <span className="search-result-kind">{kindLabel(r.kind)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
