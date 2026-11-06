import { t } from '../i18n';

/**
 * The raw technical text behind an inline error sentence (an error toast has the same behind its “Details” button).
 * Closed by default; renders nothing without text.
 */
export function ErrorDetails({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <details className="error-details">
      <summary>{t('Details', 'Подробности')}</summary>
      <pre className="toast-detail">{text}</pre>
    </details>
  );
}

/** The raw text of anything thrown. */
export function rawError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
