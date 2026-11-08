/** The failing cases of the keymap's own tests (electron/keymapTests.cjs): scenario, expected, got. */
import type { KeymapTestFailure } from '../../desktop/bridge';
import { t } from '../../i18n';

export function KeymapTestFailures({ failures, more }: { failures: KeymapTestFailure[]; more: number }) {
  return (
    <div>
      {failures.map((f, i) => (
        <section key={i} style={{ margin: '8px 0' }}>
          <div>
            <code style={{ overflowWrap: 'anywhere' }}>{f.scenario}</code> <span className="dim">{f.where}</span>
          </div>
          <div className="field-hint">
            {t('expected', 'ожидалось')}: <code style={{ overflowWrap: 'anywhere' }}>{f.expected}</code>
          </div>
          <div className="field-hint">
            {t('got', 'получилось')}: <code style={{ overflowWrap: 'anywhere' }}>{f.actual}</code>
          </div>
        </section>
      ))}
      {more > 0 && <p className="field-hint">{t(`…and ${more} more in the build log`, `…и ещё ${more} в логе сборки`)}</p>}
    </div>
  );
}
