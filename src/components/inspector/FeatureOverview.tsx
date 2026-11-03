/**
 * Summary of firmware features: what works now, what needs a rebuild, what the hardware
 * does not support and what is unknown. Source — the project (what was read from the keyboard, from the sources,
 * set by hand) and the QMK defaults.
 */
import { useMemo, useState } from 'react';
import { FEATURES, featureStatus, type FeatureState } from '../../core/features/registry';
import { hardwareFacts } from '../../lib/hardwareFacts';
import { href } from '../../lib/router';
import { useProjectStore } from '../../store/projectStore';
import { getLanguage, t } from '../../i18n';
import { StatusChip } from './KeyInspector';

const ORDER: FeatureState[] = ['available', 'needs-firmware', 'unknown', 'unsupported'];

export function FeatureOverview() {
  const project = useProjectStore((s) => s.project);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    if (!project) return [];
    const hw = hardwareFacts(project);
    return FEATURES.map((f) => ({ f, st: featureStatus(f.id, project.firmware.flags, hw) })).sort((a, b) => ORDER.indexOf(a.st.state) - ORDER.indexOf(b.st.state));
  }, [project]);
  if (!project) return <div className="inspector-body" />;
  const lang = getLanguage();
  const known = rows.filter((r) => r.st.state !== 'unknown' || project.firmware.flags[r.f.id]);
  const list = showAll ? rows : known;
  return (
    <div className="inspector-body">
      <dl className="kv">
        <dt>{t('keyboard', 'клавиатура')}</dt>
        <dd>{project.hardware.name}</dd>
        <dt>{t('matrix', 'матрица')}</dt>
        <dd>
          {project.hardware.matrix.rows} × {project.hardware.matrix.cols}
        </dd>
        <dt>{t('target', 'target')}</dt>
        <dd>{project.firmware.keyboard ?? t('not set', 'не задан')}</dd>
        <dt>spec</dt>
        <dd>keycodes {project.firmware.keycodeSpec}</dd>
      </dl>
      <div className="field">
        <span className="field-label">{t('current firmware', 'текущая прошивка')}</span>
        <div className="layer-stack">
          {list.map(({ f, st }) => (
            <div key={f.id} className="layer-stack-row" title={lang === 'ru' ? st.reason.ru : st.reason.en}>
              <span className="num">{f.defaultOn ? 'def' : ''}</span>
              <span>{lang === 'ru' ? f.title.ru : f.title.en}</span>
              <StatusChip state={st.state} likely={st.likely} text={lang === 'ru' ? st.reason.ru : st.reason.en} />
            </div>
          ))}
        </div>
        <button className="text-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? t('show only known', 'только известные') : t(`show all (${rows.length})`, `показать все (${rows.length})`)}
        </button>
      </div>
      <p className="field-hint">
        {t('“Needs firmware” = enable in the source, build and flash. Mark what you know in ', '«Нужна прошивка» = включить в исходниках, собрать и прошить. Отметить известное — в ')}
        <a href={href({ section: 'firmware', tab: 'features' })}>{t('Firmware → features', 'Прошивка → функции')}</a>.
      </p>
    </div>
  );
}
