/**
 * Changes between two project versions: keys (layer, position, before → after), encoders, sections.
 */
import type { ProjectDiff } from '../../core/project/diff';
import { keyLabel } from '../../core/keycodes/labels';
import type { Project } from '../../core/project/types';
import { useLabelContext } from '../../lib/projectContext';
import { useSpec } from '../../store/projectStore';
import { t } from '../../i18n';

const SECTION_NAMES = (): Record<string, string> => ({
  name: t('name', 'название'),
  hardware: t('hardware profile', 'профиль железа'),
  geometry: t('geometry', 'геометрия'),
  keymaps: t('keymaps / layer names', 'раскладки / имена слоёв'),
  macros: t('macros', 'макросы'),
  tapDances: 'tap dance',
  combos: t('combos', 'комбо'),
  keyOverrides: t('key overrides', 'подмены'),
  customKeycodes: t('custom keycodes', 'свои keycodes'),
  keyAliases: t('key aliases', 'псевдонимы клавиш'),
  tapHolds: t('tap-hold settings', 'настройки тап-холд'),
  keyLists: t('key lists', 'списки клавиш'),
  tapHoldActions: t('tap-hold keys with actions', 'тап-холд клавиши с действиями'),
  leaderSequences: t('leader sequences', 'последовательности лидера'),
  unicodeMap: t('unicode table', 'таблица юникода'),
  lighting: t('lighting', 'подсветка'),
  firmware: t('firmware settings', 'настройки прошивки'),
});

export function DiffView({ diff, before, limit = 80 }: { diff: ProjectDiff; before: Project; limit?: number }) {
  const spec = useSpec();
  const labelCtx = useLabelContext();
  if (!labelCtx) return null;
  const name = (v: number) => keyLabel(spec, v, labelCtx).qmk;
  const layerName = (keymapId: string, l: number) => before.keymaps.find((k) => k.id === keymapId)?.layers[l]?.name ?? `L${l}`;
  const empty = diff.keys.length === 0 && diff.encoders.length === 0 && diff.sections.length === 0 && !diff.layersAdded && !diff.layersRemoved;
  if (empty) return <p className="status-ok">{t('No differences.', 'Отличий нет.')}</p>;
  return (
    <div className="field">
      <span className="kicker">
        {t('keys', 'клавиш')}: {diff.keys.length} · {t('encoder actions', 'действий энкодеров')}: {diff.encoders.length}
        {diff.layersAdded ? ` · +${diff.layersAdded} ${t('layers', 'слоёв')}` : ''}
        {diff.layersRemoved ? ` · −${diff.layersRemoved} ${t('layers', 'слоёв')}` : ''}
      </span>
      {diff.sections.length > 0 && (
        <span className="field-hint">
          {t('also changed', 'также изменено')}: {diff.sections.map((s) => SECTION_NAMES()[s] ?? s).join(', ')}
        </span>
      )}
      {(diff.keys.length > 0 || diff.encoders.length > 0) && (
        <div className="diff" style={{ maxHeight: 260 }}>
          {diff.keys.slice(0, limit).map((k, i) => (
            <div key={`k${i}`}>
              {layerName(k.keymapId, k.layer)} [{k.pos[0]},{k.pos[1]}] <span className="d-del">{name(k.before)}</span> → <span className="d-add">{name(k.after)}</span>
            </div>
          ))}
          {diff.keys.length > limit && <div className="d-hunk">⋯ +{diff.keys.length - limit}</div>}
          {diff.encoders.map((e, i) => (
            <div key={`e${i}`}>
              {layerName(e.keymapId, e.layer)} E{e.encoder} {e.dir === 'cw' ? '↻' : '↺'} <span className="d-del">{name(e.before)}</span> → <span className="d-add">{name(e.after)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
