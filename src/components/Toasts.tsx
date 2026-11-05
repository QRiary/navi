import { useState, type FocusEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '../i18n';
import { useToastStore, type Toast } from '../store/toastStore';

/**
 * The toast stack. Rendered into document.body, outside `#root`: an open dialog makes `#root` inert (Modal.tsx),
 * and toasts (an error behind a dialog) must stay clickable, so they sit above the dialog backdrop.
 */
function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss, pause, resume } = useToastStore.getState();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const error = toast.tone === 'error';
  const closable = error || !!toast.action;
  const copy = () => {
    const text = toast.detail ? `${toast.message}\n${toast.detail}` : toast.message;
    void navigator.clipboard.writeText(text).then(() => setCopied(true), () => undefined);
  };
  const leave = (e: FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resume(toast.id);
  };
  return (
    <div
      className={`toast toast--${toast.tone}`}
      role={error ? 'alert' : undefined}
      onMouseEnter={() => pause(toast.id)}
      onMouseLeave={() => resume(toast.id)}
      onFocus={() => pause(toast.id)}
      onBlur={leave}
    >
      <div className="toast-row">
        <span className="toast-text">
          <span className="toast-prompt">&gt;</span> {toast.message}
        </span>
        {toast.action && (
          <button
            className="btn btn--ghost"
            onClick={() => {
              toast.action!.run();
              dismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )}
        {error && (
          <button className="btn btn--ghost" onClick={copy}>
            {copied ? t('Copied', 'Скопировано') : t('Copy', 'Копировать')}
          </button>
        )}
        {error && toast.detail && (
          <button className="btn btn--ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t('Details', 'Подробности')}
          </button>
        )}
        {closable && (
          <button className="icon-btn" aria-label={t('Close', 'Закрыть')} title={t('Close', 'Закрыть')} onClick={() => dismiss(toast.id)}>
            <X size={16} />
          </button>
        )}
      </div>
      {open && toast.detail && <pre className="toast-detail">{toast.detail}</pre>}
    </div>
  );
}

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <ToastItem key={x.id} toast={x} />
      ))}
    </div>,
    document.body,
  );
}
