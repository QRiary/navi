/**
 * Advanced → Tap-hold: per-key flavor, tapping term, quick tap term and “hold when pressed” keys of mod-tap and
 * layer-tap keycodes. A setting belongs to the keycode: every key with it shares the setting.
 */
import { useMemo } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { newId } from '../../core/layout/geometry';
import { activeKeymap } from '../../core/project/ops';
import { checkTapHolds, HOLD_ON_KEYS_MAX, isTapHoldKeycode, TAP_HOLD_MAX, TAP_HOLD_TERM_MAX, TAP_HOLD_TERM_MIN, tapHoldUsage } from '../../core/project/tapHolds';
import type { Project, TapHoldSetting } from '../../core/project/types';
import { t } from '../../i18n';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { IssueList, KeycodeField } from './common';

const ICON = { size: 14, strokeWidth: 1.5 };
// The number columns match .input--num (76px); the hold-keys column fits at least one key (150px field + its ×) and the +.
const COLS = 'minmax(130px,1fr) 150px 76px 76px minmax(230px,1.8fr) 32px 32px';
type Flavor = NonNullable<TapHoldSetting['flavor']>;

const flavorTitle = (f: Flavor | '') =>
  f === 'tap-preferred' ? t('Tap preferred', 'Приоритет нажатия') : f === 'balanced' ? t('Balanced', 'Сбалансированный') : f === 'hold-preferred' ? t('Hold preferred', 'Приоритет удержания') : t('Default (global)', 'По умолчанию (общий)');

export function TapHoldTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const issues = useMemo(() => checkTapHolds(spec, project), [spec, project]);
  const set = (list: TapHoldSetting[], label: string, coalesce?: string) => apply((p) => ({ ...p, tapHolds: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, change: Partial<TapHoldSetting>, label: string, coalesce?: string) => set(project.tapHolds.map((x) => (x.id === id ? { ...x, ...change } : x)), label, coalesce);
  const term = (v: string) => (v === '' ? undefined : Number(v));
  // The first tap-hold keycode of the keymap that has no setting yet.
  const nextKeycode = (): number => {
    const have = new Set(project.tapHolds.map((x) => x.keycode));
    for (const layer of activeKeymap(project).layers) for (const v of layer.keys) if (isTapHoldKeycode(spec, v) && !have.has(v)) return v;
    return 0;
  };
  return (
    <div className="page">
      <p className="field-hint">
        {t(
          'Settings belong to a keycode, not to one key: every key with the same mod-tap (LSFT_T(KC_F)) or layer-tap (LT(1, KC_SPC)) keycode shares them. Empty = the global setting from Behavior (config.h).',
          'Настройки относятся к keycode, а не к одной клавише: их делят все клавиши с тем же mod-tap (LSFT_T(KC_F)) или layer-tap (LT(1, KC_SPC)). Пусто — общая настройка из «Поведение (config.h)».',
        )}
      </p>
      <div className="panel-box">
        <div className="rows">
          <div className="row kicker" style={{ ['--row-cols' as string]: COLS }}>
            <span>{t('key', 'клавиша')}</span>
            <span>{t('flavor', 'режим')}</span>
            <span>{t('term, ms', 'время, мс')}</span>
            <span>{t('quick tap, ms', 'quick tap, мс')}</span>
            <span>{t('hold when pressed', 'удержание при нажатии')}</span>
            <span>{t('keys', 'клавиш')}</span>
            <span />
          </div>
          {project.tapHolds.map((s) => (
            <div key={s.id} className="row" style={{ ['--row-cols' as string]: COLS }}>
              <KeycodeField value={s.keycode} label={t('key', 'клавиша')} onChange={(v) => patch(s.id, { keycode: v }, t('tap-hold key', 'клавиша тап-холд'))} />
              <select
                className="select"
                value={s.flavor ?? ''}
                aria-label={t('Flavor', 'Режим')}
                onChange={(e) => patch(s.id, { flavor: e.target.value === '' ? undefined : (e.target.value as Flavor) }, t('tap-hold flavor', 'режим тап-холд'))}
              >
                {(['', 'tap-preferred', 'balanced', 'hold-preferred'] as const).map((f) => (
                  <option key={f} value={f}>
                    {flavorTitle(f)}
                  </option>
                ))}
              </select>
              <input
                className="input input--num"
                type="number"
                min={TAP_HOLD_TERM_MIN}
                max={TAP_HOLD_TERM_MAX}
                placeholder="—"
                value={s.tappingTerm ?? ''}
                onChange={(e) => patch(s.id, { tappingTerm: term(e.target.value) }, t('tap-hold term', 'время тап-холд'), `thterm:${s.id}`)}
                aria-label={t('Tapping term', 'Время')}
              />
              <input
                className="input input--num"
                type="number"
                min={0}
                max={TAP_HOLD_TERM_MAX}
                placeholder="—"
                value={s.quickTapTerm ?? ''}
                onChange={(e) => patch(s.id, { quickTapTerm: term(e.target.value) }, t('tap-hold quick tap', 'quick tap тап-холд'), `thquick:${s.id}`)}
                aria-label={t('Quick tap term', 'Quick tap')}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {(s.holdOnKeys ?? []).map((k, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flex: 'none' }}>
                    <KeycodeField
                      value={k}
                      label={t('hold when pressed', 'удержание при нажатии')}
                      onChange={(v) => patch(s.id, { holdOnKeys: (s.holdOnKeys ?? []).map((x, j) => (j === i ? v : x)) }, t('tap-hold key list', 'список тап-холд'))}
                    />
                    <button
                      className="icon-btn"
                      aria-label={t('Remove', 'Убрать')}
                      onClick={() => {
                        const rest = (s.holdOnKeys ?? []).filter((_, j) => j !== i);
                        patch(s.id, { holdOnKeys: rest.length ? rest : undefined }, t('tap-hold key list', 'список тап-холд'));
                      }}
                    >
                      <X {...ICON} />
                    </button>
                  </span>
                ))}
                <button
                  className="icon-btn"
                  aria-label={t('Add a key', 'Добавить клавишу')}
                  disabled={(s.holdOnKeys?.length ?? 0) >= HOLD_ON_KEYS_MAX}
                  onClick={() => patch(s.id, { holdOnKeys: [...(s.holdOnKeys ?? []), 0] }, t('tap-hold key list', 'список тап-холд'))}
                >
                  <Plus {...ICON} />
                </button>
              </div>
              <span className="num">{tapHoldUsage(project, s.keycode)}</span>
              <button className="icon-btn" aria-label={t('Delete', 'Удалить')} onClick={() => set(project.tapHolds.filter((x) => x.id !== s.id), t('delete tap-hold setting', 'удаление настройки тап-холд'))}>
                <Trash2 {...ICON} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="field-row">
        <button
          className="btn btn--primary"
          disabled={project.tapHolds.length >= TAP_HOLD_MAX}
          onClick={() => set([...project.tapHolds, { id: newId('th'), keycode: nextKeycode() }], t('new tap-hold setting', 'новая настройка тап-холд'))}
        >
          <Plus {...ICON} /> {t('setting', 'настройка')}
        </button>
        <span className="field-hint">
          {t(
            'Tap preferred: a hold only after the tapping term. Balanced: a hold if another key is pressed and released inside the term. Hold preferred: a hold as soon as another key is pressed. “Hold when pressed”: these keys make it a hold at once.',
            'Приоритет нажатия: удержание только после времени. Сбалансированный: удержание, если другая клавиша нажата и отпущена в пределах времени. Приоритет удержания: удержание сразу, как нажата другая клавиша. «Удержание при нажатии»: эти клавиши сразу делают удержание.',
          )}
        </span>
      </div>
      <IssueList issues={issues} />
    </div>
  );
}
