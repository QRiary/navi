/**
 * Unicode: how the keyboard types characters (UC — the code is inside the keycode, up to U+7FFF; the UM/UP table —
 * any characters, emoji included), the input method on the computer (UNICODE_SELECTED_MODES) and the table.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { checkUnicodeMap } from '../../core/features/advanced';
import { newId } from '../../core/layout/geometry';
import type { Project, UnicodeEntry } from '../../core/project/types';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { FeatureNote, IssueList } from './common';
import { getLanguage, t } from '../../i18n';
import { deletedToast } from '../../lib/undoToast';

const ICON = { size: 14, strokeWidth: 1.5 };

/** Unicode input methods in QMK (quantum/unicode/unicode.h). The order is the UC_NEXT switching order. */
const INPUT_MODES: { id: string; title: string; en: string; ru: string }[] = [
  { id: 'UNICODE_MODE_WINCOMPOSE', title: 'Windows · WinCompose', en: 'Needs the free WinCompose app. Recommended on Windows: any character, works everywhere.', ru: 'Нужна бесплатная программа WinCompose. Лучший вариант для Windows: любые символы, работает везде.' },
  { id: 'UNICODE_MODE_WINDOWS', title: 'Windows · HexNumpad', en: 'Built into Windows after a registry change (EnableHexNumpad); only up to U+FFFF, not in every app.', ru: 'Встроено в Windows после правки реестра (EnableHexNumpad); только до U+FFFF, не во всех программах.' },
  { id: 'UNICODE_MODE_LINUX', title: 'Linux · IBus', en: 'Ctrl+Shift+U input (IBus, GTK).', ru: 'Ввод через Ctrl+Shift+U (IBus, GTK).' },
  { id: 'UNICODE_MODE_MACOS', title: 'macOS', en: 'Needs the “Unicode Hex Input” keyboard layout.', ru: 'Нужна раскладка «Unicode Hex Input».' },
  { id: 'UNICODE_MODE_BSD', title: 'BSD', en: 'Not implemented in QMK yet (placeholder).', ru: 'В QMK пока не реализован (заготовка).' },
  { id: 'UNICODE_MODE_EMACS', title: 'Emacs', en: 'C-x 8 RET in Emacs.', ru: 'C-x 8 RET в Emacs.' },
];

const ROW_COLS = '24px minmax(150px, 0.5fr) minmax(0, 1.5fr) 44px';

const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
const printable = (cp: number) => (cp >= 0x20 && !(cp >= 0x7f && cp < 0xa0) && !(cp >= 0xd800 && cp <= 0xdfff) && cp <= 0x10ffff ? String.fromCodePoint(cp) : '');

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
  const selected = String(project.firmware.buildConfig.UNICODE_SELECTED_MODES ?? '')
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
  const setTable = (list: UnicodeEntry[], label: string, coalesce?: string) => apply((p) => ({ ...p, unicodeMap: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<UnicodeEntry>, label: string, coalesce?: string) => setTable(project.unicodeMap.map((x) => (x.id === id ? { ...x, ...p } : x)), label, coalesce);

  return (
    <div className="page">
      <FeatureNote project={project} feature={mode === 'unicodemap' ? 'unicodemap' : 'unicode'} />

      <section className="section">
        <div className="section-head">
          <h2>{t('how keys carry characters', 'как клавиши хранят символы')}</h2>
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
                {t('Keys refer to rows of the table below: any character, including emoji. UP gives a second character with Shift.', 'Клавиши ссылаются на строки таблицы ниже: любые символы, включая эмодзи. UP — второй символ с Shift.')}
              </span>
              <span />
            </label>
          </div>
          {confirmMode && (
            <div className="notice" style={{ borderColor: 'var(--danger-color)' }}>
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
          <h2>{t('input method on the computer', 'способ ввода на компьютере')}</h2>
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
                <input type="checkbox" checked={on} onChange={() => setInputModes(on ? selected.filter((x) => x !== m.id) : [...selected, m.id])} />
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
            {t('table', 'таблица')} · {project.unicodeMap.length}
          </h2>
          {mode !== 'unicodemap' && <span className="badge badge--warn">{t('used only in table mode', 'используется только в режиме таблицы')}</span>}
        </div>
        <div className="panel-box rows">
          {project.unicodeMap.map((u, i) => (
            <div key={u.id} className="row" style={{ ['--row-cols' as string]: '50px 60px minmax(120px, 1fr) 110px 120px auto' }}>
              <span className="kicker">UM({i})</span>
              <input
                className="input"
                style={{ width: 52, textAlign: 'center', fontSize: 'var(--fs-lg, 18px)' }}
                value={printable(u.codepoint)}
                onChange={(e) => {
                  const cp = e.target.value.codePointAt(0);
                  if (cp !== undefined) patch(u.id, { codepoint: cp }, t('character', 'символ'), `ucchar:${u.id}`);
                }}
                aria-label={t('Character', 'Символ')}
              />
              <input className="input" value={u.name} onChange={(e) => patch(u.id, { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }, t('character name', 'имя символа'), `ucname:${u.id}`)} aria-label={t('Name', 'Имя')} />
              <CodepointInput entry={u} onChange={(cp) => patch(u.id, { codepoint: cp }, t('code point', 'код символа'))} />
              <span className="field-hint">{i < 128 ? `UP(${i}, …)` : ''}</span>
              <button className="icon-btn" aria-label={t('Delete', 'Удалить')} onClick={() => { setTable(project.unicodeMap.filter((x) => x.id !== u.id), t('delete character', 'удаление символа')); deletedToast(u.name || t('character', 'символ')); }}>
                <Trash2 {...ICON} />
              </button>
            </div>
          ))}
        </div>
        <div className="field-row">
          <button className="btn btn--primary" disabled={project.unicodeMap.length >= 0x4000} onClick={() => setTable([...project.unicodeMap, { id: newId('uc'), name: `CHAR_${project.unicodeMap.length}`, codepoint: 0x2192 }], t('new character', 'новый символ'))}>
            <Plus {...ICON} /> {t('character', 'символ')}
          </button>
          <span className="field-hint">
            {t('Paste a character into the first field or type its code. On a key: expression UM(0), or UP(0, 1) for “0, with Shift — 1”.', 'Вставьте символ в первое поле или введите код. На клавишу: выражение UM(0), или UP(0, 1) — «0, а с Shift — 1».')}
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
