import { ChevronLeft } from 'lucide-react';
import { activeKeymap } from '../../core/project/ops';
import { patchProject } from '../../core/project/ops';
import type { Route } from '../../lib/router';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import { StatusLine } from './StatusLine';
import { t } from '../../i18n';

const TITLES = (): Record<Route['section'], string> => ({
  keyboard: t('Keyboard', 'Клавиатура'),
  layers: t('Layers', 'Слои'),
  encoders: t('Encoders', 'Энкодеры'),
  macros: t('Macros', 'Макросы'),
  advanced: t('Advanced', 'Расширенное'),
  lighting: t('Lighting', 'Подсветка'),
  hardware: t('Hardware', 'Железо'),
  firmware: t('Firmware', 'Прошивка'),
  device: t('Device', 'Устройство'),
  projects: t('Projects', 'Проекты'),
  settings: t('Settings', 'Настройки'),
});

/** Top of the main area: section, project, keymap and the status line. */
export function TopBar({ route }: { route: Route }) {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const systemLabels = useSettingsStore((s) => s.settings.layout.systemLabels);
  const km = project ? activeKeymap(project) : null;
  const title = TITLES()[route.section];
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
