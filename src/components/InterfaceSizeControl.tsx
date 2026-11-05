/** Settings → main → Interface size: − / value (back to 100%) / +, the same 10% steps as Ctrl+= / Ctrl+-. */
import { Minus, Plus } from 'lucide-react';
import { ZOOM_RANGE, stepZoom } from '../lib/interfaceZoom';
import { useSettingsStore } from '../store/settingsStore';
import { t } from '../i18n';

export function InterfaceSizeControl() {
  const zoom = useSettingsStore((s) => s.settings.layout.zoom);
  const setValue = useSettingsStore((s) => s.setValue);
  const set = (next: number) => next !== zoom && setValue('layout.zoom', next);
  const percent = Math.round(zoom * 100);
  return (
    <div className="row" style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto' }}>
      <span>
        {t('Interface size', 'Размер интерфейса')}
        <span className="field-hint"> — {t('also Ctrl+= / Ctrl+- / Ctrl+0 and Ctrl+wheel', 'также Ctrl+= / Ctrl+- / Ctrl+0 и Ctrl+колесо')}</span>
      </span>
      <div className="seg" role="group" aria-label={t('Interface size', 'Размер интерфейса')}>
        <button aria-label={t('Smaller', 'Меньше')} disabled={zoom <= ZOOM_RANGE[0]} onClick={() => set(stepZoom(zoom, -1))}>
          <Minus size={13} strokeWidth={1.5} />
        </button>
        <button className="zoom-value" title={t('Back to 100%', 'Вернуть 100%')} aria-label={t(`${percent}%, back to 100%`, `${percent}%, вернуть 100%`)} onClick={() => set(1)}>
          {percent}%
        </button>
        <button aria-label={t('Bigger', 'Больше')} disabled={zoom >= ZOOM_RANGE[1]} onClick={() => set(stepZoom(zoom, 1))}>
          <Plus size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
