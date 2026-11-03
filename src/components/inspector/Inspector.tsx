/**
 * RIGHT PANEL: properties of what you work with in the section.
 *  Keyboard — the selected key/encoder; Hardware — the selected geometry key;
 *  other sections — the project summary and the state of firmware features.
 */
import type { Route } from '../../lib/router';
import { KeyInspector } from './KeyInspector';
import { GeometryInspector } from '../hardware/GeometryInspector';
import { FeatureOverview } from './FeatureOverview';
import { t } from '../../i18n';

export function Inspector({ route }: { route: Route }) {
  const title = route.section === 'keyboard' ? t('key', 'клавиша') : route.section === 'hardware' ? t('geometry', 'геометрия') : t('firmware features', 'функции прошивки');
  return (
    <aside className="inspector" aria-label={t('Inspector', 'Инспектор')}>
      <div className="inspector-head">
        <h2>{title}</h2>
      </div>
      {route.section === 'keyboard' ? <KeyInspector /> : route.section === 'hardware' ? <GeometryInspector /> : <FeatureOverview />}
    </aside>
  );
}
