/**
 * BOTTOM DECK (where the player is in CARRIER): three cells.
 *  left — the keyboard (VIA connection), center — layers and undo/redo,
 *  right — saving the project and writing to the keyboard.
 */
import { useMemo, useState } from 'react';
import { Redo2, RefreshCw, Save, Undo2, Upload } from 'lucide-react';
import { activeKeymap } from '../../core/project/ops';
import { href } from '../../lib/router';
import { useDeviceStore } from '../../store/deviceStore';
import { useEditorStore } from '../../store/editorStore';
import { isDirty, saveProject, useProjectStore } from '../../store/projectStore';
import { WriteDialog } from '../device/WriteDialog';
import { t } from '../../i18n';

const ICON = { size: 16, strokeWidth: 1.5 };

function DeviceCell() {
  const status = useDeviceStore((s) => s.status);
  const current = useDeviceStore((s) => s.current);
  const caps = useDeviceStore((s) => s.caps);
  const matrix = useDeviceStore((s) => s.matrix);
  const devices = useDeviceStore((s) => s.devices);
  const progress = useDeviceStore((s) => s.progress);
  const error = useDeviceStore((s) => s.error);
  const supported = useDeviceStore((s) => s.supported);
  const refresh = useDeviceStore((s) => s.refresh);

  const connected = status === 'connected' || status === 'busy';
  return (
    <div className="deck-cell">
      <span className={`dev-led dev-led--${connected ? (status === 'busy' ? 'busy' : 'connected') : status}`} aria-hidden="true" />
      <a className="dev-meta" href={href({ section: 'device' })} style={{ flex: 1 }}>
        {connected || status === 'connecting' ? (
          <>
            <span className="dev-title">{current?.productName ?? '—'}</span>
            <span className="dev-sub">
              {status === 'connecting'
                ? `${t('connecting', 'подключение')} · ${progress?.what ?? ''}`
                : `VIA v${caps?.protocol} · ${caps?.layers} ${t('layers', 'слоя')} · ${matrix?.rows}×${matrix?.cols}${status === 'busy' ? ` · ${progress?.what ?? ''}` : ''}`}
            </span>
          </>
        ) : (
          <>
            <span className="dev-title dev-title--empty">{status === 'disconnected' ? t('disconnected', 'отключена') : t('no device', 'нет клавиатуры')}</span>
            <span className="dev-sub">
              {!supported
                ? t('WebHID is not available here', 'WebHID здесь недоступен')
                : error
                  ? error
                  : devices.length
                    ? t(`${devices.length} found · open “Device”`, `найдено: ${devices.length} · откройте «Устройство»`)
                    : t('offline mode · project only', 'без клавиатуры · только проект')}
            </span>
          </>
        )}
      </a>
      <button className="icon-btn" aria-label={t('Search keyboards', 'Искать клавиатуры')} title={t('Search keyboards', 'Искать клавиатуры')} onClick={() => void refresh()}>
        <RefreshCw {...ICON} />
      </button>
      {(status === 'busy' || status === 'connecting') && progress && (
        <div className="progress" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <i style={{ width: `${Math.round(progress.part * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function LayersCell() {
  const project = useProjectStore((s) => s.project);
  const past = useProjectStore((s) => s.past);
  const future = useProjectStore((s) => s.future);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const layer = useEditorStore((s) => s.layer);
  const setLayer = useEditorStore((s) => s.setLayer);
  if (!project) return <div className="deck-cell deck-cell--center" />;
  const km = activeKeymap(project);
  const lastUndo = past[past.length - 1]?.label;
  const lastRedo = future[0]?.label;
  return (
    <div className="deck-cell deck-cell--center">
      <div className="deck-layers" role="tablist" aria-label={t('Layers', 'Слои')}>
        {km.layers.map((l, i) => (
          <button key={l.id} role="tab" aria-selected={i === layer} className={`deck-layer ${i === layer ? 'is-active' : ''}`} onClick={() => setLayer(i)} title={`${i} · ${l.name}`}>
            {i}
          </button>
        ))}
      </div>
      <span className="deck-sep" />
      <button className="icon-btn icon-btn--lg" disabled={past.length === 0} onClick={undo} aria-label={t('Undo', 'Отменить')} title={`${t('Undo', 'Отменить')} (Ctrl+Z)${lastUndo ? `: ${lastUndo}` : ''}`}>
        <Undo2 {...ICON} />
      </button>
      <button className="icon-btn icon-btn--lg" disabled={future.length === 0} onClick={redo} aria-label={t('Redo', 'Повторить')} title={`${t('Redo', 'Повторить')} (Ctrl+Y)${lastRedo ? `: ${lastRedo}` : ''}`}>
        <Redo2 {...ICON} />
      </button>
    </div>
  );
}

function SaveCell() {
  const project = useProjectStore((s) => s.project);
  const saved = useProjectStore((s) => s.saved);
  const saving = useProjectStore((s) => s.saving);
  const draftError = useProjectStore((s) => s.draftError);
  const status = useDeviceStore((s) => s.status);
  const [writing, setWriting] = useState(false);
  const dirty = useMemo(() => isDirty({ project, saved }), [project, saved]);
  if (!project) return <div className="deck-cell deck-cell--right" />;
  return (
    <div className="deck-cell deck-cell--right">
      <div className={`save-state ${dirty ? 'save-state--dirty' : ''}`}>
        <strong>{dirty ? t('unsaved', 'не сохранено') : t('saved', 'сохранено')}</strong>
        {(() => {
          const note = draftError ? t(`draft error: ${draftError}`, `ошибка черновика: ${draftError}`) : dirty ? t('draft is kept automatically', 'черновик хранится автоматически') : project.name;
          return <span title={note}>{note}</span>;
        })()}
      </div>
      <button
        className="btn btn--primary"
        disabled={!dirty || saving}
        onClick={() => void saveProject()}
        title="Ctrl+S"
      >
        <Save size={14} strokeWidth={1.5} /> {t('save', 'сохранить')}
      </button>
      <button className="btn" disabled={status !== 'connected'} onClick={() => setWriting(true)} title={t('Write the keymap to the connected keyboard (VIA)', 'Записать раскладку в подключённую клавиатуру (VIA)')}>
        <Upload size={14} strokeWidth={1.5} /> {t('to keyboard', 'в клавиатуру')}
      </button>
      {writing && <WriteDialog onClose={() => setWriting(false)} />}
    </div>
  );
}

export function Deck() {
  return (
    <footer className="deck" aria-label={t('Device and project', 'Устройство и проект')}>
      <DeviceCell />
      <LayersCell />
      <SaveCell />
    </footer>
  );
}
