/** A line diff of a file (Firmware → files, “build + flash” before it overwrites a file edited outside NAVI). */
import { diffLines } from '../../core/qmk/textDiff';
import { t } from '../../i18n';

export function TextDiff({ lines }: { lines: ReturnType<typeof diffLines> }) {
  return (
    <div className="diff" aria-label={t('Changes', 'Изменения')}>
      {lines.map((l, i) =>
        l.kind === 'skip' ? (
          <div key={i} className="d-hunk">
            ⋯ {l.count} {t('unchanged lines', 'строк без изменений')}
          </div>
        ) : (
          <div key={i} className={l.kind === 'add' ? 'd-add' : l.kind === 'del' ? 'd-del' : undefined}>
            {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}
            {l.text}
          </div>
        ),
      )}
    </div>
  );
}
