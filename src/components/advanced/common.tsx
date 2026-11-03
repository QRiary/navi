/**
 * Shared parts of the Advanced section: a validated keycode field, a list of problems, a badge
 * “does the feature work in the current firmware and is it on in your build”.
 */
import { useState } from 'react';
import { tryParseQmk } from '../../core/keycodes/codec';
import { keyLabel } from '../../core/keycodes/labels';
import type { AdvancedIssue } from '../../core/features/advanced';
import { featureStatus, type FeatureId } from '../../core/features/registry';
import type { CustomAction, Project } from '../../core/project/types';
import { hardwareFacts } from '../../lib/hardwareFacts';
import { useLabelContext } from '../../lib/projectContext';
import { href } from '../../lib/router';
import { useSpec } from '../../store/projectStore';
import { StatusChip } from '../inspector/KeyInspector';
import { getLanguage, t } from '../../i18n';

/** Keycode field: a validated QMK expression. */
export function KeycodeField({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const qmk = labelCtx ? keyLabel(spec, value, labelCtx).qmk : '';
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = text ?? (value ? qmk : '');
  return (
    <form
      className={`expr-input ${error ? 'is-error' : ''}`}
      style={{ minWidth: 150 }}
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input value={shown} placeholder="KC_NO" aria-label={label} spellCheck={false} onChange={(e) => setText(e.target.value)} onBlur={() => commit()} />
      {error && <span className="expr-result">{error}</span>}
    </form>
  );
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

export function FeatureNote({ project, feature }: { project: Project; feature: FeatureId }) {
  const st = featureStatus(feature, project.firmware.flags, hardwareFacts(project));
  const lang = getLanguage();
  const build = project.firmware.buildFeatures[feature];
  return (
    <div className="notice">
      <span>
        {t('Current firmware', 'Текущая прошивка')}: <StatusChip state={st.state} likely={st.likely} text={lang === 'ru' ? st.reason.ru : st.reason.en} /> · {t('your build', 'ваша сборка')}:{' '}
        <strong>{build ? t('enabled', 'включено') : t('off', 'выключено')}</strong> ({' '}
        <a href={href({ section: 'firmware', tab: 'features' })}>{t('change', 'изменить')}</a> ){' '}
        — {t('defined in keymap.c, works after building and flashing your firmware.', 'задаётся в keymap.c, работает после сборки и прошивки вашей прошивки.')}
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
        <input className="input" value={action.text} onChange={(e) => onChange({ type: 'send-string', text: e.target.value }, `${coalesceKey}:text`)} placeholder="hello" spellCheck={false} aria-label={t('Text', 'Текст')} />
      ) : action.type === 'tap' ? (
        <KeycodeField value={action.keycode} label={t('Key', 'Клавиша')} onChange={(v) => onChange({ type: 'tap', keycode: v })} />
      ) : (
        <span className="field-hint">{t('handle it in your own code', 'обработайте в своём коде')}</span>
      )}
    </>
  );
}
