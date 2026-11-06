/**
 * Several keymaps in one project: choose, copy, rename, delete.
 * Geometry, macros, tap dance etc. are shared by the project; keymaps differ in layers and encoders.
 */
import { useState } from 'react';
import { CopyPlus, Trash2 } from 'lucide-react';
import { addKeymap, patchProject, removeKeymap, renameKeymap } from '../../core/project/ops';
import { useProjectStore } from '../../store/projectStore';
import { t } from '../../i18n';
import { deletedToast } from '../../lib/undoToast';
import { whyDisabled } from '../../lib/whyDisabled';
import { Hint } from '../InfoTip';

export function KeymapManager() {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const [confirm, setConfirm] = useState(false);
  if (!project) return null;
  const km = project.keymaps.find((k) => k.id === project.activeKeymapId) ?? project.keymaps[0];
  return (
    <div className="panel-box" style={{ marginBottom: 'var(--gap)' }}>
      <div className="panel-box-head">
        <span className="cell-label">
          <Hint
            tip={t(
              'A keymap is one full set of layers and encoder actions. Keep variants side by side (for example “daily” and “gaming”); only the active one goes to the keyboard and the firmware.',
              'Раскладка — полный набор слоёв и действий энкодеров. Держите варианты рядом (например, «обычная» и «игровая»); в клавиатуру и прошивку идёт только текущая.',
            )}
          >
            {t('keymaps in project', 'раскладки проекта')}
          </Hint>{' '}
          · {project.keymaps.length}
        </span>
        <div className="field-row">
          <select
            className="select"
            value={project.activeKeymapId}
            onChange={(e) => apply((p) => patchProject(p, { activeKeymapId: e.target.value }), t('switch keymap', 'другая раскладка'))}
            aria-label={t('Active keymap', 'Текущая раскладка')}
          >
            {project.keymaps.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} · {k.layers.length}L
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 170 }}
            value={km.name}
            maxLength={60}
            onChange={(e) => apply((p) => renameKeymap(p, km.id, e.target.value), t('rename keymap', 'имя раскладки'), { coalesce: `kmname:${km.id}` })}
            aria-label={t('Keymap name', 'Имя раскладки')}
          />
          <button
            className="btn"
            onClick={() => apply((p) => addKeymap(p, `${km.name} copy`, km.id), t('copy keymap', 'копия раскладки'))}
            title={t('A copy of this keymap becomes active', 'Копия этой раскладки станет текущей')}
          >
            <CopyPlus size={14} strokeWidth={1.5} /> {t('copy', 'копия')}
          </button>
          <button
            className={`btn ${confirm ? 'btn--danger' : ''}`}
            {...whyDisabled(project.keymaps.length <= 1 && t('A project needs at least one keymap', 'В проекте должна остаться хотя бы одна раскладка'))}
            onClick={() => {
              if (!confirm) {
                setConfirm(true);
                setTimeout(() => setConfirm(false), 4000);
                return;
              }
              apply((p) => removeKeymap(p, km.id), t('delete keymap', 'удаление раскладки'));
              setConfirm(false);
              deletedToast(km.name || t('keymap', 'раскладка'));
            }}
          >
            <Trash2 size={14} strokeWidth={1.5} /> {confirm ? t('delete for sure?', 'точно удалить?') : t('delete', 'удалить')}
          </button>
        </div>
      </div>
      <div className="panel-box-body">
        <p className="field-hint">
          {t(
            'Keep variants side by side (e.g. “daily” and “gaming”). The keyboard and the firmware get the active keymap; geometry, macros and tap dance are shared.',
            'Держите варианты рядом (например, «обычная» и «игровая»). В клавиатуру и прошивку идёт текущая раскладка; геометрия, макросы и tap dance общие.',
          )}
        </p>
      </div>
    </div>
  );
}
