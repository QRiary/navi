/**
 * ADVANCED SECTION: tap dance, combos, key overrides, own keycodes, leader, unicode,
 * NAVI's own behavior, behavior (config.h). All of this is code in the firmware (keymap.c / config.h): it works after building
 * and flashing your own firmware (the Firmware section). It cannot be set up over VIA — and it says so.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { friendlyName } from '../core/keycodes/friendly';
import { keyLabel } from '../core/keycodes/labels';
import { checkCombos, checkKeyOverrides, comboRefOf } from '../core/features/advanced';
import { configParams, groupTitle } from '../core/qmk/configParams';
import { newId } from '../core/layout/geometry';
import { activeKeymap, setLayerComboRef } from '../core/project/ops';
import type { Combo, CustomKeycode, KeyAlias, KeyOverride, MatrixPos, Project } from '../core/project/types';
import { aliasCName, ALIAS_LABEL_MAX, checkKeyAliases, KEY_ALIASES_MAX } from '../core/project/aliases';
import { layerIdentifiers } from '../core/qmk/generate';
import { customKeycodeValue, useActive, useLabelContext } from '../lib/projectContext';
import { href } from '../lib/router';
import { useEditorStore } from '../store/editorStore';
import { useProjectStore, useSpec } from '../store/projectStore';
import { ActionEditor, FeatureNote, IssueList, KeycodeField } from '../components/advanced/common';
import { TapHoldTab } from '../components/advanced/TapHoldTab';
import { TapDanceTab } from '../components/advanced/TapDanceTab';
import { LeaderTab } from '../components/advanced/LeaderTab';
import { UnicodeTab } from '../components/advanced/UnicodeTab';
import { LayerKeysOnTopRow } from '../components/advanced/LayerKeysOnTop';
import { ModsInput } from '../components/keyboard/KeycodeComposer';
import { LayoutPreview } from '../components/keyboard/LayoutPreview';
import { getLanguage, t } from '../i18n';

const ICON = { size: 14, strokeWidth: 1.5 };

function CombosTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const active = useActive();
  const selection = useEditorStore((s) => s.selection);
  const issues = useMemo(() => checkCombos(project, project.combos), [project]);
  const [current, setCurrent] = useState<string | null>(project.combos[0]?.id ?? null);
  if (!active || !labelCtx) return null;
  const km = activeKeymap(project);
  const cols = project.hardware.matrix.cols;
  const set = (combos: Combo[], label: string, coalesce?: string) => apply((p) => ({ ...p, combos }), label, coalesce ? { coalesce } : undefined);
  const combo = project.combos.find((c) => c.id === current) ?? null;
  const selectedPositions: MatrixPos[] = active.geometry.keys.filter((k) => selection.includes(k.id) && k.matrix).map((k) => k.matrix!);
  const marked = new Set((combo?.keys ?? []).map(([r, c]) => `${r},${c}`));
  // Labels of combo keys: the layer combos read on layer 0.
  const labelLayer = comboRefOf(km, 0);
  const keyName = ([r, c]: MatrixPos) => {
    const v = km.layers[labelLayer].keys[r * cols + c];
    return v > 1 ? friendlyName(spec, v, labelCtx).text : `[${r},${c}]`;
  };
  const setRef = (layer: number, value: string) =>
    apply((p) => setLayerComboRef(p, km.id, layer, value === '' ? undefined : value === 'self' ? 'self' : Number(value)), t('combo reference layer', 'опорный слой комбо'));
  return (
    <div className="page">
      <FeatureNote project={project} feature="combo" />
      <p className="field-hint">
        {t(
          'Press several keys together → another key. QMK matches combos by keycodes, read on each layer from its reference layer (below; a transparent key uses the setting of the layer it falls through to): combo keys need unique, non-empty keycodes there. A combo limited to layers works when the highest active layer is one of them.',
          'Нажмите несколько клавиш вместе → другая клавиша. QMK узнаёт комбо по keycodes, взятым на каждом слое с его опорного слоя (ниже; прозрачная клавиша берёт настройку слоя, на который проваливается): у клавиш комбо там должны быть разные непустые keycodes. Комбо, ограниченное слоями, работает, когда самый верхний активный слой — один из них.',
        )}
      </p>
      <div className="panel-box">
        <div className="panel-box-head">
          <span className="cell-label">{t('Reference layers: combos on this layer read keys from', 'Опорные слои: комбо на этом слое читают клавиши со слоя')}</span>
        </div>
        <div className="rows">
          {km.layers.map((l, i) => {
            const r = comboRefOf(km, i);
            const ref = r === 0 ? '' : r === i ? 'self' : String(r);
            return (
              <div key={l.id} className="row" style={{ ['--row-cols' as string]: '32px minmax(120px, 240px) minmax(160px, 240px)' }}>
                <span className="num">{i}</span>
                <span>{l.name}</span>
                <select className="select" value={ref} aria-label={t(`Combo reference layer of layer ${i}`, `Опорный слой комбо для слоя ${i}`)} onChange={(e) => setRef(i, e.target.value)}>
                  <option value="">{t('layer 0 (default)', 'слой 0 (по умолчанию)')}</option>
                  {i !== 0 && <option value="self">{t('this layer', 'этот слой')}</option>}
                  {km.layers.map((other, n) =>
                    n === 0 || n === i ? null : (
                      <option key={other.id} value={n}>
                        {t(`layer ${n}`, `слой ${n}`)} · {other.name}
                      </option>
                    ),
                  )}
                </select>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(240px, 340px) minmax(0, 1fr)' }}>
        <div className="panel-box">
          <div className="rows">
            {project.combos.map((c) => (
              <button key={c.id} className={`row ${c.id === current ? 'is-active' : ''}`} style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto', textAlign: 'left' }} onClick={() => setCurrent(c.id)}>
                <span title={`${c.keys.map(keyName).join(' + ')} → ${friendlyName(spec, c.result, labelCtx).qmk}`}>
                  {c.keys.map(keyName).join(' + ') || '—'} → {friendlyName(spec, c.result, labelCtx).text}
                </span>
                <span className="kicker">{c.name}</span>
              </button>
            ))}
            <div className="row" style={{ ['--row-cols' as string]: '1fr' }}>
              <button
                className="btn"
                onClick={() => {
                  const c: Combo = { id: newId('combo'), name: `combo_${project.combos.length}`, keys: [], result: 0 };
                  set([...project.combos, c], t('new combo', 'новое комбо'));
                  setCurrent(c.id);
                }}
              >
                <Plus {...ICON} /> {t('combo', 'комбо')}
              </button>
            </div>
          </div>
        </div>
        {combo ? (
          <div className="panel-box">
            <div className="panel-box-head">
              <input className="input" value={combo.name} onChange={(e) => set(project.combos.map((c) => (c.id === combo.id ? { ...c, name: e.target.value.replace(/[^A-Za-z0-9_]/g, '_') } : c)), t('combo name', 'имя комбо'), `cname:${combo.id}`)} aria-label={t('Name', 'Имя')} />
              <button className="icon-btn" aria-label={t('Delete', 'Удалить')} onClick={() => set(project.combos.filter((c) => c.id !== combo.id), t('delete combo', 'удаление комбо'))}>
                <Trash2 {...ICON} />
              </button>
            </div>
            <div className="panel-box-body field">
              <LayoutPreview geometry={active.geometry} label={([r, c]) => keyLabel(spec, km.layers[labelLayer].keys[r * cols + c], labelCtx)} marked={marked} height={150} />
              <div className="field-row">
                <span className="field-hint">
                  {t('keys', 'клавиши')}: {combo.keys.map(keyName).join(' + ') || '—'}
                </span>
                <button className="btn" disabled={selectedPositions.length < 2} onClick={() => set(project.combos.map((c) => (c.id === combo.id ? { ...c, keys: selectedPositions } : c)), t('combo keys', 'клавиши комбо'))} title={t('Select 2+ keys on the Keyboard page first', 'Сначала выделите 2+ клавиши в разделе «Клавиатура»')}>
                  {t(`take selected keys (${selectedPositions.length})`, `взять выбранные клавиши (${selectedPositions.length})`)}
                </button>
              </div>
              <div className="field-row">
                <span className="field-hint">{t('result', 'результат')}:</span>
                <KeycodeField value={combo.result} label={t('Result', 'Результат')} onChange={(v) => set(project.combos.map((c) => (c.id === combo.id ? { ...c, result: v } : c)), t('combo result', 'результат комбо'))} />
                <span className="field-hint">{t('own term, ms', 'своё окно, мс')}:</span>
                <input
                  className="input input--num"
                  type="number"
                  min={10}
                  max={1000}
                  placeholder="—"
                  value={combo.term ?? ''}
                  onChange={(e) => set(project.combos.map((c) => (c.id === combo.id ? { ...c, term: e.target.value ? Number(e.target.value) : undefined } : c)), t('combo term', 'окно комбо'), `cterm:${combo.id}`)}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="field-hint">{t('Create a combo on the left.', 'Создайте комбо слева.')}</p>
        )}
      </div>
      <IssueList issues={issues} />
    </div>
  );
}

function OverridesTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const issues = useMemo(() => checkKeyOverrides(project.keyOverrides), [project.keyOverrides]);
  const set = (list: KeyOverride[], label: string, coalesce?: string) => apply((p) => ({ ...p, keyOverrides: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<KeyOverride>, label: string, coalesce?: string) => set(project.keyOverrides.map((x) => (x.id === id ? { ...x, ...p } : x)), label, coalesce);
  return (
    <div className="page">
      <FeatureNote project={project} feature="key_override" />
      <p className="field-hint">{t('Modifiers + key → another key. Example: Shift + Backspace → Delete.', 'Модификаторы + клавиша → другая клавиша. Пример: Shift + Backspace → Delete.')}</p>
      <div className="panel-box rows">
        {project.keyOverrides.map((o) => (
          <div key={o.id} className="row" style={{ ['--row-cols' as string]: 'minmax(100px,0.6fr) minmax(260px,1.4fr) minmax(130px,1fr) 20px minmax(130px,1fr) auto' }}>
            <input className="input" value={o.name} onChange={(e) => patch(o.id, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, '_') }, t('override name', 'имя подмены'), `koname:${o.id}`)} aria-label={t('Name', 'Имя')} />
            <ModsInput mods={o.mods} onChange={(m) => (m & 0x0f ? patch(o.id, { mods: m }, t('override mods', 'модификаторы подмены')) : undefined)} />
            <KeycodeField value={o.trigger} label={t('Key', 'Клавиша')} onChange={(v) => patch(o.id, { trigger: v }, t('override key', 'клавиша подмены'))} />
            <span>→</span>
            <KeycodeField value={o.replacement} label={t('Replacement', 'Замена')} onChange={(v) => patch(o.id, { replacement: v }, t('override result', 'результат подмены'))} />
            <button className="icon-btn" aria-label={t('Delete', 'Удалить')} onClick={() => set(project.keyOverrides.filter((x) => x.id !== o.id), t('delete override', 'удаление подмены'))}>
              <Trash2 {...ICON} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn btn--primary" onClick={() => set([...project.keyOverrides, { id: newId('ko'), name: `ko_${project.keyOverrides.length}`, mods: 0x02, trigger: 0x2a, replacement: 0x4c }], t('new override', 'новая подмена'))}>
        <Plus {...ICON} /> {t('override', 'подмена')}
      </button>
      <IssueList issues={issues} />
    </div>
  );
}

function CustomTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const set = (list: CustomKeycode[], label: string, coalesce?: string) => apply((p) => ({ ...p, customKeycodes: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<CustomKeycode>, label: string, coalesce?: string) => set(project.customKeycodes.map((x) => (x.id === id ? { ...x, ...p } : x)), label, coalesce);
  return (
    <div className="page">
      <p className="field-hint">
        {t(
          'Your own keycodes (QK_USER_0, QK_USER_1 … — SAFE_RANGE in keymap.c). The generator writes their code in process_record_user: type a string or tap a key. They appear in the catalog under “Custom”.',
          'Свои keycodes (QK_USER_0, QK_USER_1 … — SAFE_RANGE в keymap.c). Генератор пишет их код в process_record_user: набрать строку или нажать клавишу. В каталоге — категория «Свои».',
        )}
      </p>
      <div className="panel-box rows">
        {project.customKeycodes.map((c, i) => (
          <div key={c.id} className="row" style={{ ['--row-cols' as string]: '90px minmax(120px,0.8fr) minmax(140px,1fr) 130px minmax(160px,1.2fr) auto' }}>
            <span className="kicker">0x{customKeycodeValue(spec, i).toString(16).toUpperCase()}</span>
            <input className="input" value={c.name} onChange={(e) => patch(c.id, { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }, t('custom keycode name', 'имя keycode'), `ckname:${c.id}`)} aria-label={t('Name', 'Имя')} />
            <input className="input" value={c.description} placeholder={t('description', 'описание')} onChange={(e) => patch(c.id, { description: e.target.value }, t('description', 'описание'), `ckdesc:${c.id}`)} />
            <ActionEditor action={c.action} coalesceKey={`ck:${c.id}`} onChange={(action, coalesce) => patch(c.id, { action }, t('custom action', 'действие keycode'), coalesce)} />
            <button className="icon-btn" aria-label={t('Delete', 'Удалить')} onClick={() => set(project.customKeycodes.filter((x) => x.id !== c.id), t('delete keycode', 'удаление keycode'))}>
              <Trash2 {...ICON} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn btn--primary" disabled={project.customKeycodes.length >= 32} onClick={() => set([...project.customKeycodes, { id: newId('ck'), name: `CUSTOM_${project.customKeycodes.length}`, description: '', action: { type: 'none' } }], t('new custom keycode', 'новый keycode'))}>
        <Plus {...ICON} /> keycode
      </button>
      <p className="field-hint">{t('Note: the value of a custom keycode depends on its position in this list — reordering changes what keys refer to.', 'Внимание: значение своего keycode зависит от места в списке — перестановка меняет, на что ссылаются клавиши.')}</p>
    </div>
  );
}

function AliasesTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const issues = useMemo(() => checkKeyAliases(project, layerIdentifiers(activeKeymap(project))).issues, [project]);
  const set = (list: KeyAlias[], label: string, coalesce?: string) => apply((p) => ({ ...p, keyAliases: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<KeyAlias>, label: string, coalesce?: string) => set(project.keyAliases.map((x) => (x.id === id ? { ...x, ...p } : x)), label, coalesce);
  const cols = 'minmax(140px,1fr) minmax(150px,1fr) minmax(140px,1fr) auto';
  return (
    <div className="page">
      <p className="field-hint">
        {t(
          'A label for a key: every key with that keycode shows it. Your own C can use the key by its C name (NV_ + the label): NAVI writes #define NV_… into navi.h in own pipeline mode, otherwise into keymap.c, and the generated keymap names the key by it too. They appear in the catalog under “Aliases”.',
          'Подпись для клавиши: её показывает каждая клавиша с этим keycode. Ваш код на C может звать клавишу по имени C (NV_ + подпись): NAVI пишет #define NV_… в navi.h в режиме своего конвейера, иначе в keymap.c, и сгенерированная раскладка тоже зовёт клавишу этим именем. В каталоге — категория «Псевдонимы».',
        )}
      </p>
      <div className="panel-box">
        <div className="rows">
          <div className="row kicker" style={{ ['--row-cols' as string]: cols }}>
            <span>{t('label', 'подпись')}</span>
            <span>{t('key', 'клавиша')}</span>
            <span>{t('C name', 'имя C')}</span>
            <span />
          </div>
          {project.keyAliases.map((a) => (
            <div key={a.id} className="row" style={{ ['--row-cols' as string]: cols }}>
              <input className="input" value={a.label} maxLength={ALIAS_LABEL_MAX} placeholder={t('Copy', 'Копировать')} onChange={(e) => patch(a.id, { label: e.target.value }, t('alias label', 'подпись псевдонима'), `kalabel:${a.id}`)} aria-label={t('Label', 'Подпись')} />
              <KeycodeField value={a.keycode} label={t('key', 'клавиша')} onChange={(v) => patch(a.id, { keycode: v }, t('alias key', 'клавиша псевдонима'))} />
              <span className="mono">{aliasCName(a.label.trim()) ?? '—'}</span>
              <button className="icon-btn" aria-label={t('Delete', 'Удалить')} onClick={() => set(project.keyAliases.filter((x) => x.id !== a.id), t('delete alias', 'удаление псевдонима'))}>
                <Trash2 {...ICON} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="field-row">
        <button className="btn btn--primary" disabled={project.keyAliases.length >= KEY_ALIASES_MAX} onClick={() => set([...project.keyAliases, { id: newId('ka'), label: '', keycode: 0 }], t('new alias', 'новый псевдоним'))}>
          <Plus {...ICON} /> {t('alias', 'псевдоним')}
        </button>
        <span className="field-hint">{t('Renaming a label renames its C name: code of yours that uses the old name stops building.', 'Новая подпись — новое имя C: ваш код со старым именем перестанет собираться.')}</span>
      </div>
      <IssueList issues={issues} />
    </div>
  );
}

/** NAVI's own behaviors: C code NAVI writes into keymap.c, kept apart from QMK's config.h settings. */
function NaviBehaviorTab({ project }: { project: Project }) {
  return (
    <div className="page">
      <p className="field-hint">
        {t(
          "Behaviors QMK does not have: NAVI writes them into keymap.c as its own C code. They apply after building and flashing. QMK's own settings are on the Behavior (config.h) tab.",
          'Поведение, которого нет в QMK: NAVI пишет его в keymap.c своим кодом на C. Действует после сборки и прошивки. Собственные настройки QMK — на вкладке «Поведение (config.h)».',
        )}
      </p>
      <section className="section">
        <div className="section-head">
          <h2>{t('Layers', 'Слои')}</h2>
        </div>
        <div className="panel-box rows">
          <LayerKeysOnTopRow project={project} />
        </div>
      </section>
    </div>
  );
}

function BehaviorTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const params = useMemo(() => configParams(), []);
  const lang = getLanguage();
  const groups = useMemo(() => {
    const m = new Map<string, typeof params>();
    for (const p of params) m.set(p.group, [...(m.get(p.group) ?? []), p]);
    return [...m.entries()];
  }, [params]);
  const setValue = (define: string, value: string | number | boolean | undefined) =>
    apply(
      (p) => {
        const buildConfig = { ...p.firmware.buildConfig };
        if (value === undefined || value === '') delete buildConfig[define];
        else buildConfig[define] = value;
        return { ...p, firmware: { ...p.firmware, buildConfig } };
      },
      `config.h ${define}`,
      { coalesce: `cfg:${define}` },
    );
  return (
    <div className="page">
      <p className="field-hint">
        {t(
          'These values go into config.h of your keymap (empty = QMK default). They apply after building and flashing. Names and types come from the official QMK table (data/mappings/info_config.hjson).',
          'Эти значения попадут в config.h вашей раскладки (пусто — значение QMK по умолчанию). Действуют после сборки и прошивки. Имена и типы — из официальной таблицы QMK (data/mappings/info_config.hjson).',
        )}
      </p>
      {groups.map(([group, list]) => (
        <section key={group} className="section">
          <div className="section-head">
            <h2>{lang === 'ru' ? groupTitle(group).ru : groupTitle(group).en}</h2>
          </div>
          <div className="panel-box rows">
            {list.map((p) => {
              const v = project.firmware.buildConfig[p.define];
              return (
                <div key={p.define} className="row" style={{ ['--row-cols' as string]: 'minmax(0,1.3fr) minmax(0,1fr) auto' }}>
                  <span>
                    {lang === 'ru' ? p.title.ru : p.title.en}
                    {p.hint && <span className="field-hint"> — {lang === 'ru' ? p.hint.ru : p.hint.en}</span>}
                  </span>
                  <code className="kicker">{p.define}</code>
                  {p.type === 'int' ? (
                    <input
                      className="input input--num"
                      type="number"
                      min={p.min}
                      max={p.max}
                      placeholder={p.qmkDefault !== undefined ? String(p.qmkDefault) : '—'}
                      value={typeof v === 'number' ? v : ''}
                      onChange={(e) => setValue(p.define, e.target.value === '' ? undefined : Number(e.target.value))}
                      aria-label={p.define}
                    />
                  ) : (
                    <select className="select" value={v === true ? 'on' : v === false ? 'off' : ''} onChange={(e) => setValue(p.define, e.target.value === '' ? undefined : e.target.value === 'on')} aria-label={p.define}>
                      <option value="">{t('default', 'по умолч.')}</option>
                      <option value="on">{t('on', 'вкл')}</option>
                      <option value="off">{t('off', 'выкл')}</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AdvancedPage({ tab }: { tab?: string }) {
  const project = useProjectStore((s) => s.project);
  const current = ['tapdance', 'taphold', 'combos', 'overrides', 'custom', 'aliases', 'leader', 'unicode', 'navi', 'behavior'].includes(tab ?? '') ? tab! : 'tapdance';
  if (!project) return null;
  const tabs: [string, string][] = [
    ['tapdance', 'Tap Dance'],
    ['taphold', t('Tap-hold', 'Тап-холд')],
    ['combos', t('Combos', 'Комбо')],
    ['overrides', t('Key overrides', 'Подмена сочетаний')],
    ['custom', t('Custom keycodes', 'Свои keycodes')],
    ['aliases', t('Aliases', 'Псевдонимы')],
    ['leader', t('Leader key', 'Клавиша-лидер')],
    ['unicode', t('Unicode', 'Юникод')],
    ['navi', t('NAVI behavior', 'Поведение NAVI')],
    ['behavior', t('Behavior (config.h)', 'Поведение (config.h)')],
  ];
  return (
    <div className="page">
      <div className="tabs" role="tablist">
        {tabs.map(([id, title]) => (
          <a key={id} className={`tab ${current === id ? 'is-active' : ''}`} href={href({ section: 'advanced', tab: id })}>
            {title}
          </a>
        ))}
      </div>
      {current === 'tapdance' && <TapDanceTab project={project} />}
      {current === 'taphold' && <TapHoldTab project={project} />}
      {current === 'combos' && <CombosTab project={project} />}
      {current === 'overrides' && <OverridesTab project={project} />}
      {current === 'custom' && <CustomTab project={project} />}
      {current === 'aliases' && <AliasesTab project={project} />}
      {current === 'leader' && <LeaderTab project={project} />}
      {current === 'unicode' && <UnicodeTab project={project} />}
      {current === 'navi' && <NaviBehaviorTab project={project} />}
      {current === 'behavior' && <BehaviorTab project={project} />}
    </div>
  );
}
