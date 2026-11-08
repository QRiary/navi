/**
 * "Behavior changes since the last build" (core/qmk/behaviorChanges.ts, store/behaviorStore.ts): one sentence per
 * cause, the tests behind it folded under it; changes no explainer claims as plain was / now lines under
 * "other changes". The same list on the key editor, the Advanced tabs, the Layers page and Firmware → Build.
 */
import type { CSSProperties } from 'react';
import { friendlyName } from '../../core/keycodes/friendly';
import type { KeycodeSpec } from '../../core/keycodes/spec';
import { causeKey, type BehaviorChange, type ChangeCase, type ChangeCause } from '../../core/qmk/behaviorChanges';
import { activeKeymap } from '../../core/project/ops';
import type { Project } from '../../core/project/types';
import { useBehaviorStore } from '../../store/behaviorStore';
import { EmptyState } from '../EmptyState';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { count, getLanguage, t } from '../../i18n';

/** The open project's changes since the last build; null when there is no build to compare with. */
export function useBehaviorChanges(): BehaviorChange[] | null {
  return useBehaviorStore((s) => s.changes);
}

/** What a cause is, for a group heading: "r3c0 on Game (Esc · hold Alt)", "Combo CB_AB". */
export function causeLabel(cause: ChangeCause, project: Project, spec: KeycodeSpec): string {
  const named = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name || id;
  switch (cause.kind) {
    case 'key': {
      const km = activeKeymap(project);
      const li = km.layers.findIndex((l) => l.id === cause.layerId);
      const spot = `r${cause.pos[0]}c${cause.pos[1]}`;
      if (li < 0) return t(`${spot} on a deleted layer`, `${spot} на удалённом слое`);
      const v = km.layers[li]!.keys[cause.pos[0] * project.hardware.matrix.cols + cause.pos[1]] ?? 0;
      const name = friendlyName(spec, v, { layerName: (l) => km.layers[l]?.name }).text;
      return t(`Key ${spot} on ${km.layers[li]!.name || `layer ${li}`} (now ${name})`, `Клавиша ${spot} на слое ${km.layers[li]!.name || li} (теперь ${name})`);
    }
    case 'combo':
      return `${t('Combo', 'Комбо')} ${named(project.combos, cause.id)}`;
    case 'tap-dance':
      return `${t('Tap dance', 'Тап-дэнс')} ${named(project.tapDances, cause.id)}`;
    case 'key-override':
      return `${t('Key override', 'Подмена сочетания')} ${named(project.keyOverrides, cause.id)}`;
    case 'tap-hold': {
      const s = project.tapHolds.find((x) => x.id === cause.id);
      const keys = s ? s.keycodes.map((v) => friendlyName(spec, v).qmk).join(', ') : cause.id;
      return `${t('Tap-hold setting', 'Настройка тап-холда')} ${keys}`;
    }
    case 'layers':
      return t('The layer list or layer settings', 'Список слоёв или настройки слоёв');
    case 'settings':
      return t('Other project settings', 'Другие настройки проекта');
  }
}

function Cases({ cases }: { cases: ChangeCase[] }) {
  const out = (x: string | null) => (x === null ? <span className="dim">{t('not tested', 'не проверяется')}</span> : <code style={{ overflowWrap: 'anywhere' }}>{x}</code>);
  return (
    <>
      {cases.map((c, i) => (
        <div key={i} className="field-hint" style={{ margin: '4px 0' }}>
          <code style={{ overflowWrap: 'anywhere' }}>{c.steps}</code>: {t('was', 'было')} {out(c.was)}, {t('now', 'стало')} {out(c.now)}
        </div>
      ))}
    </>
  );
}

function Sentence({ change }: { change: BehaviorChange }) {
  const lang = getLanguage();
  return (
    <li style={{ margin: '4px 0' }}>
      <span>{lang === 'ru' ? change.text!.ru : change.text!.en}</span>
      {change.cases.length > 0 && (
        <details>
          <summary className="field-hint">{count(change.cases.length, ['test', 'tests'], ['тест', 'теста', 'тестов'])}</summary>
          <Cases cases={change.cases} />
        </details>
      )}
    </li>
  );
}

/** The sentences, then the changes no explainer claims as was / now lines. */
export function BehaviorChangeList({ changes }: { changes: readonly BehaviorChange[] }) {
  const said = changes.filter((c) => c.text);
  const other = changes.filter((c) => !c.text).flatMap((c) => c.cases);
  return (
    <div>
      {said.length > 0 && (
        <ul className="steps-list" style={{ margin: 0 }}>
          {said.map((c, i) => (
            <Sentence key={i} change={c} />
          ))}
        </ul>
      )}
      {other.length > 0 && (
        <details>
          <summary className="field-hint">{t(`other changes (${other.length})`, `другие изменения (${other.length})`)}</summary>
          <Cases cases={other} />
        </details>
      )}
    </div>
  );
}

/** A small block for an editor: the changes `pick` selects from the open project's list; nothing when there are none. */
export function BehaviorChangesHere({ pick, className = 'field', style }: { pick: (changes: BehaviorChange[]) => BehaviorChange[]; className?: string; style?: CSSProperties }) {
  const changes = useBehaviorChanges();
  const here = changes ? pick(changes) : [];
  if (!here.length) return null;
  return (
    <div className={className} style={style}>
      <span className="field-label">{t('behavior changes since the last build', 'изменения поведения после последней сборки')}</span>
      <BehaviorChangeList changes={here} />
    </div>
  );
}

/** Firmware → Build: everything since the last build, grouped by cause. */
export function BehaviorChangesSinceBuild() {
  const project = useProjectStore((s) => s.project);
  const spec = useSpec();
  const baseline = useBehaviorStore((s) => s.baseline);
  const changes = useBehaviorChanges();
  if (!project || baseline === undefined) return null;
  const groups = new Map<string, { cause: ChangeCause; changes: BehaviorChange[] }>();
  for (const c of changes ?? []) {
    const main = c.causes[0];
    const key = causeKey(main);
    const g = groups.get(key) ?? { cause: main, changes: [] };
    g.changes.push(c);
    groups.set(key, g);
  }
  return (
    <div className="panel-box" style={{ marginBottom: 'var(--gap)' }}>
      <div className="panel-box-head">
        <span className="cell-label">{t('behavior changes since the last build', 'изменения поведения после последней сборки')}</span>
      </div>
      <div className="panel-box-body field">
        {baseline === null ? (
          <EmptyState what={t('No build yet to compare with: the list starts after NAVI writes the keymap files.', 'Пока не с чем сравнить: список появится после того, как NAVI запишет файлы keymap.')} />
        ) : changes === null ? null : !changes.length ? (
          <EmptyState
            what={t('No behavior changes since the keymap files were last written.', 'С последней записи файлов keymap поведение не изменилось.')}
            example={t('A key turned into a tap-hold key that Key Lock then ignores, a combo that stops firing, a layer no key reaches.', 'Клавиша стала тап-холдом, и Key Lock её пропускает; комбо перестало срабатывать; слой больше ничем не включается.')}
          />
        ) : (
          [...groups.values()].map((g) => (
            <div key={causeKey(g.cause)} style={{ margin: '4px 0' }}>
              <div className="kicker">{causeLabel(g.cause, project, spec)}</div>
              <BehaviorChangeList changes={g.changes} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
