/**
 * Advanced → Tap dance. Three kinds: slots (tap / hold / double tap / tap-then-hold, any keycode), every tap (steps
 * played at once, by the tap count, with Shift / Ctrl variants) and own C (the user's own functions).
 */
import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { checkTapDances } from '../../core/features/advanced';
import { newId } from '../../core/layout/geometry';
import { activeKeymap } from '../../core/project/ops';
import { tapDanceKind } from '../../core/project/tapDances';
import { TAP_DANCE_MAX_STEPS, TAP_DANCE_VARIANTS, type MacroStep, type Project, type TapDance, type TapDanceKind, type TapDanceOwnC, type TapDanceStep } from '../../core/project/types';
import { tapDanceReservedNames } from '../../core/qmk/generate';
import { t } from '../../i18n';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { MacroSteps } from '../macros/MacroSteps';
import { FeatureNote, IssueList, KeycodeField } from './common';

const ICON = { size: 14, strokeWidth: 1.5 };
const COLS = '40px minmax(120px,1fr) 150px 90px 32px';
// The slots / own C fields go on a line of their own under the name, wrapping when the panel is narrow.
const SLOT_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 'var(--gap)', padding: '0 var(--gap) var(--gap) calc(40px + var(--gap))' } as const;
type Variant = (typeof TAP_DANCE_VARIANTS)[number];

const kindTitle = (k: TapDanceKind) => (k === 'slots' ? t('Slots', 'Слоты') : k === 'every-tap' ? t('Every tap', 'Каждое нажатие') : t('Own C', 'Свой C'));
const variantTitle = (v: Variant) => (v === 'none' ? t('No mods', 'Без модификаторов') : v === 'shift' ? 'Shift' : v === 'ctrl' ? 'Ctrl' : 'Ctrl+Shift');
const OWN_C_FIELDS: { key: keyof TapDanceOwnC; label: () => string }[] = [
  { key: 'onEachTap', label: () => t('on each tap', 'на каждое нажатие') },
  { key: 'onFinished', label: () => t('on finished', 'по окончании') },
  { key: 'onReset', label: () => t('on reset', 'при сбросе') },
];

export function TapDanceTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const issues = useMemo(() => checkTapDances(spec, project.tapDances, tapDanceReservedNames(project, activeKeymap(project))), [spec, project]);
  const set = (tds: TapDance[], label: string, coalesce?: string) => apply((p) => ({ ...p, tapDances: tds }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, change: Partial<TapDance>, label: string, coalesce?: string) => set(project.tapDances.map((x) => (x.id === id ? { ...x, ...change } : x)), label, coalesce);
  const nextIndex = () => {
    let i = 0;
    while (project.tapDances.some((x) => x.index === i)) i++;
    return i;
  };
  const setKind = (td: TapDance, kind: TapDanceKind) =>
    // The other kinds' fields stay: switching back restores them.
    patch(td.id, { kind: kind === 'slots' ? undefined : kind, ...(kind === 'every-tap' && !td.steps?.length ? { steps: [{ none: [] }] } : {}), ...(kind === 'own-c' && !td.ownC ? { ownC: {} } : {}) }, t('tap dance kind', 'вид tap dance'));
  return (
    <div className="page">
      <FeatureNote project={project} feature="tap_dance" />
      <p className="field-hint">
        {t(
          'Each tap dance key TD(name) does different things by how it is tapped. Slots: one tap, hold, double tap, tap-then-hold, any keycode (empty = nothing; with no double tap and no tap + hold a tap fires at once on release). Every tap: each tap plays its step at once. Own C: your own functions.',
          'Каждая клавиша TD(имя) делает разное в зависимости от нажатий. Слоты: одно нажатие, удержание, двойное, нажатие+удержание, любой keycode (пусто — ничего; без двойного и нажатия+удержания нажатие срабатывает сразу при отпускании). Каждое нажатие: каждое нажатие сразу играет свой шаг. Свой C: ваши функции.',
        )}
      </p>
      <div className="panel-box">
        <div className="rows">
          <div className="row kicker" style={{ ['--row-cols' as string]: COLS }}>
            <span>#</span>
            <span>{t('name', 'имя')}</span>
            <span>{t('kind', 'вид')}</span>
            <span>{t('term, ms', 'время, мс')}</span>
            <span />
          </div>
          {project.tapDances.map((td) => {
            const kind = tapDanceKind(td);
            return (
              <div key={td.id} className="row-group">
                <div className="row" style={{ ['--row-cols' as string]: COLS }}>
                  <span className="num">{td.index}</span>
                  <input className="input" value={td.name} onChange={(e) => patch(td.id, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, '_') }, t('rename tap dance', 'имя tap dance'), `tdname:${td.id}`)} aria-label={t('Name', 'Имя')} />
                  <select className="select" value={kind} onChange={(e) => setKind(td, e.target.value as TapDanceKind)} aria-label={t('Kind', 'Вид')}>
                    {(['slots', 'every-tap', 'own-c'] as const).map((k) => (
                      <option key={k} value={k}>
                        {kindTitle(k)}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input input--num"
                    type="number"
                    min={50}
                    max={2000}
                    placeholder="—"
                    value={td.tappingTerm ?? ''}
                    onChange={(e) => patch(td.id, { tappingTerm: e.target.value ? Number(e.target.value) : undefined }, 'TD term', `tdterm:${td.id}`)}
                    aria-label={t('Tapping term', 'Время')}
                  />
                  <button className="icon-btn" aria-label={t('Delete', 'Удалить')} onClick={() => set(project.tapDances.filter((x) => x.id !== td.id), t('delete tap dance', 'удаление tap dance'))}>
                    <Trash2 {...ICON} />
                  </button>
                </div>
                {kind === 'slots' && (
                  <div style={SLOT_GRID}>
                    <SlotField title={t('tap', 'нажатие')} value={td.tap} onChange={(v) => patch(td.id, { tap: v }, 'TD tap')} />
                    <SlotField title={t('hold', 'удержание')} value={td.hold} onChange={(v) => patch(td.id, { hold: v }, 'TD hold')} />
                    <SlotField title={t('double tap', 'двойное')} value={td.doubleTap} onChange={(v) => patch(td.id, { doubleTap: v }, 'TD double')} />
                    <SlotField title={t('tap + hold', 'нажатие+удержание')} value={td.tapHold} onChange={(v) => patch(td.id, { tapHold: v }, 'TD tap-hold')} />
                  </div>
                )}
                {kind === 'own-c' && (
                  <div style={SLOT_GRID}>
                    {OWN_C_FIELDS.map((f) => (
                      <label key={f.key} className="field">
                        <span className="kicker">{f.label()}</span>
                        <input
                          className="input mono"
                          value={td.ownC?.[f.key] ?? ''}
                          placeholder="—"
                          aria-label={f.label()}
                          spellCheck={false}
                          onChange={(e) => patch(td.id, { ownC: { ...td.ownC, [f.key]: e.target.value.replace(/[^A-Za-z0-9_]/g, '') || undefined } }, t('own C function', 'своя функция C'), `tdc:${td.id}:${f.key}`)}
                        />
                      </label>
                    ))}
                  </div>
                )}
                {kind === 'every-tap' && <EveryTapSteps td={td} onSteps={(steps, label, coalesce) => patch(td.id, { steps }, label, coalesce)} />}
                {kind === 'own-c' && (
                  <p className="field-hint" style={{ padding: '0 var(--gap) var(--gap)' }}>
                    {t(
                      'Your functions: void name(tap_dance_state_t *state, void *user_data). Define them in your own lines (Firmware → keymap.c) or your own .c file.',
                      'Ваши функции: void имя(tap_dance_state_t *state, void *user_data). Определите их в своих строках (Прошивка → keymap.c) или своём .c файле.',
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="field-row">
        <button
          className="btn btn--primary"
          onClick={() => {
            const index = nextIndex();
            set([...project.tapDances, { id: newId('td'), index, name: `TD_${index}`, tap: 0, hold: 0, doubleTap: 0, tapHold: 0 }], t('new tap dance', 'новый tap dance'));
          }}
        >
          <Plus {...ICON} /> tap dance
        </button>
        <span className="field-hint">
          {t('Assign TD(…) to keys in the editor: catalog → “Tap dance” or the key composer.', 'Назначьте TD(…) клавишам в редакторе: каталог → «Tap dance» или конструктор клавиши.')}
        </span>
      </div>
      <IssueList issues={issues} />
    </div>
  );
}

function SlotField({ title, value, onChange }: { title: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span className="kicker">{title}</span>
      <KeycodeField value={value} label={title} onChange={onChange} />
    </div>
  );
}

/** The steps of an every-tap dance: one row per step, a column per Shift / Ctrl variant. */
function EveryTapSteps({ td, onSteps }: { td: TapDance; onSteps: (steps: TapDanceStep[], label: string, coalesce?: string) => void }) {
  const steps = td.steps ?? [];
  const setVariant = (i: number, v: Variant, value: MacroStep[] | undefined, label: string, coalesce?: string) =>
    onSteps(
      steps.map((st, j) => {
        if (j !== i) return st;
        const next = { ...st, [v]: value };
        if (value === undefined) delete next[v];
        return next;
      }),
      label,
      coalesce,
    );
  return (
    <div className="panel-box-body field">
      <p className="field-hint">
        {t(
          'Tap 1 plays step 1, tap 2 step 2 … then step 1 again, each at once. Shift or Ctrl held (either side, also one-shot) picks its column, played without that Shift / Ctrl. The term is the time for the next tap.',
          'Нажатие 1 играет шаг 1, нажатие 2 — шаг 2 … затем снова шаг 1, каждый сразу. Зажатый Shift или Ctrl (любой стороны, и one-shot) выбирает свой столбец, он играется без этого Shift / Ctrl. Время — срок для следующего нажатия.',
        )}
      </p>
      {steps.map((st, i) => (
        <div key={i} className="field">
          <div className="field-row">
            <span className="kicker">{t(`Step ${i + 1}`, `Шаг ${i + 1}`)}</span>
            <button className="icon-btn" disabled={steps.length <= 1} aria-label={t('Delete step', 'Удалить шаг')} onClick={() => onSteps(steps.filter((_, j) => j !== i), t('delete step', 'удаление шага'))}>
              <Trash2 {...ICON} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 'var(--gap)' }}>
            {TAP_DANCE_VARIANTS.map((v) => (
              <div key={v} className="panel-box">
                <div className="panel-box-head">
                  <span className="kicker">{variantTitle(v)}</span>
                </div>
                <div className="panel-box-body field">
                  {v !== 'none' && st[v] === undefined ? (
                    <div className="field-row">
                      <span className="field-hint">{t('Same as no mods (Shift / Ctrl kept).', 'Как без модификаторов (Shift / Ctrl остаются).')}</span>
                      <button className="btn btn--ghost" onClick={() => setVariant(i, v, [], t('own steps', 'свои шаги'))}>
                        {t('own steps', 'свои шаги')}
                      </button>
                    </div>
                  ) : (
                    <MacroSteps
                      steps={st[v] ?? []}
                      keys="any"
                      coalesceKey={`tdstep:${td.id}:${i}:${v}`}
                      emptyHint={t('Nothing: this tap types nothing.', 'Ничего: это нажатие ничего не набирает.')}
                      onChange={(list, label, coalesce) => setVariant(i, v, list, label, coalesce)}
                      actions={
                        v !== 'none' && (
                          <button className="btn btn--ghost" onClick={() => setVariant(i, v, undefined, t('same as no mods', 'как без модификаторов'))}>
                            {t('same as no mods', 'как без модификаторов')}
                          </button>
                        )
                      }
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="field-row">
        <button className="btn" disabled={steps.length >= TAP_DANCE_MAX_STEPS} onClick={() => onSteps([...steps, { none: [] }], t('add step', 'новый шаг'))}>
          <Plus {...ICON} /> {t('step', 'шаг')}
        </button>
      </div>
    </div>
  );
}
