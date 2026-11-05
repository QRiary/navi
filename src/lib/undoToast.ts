import { t } from '../i18n';
import { useProjectStore } from '../store/projectStore';
import { toast, useToastStore } from '../store/toastStore';

/**
 * Call right after a delete's `useProjectStore.apply(...)`: shows “Deleted: <what>” with an Undo button.
 * The button undoes only that delete: as soon as anything else changes the history (another edit, Ctrl+Z, another
 * project opened) the toast goes away, so Undo never reverts something the user didn't mean.
 */
export function deletedToast(what: string): void {
  const entry = useProjectStore.getState().past.at(-1);
  if (!entry) return;
  const isTop = () => useProjectStore.getState().past.at(-1) === entry;
  let id = 0;
  let stop = () => undefined as void;
  const unsubProject = useProjectStore.subscribe(() => {
    if (!isTop()) {
      stop();
      useToastStore.getState().dismiss(id);
    }
  });
  const unsubToasts = useToastStore.subscribe((s) => {
    if (id && !s.toasts.some((x) => x.id === id)) stop();
  });
  stop = () => {
    unsubProject();
    unsubToasts();
  };
  id = toast(t(`Deleted: ${what}`, `Удалено: ${what}`), 'info', {
    action: {
      label: t('Undo', 'Отменить'),
      run: () => {
        if (isTop()) useProjectStore.getState().undo();
        useToastStore.getState().dismiss(id);
      },
    },
  });
}
