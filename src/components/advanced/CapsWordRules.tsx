/**
 * Caps Word key rules (firmware.capsWordRules): which keys keep Caps Word on, which of them it shifts, and on which
 * layers. Off = QMK's own list. NAVI's own C code in keymap.c; shown on Advanced → NAVI additions.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { newId } from '../../core/layout/geometry';
import { CAPS_WORD_KEYS_MAX, CAPS_WORD_QMK_DEFAULT, CAPS_WORD_RULES_MAX, checkCapsWordRules } from '../../core/project/capsWord';
import { activeKeymap } from '../../core/project/ops';
import type { CapsWordRule, Project } from '../../core/project/types';
import { useProjectStore } from '../../store/projectStore';
import { t } from '../../i18n';
import { whyDisabled } from '../../lib/whyDisabled';
import { InfoTip } from '../InfoTip';
import { IssueList, KeyChips, type KeyChip } from './common';

const ICON = { size: 14, strokeWidth: 1.5 };
const COLS = 'minmax(0,1fr) 168px minmax(0,0.8fr) 32px';

export function CapsWordRulesRows({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const rules = project.firmware.capsWordRules;
  const km = activeKeymap(project);
  const [editLayers, setEditLayers] = useState<string | null>(null);
  const issues = useMemo(() => checkCapsWordRules(project), [project]);
  const title = t('Own key rules', 'Свои правила клавиш');
  const set = (next: CapsWordRule[], label: string, coalesce?: string) => apply((p) => ({ ...p, firmware: { ...p.firmware, capsWordRules: next } }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, change: Partial<CapsWordRule>, label: string) => set((rules ?? []).map((r) => (r.id === id ? { ...r, ...change } : r)), label);
  const toggle = (on: boolean) =>
    apply(
      (p) => {
        const { capsWordRules: _, ...rest } = p.firmware;
        return { ...p, firmware: on ? { ...rest, capsWordRules: CAPS_WORD_QMK_DEFAULT.map((r) => ({ ...r, keys: [...r.keys], id: newId('cw') })) } : rest };
      },
      title,
    );
  const listName = (id: string) => project.keyLists.find((l) => l.id === id)?.name ?? '';
  return (
    <>
      <div className="row" style={{ ['--row-cols' as string]: 'minmax(0,1.3fr) minmax(0,1fr) auto' }}>
        <span>
          {title}
          <span className="field-hint">
            {' — '}
            {t(
              "Off: QMK's own list. Letters and - are shifted; digits, Backspace, Delete and _ keep Caps Word on; any other key ends it.",
              'Выкл.: список QMK. Буквы и - получают Shift; цифры, Backspace, Delete и _ оставляют Caps Word включённым; любая другая клавиша его завершает.',
            )}{' '}
            <InfoTip label={title}>
              {t(
                'NAVI writes caps_word_press_user() into keymap.c from these rules and turns Caps Word on in rules.mk. Ticking this fills in QMK’s own list to edit; unticking goes back to QMK’s list.',
                'NAVI пишет caps_word_press_user() в keymap.c по этим правилам и включает Caps Word в rules.mk. Галочка заполняет правила списком QMK, чтобы его править; снятие возвращает список QMK.',
              )}
            </InfoTip>
          </span>
        </span>
        <code className="kicker">{t('NAVI (keymap.c)', 'NAVI (keymap.c)')}</code>
        <label className="checkbox">
          <input type="checkbox" checked={!!rules} onChange={(e) => toggle(e.target.checked)} aria-label={title} />
        </label>
      </div>
      {rules && (
        <>
          <div className="row kicker" style={{ ['--row-cols' as string]: COLS }}>
            <span>{t('keys', 'клавиши')}</span>
            <span>{t('Caps Word', 'Caps Word')}</span>
            <span>{t('layers', 'слои')}</span>
            <span />
          </div>
          {rules.map((r) => {
            const lists = r.lists ?? [];
            const free = project.keyLists.filter((l) => !lists.includes(l.id));
            const items: KeyChip[] = [...lists.map((id): KeyChip => ({ kind: 'list', id, name: listName(id) })), ...r.keys.map((value): KeyChip => ({ kind: 'key', value }))];
            const setKeys = (keys: number[], ids: string[]) => {
              const { lists: _, ...rest } = r;
              set(rules.map((x) => (x.id === r.id ? { ...rest, keys, ...(ids.length ? { lists: ids } : {}) } : x)), t('Caps Word rule keys', 'клавиши правила Caps Word'));
            };
            const layers = r.layers ?? [];
            const toggleLayer = (n: number) => {
              const next = layers.includes(n) ? layers.filter((x) => x !== n) : [...layers, n].sort((a, b) => a - b);
              const { layers: _, ...rest } = r;
              set(rules.map((x) => (x.id === r.id ? { ...rest, ...(next.length ? { layers: next } : {}) } : x)), t('Caps Word rule layers', 'слои правила Caps Word'));
            };
            return (
              <div key={r.id} className="row" style={{ ['--row-cols' as string]: COLS }}>
                <KeyChips
                  items={items}
                  label={t('add a Caps Word key', 'добавить клавишу Caps Word')}
                  full={r.keys.length >= CAPS_WORD_KEYS_MAX && t(`At most ${CAPS_WORD_KEYS_MAX} keys in a rule; put more in a key list`, `Не больше ${CAPS_WORD_KEYS_MAX} клавиш в правиле; остальные — в список клавиш`)}
                  onAdd={(v) => setKeys([...r.keys, v], lists)}
                  onRemove={(i) => (i < lists.length ? setKeys(r.keys, lists.filter((_, j) => j !== i)) : setKeys(r.keys.filter((_, j) => j !== i - lists.length), lists))}
                  extra={
                    free.length > 0 && (
                      <select className="select" value="" aria-label={t('Add a key list', 'Добавить список клавиш')} onChange={(e) => e.target.value && setKeys(r.keys, [...lists, e.target.value])}>
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
                <select className="select" value={r.shift ? 'shift' : 'keep'} aria-label={t('What Caps Word does with these keys', 'Что Caps Word делает с этими клавишами')} onChange={(e) => patch(r.id, { shift: e.target.value === 'shift' }, t('Caps Word rule', 'правило Caps Word'))}>
                  <option value="shift">{t('Shift, keeps it on', 'Shift, остаётся включённым')}</option>
                  <option value="keep">{t('Keeps it on', 'Остаётся включённым')}</option>
                </select>
                {editLayers === r.id ? (
                  <span className="combo-layers" role="group" aria-label={t('Layers the rule counts on', 'Слои, на которых работает правило')}>
                    <button className={`chip ${layers.length === 0 ? 'is-on' : ''}`} aria-pressed={layers.length === 0} onClick={() => layers.length && patch(r.id, { layers: undefined }, t('Caps Word rule layers', 'слои правила Caps Word'))}>
                      {t('all', 'все')}
                    </button>
                    {km.layers.map((l, n) => (
                      <button key={l.id} className={`chip ${layers.includes(n) ? 'is-on' : ''}`} aria-pressed={layers.includes(n)} onClick={() => toggleLayer(n)} title={t(`Layer ${n}`, `Слой ${n}`)}>
                        {n} {l.name}
                      </button>
                    ))}
                    <button className="btn" onClick={() => setEditLayers(null)}>
                      {t('done', 'готово')}
                    </button>
                  </span>
                ) : (
                  <span className="combo-keys">
                    <span>{layers.length ? layers.map((n) => `${n} ${km.layers[n]?.name ?? ''}`.trim()).join(', ') : t('every layer', 'все слои')}</span>
                    <button className="btn" onClick={() => setEditLayers(r.id)}>
                      {t('change', 'изменить')}
                    </button>
                  </span>
                )}
                <button className="icon-btn" aria-label={t('Delete', 'Удалить')} onClick={() => set(rules.filter((x) => x.id !== r.id), t('delete Caps Word rule', 'удаление правила Caps Word'))}>
                  <Trash2 {...ICON} />
                </button>
              </div>
            );
          })}
          <div className="row" style={{ ['--row-cols' as string]: 'auto minmax(0,1fr)' }}>
            <button
              className="btn"
              {...whyDisabled(rules.length >= CAPS_WORD_RULES_MAX && t(`At most ${CAPS_WORD_RULES_MAX} rules`, `Не больше ${CAPS_WORD_RULES_MAX} правил`), undefined)}
              onClick={() => rules.length < CAPS_WORD_RULES_MAX && set([...rules,{ id: newId('cw'), keys: [], shift: true }], t('add Caps Word rule', 'добавление правила Caps Word'))}
            >
              <Plus {...ICON} /> {t('Add rule', 'Добавить правило')}
            </button>
            <span className="field-hint">
              {t(
                'Any other key ends Caps Word. A rule for some layers wins over an every-layer rule for the same key; it counts when that layer is the highest one on.',
                'Любая другая клавиша завершает Caps Word. Правило для некоторых слоёв сильнее правила для всех слоёв для той же клавиши; оно действует, когда этот слой — самый верхний из включённых.',
              )}
            </span>
          </div>
          <IssueList issues={issues} />
        </>
      )}
    </>
  );
}
