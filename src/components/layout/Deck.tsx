/**
 * BOTTOM DECK (where the player is in CARRIER): three cells.
 *  left — the keyboard (VIA connection), center — layers and undo/redo,
 *  right — saving the project and writing to the keyboard.
 */
import { useMemo, useState } from 'react';
import { Redo2, RefreshCw, RotateCcw, Save, Undo2, Upload } from 'lucide-react';
import { activeKeymap } from '../../core/project/ops';
import { href } from '../../lib/router';
import { useDeviceStore } from '../../store/deviceStore';
import { useEditorStore } from '../../store/editorStore';
import { isDirty, saveProject, useProjectStore } from '../../store/projectStore';
import { WriteDialog } from '../device/WriteDialog';
import { t } from '../../i18n';
import { InfoTip } from '../InfoTip';
import { Tabs } from '../Tabs';
import { QMK_DOCS } from '../../lib/qmkDocs';
import { whyDisabled } from '../../lib/whyDisabled';

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
  const setHoverLayer = useEditorStore((s) => s.setHoverLayer);
  if (!project) return <div className="deck-cell deck-cell--center" />;
  const km = activeKeymap(project);
  const lastUndo = past[past.length - 1]?.label;
  const lastRedo = future[0]?.label;
  return (
    <div className="deck-cell deck-cell--center">
      <Tabs
        idBase="deck-layers"
        label={t('Layers', 'Слои')}
        className="deck-layers"
        tabClassName="deck-layer"
        // The layer shown changes the page itself, so the page is what these tabs control.
        panelId="main-content"
        items={km.layers.map((l, i) => ({ id: String(i), label: i, title: `${i} · ${l.name}` }))}
        current={String(layer)}
        onSelect={(id) => setLayer(Number(id))}
        // As on the Keyboard page's layer tabs: the keys leading to this layer light up on the keyboard.
        onHover={(id) => setHoverLayer(id === null ? null : Number(id))}
      />
      <InfoTip label={t('layers', 'слои')} docs={QMK_DOCS.layers}>
        {t(
          'The numbers are the keymap’s layers: click one to edit that layer. Layer 0 is the lowest; keys on higher layers take over unless they are transparent.',
          'Цифры — слои раскладки: нажмите, чтобы редактировать слой. Слой 0 самый нижний; клавиши верхних слоёв перекрывают нижние, если они не прозрачные.',
        )}
      </InfoTip>
      <span className="deck-sep" />
      <button
        className="icon-btn icon-btn--lg"
        onClick={undo}
        aria-label={t('Undo', 'Отменить')}
        {...whyDisabled(past.length === 0 && t('Nothing to undo', 'Нечего отменять'), `${t('Undo', 'Отменить')} (Ctrl+Z)${lastUndo ? `: ${lastUndo}` : ''}`)}
      >
        <Undo2 {...ICON} />
      </button>
      <button
        className="icon-btn icon-btn--lg"
        onClick={redo}
        aria-label={t('Redo', 'Повторить')}
        {...whyDisabled(future.length === 0 && t('Nothing to redo', 'Нечего повторять'), `${t('Redo', 'Повторить')} (Ctrl+Y)${lastRedo ? `: ${lastRedo}` : ''}`)}
      >
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
  const revertToSaved = useProjectStore((s) => s.revertToSaved);
  const status = useDeviceStore((s) => s.status);
  const [writing, setWriting] = useState(false);
  const dirty = useMemo(() => isDirty({ project, saved }), [project, saved]);
  if (!project) return <div className="deck-cell deck-cell--right" />;
  return (
    <div className="deck-cell deck-cell--right">
      <div className={`save-state ${dirty ? 'save-state--dirty' : ''}`}>
        <strong>
          {dirty ? t('unsaved', 'не сохранено') : t('saved', 'сохранено')}{' '}
          <InfoTip label={t('saving', 'сохранение')}>
            {t(
              'Your edits are kept as a draft automatically, but only Save (Ctrl+S) makes a version you can return to; the arrow beside it goes back to the last saved one. “To keyboard” is separate: it writes the keymap to the connected keyboard and does not save the project.',
              'Правки автоматически хранятся черновиком, но вернуться можно только к версии, созданной «Сохранить» (Ctrl+S); стрелка рядом возвращает последнюю сохранённую. «В клавиатуру» — отдельное действие: оно записывает раскладку в подключённую клавиатуру, но не сохраняет проект.',
            )}
          </InfoTip>
        </strong>
        {(() => {
          const note = draftError ? t(`draft error: ${draftError}`, `ошибка черновика: ${draftError}`) : dirty ? t('draft is kept automatically', 'черновик хранится автоматически') : project.name;
          return <span title={note}>{note}</span>;
        })()}
      </div>
      <button
        className="icon-btn"
        aria-label={t('Back to the saved version', 'Вернуть сохранённую версию')}
        {...whyDisabled(
          (!saved && t('Not saved yet', 'Ещё не сохранено')) || (!dirty && t('Nothing changed since the last save', 'С прошлого сохранения ничего не менялось')),
          t(
            'Back to the saved version: drops every edit since the last save (Ctrl+Z brings them back)',
            'Вернуть сохранённую версию: убирает все правки с прошлого сохранения (Ctrl+Z вернёт их)',
          ),
        )}
        onClick={revertToSaved}
      >
        <RotateCcw {...ICON} />
      </button>
      <button
        className="btn btn--primary"
        {...whyDisabled((saving && t('Wait: saving…', 'Подождите: идёт сохранение…')) || (!dirty && t('Nothing changed since the last save', 'С прошлого сохранения ничего не менялось')), 'Ctrl+S')}
        onClick={() => void saveProject()}
      >
        <Save size={14} strokeWidth={1.5} /> {t('save', 'сохранить')}
      </button>
      <button
        className="btn"
        {...whyDisabled(
          status !== 'connected' &&
            (status === 'busy' || status === 'connecting'
              ? t('Wait: the keyboard is busy', 'Подождите: клавиатура занята')
              : t('Connect the keyboard first (Device page)', 'Сначала подключите клавиатуру (страница «Устройство»)')),
          t('Write the keymap to the connected keyboard (VIA)', 'Записать раскладку в подключённую клавиатуру (VIA)'),
        )}
        onClick={() => setWriting(true)}
      >
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
