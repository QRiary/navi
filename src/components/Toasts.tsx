import { useToastStore } from '../store/toastStore';

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <span className="toast-prompt">&gt;</span> {t.message}
        </div>
      ))}
    </div>
  );
}
