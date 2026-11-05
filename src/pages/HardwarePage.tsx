/**
 * HARDWARE SECTION:
 *  • geometry — drawing editor: move (with snapping), rotate, resize, add,
 *    copy, mirror a half, assign matrix positions (in order or by pressing a key);
 *  • profile — what is known about the keyboard and where from (from the keyboard, from the sources, by hand);
 *  • variants — several geometries in a project, import from QMK / VIA / KLE.
 * Key assignments are stored by matrix — the geometry can change without breaking the keymap.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, FlipHorizontal2, Plus, RotateCcw, RotateCw, Trash2, Wand2 } from 'lucide-react';
import { KeyboardCanvas, type KeyView } from '../components/keyboard/KeyboardCanvas';
import { checkGeometry, cloneGeometry, geometryBounds, keyCenter, mirrorKeys, rotatePoint } from '../core/layout/geometry';
import { dilemma4x6Clone, gridGeometry } from '../core/layout/templates';
import { addGeometry, addKey, moveKeys, patchProject, removeGeometry, removeKeys, resizeMatrix, setKeyMatrix, updateKeys } from '../core/project/ops';
import { friendlyName } from '../core/keycodes/friendly';
import { keyLabel } from '../core/keycodes/labels';
import type { Geometry, HardwareProfile, KeyGeom, MatrixPos, Project } from '../core/project/types';
import { importKle, importQmkLayout, importViaDefinition, detectFileKind, listQmkLayouts } from '../core/io/formats';
import { JSON_FILTERS, openTextFile } from '../lib/files';
import { hidFromCode } from '../lib/hidCodes';
import { useActive, useLabelContext } from '../lib/projectContext';
import { href } from '../lib/router';
import { currentTab, tabItems, tabRoute } from '../lib/sections';
import { useScrollMemory } from '../lib/scrollMemory';
import { TabPanels, Tabs } from '../components/Tabs';
import { useDeviceStore } from '../store/deviceStore';
import { useEditorStore } from '../store/editorStore';
import { useProjectStore, useSpec } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import { toast } from '../store/toastStore';
import { getLanguage, locale, t } from '../i18n';
import { deletedToast } from '../lib/undoToast';
import { QMK_DOCS } from '../lib/qmkDocs';
import { whyDisabled } from '../lib/whyDisabled';
import { issueLevelLabel } from '../lib/issueLevel';
import { Hint } from '../components/InfoTip';
import { PinsTab } from '../components/hardware/PinsTab';
import { ListFilter } from '../components/ListFilter';
import { matchesQuery, useListFilter } from '../lib/find';
import { ErrorDetails, rawError } from '../components/ErrorDetails';

const ICON = { size: 15, strokeWidth: 1.5 };

type AssignMode = { kind: 'sequence'; next: MatrixPos; dir: 'cols' | 'rows' } | { kind: 'press' } | null;

/** `visible`: the tab is shown; while hidden (kept mounted) “press a key” stops listening and the matrix test stops. */
function GeometryEditor({ visible }: { visible: boolean }) {
  const active = useActive();
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const apply = useProjectStore((s) => s.apply);
  const editor = useEditorStore();
  const snap = useSettingsStore((s) => s.settings.editor.snap);
  const keySize = useSettingsStore((s) => s.settings.keyboard.keySize);
  const deviceSnapshot = useDeviceStore((s) => s.snapshot);
  const testerActive = useDeviceStore((s) => s.testerActive);
  const startTester = useDeviceStore((s) => s.startTester);
  const stopTester = useDeviceStore((s) => s.stopTester);
  const [assign, setAssign] = useState<AssignMode>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const issues = useMemo(() => (active ? checkGeometry(active.geometry, active.project.hardware.matrix.rows, active.project.hardware.matrix.cols) : []), [active]);

  const geoId = active?.geometry.id;
  const assignTo = useCallback(
    (key: KeyGeom, pos: MatrixPos) => {
      if (!geoId) return;
      apply((p) => setKeyMatrix(p, geoId, key.id, pos), t(`matrix [${pos[0]},${pos[1]}]`, `матрица [${pos[0]},${pos[1]}]`));
    },
    [apply, geoId],
  );

  // “Press a key”: the position comes from the matrix test (VIA) or from a normal key press through the layer 0 keymap.
  useEffect(() => {
    if (assign?.kind !== 'press' || !active || !visible) return;
    const selected = active.geometry.keys.find((k) => k.id === editor.selection[0]);
    if (!selected) return;
    const onPressed = (pressed: Set<string>) => {
      const first = [...pressed][0];
      if (!first) return;
      const [r, c] = first.split(',').map(Number);
      assignTo(selected, [r, c]);
      selectNext(selected);
    };
    if (!testerActive && deviceSnapshot) startTester((p) => onPressed(p));
    const onKey = (e: KeyboardEvent) => {
      if (!deviceSnapshot) return;
      const code = hidFromCode(e.code);
      if (code === null) return;
      const cols = deviceSnapshot.cols;
      const found = deviceSnapshot.keymap[0].map((v, i) => (v === code ? i : -1)).filter((i) => i >= 0);
      if (found.length === 1) {
        e.preventDefault();
        assignTo(selected, [Math.floor(found[0] / cols), found[0] % cols]);
        selectNext(selected);
      } else if (found.length > 1) toast(t('This key code is on several positions — use the matrix tester', 'Такой код на нескольких позициях — нужен тест матрицы'), 'error');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assign, editor.selection[0], active?.geometry, deviceSnapshot, visible]);

  useEffect(() => () => stopTester(), [stopTester]);
  useEffect(() => {
    if (!visible) stopTester();
  }, [visible, stopTester]);

  const selectNext = (from: KeyGeom) => {
    if (!active) return;
    const c = keyCenter(from);
    const candidates = active.geometry.keys.filter((k) => k.id !== from.id).map((k) => ({ k, c: keyCenter(k) }));
    const right = candidates.filter((x) => Math.abs(x.c.y - c.y) < 0.6 && x.c.x > c.x).sort((a, b) => a.c.x - b.c.x)[0];
    if (right) editor.select([right.k.id], 'replace');
  };

  const keyView = useCallback(
    (k: KeyGeom): KeyView => {
      const v = active && k.matrix ? active.keymap.layers[0]?.keys[k.matrix[0] * active.project.hardware.matrix.cols + k.matrix[1]] : undefined;
      const label = v !== undefined && labelCtx ? keyLabel(spec, v, labelCtx) : { main: k.matrix ? '' : '?', kind: 'none' as const, qmk: t('no matrix position', 'нет позиции матрицы') };
      return {
        name: v !== undefined && labelCtx ? friendlyName(spec, v, labelCtx).text : undefined,
        label: { ...label, top: k.matrix ? `${k.matrix[0]},${k.matrix[1]}` : t('none', 'нет'), hold: undefined },
        warn: !k.matrix || issues.some((i) => i.keyId === k.id && i.level === 'error'),
        dim: false,
        approx: !!k.approximate,
        pressed: k.matrix ? editor.pressed.has(`${k.matrix[0]},${k.matrix[1]}`) : false,
      };
    },
    [active, labelCtx, spec, issues, editor.pressed],
  );

  if (!active) return null;
  const { project, geometry } = active;
  const sel = geometry.keys.filter((k) => editor.selection.includes(k.id));
  const ids = sel.map((k) => k.id);

  const rotateSel = (d: number) => {
    if (!sel.length) return;
    const centers = sel.map(keyCenter);
    const C = { x: centers.reduce((a, c) => a + c.x, 0) / centers.length, y: centers.reduce((a, c) => a + c.y, 0) / centers.length };
    apply(
      (p) =>
        updateKeys(p, geometry.id, ids, (k) => {
          const c2 = rotatePoint(keyCenter(k), C.x, C.y, d);
          return { r: k.r + d, x: c2.x - k.w / 2, y: c2.y - k.h / 2, rx: c2.x, ry: c2.y };
        }),
      t('rotate', 'поворот'),
      { coalesce: `rot:${ids.join(',')}` },
    );
  };

  const addNewKey = () => {
    const b = geometryBounds(geometry);
    const base = sel[0];
    const x = base ? base.x + base.w + 0.1 : b.x + b.w + 0.5;
    const y = base ? base.y : b.y;
    apply((p) => addKey(p, geometry.id, { matrix: null, x, y, w: 1, h: 1, r: 0, rx: x + 0.5, ry: y + 0.5, shape: 'rect', half: base?.half ?? 'center' }), t('add key', 'новая клавиша'));
  };

  const duplicateSel = () => {
    if (!sel.length) return;
    apply(
      (p) => {
        let next = p;
        for (const k of sel) next = addKey(next, geometry.id, { ...k, matrix: null, x: k.x + 0.5, y: k.y + 0.5, rx: k.rx + 0.5, ry: k.ry + 0.5, label: undefined });
        return next;
      },
      t('duplicate keys', 'копия клавиш'),
    );
  };

  const mirrorSel = () => {
    if (!sel.length) return;
    const b = geometryBounds(geometry);
    const axis = b.x + b.w / 2;
    const mirrored = mirrorKeys(sel, axis, () => null, sel[0].half === 'left' ? 'right' : sel[0].half === 'right' ? 'left' : 'center');
    apply((p) => ({ ...p, geometries: p.geometries.map((g) => (g.id === geometry.id ? { ...g, keys: [...g.keys, ...mirrored] } : g)) }), t('mirror keys', 'зеркальная копия'));
    toast(t('Mirrored copies have no matrix position yet — assign them', 'У зеркальных копий пока нет позиций матрицы — назначьте их'));
  };

  const onSelect = (newIds: string[], mode: 'replace' | 'toggle' | 'add') => {
    if (assign?.kind === 'sequence' && newIds.length === 1 && mode === 'replace') {
      const key = geometry.keys.find((k) => k.id === newIds[0]);
      if (key) {
        assignTo(key, assign.next);
        const { rows, cols } = project.hardware.matrix;
        let [r, c] = assign.next;
        if (assign.dir === 'cols') {
          c++;
          if (c >= cols) {
            c = 0;
            r = (r + 1) % rows;
          }
        } else {
          r++;
          if (r >= rows) {
            r = 0;
            c = (c + 1) % cols;
          }
        }
        setAssign({ ...assign, next: [r, c] });
      }
    }
    editor.select(newIds, mode);
  };

  return (
    <div className="editor" style={{ gridTemplateRows: 'auto minmax(220px, 1fr) auto' }}>
      <div className="editor-bar">
        <button className="btn" onClick={addNewKey}>
          <Plus {...ICON} /> {t('key', 'клавиша')}
        </button>
        <button className="btn" {...whyDisabled(!sel.length && t('Select keys on the layout first', 'Сначала выделите клавиши на схеме'))} onClick={duplicateSel}>
          <Copy {...ICON} /> {t('copy', 'копия')}
        </button>
        <button
          className="btn"
          {...whyDisabled(!sel.length && t('Select keys on the layout first', 'Сначала выделите клавиши на схеме'), t('Mirrored copy to the other half', 'Зеркальная копия на другую половину'))}
          onClick={mirrorSel}
        >
          <FlipHorizontal2 {...ICON} /> {t('mirror', 'зеркало')}
        </button>
        <button
          className="icon-btn"
          {...whyDisabled(!sel.length && t('Select keys on the layout first', 'Сначала выделите клавиши на схеме'), '−5°')}
          onClick={() => rotateSel(-5)}
          aria-label={t('Rotate −5°', 'Повернуть −5°')}
        >
          <RotateCcw {...ICON} />
        </button>
        <button
          className="icon-btn"
          {...whyDisabled(!sel.length && t('Select keys on the layout first', 'Сначала выделите клавиши на схеме'), '+5°')}
          onClick={() => rotateSel(5)}
          aria-label={t('Rotate +5°', 'Повернуть +5°')}
        >
          <RotateCw {...ICON} />
        </button>
        <button
          className="btn"
          {...whyDisabled(!sel.length && t('Select keys on the layout first', 'Сначала выделите клавиши на схеме'))}
          onClick={() => {
            apply((p) => removeKeys(p, geometry.id, ids), t('delete keys', 'удаление клавиш'));
            deletedToast(t('keys', 'клавиши'));
          }}
        >
          <Trash2 {...ICON} /> {t('delete', 'удалить')}
        </button>
        <span className="deck-sep" />
        <div className="seg" role="group" aria-label={t('Assign matrix', 'Назначение матрицы')}>
          <button className={!assign ? 'is-on' : ''} onClick={() => setAssign(null)}>
            {t('move', 'двигать')}
          </button>
          <button
            className={assign?.kind === 'sequence' ? 'is-on' : ''}
            onClick={() => setAssign({ kind: 'sequence', next: [0, 0], dir: 'cols' })}
            title={t('Click keys in order: [0,0], [0,1] …', 'Щёлкайте клавиши по порядку: [0,0], [0,1] …')}
          >
            {t('matrix in order', 'матрица по порядку')}
          </button>
          <button
            className={assign?.kind === 'press' ? 'is-on' : ''}
            {...whyDisabled(
              !deviceSnapshot && t('Connect the keyboard first (Device page)', 'Сначала подключите клавиатуру (раздел «Устройство»)'),
              t('Select a key on the layout, then press it on the keyboard', 'Выберите клавишу на схеме и нажмите её на клавиатуре'),
            )}
            onClick={() => setAssign({ kind: 'press' })}
          >
            <Wand2 size={13} strokeWidth={1.5} /> {t('by pressing', 'нажатием')}
          </button>
        </div>
        {assign?.kind === 'sequence' && (
          <span className="kicker">
            {t('next', 'следующая')}: [{assign.next[0]},{assign.next[1]}]{' '}
            <button className="text-btn" onClick={() => setAssign({ ...assign, dir: assign.dir === 'cols' ? 'rows' : 'cols' })}>
              {assign.dir === 'cols' ? t('→ by columns', '→ по столбцам') : t('↓ by rows', '↓ по строкам')}
            </button>
          </span>
        )}
        {assign?.kind === 'press' && <span className="kicker">{t('select a key on the layout, then press it on the keyboard', 'выберите клавишу на схеме и нажмите её на клавиатуре')}</span>}
        <span className="spacer" />
        <span className="kicker">
          {t('snap', 'шаг')} {snap || t('off', 'нет')}u
        </span>
      </div>
      <KeyboardCanvas
        geometry={geometry}
        keyView={keyView}
        selection={editor.selection}
        onSelect={onSelect}
        zoom={zoom}
        pan={pan}
        onViewChange={(z, p) => {
          setZoom(z);
          setPan(p);
        }}
        keySize={keySize}
        showMatrix={false}
        geometryEdit={assign ? undefined : { snap, onMove: (moveIds, dx, dy) => apply((p) => moveKeys(p, geometry.id, moveIds, dx, dy), t('move keys', 'перемещение клавиш')) }}
        ariaLabel={t('Geometry editor', 'Редактор геометрии')}
        overlay={
          <div className="kb-legend" aria-hidden="true">
            <span>
              <i className="lg-trns" />
              {t('approximate place', 'примерное место')}
            </span>
            <span>
              <i className="lg-warn" />
              {t('no / wrong matrix', 'нет / неверная матрица')}
            </span>
          </div>
        }
      />
      {issues.length > 0 && (
        <div style={{ padding: '8px var(--pad)', borderTop: 'var(--border)', maxHeight: 90, overflowY: 'auto' }}>
          {issues.slice(0, 6).map((i, n) => (
            <div key={n} className={`issue issue--${i.level}`} style={{ marginBottom: 2 }}>
              <span className="issue-where">{issueLevelLabel(i.level)}</span>
              {getLanguage() === 'ru' ? i.message.ru : i.message.en}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const hw = project.hardware;
  const [rows, setRows] = useState(hw.matrix.rows);
  const [cols, setCols] = useState(hw.matrix.cols);
  const set = (patch: Partial<HardwareProfile>, label: string) => apply((p) => patchProject(p, { hardware: { ...p.hardware, ...patch } }), label, { coalesce: `hw:${label}` });
  const text = (key: keyof HardwareProfile, label: string, ph = '', hint?: { tip: string; docs?: string }) => (
    <label className="field">
      <span className="field-label">
        {hint ? (
          <Hint tip={hint.tip} docs={hint.docs}>
            {label}
          </Hint>
        ) : (
          label
        )}
      </span>
      <input
        className="input"
        value={(hw[key] as string | null) ?? ''}
        placeholder={ph}
        onChange={(e) => set({ [key]: e.target.value || (key === 'processor' || key === 'bootloader' ? null : '') } as Partial<HardwareProfile>, String(key))}
      />
    </label>
  );
  const hex = (n: number | null) => (n === null ? '' : `0x${n.toString(16).toUpperCase().padStart(4, '0')}`);
  const parseHex = (s: string) => (/^0x[0-9a-f]{1,4}$/i.test(s) ? Number.parseInt(s, 16) : null);
  return (
    <div className="page">
      <p className="page-lead">
        {t(
          'What is known about the keyboard. Facts read from the keyboard are marked “device”; guesses — “heuristic”. Unknown fields stay empty: nothing is invented.',
          'Что известно о клавиатуре. Факты, прочитанные с клавиатуры, помечены «device», догадки — «heuristic». Неизвестное остаётся пустым: ничего не придумывается.',
        )}
      </p>
      <div className="grid-2">
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('model', 'модель')}</span>
          </div>
          <div className="panel-box-body field">
            {text('name', t('name', 'название'))}
            {text('manufacturer', t('manufacturer', 'производитель'))}
            <div className="field-row">
              <label className="field">
                <span className="field-label">
                  <Hint
                    tip={t(
                      'USB vendor ID: a 4-digit hex number that identifies the maker to the computer. It goes into keyboard.json (usb.vid).',
                      'USB vendor ID: четырёхзначное шестнадцатеричное число, по которому компьютер узнаёт производителя. Записывается в keyboard.json (usb.vid).',
                    )}
                  >
                    USB VID
                  </Hint>
                </span>
                <input className="input" defaultValue={hex(hw.usb.vid)} placeholder="0xAFC5" onBlur={(e) => set({ usb: { ...hw.usb, vid: parseHex(e.target.value) } }, 'vid')} />
              </label>
              <label className="field">
                <span className="field-label">
                  <Hint
                    tip={t(
                      'USB product ID: a 4-digit hex number that tells this keyboard apart from the same maker’s other products. With the VID it is how NAVI and the OS find the device.',
                      'USB product ID: четырёхзначное шестнадцатеричное число, отличающее эту клавиатуру от других изделий того же производителя. Вместе с VID по нему NAVI и система находят устройство.',
                    )}
                  >
                    USB PID
                  </Hint>
                </span>
                <input className="input" defaultValue={hex(hw.usb.pid)} placeholder="0xBFC5" onBlur={(e) => set({ usb: { ...hw.usb, pid: parseHex(e.target.value) } }, 'pid')} />
              </label>
            </div>
            {text('processor', t('microcontroller', 'микроконтроллер'), 'RP2040 / STM32F411 / atmega32u4')}
            {text('bootloader', t('bootloader (QMK name)', 'загрузчик (имя в QMK)'), 'rp2040 / stm32-dfu / caterina', {
              tip: t(
                'The small program on the chip that receives new firmware over USB (UF2 drive, DFU, Caterina…). Its QMK name decides how the firmware is flashed.',
                'Небольшая программа на чипе, которая принимает новую прошивку по USB (UF2-диск, DFU, Caterina…). От её имени в QMK зависит, как прошивать.',
              ),
              docs: QMK_DOCS.flashing,
            })}
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">
              <Hint
                docs={QMK_DOCS.howAMatrixWorks}
                tip={t(
                  'The key matrix wires switches into rows and columns, so a chip with few pins can read many keys. Keymaps are stored by (row, column), so the size here must match the firmware.',
                  'Матрица соединяет переключатели в строки и столбцы, поэтому чип с малым числом выводов читает много клавиш. Раскладки хранятся по (строка, столбец), так что размер должен совпадать с прошивкой.',
                )}
              >
                {t('matrix and halves', 'матрица и половины')}
              </Hint>
            </span>
          </div>
          <div className="panel-box-body field">
            <div className="field-row">
              <label className="field-hint">
                {t('rows', 'строк')} <input className="input input--num" type="number" min={1} max={32} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
              </label>
              <label className="field-hint">
                {t('cols', 'столбцов')} <input className="input input--num" type="number" min={1} max={32} value={cols} onChange={(e) => setCols(Number(e.target.value))} />
              </label>
              <button
                className="btn"
                {...whyDisabled(rows === hw.matrix.rows && cols === hw.matrix.cols && t('The matrix size is unchanged', 'Размер матрицы не изменён'))}
                onClick={() => apply((p) => resizeMatrix(p, rows, cols), t('resize matrix', 'размер матрицы'))}
              >
                {t('apply', 'применить')}
              </button>
            </div>
            <span className="field-hint">
              {t('Keymaps keep values by (row, col); positions outside the new size are dropped.', 'Назначения сохраняются по (строка, столбец); позиции вне нового размера пропадают.')}
            </span>
            <label className="checkbox">
              <input type="checkbox" checked={hw.split.enabled} onChange={(e) => set({ split: { ...hw.split, enabled: e.target.checked } }, 'split')} />{' '}
              <Hint
                docs={QMK_DOCS.splitKeyboard}
                tip={t(
                  'A keyboard made of two halves, each with its own chip, joined by a cable or wirelessly. The firmware must know which half is which (handedness).',
                  'Клавиатура из двух половин, у каждой свой чип; половины связаны кабелем или по радио. Прошивка должна знать, какая половина левая, какая правая (handedness).',
                )}
              >
                {t('split keyboard', 'сплит (две половины)')}
              </Hint>
            </label>
            <label className="field">
              <span className="field-label">
                <Hint
                  docs={QMK_DOCS.splitKeyboard}
                  tip={t(
                    'How the two halves talk: serial (one wire in a TRRS/TRS cable), I²C (two wires), or wireless. Most wired split boards use serial.',
                    'Как половины общаются: serial (один провод в кабеле TRRS/TRS), I²C (два провода) или по радио. Большинство проводных сплитов используют serial.',
                  )}
                >
                  {t('link between halves', 'связь между половинами')}
                </Hint>
              </span>
              <select className="select" value={hw.split.transport} onChange={(e) => set({ split: { ...hw.split, transport: e.target.value as HardwareProfile['split']['transport'] } }, 'transport')}>
                <option value="unknown">{t('unknown', 'неизвестно')}</option>
                <option value="serial">{t('serial (TRRS/TRS cable)', 'serial (кабель TRRS/TRS)')}</option>
                <option value="i2c">I²C</option>
                <option value="wireless">{t('wireless', 'беспроводная')}</option>
                <option value="none">{t('none', 'нет')}</option>
              </select>
            </label>
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('controls and lighting', 'органы управления и подсветка')}</span>
          </div>
          <div className="panel-box-body field">
            <div className="field-row">
              <label className="field-hint">
                <Hint
                  docs={QMK_DOCS.encoders}
                  tip={t(
                    'A rotary knob that sends a step each way when turned; many also press like a button. Each encoder gets two keycodes per layer (clockwise, counterclockwise).',
                    'Поворотная ручка, которая посылает шаг в каждую сторону при вращении; у многих есть и нажатие. На каждый энкодер приходится по два keycode на слой (по часовой, против часовой).',
                  )}
                >
                  {t('encoders', 'энкодеров')}
                </Hint>{' '}
                <input
                  className="input input--num"
                  type="number"
                  min={0}
                  max={32}
                  value={hw.encoders.count ?? ''}
                  placeholder="?"
                  onChange={(e) => set({ encoders: { ...hw.encoders, count: e.target.value === '' ? null : Number(e.target.value) } }, 'encoders')}
                />
              </label>
              <select
                className="select"
                value={hw.encoders.withPress === null ? '' : hw.encoders.withPress ? 'yes' : 'no'}
                onChange={(e) => set({ encoders: { ...hw.encoders, withPress: e.target.value === '' ? null : e.target.value === 'yes' } }, 'press')}
                aria-label={t('Encoder button', 'Кнопка энкодера')}
              >
                <option value="">{t('button: unknown', 'кнопка: неизвестно')}</option>
                <option value="yes">{t('with button', 'с кнопкой')}</option>
                <option value="no">{t('no button', 'без кнопки')}</option>
              </select>
            </div>
            <label className="field">
              <span className="field-label">
                <Hint
                  docs={QMK_DOCS.rgbMatrix}
                  tip={t(
                    '- RGB Matrix: one RGB LED per key, effects follow the key positions.\n- RGB Light: a chain of RGB LEDs (underglow) with simple effects.\n- LED Matrix: single-color LED per key.\n- Backlight: plain single-color LEDs on a PWM pin.',
                    '- RGB Matrix: RGB-светодиод у каждой клавиши, эффекты учитывают положение клавиш.\n- RGB Light: цепочка RGB-светодиодов (подсветка снизу) с простыми эффектами.\n- LED Matrix: одноцветный светодиод у каждой клавиши.\n- Backlight: обычные одноцветные светодиоды на PWM-выводе.',
                  )}
                >
                  {t('lighting', 'подсветка')}
                </Hint>
              </span>
              <select className="select" value={hw.lighting.kind} onChange={(e) => set({ lighting: { ...hw.lighting, kind: e.target.value as HardwareProfile['lighting']['kind'] } }, 'lighting')}>
                <option value="unknown">{t('unknown', 'неизвестно')}</option>
                <option value="rgb_matrix">RGB Matrix</option>
                <option value="rgblight">RGB Light</option>
                <option value="led_matrix">LED Matrix</option>
                <option value="backlight">{t('Backlight (one color)', 'Backlight (один цвет)')}</option>
                <option value="none">{t('none', 'нет')}</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">
                <Hint
                  docs={QMK_DOCS.pointingDevice}
                  tip={t(
                    'A trackpad, trackball or TrackPoint built into the keyboard that moves the mouse cursor.',
                    'Трекпад, трекбол или трекпойнт, встроенный в клавиатуру и двигающий курсор мыши.',
                  )}
                >
                  {t('pointing device', 'указатель (трекпад, трекбол)')}
                </Hint>
              </span>
              <select className="select" value={hw.pointing.kind} onChange={(e) => set({ pointing: { ...hw.pointing, kind: e.target.value as HardwareProfile['pointing']['kind'] } }, 'pointing')}>
                <option value="unknown">{t('unknown', 'неизвестно')}</option>
                <option value="none">{t('none', 'нет')}</option>
                <option value="cirque">{t('Cirque trackpad', 'трекпад Cirque')}</option>
                <option value="trackball">{t('trackball', 'трекбол')}</option>
                <option value="trackpoint">{t('TrackPoint', 'трекпойнт')}</option>
                <option value="other">{t('other', 'другое')}</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t('other hardware', 'другое железо')}</span>
              <textarea className="textarea" value={hw.extras} onChange={(e) => set({ extras: e.target.value }, 'extras')} />
            </label>
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('facts and sources', 'факты и источники')}</span>
          </div>
          <div className="panel-box-body field">
            <div className="layer-stack">
              {hw.facts.map((f, i) => (
                <div key={i} className="layer-stack-row" style={{ gridTemplateColumns: 'minmax(80px,auto) minmax(0,1fr) auto' }} title={f.note}>
                  <code>{f.key}</code>
                  <span>{f.value}</span>
                  <span className={`badge ${f.evidence === 'device' ? 'badge--ok' : f.evidence === 'heuristic' ? 'badge--dim' : 'badge--info'}`}>{f.evidence}</span>
                </div>
              ))}
              {hw.facts.length === 0 && <div className="layer-stack-row">{t('No recorded facts yet.', 'Записанных фактов пока нет.')}</div>}
            </div>
            <label className="field">
              <span className="field-label">{t('notes', 'заметки')}</span>
              <textarea className="textarea" value={hw.notes} onChange={(e) => set({ notes: e.target.value }, 'notes')} />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}

function VariantsTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const [msg, setMsg] = useState<string[]>([]);
  const [msgDetail, setMsgDetail] = useState('');
  const [query, setQuery] = useListFilter();
  const shownGeometries = project.geometries.filter((g) => matchesQuery(query, g.name, g.source.kind, g.source.ref, g.keys.length));
  const importVariant = async () => {
    const file = await openTextFile(JSON_FILTERS);
    if (!file) return;
    try {
      const json = JSON.parse(file.text);
      const kind = detectFileKind(json);
      let g: Geometry | null = null;
      const notes: string[] = [];
      if (kind === 'via-definition') {
        const r = importViaDefinition(json);
        g = r.geometry;
        notes.push(...r.issues.map((i) => i.message));
      } else if (kind === 'kle') {
        const r = importKle(json, file.name);
        g = r.geometry;
        notes.push(...r.issues.map((i) => i.message));
      } else if (kind === 'qmk-info') {
        const layout = listQmkLayouts(json)[0];
        const r = importQmkLayout(json, layout);
        g = r.geometry;
        notes.push(...r.issues.map((i) => i.message));
      } else notes.push(t('Expected a QMK keyboard.json / info.json, a VIA definition or KLE data.', 'Ожидался QMK keyboard.json / info.json, определение VIA или данные KLE.'));
      if (g) {
        const { rows, cols } = project.hardware.matrix;
        const outside = g.keys.filter((k) => k.matrix && (k.matrix[0] >= rows || k.matrix[1] >= cols)).length;
        if (outside)
          notes.push(t(`${outside} keys are outside the project matrix ${rows}×${cols} (matrix positions cleared).`, `${outside} клавиш вне матрицы проекта ${rows}×${cols} (позиции сброшены).`));
        g.keys = g.keys.map((k) => (k.matrix && (k.matrix[0] >= rows || k.matrix[1] >= cols) ? { ...k, matrix: null } : k));
        const geo = g;
        apply((p) => addGeometry(p, geo), t('import geometry', 'импорт геометрии'));
        toast(t('Geometry variant added and activated', 'Вариант геометрии добавлен и выбран'));
      }
      setMsg(notes);
      setMsgDetail('');
    } catch (err) {
      setMsg([t('Couldn’t read this file as a geometry. Pick a QMK info.json, a VIA definition or a KLE file.', 'Не удалось прочитать файл как геометрию. Выберите QMK info.json, описание VIA или файл KLE.')]);
      setMsgDetail(rawError(err));
    }
  };
  return (
    <div className="page">
      <p className="page-lead">
        {t(
          'One keyboard can have several geometry variants (e.g. approximate and measured). Keymaps are shared — they are stored by matrix position.',
          'У клавиатуры может быть несколько вариантов геометрии (например, примерная и измеренная). Раскладки общие — они хранятся по позициям матрицы.',
        )}
      </p>
      <ListFilter
        value={query}
        onChange={setQuery}
        label={t('Filter geometries', 'Фильтр геометрий')}
        placeholder={t('Filter by name or source', 'Фильтр по имени или источнику')}
        shown={shownGeometries.length}
        total={project.geometries.length}
      />
      {shownGeometries.length === 0 && <p className="field-hint">{t('Nothing matches the filter.', 'Под фильтр ничего не подходит.')}</p>}
      <div className="panel-box rows" hidden={shownGeometries.length === 0}>
        {shownGeometries.map((g) => (
          <div key={g.id} className={`row ${g.id === project.activeGeometryId ? 'is-active' : ''}`} style={{ ['--row-cols' as string]: 'minmax(0,1fr) 140px 90px auto' }}>
            <input
              className="input"
              value={g.name}
              onChange={(e) =>
                apply((p) => ({ ...p, geometries: p.geometries.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)) }), t('rename geometry', 'имя геометрии'), {
                  coalesce: `gname:${g.id}`,
                })
              }
              aria-label={t('Name', 'Имя')}
            />
            <span className="kicker">
              {g.source.kind}
              {g.source.ref ? ` · ${g.source.ref}` : ''}
            </span>
            <span className="kicker">
              {g.keys.length} {t('keys', 'кл.')}
            </span>
            <div className="row-actions">
              <button
                className="btn"
                {...whyDisabled(g.id === project.activeGeometryId && t('This geometry is already the active one', 'Эта геометрия уже выбрана'))}
                onClick={() => apply((p) => patchProject(p, { activeGeometryId: g.id }), t('select geometry', 'выбор геометрии'))}
              >
                {t('use', 'выбрать')}
              </button>
              <button
                className="icon-btn"
                aria-label={t('Duplicate', 'Копия')}
                onClick={() => apply((p) => addGeometry(p, cloneGeometry(g, `${g.name} copy`)), t('duplicate geometry', 'копия геометрии'))}
              >
                <Copy size={14} strokeWidth={1.5} />
              </button>
              <button
                className="icon-btn"
                {...whyDisabled(project.geometries.length <= 1 && t('The last geometry cannot be deleted', 'Последнюю геометрию удалить нельзя'))}
                aria-label={t('Delete', 'Удалить')}
                onClick={() => {
                  apply((p) => removeGeometry(p, g.id), t('delete geometry', 'удаление геометрии'));
                  deletedToast(g.name || t('geometry', 'геометрия'));
                }}
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="field-row">
        <button className="btn btn--primary" onClick={() => void importVariant()}>
          {t('import geometry (QMK / VIA / KLE)…', 'импорт геометрии (QMK / VIA / KLE)…')}
        </button>
        <button className="btn" onClick={() => apply((p) => addGeometry(p, gridGeometry(p.hardware.matrix.rows, p.hardware.matrix.cols, p.hardware.split.enabled)), t('grid geometry', 'сетка'))}>
          {t('add a matrix grid', 'добавить сетку по матрице')}
        </button>
        {project.hardware.matrix.rows === 10 && project.hardware.matrix.cols === 6 && (
          <button className="btn" onClick={() => apply((p) => addGeometry(p, dilemma4x6Clone()), t('Dilemma template', 'шаблон Dilemma'))}>
            {t('add Dilemma 4x6 template', 'добавить шаблон Dilemma 4x6')}
          </button>
        )}
      </div>
      {msg.length > 0 && (
        <ul className="issue-list" role={msgDetail ? 'alert' : 'status'}>
          {msg.map((m, i) => (
            <li key={i} className="issue issue--warning">
              {m}
            </li>
          ))}
          {msgDetail && (
            <li className="issue">
              <ErrorDetails text={msgDetail} />
            </li>
          )}
        </ul>
      )}
      <p className="field-hint">{new Date(project.updatedAt).toLocaleString(locale())}</p>
    </div>
  );
}

export function HardwarePage({ tab }: { tab?: string }) {
  const project = useProjectStore((s) => s.project);
  const current = currentTab('hardware', tab);
  // A fill page: the scrolling tabs share one scroller of their own, so the position is remembered here.
  const scrollRef = useScrollMemory(`hardware/${current}`);
  if (!project) return null;
  const tabs = tabItems('hardware');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs
        idBase="hardware"
        label={t('Hardware', 'Железо')}
        items={tabs}
        current={current}
        href={(id) => href(tabRoute('hardware', id))}
        style={{ margin: 0, padding: '0 var(--pad)' }}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        {/* Geometry stays mounted once visited (its zoom, pan and assign mode survive a tab switch). */}
        <TabPanels idBase="hardware" ids={['geometry']} current={current} className="hw-fill-panel" render={(_, active) => <GeometryEditor visible={active} />} />
        <div className="page-scroll" style={{ height: '100%' }} hidden={current === 'geometry'} ref={scrollRef}>
          <div className="page-wrap">
            <TabPanels
              idBase="hardware"
              ids={['profile', 'variants', 'pins']}
              current={current}
              render={(id) => (id === 'profile' ? <ProfileTab project={project} /> : id === 'pins' ? <PinsTab project={project} /> : <VariantsTab project={project} />)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
