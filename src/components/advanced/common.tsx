/**
 * Shared parts of the Advanced section: a validated keycode field, a list of problems, a badge
 * “does the feature work in the current firmware and is it on in your build”.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, LayoutGrid } from 'lucide-react';
import { decode, tryParseQmk } from '../../core/keycodes/codec';
import { friendlyName, type FriendlyName } from '../../core/keycodes/friendly';
import { selectedKeycode } from '../../lib/keymapActions';
import { useEditorStore } from '../../store/editorStore';
import { KeycodePopover } from '../keyboard/KeycodePopover';
import type { AdvancedIssue } from '../../core/features/advanced';
import { buildNote } from '../../core/features/buildNote';
import type { FeatureId } from '../../core/features/registry';
import { whyDisabled } from '../../lib/whyDisabled';
import type { CustomAction, Project } from '../../core/project/types';
import { hardwareFacts } from '../../lib/hardwareFacts';
import { useLabelContext } from '../../lib/projectContext';
import { href } from '../../lib/router';
import { useSpec } from '../../store/projectStore';
import { getLanguage, t } from '../../i18n';

/**
 * Keycode field: a validated QMK expression, what it means next to it ("Space · hold Num", "unknown" or the parse
 * error), a button opening the keycode catalog, and (`fromKeyboard`) one taking the keycode of the key selected on
 * the Keyboard page's shown layer.
 */
export function KeycodeField({ value, onChange, label, fromKeyboard = true }: { value: number; onChange: (v: number) => void; label: string; fromKeyboard?: boolean }) {
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const name = labelCtx ? friendlyName(spec, value, labelCtx) : null;
  const qmk = name?.qmk ?? '';
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const pickBtn = useRef<HTMLButtonElement>(null);
  const closePicker = useCallback(() => setPicking(false), []);
  const selection = useEditorStore((s) => s.selection);
  const layer = useEditorStore((s) => s.layer);
  // Recomputed when the selection or the shown layer changes (the store getter reads them).
  const selected = useMemo(() => (fromKeyboard ? selectedKeycode() : null), [fromKeyboard, selection, layer, labelCtx]);
  const shown = text ?? (value ? qmk : '');
  const typed = text !== null && text.trim() ? tryParseQmk(spec, text) : null;
  const preview = (() => {
    if (error) return error;
    if (typed) return 'value' in typed && labelCtx ? meaning(friendlyName(spec, typed.value, labelCtx), typed.value) : '';
    return value && name ? meaning(name, value) : '';
  })();
  return (
    <span className="kc-field">
      <form
        className={`expr-input ${error ? 'is-error' : ''}`}
        style={{ minWidth: 96 }}
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          value={shown}
          placeholder="KC_NO"
          aria-label={label}
          spellCheck={false}
          title={name && value ? `${name.text}\n${name.qmk}` : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit()}
        />
        {preview && (
          <span className="expr-result" title={preview}>
            {preview}
          </span>
        )}
      </form>
      <button
        ref={pickBtn}
        type="button"
        className="icon-btn"
        aria-label={t('Pick from the catalog', 'Выбрать из каталога')}
        title={t('Pick from the catalog', 'Выбрать из каталога')}
        aria-expanded={picking}
        onClick={() => setPicking((p) => !p)}
      >
        <LayoutGrid size={14} strokeWidth={1.5} />
      </button>
      {fromKeyboard && (
        <button
          type="button"
          className="icon-btn"
          aria-label={t('Take the selected key', 'Взять выбранную клавишу')}
          {...whyDisabled(
            !selected && t('Select a key on the Keyboard page to take its keycode', 'Выберите клавишу на странице «Клавиатура», чтобы взять её keycode'),
            selected && labelCtx
              ? t(
                  `Take the key selected on the Keyboard page (layer ${selected.layer}): ${friendlyName(spec, selected.keycode, labelCtx).text}`,
                  `Взять клавишу, выбранную на странице «Клавиатура» (слой ${selected.layer}): ${friendlyName(spec, selected.keycode, labelCtx).text}`,
                )
              : undefined,
          )}
          onClick={() => selected && set(selected.keycode)}
        >
          <Keyboard size={14} strokeWidth={1.5} />
        </button>
      )}
      {picking && (
        <KeycodePopover
          anchor={pickBtn}
          current={value}
          onClose={closePicker}
          onPick={(v) => {
            set(v);
            setPicking(false);
          }}
        />
      )}
    </span>
  );
  function meaning(n: FriendlyName, v: number): string {
    if (n.text !== n.qmk) return n.text;
    return decode(spec, v).kind === 'unknown' ? t('unknown', 'неизвестно') : '';
  }
  function set(v: number) {
    onChange(v);
    setText(null);
    setError(null);
  }
  function commit() {
    if (text === null) return;
    if (!text.trim()) {
      onChange(0);
      setText(null);
      setError(null);
      return;
    }
    const r = tryParseQmk(spec, text);
    if ('error' in r) setError(r.error);
    else {
      onChange(r.value);
      setText(null);
      setError(null);
    }
  }
}

/** One item of a chip list: a key (shown as its QMK name) or a named key list. */
export type KeyChip = { kind: 'key'; value: number } | { kind: 'list'; id: string; name: string };

/**
 * Keys as compact chips (× removes one) with a field at the end that adds a key on Enter; `extra` sits after it
 * (the “+ list” picker). Used for a tap-hold setting's keys and hold keys, and for a key list's keys.
 */
export function KeyChips({
  items,
  onRemove,
  onAdd,
  label,
  full,
  extra,
}: {
  items: KeyChip[];
  onRemove: (index: number) => void;
  onAdd: (v: number) => void;
  label: string;
  /** Why no key can be added (the list is full): disables the “+ key” box with this as its tooltip. */
  full?: string | false;
  extra?: ReactNode;
}) {
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    if (!text.trim()) return setError(null);
    const r = tryParseQmk(spec, text);
    if ('error' in r) return setError(r.error);
    onAdd(r.value);
    setText('');
    setError(null);
  };
  return (
    <div className="key-chips">
      {items.map((c, i) => (
        <span
          key={c.kind === 'list' ? `l:${c.id}` : `k:${i}`}
          className={`key-chip ${c.kind === 'list' ? 'key-chip--list' : ''}`}
          title={c.kind === 'list' ? t('key list', 'список клавиш') : labelCtx ? friendlyName(spec, c.value, labelCtx).qmk : undefined}
        >
          {c.kind === 'list' ? c.name || '—' : labelCtx ? friendlyName(spec, c.value, labelCtx).text : ''}
          <button className="key-chip-x" aria-label={t('Remove', 'Убрать')} onClick={() => onRemove(i)}>
            ×
          </button>
        </span>
      ))}
      <form
        className={`key-chip-add ${error ? 'is-error' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={text}
          placeholder={t('+ key', '+ клавиша')}
          aria-label={label}
          spellCheck={false}
          {...whyDisabled(full, error ?? undefined)}
          onChange={(e) => setText(e.target.value)}
          onBlur={add}
        />
      </form>
      {extra}
    </div>
  );
}

export function IssueList({ issues }: { issues: AdvancedIssue[] }) {
  const lang = getLanguage();
  if (!issues.length) return <p className="status-ok">ok · {t('no problems found', 'проблем не найдено')}</p>;
  return (
    <ul className="issue-list">
      {issues.map((i, n) => (
        <li key={n} className={`issue issue--${i.level}`}>
          <span className="issue-where">{i.where}</span>
          {lang === 'ru' ? i.message.ru : i.message.en}
        </li>
      ))}
    </ul>
  );
}

/**
 * The firmware-status sentence at the top of an Advanced tab: is the feature in the user's build, why, and what it
 * takes to work on the keyboard (`buildNote`). `firstUse` finishes "…turns on by itself when you …".
 */
export function FeatureNote({ project, feature, firstUse }: { project: Project; feature: FeatureId; firstUse?: { en: string; ru: string } }) {
  const spec = useSpec();
  const note = buildNote(project, feature, spec, hardwareFacts(project), firstUse);
  const lang = getLanguage();
  return (
    <div className="notice">
      <span>
        {lang === 'ru' ? note.text.ru : note.text.en} <a href={href({ section: 'firmware', tab: 'features' })}>{t('Firmware features', 'Функции прошивки')}</a>
      </span>
    </div>
  );
}

/** Action: type a string (SEND_STRING) / press a key (tap_code16) / nothing. */
export function ActionEditor({ action, onChange, coalesceKey }: { action: CustomAction; onChange: (a: CustomAction, coalesce?: string) => void; coalesceKey: string }) {
  return (
    <>
      <select
        className="select"
        value={action.type}
        onChange={(e) => onChange(e.target.value === 'send-string' ? { type: 'send-string', text: '' } : e.target.value === 'tap' ? { type: 'tap', keycode: 0x04 } : { type: 'none' })}
        aria-label={t('Action', 'Действие')}
      >
        <option value="none">{t('no code', 'без кода')}</option>
        <option value="send-string">{t('type text', 'набрать текст')}</option>
        <option value="tap">{t('press a key', 'нажать клавишу')}</option>
      </select>
      {action.type === 'send-string' ? (
        <input
          className="input"
          value={action.text}
          onChange={(e) => onChange({ type: 'send-string', text: e.target.value }, `${coalesceKey}:text`)}
          placeholder="hello"
          spellCheck={false}
          aria-label={t('Text', 'Текст')}
        />
      ) : action.type === 'tap' ? (
        <KeycodeField value={action.keycode} label={t('Key', 'Клавиша')} onChange={(v) => onChange({ type: 'tap', keycode: v })} />
      ) : (
        <span className="field-hint">{t('handle it in your own code', 'обработайте в своём коде')}</span>
      )}
    </>
  );
}
