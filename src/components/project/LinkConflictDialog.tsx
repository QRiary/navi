/**
 * THE LINKED FILE CHANGED OUTSIDE NAVI (git pull, a hand edit): show the differences and let the user pick.
 * Nothing is written until they do; closing the window decides later (the next Save asks again).
 */
import { useMemo } from 'react';
import { X } from 'lucide-react';
import { diffProjects } from '../../core/project/diff';
import { useProjectStore } from '../../store/projectStore';
import { toast } from '../../store/toastStore';
import { t } from '../../i18n';
import { DiffView } from './DiffView';

export function LinkConflictDialog() {
  const conflict = useProjectStore((s) => s.linkConflict);
  const project = useProjectStore((s) => s.project);
  const saved = useProjectStore((s) => s.saved);
  const resolve = useProjectStore((s) => s.resolveLinkConflict);
  const dismiss = useProjectStore((s) => s.dismissLinkConflict);
  const mine = conflict?.kind === 'save' ? (saved ?? project) : project;
  const diff = useMemo(() => (conflict?.file && mine ? diffProjects(conflict.file, mine) : null), [conflict, mine]);
  if (!conflict || !mine) return null;

  const pick = (choice: 'mine' | 'file') =>
    void resolve(choice)
      .then(() => {
        if (choice === 'file') toast(t('Loaded the linked file (your previous version is in “versions”)', 'Загружен связанный файл (ваша прошлая версия — в «версиях»)'));
      })
      .catch((err: Error) => toast(err.message, 'error'));

  const onSave = conflict.kind === 'save';
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('The linked file changed', 'Связанный файл изменился')}>
      <div className="modal">
        <div className="modal-head">
          <h2>{t('The linked file changed outside NAVI', 'Связанный файл изменился вне NAVI')}</h2>
          <button className="icon-btn" title={t('Decide later', 'Решить позже')} aria-label={t('Decide later', 'Решить позже')} onClick={dismiss}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="modal-body">
          <p className="field-hint">
            <code>{conflict.path}</code>
          </p>
          <p className="field-hint">
            {onSave
              ? t('Your version is saved in NAVI, but not in the file yet: the file was changed elsewhere (git pull, another program).', 'Ваша версия сохранена в NAVI, но ещё не в файле: файл изменили в другом месте (git pull, другая программа).')
              : t('You have unsaved edits, and the file was changed elsewhere (git pull, another program).', 'У вас есть несохранённые правки, а файл изменили в другом месте (git pull, другая программа).')}
          </p>
          {conflict.file && diff ? (
            <>
              <span className="cell-label">{t('the file → your version', 'файл → ваша версия')}</span>
              <DiffView diff={diff} before={conflict.file} />
            </>
          ) : (
            <p className="field-hint">
              {t(`The file cannot be read as a NAVI project: ${conflict.fileError ?? ''}`, `Файл не читается как проект NAVI: ${conflict.fileError ?? ''}`)}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={dismiss}>
            {t('decide later', 'решить позже')}
          </button>
          {conflict.file && (
            <button className="btn" onClick={() => pick('file')}>
              {onSave ? t('load the file’s version', 'загрузить версию из файла') : t('take the file', 'взять файл')}
            </button>
          )}
          <button className="btn btn--primary" onClick={() => pick('mine')}>
            {onSave ? t('overwrite the file', 'перезаписать файл') : t('keep my edits', 'оставить мои правки')}
          </button>
        </div>
      </div>
    </div>
  );
}
