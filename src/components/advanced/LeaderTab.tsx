/**
 * Leader key: press QK_LEAD, then 1–5 keys → action.
 * The generator writes leader_end_user() into keymap.c; the wait time is LEADER_TIMEOUT (“Behavior”).
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { checkLeaderSequences } from '../../core/features/advanced';
import { parseKeySequence, sequenceText } from '../../core/keycodes/sequence';
import { newId } from '../../core/layout/geometry';
import type { LeaderSequence, Project } from '../../core/project/types';
import { href } from '../../lib/router';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { ActionEditor, FeatureNote, IssueList } from './common';
import { getLanguage, t } from '../../i18n';
import { deletedToast } from '../../lib/undoToast';

const ICON = { size: 14, strokeWidth: 1.5 };

function SequenceInput({ seq, onChange }: { seq: LeaderSequence; onChange: (keys: number[]) => void }) {
  const spec = useSpec();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lang = getLanguage();
  const commit = () => {
    if (text === null) return;
    const r = parseKeySequence(spec, text);
    if ('error' in r) setError(lang === 'ru' ? r.error.ru : r.error.en);
    else {
      onChange(r.keys);
      setText(null);
      setError(null);
    }
  };
  return (
    <form
      className={`expr-input ${error ? 'is-error' : ''}`}
      title={error ?? undefined}
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input value={text ?? sequenceText(spec, seq.keys)} placeholder="d d" spellCheck={false} onChange={(e) => setText(e.target.value)} onBlur={commit} aria-label={t('Keys after Leader', 'Клавиши после лидера')} />
      {error && <span className="expr-result">{error}</span>}
    </form>
  );
}

export function LeaderTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const issues = useMemo(() => checkLeaderSequences(spec, project), [spec, project]);
  const set = (list: LeaderSequence[], label: string, coalesce?: string) => apply((p) => ({ ...p, leaderSequences: list }), label, coalesce ? { coalesce } : undefined);
  const patch = (id: string, p: Partial<LeaderSequence>, label: string, coalesce?: string) => set(project.leaderSequences.map((x) => (x.id === id ? { ...x, ...p } : x)), label, coalesce);
  const cols = '40px minmax(140px,0.8fr) 150px minmax(160px,1.2fr) auto';
  return (
    <div className="page">
      <FeatureNote project={project} feature="leader" />
      <p className="field-hint">
        {t(
          'Press the Leader key (QK_LEAD), then type a short sequence — e.g. Leader, d, d → type your e-mail. Keys are plain keys as printed (US layout); type them separated by spaces: “d d”, “g h”, “f1 x”. The wait time is LEADER_TIMEOUT in ',
          'Нажмите клавишу-лидер (QK_LEAD), затем короткую последовательность — например, лидер, d, d → набрать e-mail. Клавиши — простые, как на клавише (раскладка US), через пробел: «d d», «g h», «f1 x». Время ожидания — LEADER_TIMEOUT в ',
        )}
        <a href={href({ section: 'advanced', tab: 'behavior' })}>{t('QMK settings', '«Настройках QMK»')}</a>.
      </p>
      <div className="panel-box rows">
        {project.leaderSequences.length > 0 && (
          <div className="row kicker" style={{ ['--row-cols' as string]: cols }}>
            <span>#</span>
            <span>{t('keys after Leader', 'клавиши после лидера')}</span>
            <span>{t('action', 'действие')}</span>
            <span />
            <span />
          </div>
        )}
        {project.leaderSequences.map((s, i) => (
          <div key={s.id} className="row" style={{ ['--row-cols' as string]: cols }}>
            <span className="num">{i + 1}</span>
            <SequenceInput seq={s} onChange={(keys) => patch(s.id, { keys }, t('leader keys', 'клавиши лидера'))} />
            <ActionEditor action={s.action} coalesceKey={`lead:${s.id}`} onChange={(action, coalesce) => patch(s.id, { action }, t('leader action', 'действие лидера'), coalesce)} />
            <button className="icon-btn" aria-label={t('Delete', 'Удалить')} onClick={() => { set(project.leaderSequences.filter((x) => x.id !== s.id), t('delete sequence', 'удаление последовательности')); deletedToast(t('leader sequence', 'последовательность leader')); }}>
              <Trash2 {...ICON} />
            </button>
          </div>
        ))}
      </div>
      <div className="field-row">
        <button
          className="btn btn--primary"
          disabled={project.leaderSequences.length >= 256}
          onClick={() => set([...project.leaderSequences, { id: newId('lead'), keys: [0x07], action: { type: 'send-string', text: '' } }], t('new leader sequence', 'новая последовательность'))}
        >
          <Plus {...ICON} /> {t('sequence', 'последовательность')}
        </button>
        <span className="field-hint">{t('Put QK_LEAD on a key in the editor: catalog → search “leader”.', 'Поставьте QK_LEAD на клавишу в редакторе: каталог → поиск «leader».')}</span>
      </div>
      <IssueList issues={issues} />
    </div>
  );
}
