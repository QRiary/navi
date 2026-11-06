/**
 * Firmware → features. Two different things:
 *  • “what is in the firmware now” — facts about the firmware on the keyboard (from the keyboard,
 *    from the sources or set by you). The “works / needs firmware” marks depend on it.
 *  • “what to turn on in your build” — rules.mk flags for your own firmware.
 * Features your keymap needs (tap dance, combos, keycodes…) are marked.
 */
import { useMemo } from 'react';
import { FEATURES, featureStatus, type FeatureId, type FlagState } from '../../core/features/registry';
import { requiredFeatures } from '../../core/features/required';
import { activeKeymap } from '../../core/project/ops';
import { hardwareFacts } from '../../lib/hardwareFacts';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { StatusChip } from '../inspector/KeyInspector';
import { getLanguage, t } from '../../i18n';
import { whyDisabled } from '../../lib/whyDisabled';
import { matchesQuery, useListFilter } from '../../lib/find';
import { ListFilter } from '../ListFilter';
import { Hint } from '../InfoTip';

export function FeaturesTab() {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const lang = getLanguage();
  const need = useMemo(() => (project ? requiredFeatures(project, activeKeymap(project), spec) : new Map<FeatureId, string>()), [project, spec]);
  const [query, setQuery] = useListFilter();
  if (!project) return null;
  const hw = hardwareFacts(project);
  const shownFeatures = FEATURES.filter((f) => matchesQuery(query, f.title.en, f.title.ru, f.rules, f.id, need.get(f.id)));

  const setFlag = (f: FeatureId, state: FlagState | '') =>
    apply(
      (p) => {
        const flags = { ...p.firmware.flags };
        if (state === '') delete flags[f];
        else flags[f] = { state, evidence: 'declared' };
        return { ...p, firmware: { ...p.firmware, flags } };
      },
      t('firmware fact', 'факт о прошивке'),
    );
  const setBuild = (f: FeatureId, on: boolean | null) =>
    apply(
      (p) => {
        const buildFeatures = { ...p.firmware.buildFeatures };
        if (on === null) delete buildFeatures[f];
        else buildFeatures[f] = on;
        return { ...p, firmware: { ...p.firmware, buildFeatures } };
      },
      t('build feature', 'функция сборки'),
    );

  return (
    <div className="page">
      <p className="page-lead">
        {t(
          '“Now” = the firmware that is on the keyboard (badge shows where it is known from). “Your build” = what goes into rules.mk of your keymap. Features your keymap needs are enabled in the build automatically.',
          '«Сейчас» — прошивка, которая стоит на клавиатуре (значок — откуда это известно). «Ваша сборка» — что попадёт в rules.mk вашего keymap. Функции, которые нужны раскладке, в сборке включаются сами.',
        )}
      </p>
      <ListFilter
        value={query}
        onChange={setQuery}
        label={t('Filter features', 'Фильтр функций')}
        placeholder={t('Filter by name, rules.mk flag or what needs it', 'Фильтр по названию, флагу rules.mk или тому, кому нужно')}
        shown={shownFeatures.length}
        total={FEATURES.length}
      />
      {shownFeatures.length === 0 && <p className="field-hint">{t('Nothing matches the filter.', 'Под фильтр ничего не подходит.')}</p>}
      <div className="panel-box rows features-table" hidden={shownFeatures.length === 0}>
        <div className="row kicker">
          <span>{t('feature', 'функция')}</span>
          <span>
            <Hint
              tip={t(
                'Whether this feature is in the firmware that is on the keyboard now. It decides the “works / needs firmware” marks elsewhere in NAVI. Empty means the QMK default.',
                'Есть ли эта функция в прошивке, которая стоит на клавиатуре сейчас. От этого зависят отметки «работает / нужна прошивка» в других местах NAVI. Пусто — значение QMK по умолчанию.',
              )}
            >
              {t('now', 'сейчас')}
            </Hint>
          </span>
          <span>{t('known from', 'откуда известно')}</span>
          <span>
            <Hint
              tip={t(
                'Turn the feature on in the rules.mk of your own firmware build (the flag shown next to its name).',
                'Включить функцию в rules.mk вашей собственной прошивки (флаг рядом с названием).',
              )}
            >
              {t('your build', 'ваша сборка')}
            </Hint>
          </span>
          <span>{t('needed by', 'нужно для')}</span>
        </div>
        {shownFeatures.map((f) => {
          const flag = project.firmware.flags[f.id];
          const st = featureStatus(f.id, project.firmware.flags, hw);
          const build = project.firmware.buildFeatures[f.id];
          const needed = need.get(f.id);
          return (
            <div key={f.id} className="row" title={lang === 'ru' ? f.description.ru : f.description.en}>
              <span>
                {lang === 'ru' ? f.title.ru : f.title.en} {f.rules && <span className="kicker">{f.rules}</span>}
              </span>
              <select className="select" value={flag?.state ?? ''} onChange={(e) => setFlag(f.id, e.target.value as FlagState | '')} aria-label={t('Now', 'Сейчас')}>
                <option value="">{f.defaultOn ? t('default (on)', 'по умолч. (вкл)') : t('unknown', 'неизвестно')}</option>
                <option value="on">{t('on', 'есть')}</option>
                <option value="off">{t('off', 'нет')}</option>
                <option value="unknown">{t('unknown', 'неизвестно')}</option>
              </select>
              <span>
                <StatusChip state={st.state} likely={st.likely} text={lang === 'ru' ? st.reason.ru : st.reason.en} /> {flag && <span className="kicker">{flag.evidence}</span>}
              </span>
              {f.rules ? (
                <button
                  className={`toggle ${build || needed ? 'is-on' : ''}`}
                  {...whyDisabled(needed && t('Required by your project, so it is always on', 'Нужно вашему проекту, поэтому всегда включено'))}
                  onClick={() => setBuild(f.id, build ? null : true)}
                >
                  {build || needed ? 'on' : 'off'}
                </button>
              ) : (
                <span className="kicker">—</span>
              )}
              <span className="field-hint">{needed ?? ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
