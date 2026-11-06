/**
 * Full log of a QMK build/command with highlighting and a list of errors (file:line) above it.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Square } from 'lucide-react';
import { lineLevel, parseBuildLog } from '../../core/qmk/buildLog';
import { useQmkStore } from '../../store/qmkStore';
import { t } from '../../i18n';
import { issueLevelLabel } from '../../lib/issueLevel';

export function BuildLog() {
  const log = useQmkStore((s) => s.log);
  const job = useQmkStore((s) => s.job);
  const cancel = useQmkStore((s) => s.cancel);
  const ref = useRef<HTMLDivElement>(null);
  const summary = useMemo(() => parseBuildLog(log.map((l) => l.text)), [log]);
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [log]);
  const jump = (at: number) => {
    const el = ref.current?.querySelector(`[data-line="${at}"]`);
    el?.scrollIntoView({ block: 'center' });
  };
  return (
    <section className="section">
      <div className="section-head">
        <h2>
          {t('log', 'лог')} · {job?.kind ?? ''} {job?.running ? t('· running…', '· выполняется…') : ''}
        </h2>
        <div className="field-row">
          <span className="kicker">
            {summary.errors} {t('errors', 'ошибок')} · {summary.warnings} {t('warnings', 'предупр.')}
            {summary.size ? ` · ${summary.size.used}/${summary.size.max} B` : ''}
          </span>
          {job?.running && (
            <button className="btn btn--danger" onClick={() => void cancel()}>
              <Square size={13} strokeWidth={1.5} /> {t('stop', 'остановить')}
            </button>
          )}
        </div>
      </div>
      {summary.messages.filter((m) => m.level !== 'note').length > 0 && (
        <ul className="issue-list" style={{ marginBottom: 8 }}>
          {summary.messages
            .filter((m) => m.level !== 'note')
            .slice(0, 30)
            .map((m, i) => (
              <li key={i} className={`issue issue--${m.level === 'error' ? 'error' : 'warning'}`}>
                <span className="issue-where">{m.file ? `${m.file.split('/').pop()}:${m.line}${m.column ? `:${m.column}` : ''}` : issueLevelLabel(m.level)}</span>
                <button className="text-btn" style={{ textAlign: 'left' }} onClick={() => jump(m.at)}>
                  {m.text}
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="log" ref={ref} role="log" aria-live="polite">
        {log.map((l, i) => {
          const lv = l.stream === 'app' ? 'dim' : lineLevel(l.text);
          return (
            <div key={i} data-line={i} className={lv === 'error' ? 'l-err' : lv === 'warning' ? 'l-warn' : lv === 'info' ? 'l-ok' : lv === 'dim' ? 'l-dim' : undefined}>
              {l.text.replace(/\x1b\[[0-9;]*m/g, '')}
            </div>
          );
        })}
        {log.length === 0 && <span className="l-dim">{t('No output yet.', 'Вывода пока нет.')}</span>}
      </div>
    </section>
  );
}
