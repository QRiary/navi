/** Settings → main → Interface size: − / value (back to 100%) / +, the same 10% steps as Ctrl+= / Ctrl+-. */
import { Minus, Plus } from 'lucide-react';
import { ZOOM_RANGE, stepZoom } from '../lib/interfaceZoom';
import { useSettingsStore } from '../store/settingsStore';
import { t } from '../i18n';
import { whyDisabled } from '../lib/whyDisabled';
import { findAttr } from '../lib/find';
import { settingHint, settingLabel } from '../lib/settingsIndex';

export function InterfaceSizeControl() {
  const zoom = useSettingsStore((s) => s.settings.layout.zoom);
  const setValue = useSettingsStore((s) => s.setValue);
  const set = (next: number) => next !== zoom && setValue('layout.zoom', next);
  const percent = Math.round(zoom * 100);
  return (
    <div className="row" {...findAttr('setting:layout.zoom')} style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto' }}>
      <span>
        {settingLabel('layout.zoom')}
        <span className="field-hint"> — {settingHint('layout.zoom')}</span>
      </span>
      <div className="seg" role="group" aria-label={t('Interface size', 'Размер интерфейса')}>
        <button
          aria-label={t('Smaller', 'Меньше')}
          {...whyDisabled(zoom <= ZOOM_RANGE[0] && t(`Already at the smallest size (${Math.round(ZOOM_RANGE[0] * 100)}%)`, `Уже самый маленький размер (${Math.round(ZOOM_RANGE[0] * 100)}%)`))}
          onClick={() => set(stepZoom(zoom, -1))}
        >
          <Minus size={13} strokeWidth={1.5} />
        </button>
        <button className="zoom-value" title={t('Back to 100%', 'Вернуть 100%')} aria-label={t(`${percent}%, back to 100%`, `${percent}%, вернуть 100%`)} onClick={() => set(1)}>
          {percent}%
        </button>
        <button
          aria-label={t('Bigger', 'Больше')}
          {...whyDisabled(zoom >= ZOOM_RANGE[1] && t(`Already at the biggest size (${Math.round(ZOOM_RANGE[1] * 100)}%)`, `Уже самый большой размер (${Math.round(ZOOM_RANGE[1] * 100)}%)`))}
          onClick={() => set(stepZoom(zoom, 1))}
        >
          <Plus size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
