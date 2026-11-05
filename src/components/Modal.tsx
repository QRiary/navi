/**
 * MODAL DIALOG: the one dialog box of the interface (write to keyboard, write keymap files, linked file conflict,
 * unsaved changes on close).
 *  • Esc, the × button and a click on the backdrop close it (not while `busy`; the backdrop only when `dismissible`);
 *  • focus moves in on open (`data-autofocus` inside, else the dialog itself), Tab stays inside, and focus goes back
 *    to what had it when the dialog closes;
 *  • the rest of the app is `inert` (no clicks, no focus, hidden from screen readers), and the global shortcuts
 *    (`useShortcuts`) are paused while any dialog is open.
 * Rendered into document.body, so `#root` can be made inert as a whole. Dialogs stack: only the top one is live.
 */
import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '../i18n';

const stack: HTMLElement[] = [];

/** True while any dialog is open (global shortcuts check it). */
export function anyModalOpen(): boolean {
  return stack.length > 0;
}

function refreshInert() {
  const root = document.getElementById('root');
  if (root) root.inert = stack.length > 0;
  stack.forEach((el, i) => (el.inert = i < stack.length - 1));
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  /** A job is running: Esc, × and the backdrop do nothing. */
  busy?: boolean;
  /** A click on the backdrop closes (default true). */
  dismissible?: boolean;
  /** The × button in the head (default true) and its tooltip (default “Close”). */
  closeButton?: boolean;
  closeLabel?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ title, onClose, busy = false, dismissible = true, closeButton = true, closeLabel, footer, children }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const pressedOnBackdrop = useRef(false);
  const close = () => {
    if (!busy) onClose();
  };

  useEffect(() => {
    const backdrop = backdropRef.current!;
    const opener = document.activeElement as HTMLElement | null;
    stack.push(backdrop);
    refreshInert();
    const first = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? dialogRef.current;
    first?.focus();
    return () => {
      stack.splice(stack.indexOf(backdrop), 1);
      refreshInert();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...dialogRef.current!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === firstItem || active === dialogRef.current)) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && active === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  };

  // Only a press that starts and ends on the backdrop closes (a text selection dragged out of the box doesn't).
  const onBackdropDown = (e: MouseEvent) => (pressedOnBackdrop.current = e.target === e.currentTarget);
  const onBackdropClick = (e: MouseEvent) => {
    if (dismissible && pressedOnBackdrop.current && e.target === e.currentTarget) close();
    pressedOnBackdrop.current = false;
  };

  return createPortal(
    <div className="modal-backdrop" ref={backdropRef} onMouseDown={onBackdropDown} onClick={onBackdropClick}>
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy || undefined} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          {closeButton && (
            <button className="icon-btn" title={closeLabel ?? t('Close', 'Закрыть')} aria-label={closeLabel ?? t('Close', 'Закрыть')} onClick={close} disabled={busy}>
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
