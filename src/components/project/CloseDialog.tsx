/**
 * CLOSING THE WINDOW WITH UNSAVED CHANGES (desktop): the main process holds the close and asks here
 * (electron/closeGuard.cjs); this dialog answers Save / Don't save / Cancel. It also keeps the main process told
 * the interface language and whether there is anything unsaved. In a plain browser: the browser's own beforeunload.
 */
import { useEffect, useMemo, useState } from 'react';
import { navi } from '../../desktop/bridge';
import { flushDraft, isDirty, saveProject, useProjectStore } from '../../store/projectStore';
import { toastError } from '../../store/toastStore';
import { useSettingsStore } from '../../store/settingsStore';
import { t } from '../../i18n';
import { Modal } from '../Modal';
import { whyDisabled } from '../../lib/whyDisabled';

export function CloseDialog() {
  const project = useProjectStore((s) => s.project);
  const saved = useProjectStore((s) => s.saved);
  const language = useSettingsStore((s) => s.settings.language);
  const dirty = useMemo(() => isDirty({ project, saved }), [project, saved]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'save' | 'discard' | null>(null);

  useEffect(() => void navi?.reportUiState({ language }), [language]);
  useEffect(() => void navi?.reportUiState({ dirty }), [dirty]);

  useEffect(() => {
    if (!navi) return;
    return navi.onCloseRequest(() => {
      void navi!.answerClose('shown');
      setOpen(true);
    });
  }, []);

  // No desktop bridge: the browser asks on its own.
  useEffect(() => {
    if (navi || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (!open) return null;
  const answer = (choice: 'close' | 'stay') => {
    setOpen(false);
    void navi?.answerClose(choice);
  };
  const discard = async () => {
    setBusy('discard');
    try {
      await flushDraft();
      answer('close');
    } catch (err) {
      toastError(
        t('Couldn’t save the draft, so the project was not closed. Save it with Ctrl+S and try again.', 'Не удалось сохранить черновик, поэтому проект не закрыт. Сохраните его (Ctrl+S) и повторите.'),
        err,
      );
      answer('stay');
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy('save');
    const result = await saveProject();
    setBusy(null);
    // Close only when everything is saved; a linked-file problem keeps the window so the user sees it.
    if (result === 'saved') answer('close');
    else answer('stay');
  };

  return (
    <Modal
      title={t('unsaved changes', 'несохранённые изменения')}
      onClose={() => answer('stay')}
      busy={busy !== null}
      footer={
        <>
          <button className="btn" onClick={() => answer('stay')} {...whyDisabled(busy !== null && t('Wait: saving…', 'Подождите: идёт сохранение…'))}>
            {t('cancel', 'отмена')}
          </button>
          <button className="btn" onClick={() => void discard()} {...whyDisabled(busy !== null && t('Wait: saving…', 'Подождите: идёт сохранение…'))}>
            {t("don't save", 'не сохранять')}
          </button>
          <button className="btn btn--primary" data-autofocus onClick={() => void save()} {...whyDisabled(busy !== null && t('Wait: saving…', 'Подождите: идёт сохранение…'))}>
            {busy === 'save' ? t('saving…', 'сохранение…') : t('save', 'сохранить')}
          </button>
        </>
      }
    >
      <p className="field-hint">
        {t(`“${project?.name ?? ''}” has unsaved changes. Save them before closing?`, `В «${project?.name ?? ''}» есть несохранённые изменения. Сохранить их перед закрытием?`)}
      </p>
      <p className="field-hint">{t("Don't save: the edits stay in the draft and reopen next time.", 'Не сохранять: правки остаются в черновике и откроются при следующем запуске.')}</p>
    </Modal>
  );
}
