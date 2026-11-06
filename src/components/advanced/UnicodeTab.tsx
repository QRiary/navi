/**
 * Unicode: how the keyboard types characters (UC — the code is inside the keycode, up to U+7FFF; the UM/UP table —
 * any characters, emoji included), the input method on the computer (UNICODE_SELECTED_MODES) and the table.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { checkUnicodeMap } from '../../core/features/advanced';
import { newId } from '../../core/layout/geometry';
import { usesTextRoute } from '../../core/project/languages';
import type { Project, UnicodeEntry } from '../../core/project/types';
import { ROUTE_UNICODE_MODE } from '../../core/qmk/languages';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { CharInput, FeatureNote, IssueList } from './common';
import { getLanguage, t } from '../../i18n';
import { QMK_DOCS } from '../../lib/qmkDocs';
import { deletedToast } from '../../lib/undoToast';
import { whyDisabled } from '../../lib/whyDisabled';
import { EmptyState } from '../EmptyState';
import { Hint } from '../InfoTip';
import { ListFilter } from '../ListFilter';
import { findAttr, matchesQuery, useListFilter } from '../../lib/find';

const ICON = { size: 14, strokeWidth: 1.5 };

/** Unicode input methods in QMK (quantum/unicode/unicode.h). The order is the UC_NEXT switching order. */
const INPUT_MODES: { id: string; title: string; en: string; ru: string }[] = [
  {
    id: 'UNICODE_MODE_WINCOMPOSE',
    title: 'Windows · WinCompose',
    en: 'Needs the free WinCompose app. Recommended on Windows: any character, works everywhere.',
    ru: 'Нужна бесплатная программа WinCompose. Лучший вариант для Windows: любые символы, работает везде.',
  },
  {
    id: 'UNICODE_MODE_WINDOWS',
    title: 'Windows · HexNumpad',
    en: 'Built into Windows after a registry change (EnableHexNumpad); only up to U+FFFF, not in every app.',
    ru: 'Встроено в Windows после правки реестра (EnableHexNumpad); только до U+FFFF, не во всех программах.',
  },
  { id: 'UNICODE_MODE_LINUX', title: 'Linux · IBus', en: 'Ctrl+Shift+U input (IBus, GTK).', ru: 'Ввод через Ctrl+Shift+U (IBus, GTK).' },
  { id: 'UNICODE_MODE_MACOS', title: 'macOS', en: 'Needs the “Unicode Hex Input” keyboard layout.', ru: 'Нужна раскладка «Unicode Hex Input».' },
  { id: 'UNICODE_MODE_BSD', title: 'BSD', en: 'Not implemented in QMK yet (placeholder).', ru: 'В QMK пока не реализован (заготовка).' },
  { id: 'UNICODE_MODE_EMACS', title: 'Emacs', en: 'C-x 8 RET in Emacs.', ru: 'C-x 8 RET в Emacs.' },
];

const ROW_COLS = '24px minmax(150px, 0.5fr) minmax(0, 1.5fr) 44px';

const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

function CodepointInput({ entry, onChange }: { entry: UnicodeEntry; onChange: (cp: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const m = /^\s*(?:U\+|0x)?([0-9a-f]{1,6})\s*$/i.exec(text);
    const cp = m ? parseInt(m[1], 16) : NaN;
    if (Number.isFinite(cp) && cp <= 0x10ffff) onChange(cp);
    setText(null);
  };
  return (
    <input
      className="input"
      style={{ width: 110 }}
      value={text ?? hex(entry.codepoint)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      spellCheck={false}
      aria-label={t('Code point', 'Код символа')}
    />
  );
}

export function UnicodeTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const lang = getLanguage();
  const [confirmMode, setConfirmMode] = useState(false);
  const issues = useMemo(() => checkUnicodeMap(spec, project), [spec, project]);
  const mode = project.firmware.unicode;
  const highKeys = useMemo(() => project.keymaps.reduce((n, km) => n + km.layers.reduce((m, l) => m + l.keys.filter((v) => v >= 0x8000).length, 0), 0), [project.keymaps]);
  // A Unicode text route (Advanced → Languages) sets the input mode itself.
  const routeMode = usesTextRoute(project) ? ROUTE_UNICODE_MODE[project.firmware.textRoute] : undefined;
  const selected = routeMode
    ? [routeMode]
    : String(project.firmware.buildConfig.UNICODE_SELECTED_MODES ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const setMode = (next: Project['firmware']['unicode']) => {
    if (next === mode) return;
    if (highKeys > 0 && !confirmMode) {
      setConfirmMode(true);
      return;
    }
    setConfirmMode(false);
    apply((p) => ({ ...p, firmware: { ...p.firmware, unicode: next } }), t('unicode mode', 'режим юникода'));
  };
  const setInputModes = (list: string[]) =>
    apply(
      (p) => {
        const buildConfig = { ...p.firmware.buildConfig };
        if (list.length) buildConfig.UNICODE_SELECTED_MODES = list.join(', ');
        else delete buildConfig.UNICODE_SELECTED_MODES;
        return { ...p, firmware: { ...p.firmware, buildConfig } };
      },
      t('unicode input', 'ввод юникода'),
    );
  const [query, setQuery] = useListFilter();
  const shownMap = project.unicodeMap
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => {
      const hex = u.codepoint.toString(16).toUpperCase().padStart(4, '0');
      return matchesQuery(query, u.name, u.codepoint >= 0 && u.codepoint <= 0x10ffff && String.fromCodePoint(u.codepoint), `U+${hex}`, hex, `UM(${project.unicodeMap.indexOf(u)})`);
    });
  const setTable = (list: UnicodeEntry[], label: string, coalesce?: string) => apply((p) => ({ ...p, unicodeMap: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<UnicodeEntry>, label: string, coalesce?: string) =>
    setTable(
      project.unicodeMap.map((x) => (x.id === id ? { ...x, ...p } : x)),
      label,
      coalesce,
    );

  const addButton = (
    <button
      className="btn btn--primary"
      {...whyDisabled(project.unicodeMap.length >= 0x4000 && t('At most 16384 characters', 'Не больше 16384 символов'))}
      onClick={() => setTable([...project.unicodeMap, { id: newId('uc'), name: `CHAR_${project.unicodeMap.length}`, codepoint: 0x2192 }], t('new character', 'новый символ'))}
    >
      <Plus {...ICON} /> {t('character', 'символ')}
    </button>
  );
  const firstUse =
    mode === 'unicodemap'
      ? { en: 'add the first character to the table', ru: 'добавите первый символ в таблицу' }
      : { en: 'put a Unicode character (UC) on a key', ru: 'поставите на клавишу символ Юникода (UC)' };
  return (
    <div className="page">
      <FeatureNote project={project} feature={mode === 'unicodemap' ? 'unicodemap' : 'unicode'} firstUse={firstUse} />

      <section className="section">
        <div className="section-head">
          <h2>
            <Hint
              docs={QMK_DOCS.unicodeSubsystems}
              tip={t(
                'Two ways to put a character on a key:\n- UC: the code sits inside the keycode (up to U+7FFF, no emoji).\n- UM and UP: the character comes from the table below, so any character works; UP holds a pair, the second one typed with Shift.',
                'Два способа поставить символ на клавишу:\n- UC: код хранится прямо в keycode (до U+7FFF, без эмодзи).\n- UM и UP: символ берётся из таблицы ниже, поэтому подходят любые символы; UP хранит пару, второй символ печатается с Shift.',
              )}
            >
              {t('how keys carry characters', 'как клавиши хранят символы')}
            </Hint>
          </h2>
        </div>
        <div className="field">
          <div className="panel-box rows">
            <label className="row" style={{ ['--row-cols' as string]: ROW_COLS }}>
              <input type="radio" name="unicode-mode" checked={mode === 'unicode'} onChange={() => setMode('unicode')} />
              <strong>UC(U+…)</strong>
              <span className="field-hint">{t('The code is inside the keycode; up to U+7FFF (no emoji). No table needed.', 'Код прямо в keycode; до U+7FFF (без эмодзи). Таблица не нужна.')}</span>
              <span />
            </label>
            <label className="row" style={{ ['--row-cols' as string]: ROW_COLS }}>
              <input type="radio" name="unicode-mode" checked={mode === 'unicodemap'} onChange={() => setMode('unicodemap')} />
              <strong>UM(i) / UP(i, j)</strong>
              <span className="field-hint">
                {t(
                  'Keys refer to rows of the table below: any character, including emoji. UP gives a second character with Shift.',
                  'Клавиши ссылаются на строки таблицы ниже: любые символы, включая эмодзи. UP — второй символ с Shift.',
                )}
              </span>
              <span />
            </label>
          </div>
          {confirmMode && (
            <div className="notice" role="alert" style={{ borderColor: 'var(--danger-color)' }}>
              <span>
                {t(
                  `${highKeys} keys have values 0x8000–0xFFFF: in the other mode they mean different characters. Click the mode again to switch anyway.`,
                  `У ${highKeys} клавиш значения 0x8000–0xFFFF: в другом режиме они означают другие символы. Нажмите режим ещё раз, чтобы всё равно переключить.`,
                )}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            <Hint
              docs={QMK_DOCS.unicodeInputModes}
              tip={t(
                'A keyboard cannot send a character directly: it types a key sequence the operating system turns into the character, and every OS expects a different one. Pick the one for your computer.',
                'Клавиатура не может отправить символ напрямую: она набирает последовательность клавиш, которую система превращает в символ, и у каждой системы она своя. Выберите ту, что подходит вашему компьютеру.',
              )}
            >
              {t('input method on the computer', 'способ ввода на компьютере')}
            </Hint>
          </h2>
          <span className="kicker">UNICODE_SELECTED_MODES</span>
        </div>
        <p className="field-hint">
          {t(
            'The keyboard “types” a character with the method your system understands. Choose one or more; the first is the default, the UC_NEXT key switches between them (the choice is remembered).',
            'Клавиатура «печатает» символ способом, который понимает система. Выберите один или несколько: первый — по умолчанию, клавиша UC_NEXT переключает (выбор запоминается).',
          )}
        </p>
        <div className="panel-box rows">
          {INPUT_MODES.map((m) => {
            const on = selected.includes(m.id);
            return (
              <label key={m.id} className="row" style={{ ['--row-cols' as string]: ROW_COLS }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setInputModes(on ? selected.filter((x) => x !== m.id) : [...selected, m.id])}
                  {...whyDisabled(routeMode && t('Set by the text route in Advanced → Languages', 'Задано способом ввода текста в «Расширенное → Языки»'))}
                />
                <strong>{m.title}</strong>
                <span className="field-hint">{lang === 'ru' ? m.ru : m.en}</span>
                <span className="kicker">{on ? `#${selected.indexOf(m.id) + 1}` : ''}</span>
              </label>
            );
          })}
        </div>
        {!selected.length && <p className="field-hint">{t('Nothing chosen: QMK uses its default (macOS).', 'Ничего не выбрано: QMK возьмёт своё значение по умолчанию (macOS).')}</p>}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            <Hint
              docs={QMK_DOCS.unicodeSubsystems}
              tip={t(
                'The list of characters UM(i) and UP(i, j) refer to by row number. Only used in the “UM / UP” mode.',
                'Список символов, на которые ссылаются UM(i) и UP(i, j) по номеру строки. Используется только в режиме «UM / UP».',
              )}
            >
              {t('table', 'таблица')}
            </Hint>{' '}
            · {project.unicodeMap.length}
          </h2>
          {mode !== 'unicodemap' && <span className="badge badge--warn">{t('used only in table mode', 'используется только в режиме таблицы')}</span>}
        </div>
        {project.unicodeMap.length === 0 && (
          <EmptyState
            what={t('The table holds the characters that UM(i) and UP(i, j) keys type, one per row.', 'В таблице лежат символы, которые печатают клавиши UM(i) и UP(i, j), по одному на строку.')}
            example={t('Row 0 = “→” (U+2192): put UM(0) on a key to type an arrow.', 'Строка 0 = «→» (U+2192): поставьте UM(0) на клавишу, чтобы печатать стрелку.')}
          >
            {addButton}
          </EmptyState>
        )}
        {project.unicodeMap.length > 0 && (
          <ListFilter
            value={query}
            onChange={setQuery}
            label={t('Filter characters', 'Фильтр символов')}
            placeholder={t('Filter by name, character or code', 'Фильтр по имени, символу или коду')}
            shown={shownMap.length}
            total={project.unicodeMap.length}
          />
        )}
        {project.unicodeMap.length > 0 && shownMap.length === 0 && <p className="field-hint">{t('Nothing matches the filter.', 'Под фильтр ничего не подходит.')}</p>}
        {shownMap.length > 0 && (
          <div className="panel-box rows">
            {shownMap.map(({ u, i }) => (
              <div key={u.id} className="row" {...findAttr('unicode:' + u.id)} style={{ ['--row-cols' as string]: '50px 60px minmax(120px, 1fr) 110px 120px auto' }}>
                <span className="kicker">UM({i})</span>
                <CharInput codepoint={u.codepoint} onChange={(cp) => patch(u.id, { codepoint: cp }, t('character', 'символ'), `ucchar:${u.id}`)} />
                <input
                  className="input"
                  value={u.name}
                  onChange={(e) => patch(u.id, { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }, t('character name', 'имя символа'), `ucname:${u.id}`)}
                  aria-label={t('Name', 'Имя')}
                />
                <CodepointInput entry={u} onChange={(cp) => patch(u.id, { codepoint: cp }, t('code point', 'код символа'))} />
                <span className="field-hint">{i < 128 ? `UP(${i}, …)` : ''}</span>
                <button
                  className="icon-btn"
                  aria-label={t('Delete', 'Удалить')}
                  onClick={() => {
                    setTable(
                      project.unicodeMap.filter((x) => x.id !== u.id),
                      t('delete character', 'удаление символа'),
                    );
                    deletedToast(u.name || t('character', 'символ'));
                  }}
                >
                  <Trash2 {...ICON} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="field-row">
          {project.unicodeMap.length > 0 && addButton}
          <span className="field-hint">
            {t(
              'Paste a character into the first field or type its code. On a key: expression UM(0), or UP(0, 1) for “0, with Shift — 1”.',
              'Вставьте символ в первое поле или введите код. На клавишу: выражение UM(0), или UP(0, 1) — «0, а с Shift — 1».',
            )}
          </span>
        </div>
        <p className="field-hint">
          {t('Removing or reordering rows changes which characters keys refer to (by number).', 'Удаление строк сдвигает номера — клавиши начнут ссылаться на другие символы.')}
        </p>
      </section>
      <IssueList issues={issues} />
    </div>
  );
}
