import { ChevronLeft, Search } from 'lucide-react';
import { useFindStore } from '../../lib/find';
import { activeKeymap } from '../../core/project/ops';
import { patchProject } from '../../core/project/ops';
import type { Route } from '../../lib/router';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import { StatusLine } from './StatusLine';
import { sectionDef } from '../../lib/sections';
import { t } from '../../i18n';

/** Top of the main area: section, project, keymap and the status line. */
export function TopBar({ route }: { route: Route }) {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const systemLabels = useSettingsStore((s) => s.settings.layout.systemLabels);
  const km = project ? activeKeymap(project) : null;
  const title = sectionDef(route.section).title();
  const setSearchOpen = useFindStore((s) => s.setOpen);
  return (
    <header className="topbar">
      <div className="topbar-row">
        <button className="icon-btn" aria-label={t('Back', 'Назад')} onClick={() => history.back()}>
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
        <div className="topbar-title">
          {/* “Signal glitch” on hover — if turned on in the settings (effects.glitch). */}
          <h1 className="glitch-hover" data-text={title}>
            {title}
          </h1>
          {project && systemLabels && (
            <span className="system-label">
              {project.name} / keymap://{km?.name}
            </span>
          )}
        </div>
        <button type="button" className="search-box topbar-search" onClick={() => setSearchOpen(true)} aria-keyshortcuts="Control+K" title={t('Search everywhere (Ctrl+K)', 'Поиск везде (Ctrl+K)')}>
          <Search size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className="topbar-search-text">{t('Search', 'Поиск')}</span>
          <kbd>Ctrl K</kbd>
        </button>
        {project && project.keymaps.length > 1 && (
          <select
            className="select"
            value={project.activeKeymapId}
            onChange={(e) => apply((p) => patchProject(p, { activeKeymapId: e.target.value }), t('switch keymap', 'другая раскладка'))}
            aria-label={t('Keymap', 'Раскладка')}
          >
            {project.keymaps.map((k) => (
              <option key={k.id} value={k.id}>
                keymap: {k.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <StatusLine />
    </header>
  );
}
