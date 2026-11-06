/**
 * “Layer keys bring their layer to the top” (firmware.layerKeysOnTop): NAVI's own behavior, C code in keymap.c,
 * not a config.h define. One row, shown on Advanced → NAVI behavior and on the Layers page (same setting).
 */
import type { Project } from '../../core/project/types';
import { useProjectStore } from '../../store/projectStore';
import { t } from '../../i18n';

export function LayerKeysOnTopRow({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const on = project.firmware.layerKeysOnTop;
  const title = t('Layer keys bring their layer to the top', 'Клавиши слоёв поднимают свой слой наверх');
  return (
    <div className="row" style={{ ['--row-cols' as string]: 'minmax(0,1.3fr) minmax(0,1fr) auto' }}>
      <span>
        {title}
        <span className="field-hint">
          {' — '}
          {t(
            'The layer turned on last wins: layers above it are hidden while it is on. Without this, QMK shows the highest layer, so a key for a lower layer seems to do nothing.',
            'Побеждает слой, включённый последним: слои выше него скрыты, пока он включён. Без этого QMK показывает самый верхний слой, и клавиша нижнего слоя будто не работает.',
          )}
        </span>
      </span>
      <code className="kicker">{t('NAVI (keymap.c)', 'NAVI (keymap.c)')}</code>
      <label className="checkbox">
        <input type="checkbox" checked={on} onChange={(e) => apply((p) => ({ ...p, firmware: { ...p.firmware, layerKeysOnTop: e.target.checked } }), title)} aria-label={title} />
      </label>
    </div>
  );
}
