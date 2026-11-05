/**
 * ADVANCED SECTION: tap dance, combos, key overrides, own keycodes, leader, unicode,
 * QMK settings (config.h), NAVI additions (its own C code). All of this is code in the firmware (keymap.c / config.h): it works after building
 * and flashing your own firmware (the Firmware section). It cannot be set up over VIA — and it says so.
 */
import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { checkKeyOverrides } from '../core/features/advanced';
import { configParams, groupTitle } from '../core/qmk/configParams';
import { newId } from '../core/layout/geometry';
import { activeKeymap } from '../core/project/ops';
import type { CustomKeycode, KeyAlias, KeyOverride, Project } from '../core/project/types';
import { aliasCName, ALIAS_LABEL_MAX, checkKeyAliases, KEY_ALIASES_MAX } from '../core/project/aliases';
import { layerIdentifiers } from '../core/qmk/generate';
import { customKeycodeValue } from '../lib/projectContext';
import { href } from '../lib/router';
import { TabPanels, Tabs, type TabItem } from '../components/Tabs';
import { useProjectStore, useSpec } from '../store/projectStore';
import { ActionEditor, FeatureNote, IssueList, KeycodeField } from '../components/advanced/common';
import { TapHoldTab } from '../components/advanced/TapHoldTab';
import { CombosTab } from '../components/advanced/CombosTab';
import { TapDanceTab } from '../components/advanced/TapDanceTab';
import { LeaderTab } from '../components/advanced/LeaderTab';
import { UnicodeTab } from '../components/advanced/UnicodeTab';
import { LayerKeysOnTopRow } from '../components/advanced/LayerKeysOnTop';
import { ModsInput } from '../components/keyboard/KeycodeComposer';
import { getLanguage, t } from '../i18n';
import { openDocs, QMK_DOCS } from '../lib/qmkDocs';
import { deletedToast } from '../lib/undoToast';
import { whyDisabled } from '../lib/whyDisabled';
import { EmptyState } from '../components/EmptyState';
import { Hint, InfoTip } from '../components/InfoTip';

const ICON = { size: 14, strokeWidth: 1.5 };

function OverridesTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const issues = useMemo(() => checkKeyOverrides(project.keyOverrides), [project.keyOverrides]);
  const set = (list: KeyOverride[], label: string, coalesce?: string) => apply((p) => ({ ...p, keyOverrides: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<KeyOverride>, label: string, coalesce?: string) =>
    set(
      project.keyOverrides.map((x) => (x.id === id ? { ...x, ...p } : x)),
      label,
      coalesce,
    );
  const addOverrideButton = (
    <button
      className="btn btn--primary"
      onClick={() => set([...project.keyOverrides, { id: newId('ko'), name: `ko_${project.keyOverrides.length}`, mods: 0x02, trigger: 0x2a, replacement: 0x4c }], t('new override', 'новая подмена'))}
    >
      <Plus {...ICON} /> {t('override', 'подмена')}
    </button>
  );
  return (
    <div className="page">
      <FeatureNote project={project} feature="key_override" firstUse={{ en: 'add the first override', ru: 'добавите первую подмену' }} />
      <p className="field-hint">
        {t('Modifiers + key → another key. Example: Shift + Backspace → Delete.', 'Модификаторы + клавиша → другая клавиша. Пример: Shift + Backspace → Delete.')}{' '}
        <InfoTip docs={QMK_DOCS.keyOverrideCreate} label={t('Key overrides', 'Подмена сочетаний')}>
          {t(
            'When the chosen modifiers are held and the trigger key is pressed, the keyboard sends the replacement instead, and the trigger key and these modifiers are not sent. It still works if you hold extra modifiers.',
            'Когда зажаты выбранные модификаторы и нажата клавиша-триггер, клавиатура отправляет замену вместо неё; сама клавиша и эти модификаторы не отправляются. Работает и при дополнительно зажатых модификаторах.',
          )}
        </InfoTip>
      </p>
      {project.keyOverrides.length === 0 && (
        <EmptyState
          what={t('A key override changes what a modifier + key combination types.', 'Подмена меняет то, что печатает сочетание «модификатор + клавиша».')}
          example={t('Shift + Backspace → Delete.', 'Shift + Backspace → Delete.')}
        >
          {addOverrideButton}
        </EmptyState>
      )}
      {project.keyOverrides.length > 0 && (
        <div className="panel-box rows">
          {project.keyOverrides.map((o) => (
            <div key={o.id} className="row" style={{ ['--row-cols' as string]: 'minmax(96px,0.6fr) minmax(176px,1fr) 16px minmax(176px,1fr) auto', paddingBlock: 8 }}>
              <input
                className="input"
                value={o.name}
                onChange={(e) => patch(o.id, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, '_') }, t('override name', 'имя подмены'), `koname:${o.id}`)}
                aria-label={t('Name', 'Имя')}
              />
              {/* Modifiers on a second line under the keys: one line doesn't fit a normal window. */}
              <div style={{ gridColumn: '2 / -1', gridRow: 2 }}>
                <ModsInput mods={o.mods} onChange={(m) => (m & 0x0f ? patch(o.id, { mods: m }, t('override mods', 'модификаторы подмены')) : undefined)} />
              </div>
              <KeycodeField value={o.trigger} label={t('Key', 'Клавиша')} onChange={(v) => patch(o.id, { trigger: v }, t('override key', 'клавиша подмены'))} />
              <span>→</span>
              <KeycodeField value={o.replacement} label={t('Replacement', 'Замена')} onChange={(v) => patch(o.id, { replacement: v }, t('override result', 'результат подмены'))} />
              <button
                className="icon-btn"
                aria-label={t('Delete', 'Удалить')}
                onClick={() => {
                  set(
                    project.keyOverrides.filter((x) => x.id !== o.id),
                    t('delete override', 'удаление подмены'),
                  );
                  deletedToast(o.name || t('key override', 'подмена клавиши'));
                }}
              >
                <Trash2 {...ICON} />
              </button>
            </div>
          ))}
        </div>
      )}
      {project.keyOverrides.length > 0 && addOverrideButton}
      <IssueList issues={issues} />
    </div>
  );
}

function CustomTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const set = (list: CustomKeycode[], label: string, coalesce?: string) => apply((p) => ({ ...p, customKeycodes: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<CustomKeycode>, label: string, coalesce?: string) =>
    set(
      project.customKeycodes.map((x) => (x.id === id ? { ...x, ...p } : x)),
      label,
      coalesce,
    );
  const addCustomButton = (
    <button
      className="btn btn--primary"
      {...whyDisabled(project.customKeycodes.length >= 32 && t('At most 32 custom keycodes', 'Не больше 32 своих keycodes'))}
      onClick={() =>
        set([...project.customKeycodes, { id: newId('ck'), name: `CUSTOM_${project.customKeycodes.length}`, description: '', action: { type: 'none' } }], t('new custom keycode', 'новый keycode'))
      }
    >
      <Plus {...ICON} /> keycode
    </button>
  );
  return (
    <div className="page">
      <p className="field-hint">
        {t(
          'Your own keycodes (QK_USER_0, QK_USER_1 … — SAFE_RANGE in keymap.c). The generator writes their code in process_record_user: type a string or tap a key. They appear in the catalog under “Custom”.',
          'Свои keycodes (QK_USER_0, QK_USER_1 … — SAFE_RANGE в keymap.c). Генератор пишет их код в process_record_user: набрать строку или нажать клавишу. В каталоге — категория «Свои».',
        )}{' '}
        <InfoTip docs={QMK_DOCS.customKeycodes} label={t('Custom keycodes', 'Свои keycodes')}>
          {t(
            'A keycode QMK does not have: it gets a number in QMK’s free range (SAFE_RANGE). NAVI writes the code that runs when it is pressed (type text or press a key) into keymap.c; for anything else, handle it in your own C.',
            'Keycode, которого нет в QMK: он получает номер из свободного диапазона QMK (SAFE_RANGE). NAVI пишет в keymap.c код, который выполняется при нажатии (набрать текст или нажать клавишу); для остального обработайте его в своём C.',
          )}
        </InfoTip>
      </p>
      {project.customKeycodes.length === 0 && (
        <EmptyState
          what={t('A custom keycode is a key of your own that types a text or presses another key.', 'Свой keycode — ваша собственная клавиша, которая набирает текст или нажимает другую клавишу.')}
          example={t('CUSTOM_0 types your e-mail address.', 'CUSTOM_0 набирает ваш e-mail.')}
        >
          {addCustomButton}
        </EmptyState>
      )}
      {project.customKeycodes.length > 0 && (
        <div className="panel-box rows">
          {project.customKeycodes.map((c, i) => (
            <div key={c.id} className="row" style={{ ['--row-cols' as string]: '72px minmax(96px,0.8fr) minmax(96px,1fr) 128px minmax(96px,1.2fr) auto' }}>
              <span className="kicker">0x{customKeycodeValue(spec, i).toString(16).toUpperCase()}</span>
              <input
                className="input"
                value={c.name}
                onChange={(e) => patch(c.id, { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }, t('custom keycode name', 'имя keycode'), `ckname:${c.id}`)}
                aria-label={t('Name', 'Имя')}
              />
              <input
                className="input"
                value={c.description}
                placeholder={t('description', 'описание')}
                onChange={(e) => patch(c.id, { description: e.target.value }, t('description', 'описание'), `ckdesc:${c.id}`)}
              />
              <ActionEditor action={c.action} coalesceKey={`ck:${c.id}`} onChange={(action, coalesce) => patch(c.id, { action }, t('custom action', 'действие keycode'), coalesce)} />
              <button
                className="icon-btn"
                aria-label={t('Delete', 'Удалить')}
                onClick={() => {
                  set(
                    project.customKeycodes.filter((x) => x.id !== c.id),
                    t('delete keycode', 'удаление keycode'),
                  );
                  deletedToast(c.name || t('custom keycode', 'свой keycode'));
                }}
              >
                <Trash2 {...ICON} />
              </button>
            </div>
          ))}
        </div>
      )}
      {project.customKeycodes.length > 0 && addCustomButton}
      <p className="field-hint">
        {t(
          'Note: the value of a custom keycode depends on its position in this list — reordering changes what keys refer to.',
          'Внимание: значение своего keycode зависит от места в списке — перестановка меняет, на что ссылаются клавиши.',
        )}
      </p>
    </div>
  );
}

function AliasesTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const issues = useMemo(() => checkKeyAliases(project, layerIdentifiers(activeKeymap(project))).issues, [project]);
  const set = (list: KeyAlias[], label: string, coalesce?: string) => apply((p) => ({ ...p, keyAliases: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<KeyAlias>, label: string, coalesce?: string) =>
    set(
      project.keyAliases.map((x) => (x.id === id ? { ...x, ...p } : x)),
      label,
      coalesce,
    );
  const cols = 'minmax(140px,1fr) minmax(150px,1fr) minmax(140px,1fr) auto';
  const addAliasButton = (
    <button
      className="btn btn--primary"
      {...whyDisabled(project.keyAliases.length >= KEY_ALIASES_MAX && t(`At most ${KEY_ALIASES_MAX} aliases`, `Не больше ${KEY_ALIASES_MAX} псевдонимов`))}
      onClick={() => set([...project.keyAliases, { id: newId('ka'), label: '', keycode: 0 }], t('new alias', 'новый псевдоним'))}
    >
      <Plus {...ICON} /> {t('alias', 'псевдоним')}
    </button>
  );
  return (
    <div className="page">
      <p className="field-hint">
        {t(
          'A label for a key: every key with that keycode shows it. Your own C can use the key by its C name (NV_ + the label): NAVI writes #define NV_… into navi.h in own pipeline mode, otherwise into keymap.c, and the generated keymap names the key by it too. They appear in the catalog under “Aliases”.',
          'Подпись для клавиши: её показывает каждая клавиша с этим keycode. Ваш код на C может звать клавишу по имени C (NV_ + подпись): NAVI пишет #define NV_… в navi.h в режиме своего конвейера, иначе в keymap.c, и сгенерированная раскладка тоже зовёт клавишу этим именем. В каталоге — категория «Псевдонимы».',
        )}{' '}
        <InfoTip label={t('Aliases', 'Псевдонимы')}>
          {t(
            'An alias is NAVI’s own feature, not QMK’s: it names a keycode, for example “Copy” for Ctrl+C. Every key with that keycode shows the label, and the generated code defines NV_COPY for it.',
            'Псевдоним — функция самого NAVI, не QMK: он даёт имя keycode, например «Copy» для Ctrl+C. Каждая клавиша с этим keycode показывает подпись, а в сгенерированном коде для неё определён NV_COPY.',
          )}
        </InfoTip>
      </p>
      {project.keyAliases.length === 0 && (
        <EmptyState
          what={t('An alias gives a key a name of your own, shown on every key with that keycode.', 'Псевдоним даёт клавише ваше имя, которое видно на каждой клавише с этим keycode.')}
          example={t('“Copy” for Ctrl+C: keys with it show “Copy”, and your C code can use NV_COPY.', '«Copy» для Ctrl+C: клавиши с ним подписаны «Copy», а в вашем коде на C можно писать NV_COPY.')}
        >
          {addAliasButton}
        </EmptyState>
      )}
      {project.keyAliases.length > 0 && (
        <div className="panel-box">
          <div className="rows">
            <div className="row kicker" style={{ ['--row-cols' as string]: cols }}>
              <span>{t('label', 'подпись')}</span>
              <span>{t('key', 'клавиша')}</span>
              <span>
                <Hint
                  tip={t(
                    'The name to use in your own C code: NV_ plus the label in capitals. Russian letters are transliterated and anything else becomes an underscore.',
                    'Имя для вашего кода на C: NV_ и подпись заглавными. Русские буквы транслитерируются, всё остальное становится подчёркиванием.',
                  )}
                >
                  {t('C name', 'имя C')}
                </Hint>
              </span>
              <span />
            </div>
            {project.keyAliases.map((a) => (
              <div key={a.id} className="row" style={{ ['--row-cols' as string]: cols }}>
                <input
                  className="input"
                  value={a.label}
                  maxLength={ALIAS_LABEL_MAX}
                  placeholder={t('Copy', 'Копировать')}
                  onChange={(e) => patch(a.id, { label: e.target.value }, t('alias label', 'подпись псевдонима'), `kalabel:${a.id}`)}
                  aria-label={t('Label', 'Подпись')}
                />
                <KeycodeField value={a.keycode} label={t('key', 'клавиша')} onChange={(v) => patch(a.id, { keycode: v }, t('alias key', 'клавиша псевдонима'))} />
                <span className="mono">{aliasCName(a.label.trim()) ?? '—'}</span>
                <button
                  className="icon-btn"
                  aria-label={t('Delete', 'Удалить')}
                  onClick={() => {
                    set(
                      project.keyAliases.filter((x) => x.id !== a.id),
                      t('delete alias', 'удаление псевдонима'),
                    );
                    deletedToast(a.label || t('alias', 'псевдоним'));
                  }}
                >
                  <Trash2 {...ICON} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="field-row">
        {project.keyAliases.length > 0 && addAliasButton}
        <span className="field-hint">
          {t('Renaming a label renames its C name: code of yours that uses the old name stops building.', 'Новая подпись — новое имя C: ваш код со старым именем перестанет собираться.')}
        </span>
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
          "Behaviors QMK does not have: NAVI writes them into keymap.c as its own C code. They apply after building and flashing. QMK's own settings (config.h) are on the QMK settings tab.",
          'Поведение, которого нет в QMK: NAVI пишет его в keymap.c своим кодом на C. Действует после сборки и прошивки. Собственные настройки QMK (config.h) — на вкладке «Настройки QMK».',
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
          'These values go into config.h of your keymap (empty = QMK default). They apply after building and flashing. Names and types come from QMK’s own list of settings.',
          'Эти значения попадут в config.h вашей раскладки (пусто — значение QMK по умолчанию). Действуют после сборки и прошивки. Имена и типы — из собственного списка настроек QMK.',
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
                    {p.docs && (
                      <span className="row-docs">
                        <button type="button" className="text-btn" onClick={() => openDocs(p.docs!)}>
                          {t('QMK docs', 'Документация QMK')} ↗
                        </button>
                      </span>
                    )}
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
                    <select
                      className="select"
                      value={v === true ? 'on' : v === false ? 'off' : ''}
                      onChange={(e) => setValue(p.define, e.target.value === '' ? undefined : e.target.value === 'on')}
                      aria-label={p.define}
                    >
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
  if (!project) return null;
  const keys = t('Keys', 'Клавиши');
  const codes = t('Codes', 'Коды');
  const behavior = t('Behavior', 'Поведение');
  const tabs: TabItem[] = [
    { id: 'tapdance', label: 'Tap dance', group: keys },
    { id: 'taphold', label: t('Tap-hold', 'Тап-холд'), group: keys },
    { id: 'combos', label: t('Combos', 'Комбо'), group: keys },
    { id: 'overrides', label: t('Key overrides', 'Подмена сочетаний'), group: keys },
    { id: 'leader', label: t('Leader key', 'Клавиша-лидер'), group: keys },
    { id: 'custom', label: t('Custom keycodes', 'Свои keycodes'), group: codes },
    { id: 'aliases', label: t('Aliases', 'Псевдонимы'), group: codes },
    { id: 'unicode', label: t('Unicode', 'Юникод'), group: codes },
    {
      id: 'behavior',
      label: t('QMK settings', 'Настройки QMK'),
      group: behavior,
      title: t("QMK's own settings: defines NAVI writes into config.h", 'Собственные настройки QMK: define, которые NAVI пишет в config.h'),
    },
    {
      id: 'navi',
      label: t('NAVI additions', 'Дополнения NAVI'),
      group: behavior,
      title: t('Behaviors QMK does not have: C code NAVI generates into keymap.c', 'Поведение, которого нет в QMK: код на C, который NAVI генерирует в keymap.c'),
    },
  ];
  const current = tabs.some((i) => i.id === tab) ? tab! : 'tapdance';
  const panel = (id: string, active: boolean) => {
    switch (id) {
      case 'tapdance':
        return <TapDanceTab project={project} />;
      case 'taphold':
        return <TapHoldTab project={project} />;
      case 'combos':
        return <CombosTab project={project} active={active} />;
      case 'overrides':
        return <OverridesTab project={project} />;
      case 'custom':
        return <CustomTab project={project} />;
      case 'aliases':
        return <AliasesTab project={project} />;
      case 'leader':
        return <LeaderTab project={project} />;
      case 'unicode':
        return <UnicodeTab project={project} />;
      case 'navi':
        return <NaviBehaviorTab project={project} />;
      case 'behavior':
        return <BehaviorTab project={project} />;
    }
  };
  return (
    <div className="page">
      <Tabs idBase="advanced" label={t('Advanced', 'Расширенное')} items={tabs} current={current} href={(id) => href({ section: 'advanced', tab: id })} sticky />
      <TabPanels idBase="advanced" ids={tabs.map((i) => i.id)} current={current} render={panel} />
    </div>
  );
}
