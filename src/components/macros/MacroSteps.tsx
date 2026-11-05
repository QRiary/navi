/**
 * A list of macro steps (text, tap, press, release, pause) with add / move / delete. Used by the Macros section
 * (basic keys only: VIA's macro format) and by every-tap tap dances (any keycode: played by the firmware).
 */
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { BasicKeySelect } from '../keyboard/KeycodeComposer';
import { KeycodeField } from '../advanced/common';
import type { MacroStep } from '../../core/project/types';
import { useSpec } from '../../store/projectStore';
import { t } from '../../i18n';
import { deletedToast } from '../../lib/undoToast';
import { whyDisabled } from '../../lib/whyDisabled';

const ICON = { size: 14, strokeWidth: 1.5 };

/** basic: a picker of basic keys (VIA macros); any: any QMK keycode as an expression. */
export type StepKeys = 'basic' | 'any';

function StepEditor({ step, keys, onChange }: { step: MacroStep; keys: StepKeys; onChange: (s: MacroStep) => void }) {
  const spec = useSpec();
  const typeSelect = (
    <select
      className="select"
      style={{ flexShrink: 0 }}
      value={step.type}
      onChange={(e) => {
        const type = e.target.value as MacroStep['type'];
        if (type === 'text') onChange({ type, text: '' });
        else if (type === 'delay') onChange({ type, ms: 100 });
        else onChange({ type, keycode: 'keycode' in step ? step.keycode : 0x04 });
      }}
      aria-label={t('Step type', 'Тип шага')}
    >
      <option value="text">{t('type text', 'набрать текст')}</option>
      <option value="tap">{t('tap key', 'нажать и отпустить')}</option>
      <option value="down">{t('hold key', 'зажать клавишу')}</option>
      <option value="up">{t('release key', 'отпустить клавишу')}</option>
      <option value="delay">{t('pause', 'пауза')}</option>
    </select>
  );
  const isKey = step.type === 'tap' || step.type === 'down' || step.type === 'up';
  return (
    <div className="field-row" style={{ flex: 1, flexWrap: 'nowrap', minWidth: 0 }}>
      {typeSelect}
      {step.type === 'text' && (
        <input
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          value={step.text}
          onChange={(e) => onChange({ type: 'text', text: e.target.value })}
          placeholder="git status"
          aria-label={t('Text', 'Текст')}
          spellCheck={false}
        />
      )}
      {isKey && keys === 'basic' && <BasicKeySelect spec={spec} value={step.keycode} label={t('Key', 'Клавиша')} onChange={(keycode) => onChange({ type: step.type, keycode })} />}
      {isKey && keys === 'any' && <KeycodeField value={step.keycode} label={t('Key', 'Клавиша')} onChange={(keycode) => onChange({ type: step.type, keycode })} />}
      {step.type === 'delay' && (
        <label className="field-hint">
          <input className="input input--num" type="number" min={1} max={9999} value={step.ms} onChange={(e) => onChange({ type: 'delay', ms: Number(e.target.value) })} /> {t('ms', 'мс')}
        </label>
      )}
    </div>
  );
}

export function MacroSteps({
  steps,
  keys,
  onChange,
  coalesceKey,
  actions,
  emptyHint = t('No steps yet.', 'Шагов пока нет.'),
}: {
  steps: MacroStep[];
  keys: StepKeys;
  /** coalesce: typing in one step's field is one undo step. */
  onChange: (steps: MacroStep[], label: string, coalesce?: string) => void;
  coalesceKey: string;
  /** Extra buttons after the “add” ones. */
  actions?: ReactNode;
  emptyHint?: ReactNode;
}) {
  const move = (i: number, j: number) =>
    onChange(
      steps.map((x, k) => (k === i ? steps[j] : k === j ? steps[i] : x)),
      t('move step', 'перестановка'),
    );
  return (
    <>
      {steps.map((s, i) => (
        <div key={i} className="field-row" style={{ flexWrap: 'nowrap' }}>
          <span className="num kicker" style={{ width: 22 }}>
            {i + 1}
          </span>
          <StepEditor
            step={s}
            keys={keys}
            onChange={(ns) =>
              onChange(
                steps.map((x, j) => (j === i ? ns : x)),
                t('edit step', 'шаг макроса'),
                `${coalesceKey}:${i}`,
              )
            }
          />
          <button className="icon-btn" {...whyDisabled(i === 0 && t('Already the first step', 'Уже первый шаг'))} aria-label={t('Up', 'Выше')} onClick={() => move(i, i - 1)}>
            <ArrowUp {...ICON} />
          </button>
          <button className="icon-btn" {...whyDisabled(i === steps.length - 1 && t('Already the last step', 'Уже последний шаг'))} aria-label={t('Down', 'Ниже')} onClick={() => move(i, i + 1)}>
            <ArrowDown {...ICON} />
          </button>
          <button
            className="icon-btn"
            aria-label={t('Delete step', 'Удалить шаг')}
            onClick={() => {
              onChange(
                steps.filter((_, j) => j !== i),
                t('delete step', 'удаление шага'),
              );
              deletedToast(t('macro step', 'шаг макроса'));
            }}
          >
            <Trash2 {...ICON} />
          </button>
        </div>
      ))}
      {steps.length === 0 && emptyHint && <p className="field-hint">{emptyHint}</p>}
      <div className="field-row">
        <button className="btn" onClick={() => onChange([...steps, { type: 'text', text: '' }], t('add step', 'новый шаг'))}>
          <Plus {...ICON} /> {t('text', 'текст')}
        </button>
        <button className="btn" onClick={() => onChange([...steps, { type: 'tap', keycode: 0x28 }], t('add step', 'новый шаг'))}>
          <Plus {...ICON} /> {t('key', 'клавиша')}
        </button>
        <button className="btn" onClick={() => onChange([...steps, { type: 'delay', ms: 100 }], t('add step', 'новый шаг'))}>
          <Plus {...ICON} /> {t('pause', 'пауза')}
        </button>
        {actions}
      </div>
    </>
  );
}
