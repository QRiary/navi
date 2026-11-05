/**
 * Geometry inspector: properties of the selected keys (place, size, rotation, matrix position),
 * encoders and other controls. Geometry does not touch key assignments.
 */
import { Plus, Trash2 } from 'lucide-react';
import { newId } from '../../core/layout/geometry';
import { setKeyMatrix, updateGeometryMeta, updateKeys } from '../../core/project/ops';
import type { ControlGeom, EncoderGeom, KeyGeom, MatrixPos } from '../../core/project/types';
import { useActive } from '../../lib/projectContext';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { t } from '../../i18n';
import { deletedToast } from '../../lib/undoToast';
import { QMK_DOCS } from '../../lib/qmkDocs';
import { whyDisabled } from '../../lib/whyDisabled';
import { EmptyState } from '../EmptyState';
import { Hint } from '../InfoTip';

function Num({ label, value, onChange, step = 0.25, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="field-hint" style={{ display: 'grid', gap: 4 }}>
      <span className="field-label">{label}</span>
      <input
        className="input input--num"
        type="number"
        step={step}
        min={min}
        max={max}
        value={Math.round(value * 1000) / 1000}
        onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
      />
    </label>
  );
}

function MatrixInput({ value, rows, cols, onChange }: { value: MatrixPos | null; rows: number; cols: number; onChange: (m: MatrixPos | null) => void }) {
  return (
    <div className="field-row">
      <select className="select" value={value ? value[0] : ''} onChange={(e) => onChange(e.target.value === '' ? null : [Number(e.target.value), value?.[1] ?? 0])} aria-label={t('Row', 'Строка')}>
        <option value="">{t('none', 'нет')}</option>
        {Array.from({ length: rows }, (_, i) => (
          <option key={i} value={i}>
            {t('row', 'стр.')} {i}
          </option>
        ))}
      </select>
      <select
        className="select"
        value={value ? value[1] : ''}
        {...whyDisabled(!value && t('Choose a row first', 'Сначала выберите строку'))}
        onChange={(e) => value && onChange([value[0], Number(e.target.value)])}
        aria-label={t('Column', 'Столбец')}
      >
        {Array.from({ length: cols }, (_, i) => (
          <option key={i} value={i}>
            {t('col', 'стб.')} {i}
          </option>
        ))}
      </select>
    </div>
  );
}

export function GeometryInspector() {
  const active = useActive();
  const apply = useProjectStore((s) => s.apply);
  const selection = useEditorStore((s) => s.selection);
  if (!active) return null;
  const { project, geometry } = active;
  const { rows, cols } = project.hardware.matrix;
  const keys = geometry.keys.filter((k) => selection.includes(k.id));
  const ids = keys.map((k) => k.id);
  const patch = (fn: (k: KeyGeom) => Partial<KeyGeom>, label: string) => apply((p) => updateKeys(p, geometry.id, ids, fn), label, { coalesce: `geo:${label}:${ids.join(',')}` });

  const setEncoders = (encoders: EncoderGeom[], label: string) => apply((p) => updateGeometryMeta(p, geometry.id, { encoders }), label, label === 'delete' ? undefined : { coalesce: `enc:${label}` });
  const setControls = (controls: ControlGeom[], label: string) => apply((p) => updateGeometryMeta(p, geometry.id, { controls }), label, label === 'delete' ? undefined : { coalesce: `ctl:${label}` });

  const addEncoder = (
    <button
      className="btn"
      onClick={() => {
        const index = Math.max(-1, ...geometry.encoders.map((e) => e.index)) + 1;
        setEncoders([...geometry.encoders, { id: newId('enc'), index, x: 1, y: -1, d: 0.9, half: 'center', pressMatrix: null, label: `E${index}` }], 'add');
      }}
    >
      <Plus size={14} strokeWidth={1.5} /> {t('encoder', 'энкодер')}
    </button>
  );

  return (
    <div className="inspector-body">
      {keys.length === 1 && (
        <>
          <div className="kicker">
            {keys[0].label ?? t('key', 'клавиша')} {keys[0].approximate && <span className="badge badge--dim">{t('approx.', 'примерно')}</span>}
          </div>
          <div className="field-row">
            <Num label="x" value={keys[0].x} onChange={(v) => patch((k) => ({ x: v, rx: k.rx + (v - k.x) }), 'x')} />
            <Num label="y" value={keys[0].y} onChange={(v) => patch((k) => ({ y: v, ry: k.ry + (v - k.y) }), 'y')} />
            <Num label="w" value={keys[0].w} min={0.25} onChange={(v) => patch(() => ({ w: v }), 'w')} />
            <Num label="h" value={keys[0].h} min={0.25} onChange={(v) => patch(() => ({ h: v }), 'h')} />
          </div>
          <div className="field-row">
            <Num label={t('angle °', 'угол °')} value={keys[0].r} step={1} onChange={(v) => patch(() => ({ r: v }), 'r')} />
            <Num label="rx" value={keys[0].rx} onChange={(v) => patch(() => ({ rx: v }), 'rx')} />
            <Num label="ry" value={keys[0].ry} onChange={(v) => patch(() => ({ ry: v }), 'ry')} />
          </div>
          <div className="field">
            <span className="field-label">
              <Hint
                docs={QMK_DOCS.howAMatrixWorks}
                tip={t(
                  'The (row, column) of the matrix this key is wired to. Keymaps are stored by this position, so it must match the firmware.',
                  'Пара (строка, столбец) матрицы, к которой подключена клавиша. Раскладки хранятся по этой позиции, так что она должна совпадать с прошивкой.',
                )}
              >
                {t('matrix position', 'позиция в матрице')}
              </Hint>
            </span>
            <MatrixInput value={keys[0].matrix} rows={rows} cols={cols} onChange={(m) => apply((p) => setKeyMatrix(p, geometry.id, keys[0].id, m), t('matrix position', 'позиция матрицы'))} />
            <span className="field-hint">{t('If another key had this position, it is taken from it.', 'Если позиция была у другой клавиши — у той она снимается.')}</span>
          </div>
          <div className="field-row">
            <label className="field-hint">
              {t('label', 'подпись')} <input className="input" value={keys[0].label ?? ''} maxLength={20} onChange={(e) => patch(() => ({ label: e.target.value || undefined }), 'label')} />
            </label>
            <select className="select" value={keys[0].half} onChange={(e) => patch(() => ({ half: e.target.value as KeyGeom['half'] }), 'half')} aria-label={t('Half', 'Половина')}>
              <option value="left">{t('left half', 'левая половина')}</option>
              <option value="right">{t('right half', 'правая половина')}</option>
              <option value="center">{t('one piece', 'цельная')}</option>
            </select>
            <select className="select" value={keys[0].shape} onChange={(e) => patch(() => ({ shape: e.target.value as KeyGeom['shape'] }), 'shape')} aria-label={t('Shape', 'Форма')}>
              <option value="rect">{t('square', 'квадратная')}</option>
              <option value="circle">{t('round', 'круглая')}</option>
            </select>
          </div>
        </>
      )}
      {keys.length > 1 && (
        <>
          <div className="kicker">
            {keys.length} {t('keys', 'клавиш')}
          </div>
          <div className="field-row">
            <Num label="w" value={keys[0].w} min={0.25} onChange={(v) => patch(() => ({ w: v }), 'w')} />
            <Num label="h" value={keys[0].h} min={0.25} onChange={(v) => patch(() => ({ h: v }), 'h')} />
            <Num label={t('angle °', 'угол °')} value={keys[0].r} step={1} onChange={(v) => patch(() => ({ r: v }), 'r')} />
          </div>
          <div className="field-row">
            <button className="btn" onClick={() => patch(() => ({ half: 'left' }), 'half')}>
              {t('→ left half', '→ левая')}
            </button>
            <button className="btn" onClick={() => patch(() => ({ half: 'right' }), 'half')}>
              {t('→ right half', '→ правая')}
            </button>
          </div>
        </>
      )}
      {keys.length === 0 && (
        <p className="field-hint">
          {t(
            'Select keys on the layout to edit position, size, rotation and matrix position. Drag keys to move them.',
            'Выберите клавиши на схеме, чтобы менять место, размер, поворот и позицию матрицы. Клавиши можно перетаскивать.',
          )}
        </p>
      )}

      <div className="field">
        <span className="field-label">
          <Hint
            docs={QMK_DOCS.encoders}
            tip={t(
              'A rotary knob drawn on the layout. Its index is the number QMK uses for it; its press (if any) is a normal key in the matrix.',
              'Поворотная ручка на схеме. Её номер — тот, по которому её знает QMK; нажатие (если есть) — обычная клавиша матрицы.',
            )}
          >
            {t('encoders', 'энкодеры')}
          </Hint>
        </span>
        {geometry.encoders.length === 0 && (
          <EmptyState
            what={t(
              'Encoders drawn here show up on the Keyboard page, where you assign their turn keycodes.',
              'Нарисованные здесь энкодеры появятся в разделе «Клавиатура», где назначаются их keycode вращения.',
            )}
            example={t('E0 above the right half, with a press on matrix [4,5].', 'E0 над правой половиной, нажатие — матрица [4,5].')}
          >
            {addEncoder}
          </EmptyState>
        )}
        {geometry.encoders.map((e) => (
          <div key={e.id} className="field" style={{ borderLeft: 'var(--border)', paddingLeft: 8 }}>
            <div className="field-row">
              <span className="num kicker">E</span>
              <Num
                label={t('index', 'номер')}
                value={e.index}
                step={1}
                min={0}
                max={31}
                onChange={(v) =>
                  setEncoders(
                    geometry.encoders.map((x) => (x.id === e.id ? { ...x, index: Math.round(v), label: `E${Math.round(v)}` } : x)),
                    'index',
                  )
                }
              />
              <Num
                label="x"
                value={e.x}
                onChange={(v) =>
                  setEncoders(
                    geometry.encoders.map((x) => (x.id === e.id ? { ...x, x: v, approximate: false } : x)),
                    'x',
                  )
                }
              />
              <Num
                label="y"
                value={e.y}
                onChange={(v) =>
                  setEncoders(
                    geometry.encoders.map((x) => (x.id === e.id ? { ...x, y: v, approximate: false } : x)),
                    'y',
                  )
                }
              />
              <Num
                label="d"
                value={e.d}
                min={0.3}
                onChange={(v) =>
                  setEncoders(
                    geometry.encoders.map((x) => (x.id === e.id ? { ...x, d: v } : x)),
                    'd',
                  )
                }
              />
              <button
                className="icon-btn"
                aria-label={t('Delete encoder', 'Удалить энкодер')}
                onClick={() => {
                  setEncoders(
                    geometry.encoders.filter((x) => x.id !== e.id),
                    'delete',
                  );
                  deletedToast(t('encoder', 'энкодер'));
                }}
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </div>
            <span className="field-hint">{t('press = matrix position:', 'нажатие = позиция матрицы:')}</span>
            <MatrixInput
              value={e.pressMatrix}
              rows={rows}
              cols={cols}
              onChange={(m) =>
                setEncoders(
                  geometry.encoders.map((x) => (x.id === e.id ? { ...x, pressMatrix: m } : x)),
                  'press',
                )
              }
            />
          </div>
        ))}
        {geometry.encoders.length > 0 && addEncoder}
      </div>

      <div className="field">
        <span className="field-label">{t('other controls', 'другие органы управления')}</span>
        {geometry.controls.map((c) => (
          <div key={c.id} className="field" style={{ borderLeft: 'var(--border)', paddingLeft: 8 }}>
            <div className="field-row">
              <select
                className="select"
                value={c.kind}
                onChange={(e) =>
                  setControls(
                    geometry.controls.map((x) => (x.id === c.id ? { ...x, kind: e.target.value as ControlGeom['kind'] } : x)),
                    'kind',
                  )
                }
                aria-label={t('Kind', 'Тип')}
              >
                <option value="trackpad">{t('trackpad', 'трекпад')}</option>
                <option value="trackball">{t('trackball', 'трекбол')}</option>
                <option value="display">{t('display', 'экран')}</option>
                <option value="button">{t('button', 'кнопка')}</option>
                <option value="other">{t('other', 'другое')}</option>
              </select>
              <input
                className="input"
                style={{ flex: 1 }}
                value={c.label}
                onChange={(e) =>
                  setControls(
                    geometry.controls.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)),
                    'label',
                  )
                }
                aria-label={t('Label', 'Подпись')}
              />
              <button
                className="icon-btn"
                aria-label={t('Delete', 'Удалить')}
                onClick={() => {
                  setControls(
                    geometry.controls.filter((x) => x.id !== c.id),
                    'delete',
                  );
                  deletedToast(t('control', 'элемент управления'));
                }}
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </div>
            <div className="field-row">
              <Num
                label="x"
                value={c.x}
                onChange={(v) =>
                  setControls(
                    geometry.controls.map((x) => (x.id === c.id ? { ...x, x: v, approximate: false } : x)),
                    'x',
                  )
                }
              />
              <Num
                label="y"
                value={c.y}
                onChange={(v) =>
                  setControls(
                    geometry.controls.map((x) => (x.id === c.id ? { ...x, y: v, approximate: false } : x)),
                    'y',
                  )
                }
              />
              <Num
                label="w"
                value={c.w}
                onChange={(v) =>
                  setControls(
                    geometry.controls.map((x) => (x.id === c.id ? { ...x, w: v } : x)),
                    'w',
                  )
                }
              />
              <Num
                label="h"
                value={c.h}
                onChange={(v) =>
                  setControls(
                    geometry.controls.map((x) => (x.id === c.id ? { ...x, h: v } : x)),
                    'h',
                  )
                }
              />
            </div>
            {c.notes && <span className="field-hint">{c.notes}</span>}
          </div>
        ))}
        <button
          className="btn"
          onClick={() => setControls([...geometry.controls, { id: newId('ctl'), kind: 'other', x: 0, y: -2, w: 1.5, h: 1.5, shape: 'circle', half: 'center', label: t('control', 'элемент') }], 'add')}
        >
          <Plus size={14} strokeWidth={1.5} /> {t('control', 'элемент')}
        </button>
      </div>
    </div>
  );
}
