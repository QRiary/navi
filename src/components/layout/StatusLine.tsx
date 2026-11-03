import { useMemo } from 'react';
import { diffProjects, sameContent } from '../../core/project/diff';
import { activeKeymap } from '../../core/project/ops';
import { useDeviceStore } from '../../store/deviceStore';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import { t } from '../../i18n';

function Item({ k, v, title }: { k: string; v: string; title?: string }) {
  return (
    <span className="sl-item" title={title}>
      <span className="sl-key">{k}</span>
      <span className="sl-val">{v}</span>
    </span>
  );
}

/** Status line (like in the player): device, layer, keys, spec, changes. */
export function StatusLine() {
  const enabled = useSettingsStore((s) => s.settings.layout.statusLine);
  const project = useProjectStore((s) => s.project);
  const saved = useProjectStore((s) => s.saved);
  const layer = useEditorStore((s) => s.layer);
  const status = useDeviceStore((s) => s.status);
  const caps = useDeviceStore((s) => s.caps);
  const current = useDeviceStore((s) => s.current);

  const changes = useMemo(() => {
    if (!project) return 0;
    if (!saved) return -1;
    const d = diffProjects(saved, project);
    const n = d.keys.length + d.encoders.length + d.sections.filter((s) => s !== 'keymaps').length + d.layersAdded + d.layersRemoved;
    // A new keymap, a renamed layer, another current keymap — also unsaved changes.
    return n === 0 && !sameContent(saved, project) ? 1 : n;
  }, [project, saved]);

  if (!enabled || !project) return null;
  const km = activeKeymap(project);
  const state = status === 'connected' ? 'online' : status === 'busy' ? 'busy' : status === 'connecting' ? 'link' : status === 'error' || status === 'disconnected' ? 'error' : 'offline';
  const stateClass = state === 'online' ? 'playing' : state === 'error' ? 'error' : state === 'busy' || state === 'link' ? 'paused' : 'idle';

  return (
    <div className="status-line" role="status" aria-label={t('Status line', 'Строка состояния')}>
      <span className={`sl-item sl-state sl-state--${stateClass}`} title={current?.productName}>
        <i className="sl-dot" aria-hidden="true" />
        {state}
      </span>
      {caps && <Item k="via" v={`v${caps.protocol}`} />}
      <Item k="layer" v={`${layer}/${km.layers.length}`} />
      <Item k="keys" v={`${project.hardware.matrix.rows}×${project.hardware.matrix.cols}`} title={t('matrix rows × cols', 'матрица: строки × столбцы')} />
      <Item k="spec" v={project.firmware.keycodeSpec} title={t('QMK keycode spec version', 'Версия спецификации keycodes QMK')} />
      <Item k="changes" v={changes === -1 ? t('new', 'новый') : changes === 0 ? t('saved', 'сохранено') : `${changes} ${t('unsaved', 'не сохр.')}`} />
    </div>
  );
}
