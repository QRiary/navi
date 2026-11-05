import { t } from '../i18n';

/** How bad a problem is, as the issue lists print it (core issues are error/warning, the compiler log adds note/info). */
export type IssueLevel = 'error' | 'warning' | 'note' | 'info';

/** The level's word for an issue row's first column: “error”, “warning”, “note”, “info”. */
export function issueLevelLabel(level: IssueLevel): string {
  if (level === 'error') return t('error', 'ошибка');
  if (level === 'warning') return t('warning', 'внимание');
  if (level === 'note') return t('note', 'заметка');
  return t('info', 'сведения');
}
