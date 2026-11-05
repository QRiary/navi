import { Plus } from 'lucide-react';
import { href, navigate, type Route } from '../../lib/router';
import { SECTIONS } from '../../lib/sections';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useDeviceStore } from '../../store/deviceStore';
import { Logo } from '../Logo';
import { t } from '../../i18n';

export function Sidebar({ route }: { route: Route }) {
  const tagline = useSettingsStore((s) => s.settings.brand.tagline);
  const list = useProjectStore((s) => s.list);
  const current = useProjectStore((s) => s.project?.id);
  const open = useProjectStore((s) => s.open);
  const deviceStatus = useDeviceStore((s) => s.status);

  return (
    <aside className="sidebar" aria-label={t('Sidebar', 'Боковая панель')}>
      <a className="brand" href={href({ section: 'keyboard' })} aria-label="NAVI">
        <Logo size="sm" />
      </a>
      <div className="cell-label side-label">{t('navigation', 'навигация')}</div>
      <nav className="side-nav" aria-label={t('Main navigation', 'Основная навигация')}>
        {SECTIONS.map(({ id: section, title: label, icon: Icon }, i) => {
          const isActive = route.section === section;
          const note = section === 'device' && (deviceStatus === 'connected' || deviceStatus === 'busy') ? t('on', 'вкл') : '';
          return (
            <a key={section} href={href({ section })} className={`side-link ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined} title={label()}>
              <span className="side-link-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <Icon size={16} strokeWidth={1.5} className="side-link-icon" />
              <span className="side-link-text">{label()}</span>
              <span className="side-link-note">{note}</span>
            </a>
          );
        })}
      </nav>

      <section className="side-projects" aria-label={t('Projects', 'Проекты')}>
        <div className="side-projects-head">
          <span className="cell-label">{t('projects', 'проекты')}</span>
          <button className="icon-btn" aria-label={t('New project', 'Новый проект')} title={t('New project', 'Новый проект')} onClick={() => navigate({ section: 'projects', tab: 'new' })}>
            <Plus size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="side-projects-list">
          {list.map((p) => (
            <button key={p.id} className={`side-item ${p.id === current ? 'is-active' : ''}`} onClick={() => void open(p.id)} title={p.keyboard}>
              <span className="side-item-title">{p.name}</span>
              <span className="side-item-meta">{p.unsaved ? '●' : `${p.layers}L`}</span>
            </button>
          ))}
          {list.length === 0 && <p className="side-hint">{t('no projects · “+” to create', 'нет проектов · «+» чтобы создать')}</p>}
        </div>
      </section>
      <div className="side-foot">{tagline}</div>
    </aside>
  );
}
