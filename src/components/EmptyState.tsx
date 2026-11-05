/**
 * EMPTY STATE of a list: what the list is for (one line), one example, and the add button(s) as `children`.
 *   <EmptyState what={t('…')} example={t('…')}><button …>+ combo</button></EmptyState>
 */
import type { ReactNode } from 'react';
import { t } from '../i18n';

export function EmptyState({ what, example, children }: { what: ReactNode; example?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-state-what">{what}</p>
      {example && (
        <p className="empty-state-example">
          <span className="kicker">{t('example', 'пример')}</span> {example}
        </p>
      )}
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  );
}
