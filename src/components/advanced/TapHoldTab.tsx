/**
 * Advanced → Tap-hold: per-key flavor, tapping term, quick tap term and “hold when pressed” keys of mod-tap and
 * layer-tap keycodes. A setting holds one or more keycodes: every key with one of them shares the setting.
 * Hold keys are single keys and/or named key lists (top block) that several settings point to.
 */
import { useMemo, useState } from 'react';
import { ListPlus, Plus, Trash2 } from 'lucide-react';
import { newId } from '../../core/layout/geometry';
import { activeKeymap } from '../../core/project/ops';
import {
  checkTapHolds,
  HOLD_ON_KEYS_MAX,
  isTapHoldKeycode,
  KEY_LIST_KEYS_MAX,
  KEY_LIST_NAME_MAX,
  KEY_LISTS_MAX,
  keyListUsage,
  removeKeyList,
  TAP_HOLD_KEYCODES_MAX,
  TAP_HOLD_MAX,
  TAP_HOLD_TERM_MAX,
  TAP_HOLD_TERM_MIN,
  tapHoldUsage,
} from '../../core/project/tapHolds';
import type { KeyList, Project, TapHoldSetting } from '../../core/project/types';
import { t } from '../../i18n';
import { deletedToast } from '../../lib/undoToast';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { IssueList, KeyChips, type KeyChip } from './common';

const ICON = { size: 14, strokeWidth: 1.5 };
// The number columns match .input--num (76px); the keys wrap their chips. Hold keys get their own line under the row.
const COLS = 'minmax(0,1fr) 150px 76px 76px 40px 32px 32px';
const LIST_COLS = '180px minmax(0,1fr) 72px 32px';
type Flavor = NonNullable<TapHoldSetting['flavor']>;

const flavorTitle = (f: Flavor | '') =>
  f === 'tap-preferred'
    ? t('Tap preferred', 'Приоритет нажатия')
    : f === 'balanced'
      ? t('Balanced', 'Сбалансированный')
      : f === 'hold-preferred'
        ? t('Hold preferred', 'Приоритет удержания')
        : t('Default (global)', 'По умолчанию (общий)');

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((k) => b.includes(k)) && b.every((k) => a.includes(k));

export function TapHoldTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const issues = useMemo(() => checkTapHolds(spec, project), [spec, project]);
  // The list whose delete button was pressed once while settings still use it: the second press deletes.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const set = (list: TapHoldSetting[], label: string, coalesce?: string) => apply((p) => ({ ...p, tapHolds: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, change: Partial<TapHoldSetting>, label: string, coalesce?: string) =>
    set(
      project.tapHolds.map((x) => (x.id === id ? { ...x, ...change } : x)),
      label,
      coalesce,
    );
  const patchList = (id: string, change: Partial<KeyList>, label: string, coalesce?: string) =>
    apply(
      (p) => ({
        ...p,
        keyLists: p.keyLists.map((l) => (l.id === id ? { ...l, ...change } : l)),
      }),
      label,
      coalesce ? { coalesce } : undefined,
    );
  const term = (v: string) => (v === '' ? undefined : Number(v));
  const listLabel = t('tap-hold key list', 'список тап-холд');
  // The first tap-hold keycode of the keymap that has no setting yet.
  const nextKeycode = (): number => {
    const have = new Set(project.tapHolds.flatMap((x) => x.keycodes));
    for (const layer of activeKeymap(project).layers) for (const v of layer.keys) if (isTapHoldKeycode(spec, v) && !have.has(v)) return v;
    return 0;
  };
  const listName = (id: string) => project.keyLists.find((l) => l.id === id)?.name ?? '';
  // “Make a list”: the row's hold keys become a new list, swapped in on every setting with the same hold keys.
  const makeList = (s: TapHoldSetting) => {
    const keys = s.holdOnKeys ?? [];
    const taken = new Set(project.keyLists.map((l) => l.name.toLowerCase()));
    let n = project.keyLists.length + 1;
    while (taken.has(`list ${n}`)) n++;
    const list: KeyList = { id: newId('kl'), name: `List ${n}`, keys };
    apply(
      (p) => ({
        ...p,
        keyLists: [...p.keyLists, list],
        tapHolds: p.tapHolds.map((x) => {
          if (!x.holdOnKeys || !sameSet(x.holdOnKeys, keys)) return x;
          const { holdOnKeys: _, ...rest } = x;
          return { ...rest, holdOnLists: [...(x.holdOnLists ?? []), list.id] };
        }),
      }),
      t('make a key list', 'список клавиш из клавиш'),
    );
  };
  const deleteList = (id: string) => {
    if (keyListUsage(project, id) > 0 && confirmDelete !== id) return setConfirmDelete(id);
    setConfirmDelete(null);
    apply((p) => removeKeyList(p, id), t('delete key list', 'удаление списка клавиш'));
    deletedToast(t('key list', 'список клавиш'));
  };

  return (
    <div className="page">
      <p className="field-hint">
        {t(
          'Settings belong to keycodes, not to one key: every key with the same mod-tap (LSFT_T(KC_F)) or layer-tap (LT(1, KC_SPC)) keycode shares them, and one setting can list several keycodes. Empty = the global setting from QMK settings (config.h).',
          'Настройки относятся к keycode, а не к одной клавише: их делят все клавиши с тем же mod-tap (LSFT_T(KC_F)) или layer-tap (LT(1, KC_SPC)), и одна настройка может перечислять несколько keycode. Пусто — общая настройка из «Настройки QMK» (config.h).',
        )}
      </p>

      <section className="section">
        <div className="section-head">
          <h2>{t('key lists', 'списки клавиш')}</h2>
        </div>
        <p className="field-hint">
          {t(
            'Hold keys several settings share: change a list here and every setting that uses it follows.',
            'Клавиши удержания, общие для нескольких настроек: измените список здесь — изменятся все настройки, которые его используют.',
          )}
        </p>
        {project.keyLists.length > 0 && (
          <div className="panel-box">
            <div className="rows">
              <div className="row kicker" style={{ ['--row-cols' as string]: LIST_COLS }}>
                <span>{t('name', 'имя')}</span>
                <span>{t('keys', 'клавиши')}</span>
                <span>{t('settings', 'настроек')}</span>
                <span />
              </div>
              {project.keyLists.map((l) => {
                const uses = keyListUsage(project, l.id);
                const confirming = confirmDelete === l.id;
                return (
                  <div key={l.id} className="row" style={{ ['--row-cols' as string]: LIST_COLS }}>
                    <input
                      className="input"
                      value={l.name}
                      maxLength={KEY_LIST_NAME_MAX}
                      onChange={(e) => patchList(l.id, { name: e.target.value }, t('rename key list', 'имя списка клавиш'), `klname:${l.id}`)}
                      aria-label={t('List name', 'Имя списка')}
                    />
                    <KeyChips
                      items={l.keys.map((value) => ({ kind: 'key', value }))}
                      label={t('add a key to the list', 'добавить клавишу в список')}
                      disabled={l.keys.length >= KEY_LIST_KEYS_MAX}
                      onAdd={(v) => patchList(l.id, { keys: [...l.keys, v] }, listLabel)}
                      onRemove={(i) => patchList(l.id, { keys: l.keys.filter((_, j) => j !== i) }, listLabel)}
                    />
                    <span className="num">{uses}</span>
                    <button
                      className={`icon-btn ${confirming ? 'is-danger' : ''}`}
                      aria-label={confirming ? t(`Delete: ${uses} settings use it`, `Удалить: используется в ${uses} настройках`) : t('Delete', 'Удалить')}
                      onClick={() => deleteList(l.id)}
                      onBlur={() => confirming && setConfirmDelete(null)}
                    >
                      <Trash2 {...ICON} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {confirmDelete && (
          <p className="issue issue--warning">
            {t(
              `“${listName(confirmDelete)}” is used by ${keyListUsage(project, confirmDelete)} settings. Press delete again to remove it from them too.`,
              `«${listName(confirmDelete)}» используется в ${keyListUsage(project, confirmDelete)} настройках. Нажмите «удалить» ещё раз, чтобы убрать его и оттуда.`,
            )}
          </p>
        )}
        <div className="field-row">
          <button
            className="btn"
            disabled={project.keyLists.length >= KEY_LISTS_MAX}
            onClick={() => {
              const taken = new Set(project.keyLists.map((l) => l.name.toLowerCase()));
              let n = project.keyLists.length + 1;
              while (taken.has(`list ${n}`)) n++;
              apply(
                (p) => ({
                  ...p,
                  keyLists: [...p.keyLists, { id: newId('kl'), name: `List ${n}`, keys: [] }],
                }),
                t('new key list', 'новый список клавиш'),
              );
            }}
          >
            <Plus {...ICON} /> {t('key list', 'список клавиш')}
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t('settings', 'настройки')}</h2>
        </div>
        <div className="panel-box">
          <div className="rows">
            <div className="row kicker" style={{ ['--row-cols' as string]: COLS }}>
              <span>{t('keys', 'клавиши')}</span>
              <span>{t('flavor', 'режим')}</span>
              <span>{t('term, ms', 'время, мс')}</span>
              <span>{t('quick tap, ms', 'quick tap, мс')}</span>
              <span>{t('uses', 'клавиш')}</span>
              <span />
              <span />
            </div>
            {project.tapHolds.map((s) => {
              const holdKeys = s.holdOnKeys ?? [];
              const lists = s.holdOnLists ?? [];
              const free = project.keyLists.filter((l) => !lists.includes(l.id));
              const holdItems: KeyChip[] = [
                ...lists.map((id): KeyChip => ({
                  kind: 'list',
                  id,
                  name: listName(id),
                })),
                ...holdKeys.map((value): KeyChip => ({ kind: 'key', value })),
              ];
              const setHold = (keys: number[], ids: string[]) => {
                const { holdOnKeys: _k, holdOnLists: _l, ...rest } = s;
                set(
                  project.tapHolds.map((x) =>
                    x.id === s.id
                      ? {
                          ...rest,
                          ...(keys.length ? { holdOnKeys: keys } : {}),
                          ...(ids.length ? { holdOnLists: ids } : {}),
                        }
                      : x,
                  ),
                  listLabel,
                );
              };
              return (
                <div key={s.id} className="row-group">
                  <div key={s.id} className="row" style={{ ['--row-cols' as string]: COLS }}>
                    <KeyChips
                      items={s.keycodes.map((value) => ({ kind: 'key', value }))}
                      label={t('add a tap-hold key', 'добавить клавишу тап-холд')}
                      disabled={s.keycodes.length >= TAP_HOLD_KEYCODES_MAX}
                      onAdd={(v) => patch(s.id, { keycodes: [...s.keycodes, v] }, t('tap-hold key', 'клавиша тап-холд'))}
                      onRemove={(i) => patch(s.id, { keycodes: s.keycodes.filter((_, j) => j !== i) }, t('tap-hold key', 'клавиша тап-холд'))}
                    />
                    <select
                      className="select"
                      value={s.flavor ?? ''}
                      aria-label={t('Flavor', 'Режим')}
                      onChange={(e) =>
                        patch(
                          s.id,
                          {
                            flavor: e.target.value === '' ? undefined : (e.target.value as Flavor),
                          },
                          t('tap-hold flavor', 'режим тап-холд'),
                        )
                      }
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
                    <span className="num">{s.keycodes.reduce((n, k) => n + tapHoldUsage(project, k), 0)}</span>
                    <button
                      className="icon-btn"
                      aria-label={t('Make a key list from these hold keys', 'Сделать список клавиш из этих клавиш')}
                      title={t(
                        'Make a key list from these hold keys (every setting with the same hold keys gets the list)',
                        'Сделать список клавиш из этих клавиш (все настройки с теми же клавишами получат список)',
                      )}
                      disabled={holdKeys.length < 2 || project.keyLists.length >= KEY_LISTS_MAX}
                      onClick={() => makeList(s)}
                    >
                      <ListPlus {...ICON} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={t('Delete', 'Удалить')}
                      onClick={() => {
                        set(
                          project.tapHolds.filter((x) => x.id !== s.id),
                          t('delete tap-hold setting', 'удаление настройки тап-холд'),
                        );
                        deletedToast(t('tap-hold setting', 'настройка тап-холд'));
                      }}
                    >
                      <Trash2 {...ICON} />
                    </button>
                  </div>
                  <div className="row-sub">
                    <span className="kicker">{t('hold when pressed', 'удержание при нажатии')}</span>
                    <KeyChips
                      items={holdItems}
                      label={t('hold when pressed', 'удержание при нажатии')}
                      disabled={holdKeys.length >= HOLD_ON_KEYS_MAX}
                      onAdd={(v) => setHold([...holdKeys, v], lists)}
                      onRemove={(i) =>
                        i < lists.length
                          ? setHold(
                              holdKeys,
                              lists.filter((_, j) => j !== i),
                            )
                          : setHold(
                              holdKeys.filter((_, j) => j !== i - lists.length),
                              lists,
                            )
                      }
                      extra={
                        free.length > 0 && (
                          <select
                            className="select"
                            value=""
                            aria-label={t('Add a key list', 'Добавить список клавиш')}
                            onChange={(e) => e.target.value && setHold(holdKeys, [...lists, e.target.value])}
                          >
                            <option value="">{t('+ list', '+ список')}</option>
                            {free.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name || '—'}
                              </option>
                            ))}
                          </select>
                        )
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="field-row">
          <button
            className="btn btn--primary"
            disabled={project.tapHolds.length >= TAP_HOLD_MAX}
            onClick={() =>
              set(
                [
                  ...project.tapHolds,
                  {
                    id: newId('th'),
                    keycodes: nextKeycode() ? [nextKeycode()] : [],
                  },
                ],
                t('new tap-hold setting', 'новая настройка тап-холд'),
              )
            }
          >
            <Plus {...ICON} /> {t('setting', 'настройка')}
          </button>
          <span className="field-hint">
            {t(
              'Tap preferred: a hold only after the tapping term. Balanced: a hold if another key is pressed and released inside the term. Hold preferred: a hold as soon as another key is pressed. “Hold when pressed”: these keys and lists make it a hold at once.',
              'Приоритет нажатия: удержание только после времени. Сбалансированный: удержание, если другая клавиша нажата и отпущена в пределах времени. Приоритет удержания: удержание сразу, как нажата другая клавиша. «Удержание при нажатии»: эти клавиши и списки сразу делают удержание.',
            )}
          </span>
        </div>
      </section>
      <IssueList issues={issues} />
    </div>
  );
}
