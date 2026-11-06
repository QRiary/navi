/**
 * Advanced → Languages: the languages the keyboard types in (name, code, plain keys, layer, OS shortcut, their two
 * keys), the text route for text outside a plain-keys language, and which layers are typing layers.
 * The model is core/project/languages.ts, the C is core/qmk/languages.ts.
 */
import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { friendlyName } from '../../core/keycodes/friendly';
import {
  addLanguage,
  checkLanguages,
  isTypingLayer,
  setLayerTypingTick,
  LANGUAGE_NAME_MAX,
  LANGUAGES_MAX,
  languageKeycodes,
  moveLanguage,
  patchLanguage,
  removeLanguage,
} from '../../core/project/languages';
import { activeKeymap } from '../../core/project/ops';
import { TEXT_ROUTES, type Keymap, type Language, type Project, type TextRoute } from '../../core/project/types';
import { t } from '../../i18n';
import { findAttr } from '../../lib/find';
import { useLabelContext } from '../../lib/projectContext';
import { deletedToast } from '../../lib/undoToast';
import { whyDisabled } from '../../lib/whyDisabled';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { EmptyState } from '../EmptyState';
import { Hint, InfoTip } from '../InfoTip';
import { KeyName } from '../KeyName';
import { IssueList, KeycodeField } from './common';

const ICON = { size: 14, strokeWidth: 1.5 };
const COLS = 'minmax(0,1fr) 100px 170px 170px 32px 32px 32px'; // “обычные клавиши ?” needs the 170px
const ROUTE_COLS = '24px minmax(150px, 0.5fr) minmax(0, 1.5fr)';

const ROUTES: Record<TextRoute, { title: string; en: string; ru: string }> = {
  'own-program': {
    title: 'My own program',
    en: 'A program on your computer types the text and switches the layout. Your C defines navi_type_text_user and navi_switch_language_user (docs/languages.md).',
    ru: 'Текст печатает и раскладку переключает программа на вашем компьютере. Ваш C определяет navi_type_text_user и navi_switch_language_user (docs/languages.md).',
  },
  wincompose: {
    title: 'Windows · WinCompose',
    en: 'Unicode input through the free WinCompose app.',
    ru: 'Ввод Юникода через бесплатную программу WinCompose.',
  },
  'alt-codes': {
    title: 'Windows · Alt codes',
    en: 'Unicode input with Alt codes (HexNumpad). Unreliable: some apps ignore it, and Windows needs a registry key.',
    ru: 'Ввод Юникода Alt-кодами (HexNumpad). Ненадёжно: некоторые программы его игнорируют, а Windows нужен ключ реестра.',
  },
  linux: {
    title: 'Linux · IBus / GTK',
    en: 'Unicode input with Ctrl+Shift+U (IBus, GTK).',
    ru: 'Ввод Юникода через Ctrl+Shift+U (IBus, GTK).',
  },
};

const routeTitle = (r: TextRoute) => (r === 'own-program' ? t('My own program', 'Своя программа') : ROUTES[r].title);

/** The “typing layer” tick of one layer: its keys go to the OS layout as they are, in every language. */
export function TypingLayerTick({ project, keymap, layer, tip = true }: { project: Project; keymap: Keymap; layer: number; tip?: boolean }) {
  const apply = useProjectStore((s) => s.apply);
  const on = isTypingLayer(project, keymap, layer);
  const title = t('Typing layer', 'Слой для набора');
  return (
    <label className="checkbox">
      <input type="checkbox" checked={on} onChange={(e) => apply((p) => setLayerTypingTick(p, keymap.id, layer, e.target.checked), t('typing layer', 'слой для набора'))} aria-label={title} />
      {title}
      {tip && (
      <InfoTip label={title}>
        {t(
          'A typing layer sends its keys to the computer’s layout as they are, in every language (letters, and the symbols your layout puts there). On other layers (symbols, navigation) the symbol keys type their US character through the text route, so they stay the same in every language. By default the base layer and the languages’ layers are typing layers.',
          'Слой для набора отправляет свои клавиши раскладке компьютера как есть, в любом языке (буквы и знаки, которые ставит ваша раскладка). На других слоях (символы, навигация) клавиши знаков печатают свой американский символ через способ ввода текста, поэтому в любом языке они одинаковы. По умолчанию слой для набора — базовый и слои языков.',
        )}
      </InfoTip>
      )}
    </label>
  );
}

export function LanguagesTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const keymap = activeKeymap(project);
  const issues = useMemo(() => checkLanguages(project, keymap), [project, keymap]);
  const list = project.languages;
  const patch = (id: string, change: Partial<Omit<Language, 'id'>>, label: string, coalesce?: string) =>
    apply((p) => patchLanguage(p, id, change), label, coalesce ? { coalesce } : undefined);
  const full = list.length >= LANGUAGES_MAX && t(`At most ${LANGUAGES_MAX} languages`, `Не больше ${LANGUAGES_MAX} языков`);
  const addButton = (
    <button className="btn btn--primary" onClick={() => apply((p) => addLanguage(p), t('new language', 'новый язык'))} {...whyDisabled(full)}>
      <Plus {...ICON} /> {t('language', 'язык')}
    </button>
  );
  const setRoute = (textRoute: TextRoute) => apply((p) => ({ ...p, firmware: { ...p.firmware, textRoute } }), t('text route', 'способ ввода текста'));
  const routeTip = (
    <InfoTip label={t('text route', 'способ ввода текста')}>
      {t(
        'How text that plain keys cannot type reaches the computer (macros, custom keycodes, leader strings, “Every tap” tap dances, and symbol keys outside a plain-keys language). Used only while a language without plain keys is on. One route for the whole firmware:\n- My own program: a program on your computer types it (needs your C: navi_type_text_user, navi_switch_language_user).\n- WinCompose: Unicode input through the WinCompose app on Windows.\n- Alt codes: Windows Alt codes; unreliable.\n- Linux: Ctrl+Shift+U (IBus, GTK).\nThe Unicode routes are not confirmed to work on non-Latin layouts: QMK types the hex digits A-F as letter keys, which a Russian layout turns into other letters. Not checked.',
        'Как текст, который не набрать обычными клавишами, попадает на компьютер (макросы, свои keycodes, строки лидера, tap dance «Каждое нажатие» и клавиши знаков вне языка с обычными клавишами). Работает, только когда включён язык без обычных клавиш. Один способ на всю прошивку:\n- Своя программа: текст печатает программа на вашем компьютере (нужен ваш C: navi_type_text_user, navi_switch_language_user).\n- WinCompose: ввод Юникода через WinCompose в Windows.\n- Alt-коды: Alt-коды Windows; ненадёжно.\n- Linux: Ctrl+Shift+U (IBus, GTK).\nНе подтверждено, что способы через Юникод работают в нелатинских раскладках: QMK печатает шестнадцатеричные цифры A-F буквенными клавишами, которые русская раскладка превращает в другие буквы. Не проверялось.',
      )}
    </InfoTip>
  );
  const nonLatinNote = (
    <p className="field-hint">
      {t(
        'The Unicode routes are not confirmed to work while the computer is on a non-Latin layout (QMK types hex digits A-F as letter keys). Not checked.',
        'Не подтверждено, что способы через Юникод работают при нелатинской раскладке компьютера (QMK печатает шестнадцатеричные цифры A-F буквенными клавишами). Не проверялось.',
      )}
    </p>
  );
  const layerOptions = keymap.layers.map((l, i) => ({ i, name: l.name })).filter(({ i }) => i !== keymap.defaultLayer);

  return (
    <div className="page">
      <p className="field-hint">
        {t(
          'List the languages the keyboard types in. Each gets two keys: “switch to” and “toggle” (toggle goes back to the first plain-keys language when it is already on). At power-on the first language is active; nothing is saved across restarts.',
          'Перечислите языки, на которых печатает клавиатура. У каждого две клавиши: «переключить на» и «переключатель» (если язык уже включён, переключатель возвращает к первому языку с обычными клавишами). При включении активен первый язык; после перезапуска ничего не сохраняется.',
        )}{' '}
        <InfoTip label={t('languages', 'языки')}>
          {t(
            'Firmware cannot read the computer’s layout: it knows the language only from these keys (or from your own program). Switching on the computer (Win+Space) leaves the keyboard on the old language unless your program tells it. Outside a plain-keys language, typed text and symbol keys go through the text route.',
            'Прошивка не может прочитать раскладку компьютера: язык она знает только по этим клавишам (или от вашей программы). Если переключить язык на компьютере (Win+Пробел), клавиатура останется на прежнем, пока ваша программа ей не сообщит. Вне языка с обычными клавишами набранный текст и клавиши знаков идут через способ ввода текста.',
          )}
        </InfoTip>
      </p>

      <section className="section">
        <div className="section-head">
          <h2>
            {t('text route', 'способ ввода текста')} {routeTip}
          </h2>
          <span className="kicker">firmware.textRoute</span>
        </div>
        <div className="panel-box rows">
          {TEXT_ROUTES.map((r) => (
            <label key={r} className="row" style={{ ['--row-cols' as string]: ROUTE_COLS }}>
              <input type="radio" name="text-route" checked={project.firmware.textRoute === r} onChange={() => setRoute(r)} />
              <strong>{routeTitle(r)}</strong>
              <span className="field-hint">{t(ROUTES[r].en, ROUTES[r].ru)}</span>
            </label>
          ))}
        </div>
        {nonLatinNote}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t('languages', 'языки')} · {list.length}</h2>
        </div>
        {list.length === 0 && (
          <EmptyState
            what={t(
              'A language is something the keyboard types in. With none, NAVI generates no language code.',
              'Язык — то, на чём печатает клавиатура. Пока языков нет, NAVI не генерирует код для языков.',
            )}
            example={t(
              'English (plain keys) and Russian with its own layer and Alt+Shift as the computer’s shortcut: two keys per language switch between them.',
              'English (обычные клавиши) и Русский со своим слоем и Alt+Shift как сочетанием компьютера: две клавиши на язык переключают их.',
            )}
          >
            {addButton}
          </EmptyState>
        )}
        {list.length > 0 && (
          <div className="panel-box">
            <div className="rows">
              <div className="row kicker" style={{ ['--row-cols' as string]: COLS }}>
                <span>{t('name', 'имя')}</span>
                <span>
                  <Hint tip={t('Lower case C name part: NAVI_TO_RU, NAVI_TOGGLE_RU.', 'Часть C-имени строчными: NAVI_TO_RU, NAVI_TOGGLE_RU.')}>{t('code', 'код')}</Hint>
                </span>
                <span>
                  <Hint
                    tip={t(
                      'The computer’s layout matches the keys in this language (like English). Its text and symbols are typed as plain keys, not through the text route.',
                      'Раскладка компьютера в этом языке совпадает с клавишами (как английская). Его текст и знаки набираются обычными клавишами, а не через способ ввода текста.',
                    )}
                  >
                    {t('plain keys', 'обычные клавиши')}
                  </Hint>
                </span>
                <span>
                  <Hint
                    tip={t(
                      'A layer that is on while this language is on, always under the other layers. Not the base layer.',
                      'Слой, который включён, пока включён этот язык; всегда под остальными слоями. Не базовый.',
                    )}
                  >
                    {t('layer', 'слой')}
                  </Hint>
                </span>
                <span />
                <span />
                <span />
              </div>
              {list.map((l, i) => {
                const keys = languageKeycodes(spec, i);
                const layerMissing = l.layer !== undefined && !layerOptions.some((o) => o.i === l.layer);
                return (
                  <div key={l.id} className="row-group" {...findAttr('language:' + l.id)}>
                    <div className="row" style={{ ['--row-cols' as string]: COLS }}>
                      <input
                        className="input"
                        value={l.name}
                        maxLength={LANGUAGE_NAME_MAX}
                        placeholder={t('Name', 'Имя')}
                        onChange={(e) => patch(l.id, { name: e.target.value }, t('language name', 'имя языка'), `langname:${l.id}`)}
                        aria-label={t('Language name', 'Имя языка')}
                      />
                      <input
                        className="input"
                        style={{ fontFamily: 'var(--mono, monospace)' }}
                        value={l.code}
                        maxLength={8}
                        spellCheck={false}
                        onChange={(e) => patch(l.id, { code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') }, t('language code', 'код языка'), `langcode:${l.id}`)}
                        aria-label={t('Language code', 'Код языка')}
                      />
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={l.plainKeys}
                          onChange={(e) => patch(l.id, { plainKeys: e.target.checked }, t('language plain keys', 'обычные клавиши языка'))}
                          aria-label={t('Types with plain keys', 'Печатает обычными клавишами')}
                        />
                      </label>
                      <select
                        className="select"
                        value={l.layer === undefined ? '' : String(l.layer)}
                        onChange={(e) => patch(l.id, { layer: e.target.value === '' ? undefined : Number(e.target.value) }, t('language layer', 'слой языка'))}
                        aria-label={t('Language layer', 'Слой языка')}
                      >
                        <option value="">{t('none', 'нет')}</option>
                        {layerMissing && <option value={String(l.layer)}>{t(`layer ${l.layer} (missing)`, `слой ${l.layer} (нет)`)}</option>}
                        {layerOptions.map((o) => (
                          <option key={o.i} value={String(o.i)}>
                            {o.i} · {o.name || t('(no name)', '(без имени)')}
                          </option>
                        ))}
                      </select>
                      <button
                        className="icon-btn"
                        aria-label={t('Move up', 'Выше')}
                        {...whyDisabled(i === 0 && t('Already the first language', 'Уже первый язык'), t('Move up (the first language is active at power-on)', 'Выше (первый язык активен при включении)'))}
                        onClick={() => apply((p) => moveLanguage(spec, p, i, i - 1), t('move language', 'перестановка языка'))}
                      >
                        <ArrowUp {...ICON} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={t('Move down', 'Ниже')}
                        {...whyDisabled(i === list.length - 1 && t('Already the last language', 'Уже последний язык'), t('Move down', 'Ниже'))}
                        onClick={() => apply((p) => moveLanguage(spec, p, i, i + 1), t('move language', 'перестановка языка'))}
                      >
                        <ArrowDown {...ICON} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={t('Delete', 'Удалить')}
                        onClick={() => {
                          apply((p) => removeLanguage(spec, p, l.id), t('delete language', 'удаление языка'));
                          deletedToast(l.name || l.code);
                        }}
                      >
                        <Trash2 {...ICON} />
                      </button>
                    </div>
                    <div className="row-sub">
                      <span className="kicker">
                        <Hint
                          tip={t(
                            'The computer’s own key combo that switches its layout to this language (for example Alt+Shift). The language keys tap it. Not used with “My own program”.',
                            'Собственное сочетание клавиш компьютера, переключающее раскладку на этот язык (например, Alt+Shift). Клавиши языка нажимают его. С «Своей программой» не используется.',
                          )}
                        >
                          {t('OS shortcut', 'сочетание ОС')}
                        </Hint>
                      </span>
                      <KeycodeField
                        value={l.osShortcut ?? 0}
                        label={t('OS shortcut', 'Сочетание ОС')}
                        onChange={(v) => patch(l.id, { osShortcut: v === 0 ? undefined : v }, t('language OS shortcut', 'сочетание ОС языка'))}
                      />
                      <span className="kicker">{t('keys', 'клавиши')}</span>
                      {labelCtx && (
                        <>
                          <KeyName name={friendlyName(spec, keys.to, labelCtx)} />
                          <KeyName name={friendlyName(spec, keys.toggle, labelCtx)} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {list.length > 0 && <div className="field-row">{addButton}</div>}
        {list.length > 0 && (
          <p className="field-hint">
            {t('Reordering or deleting languages renumbers their keys on the keyboard.', 'Перестановка и удаление языков пересчитывает их клавиши на клавиатуре.')}
          </p>
        )}
      </section>

      {list.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>
              <Hint
                tip={t(
                  'A typing layer sends its keys to the computer’s layout as they are, in every language. Other layers (symbols, navigation) type the US character of a symbol key through the text route.',
                  'Слой для набора отправляет свои клавиши раскладке компьютера как есть, в любом языке. Остальные слои (символы, навигация) печатают американский символ клавиши знака через способ ввода текста.',
                )}
              >
                {t('typing layers', 'слои для набора')}
              </Hint>
            </h2>
          </div>
          <div className="panel-box rows">
            {keymap.layers.map((l, i) => (
              <div key={l.id} className="row" style={{ ['--row-cols' as string]: '34px minmax(0,1fr) auto' }}>
                <span className="num">L{i}</span>
                <span>{l.name || t('(no name)', '(без имени)')}</span>
                <TypingLayerTick project={project} keymap={keymap} layer={i} tip={false} />
              </div>
            ))}
          </div>
        </section>
      )}
      <IssueList issues={issues} />
    </div>
  );
}
