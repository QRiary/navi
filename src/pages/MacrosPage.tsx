/**
 * MACROS SECTION: macro slots (MC_0 … MC_n), a visual step editor
 * (text, tap, press, release, pause), recording from the keyboard,
 * used space in the keyboard memory and the firmware format limits (ASCII text,
 * only basic keys, pauses up to 9999 ms).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Square } from 'lucide-react';
import { MacroSteps } from '../components/macros/MacroSteps';
import { newId } from '../core/layout/geometry';
import type { Macro, MacroStep } from '../core/project/types';
import { checkMacroSteps, macroBytesUsed } from '../core/via/macros';
import { encode } from '../core/keycodes/codec';
import { hidFromCode } from '../lib/hidCodes';
import { navigate } from '../lib/router';
import { assignToSelection } from '../lib/keymapActions';
import { useDeviceStore } from '../store/deviceStore';
import { useProjectStore, useSpec } from '../store/projectStore';
import { getLanguage, t } from '../i18n';

const ICON = { size: 14, strokeWidth: 1.5 };

function patchMacros(macros: Macro[], index: number, fn: (m: Macro) => Macro): Macro[] {
  const existing = macros.find((m) => m.index === index);
  const base: Macro = existing ?? { id: newId('macro'), index, name: `M${index}`, steps: [] };
  const next = fn(base);
  const others = macros.filter((m) => m.index !== index);
  return next.steps.length === 0 && !next.name.trim() ? others : [...others, next].sort((a, b) => a.index - b.index);
}

export function MacrosPage() {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const spec = useSpec();
  const caps = useDeviceStore((s) => s.caps);
  const [selected, setSelected] = useState(0);
  const [recording, setRecording] = useState(false);
  const recordRef = useRef<{ last: number; steps: MacroStep[] } | null>(null);
  const lang = getLanguage();

  const count = Math.max(caps?.macros?.count ?? 16, ...(project?.macros.map((m) => m.index + 1) ?? [0]));
  const bufferSize = caps?.macros?.bufferSize ?? null;
  const used = useMemo(() => (project ? macroBytesUsed(project.macros, count) : 0), [project, count]);

  // Recording: presses of the physical keyboard → “press/release” steps (with pauses longer than 300 ms).
  useEffect(() => {
    if (!recording) return;
    recordRef.current = { last: performance.now(), steps: [] };
    const onEvent = (e: KeyboardEvent) => {
      const code = hidFromCode(e.code);
      if (code === null) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      const rec = recordRef.current!;
      const now = performance.now();
      const gap = Math.round(now - rec.last);
      if (rec.steps.length && gap > 300) rec.steps.push({ type: 'delay', ms: Math.min(9999, gap) });
      rec.last = now;
      rec.steps.push({ type: e.type === 'keydown' ? 'down' : 'up', keycode: code });
    };
    window.addEventListener('keydown', onEvent, true);
    window.addEventListener('keyup', onEvent, true);
    return () => {
      window.removeEventListener('keydown', onEvent, true);
      window.removeEventListener('keyup', onEvent, true);
    };
  }, [recording]);

  if (!project) return null;
  const macro = project.macros.find((m) => m.index === selected) ?? { id: '', index: selected, name: `M${selected}`, steps: [] };
  const issues = checkMacroSteps(selected, macro.steps);
  const update = (fn: (m: Macro) => Macro, label: string, coalesce?: string) => apply((p) => ({ ...p, macros: patchMacros(p.macros, selected, fn) }), label, coalesce ? { coalesce } : undefined);
  const setSteps = (steps: MacroStep[], label: string, coalesce?: string) => update((m) => ({ ...m, steps }), label, coalesce);

  /** Collapse “press X, release X” in a row into “tap X”. */
  const finishRecording = () => {
    setRecording(false);
    const rec = recordRef.current?.steps ?? [];
    const out: MacroStep[] = [];
    for (let i = 0; i < rec.length; i++) {
      const s = rec[i];
      const next = rec[i + 1];
      if (s.type === 'down' && next?.type === 'up' && next.keycode === s.keycode) {
        out.push({ type: 'tap', keycode: s.keycode });
        i++;
      } else out.push(s);
    }
    if (out.length) setSteps([...macro.steps, ...out], t('record macro', 'запись макроса'));
  };

  return (
    <div className="page">
      <p className="page-lead">
        {t(
          'Macros live in the keyboard memory (VIA) and run by keys MC_0 … MC_n. The firmware types text as US-layout keys, presses only basic keys and waits at most 9999 ms per pause.',
          'Макросы хранятся в памяти клавиатуры (VIA) и запускаются клавишами MC_0 … MC_n. Прошивка набирает текст как американские клавиши, нажимает только простые клавиши и ждёт не больше 9999 мс за паузу.',
        )}
      </p>
      <div className="toolbar">
        <span className="kicker">
          {caps?.macros
            ? t(`keyboard: ${caps.macros.count} slots, ${caps.macros.bufferSize} bytes`, `клавиатура: ${caps.macros.count} ячеек, ${caps.macros.bufferSize} байт`)
            : t('keyboard not connected — sizes are not known yet', 'клавиатура не подключена — объём памяти пока неизвестен')}
        </span>
        {bufferSize !== null && (
          <div className="field-row" style={{ minWidth: 220 }}>
            <div className="progress" style={{ flex: 1 }}>
              <i style={{ width: `${Math.min(100, (used / bufferSize) * 100)}%` }} />
            </div>
            <span className="kicker">
              {used} / {bufferSize} B
            </span>
          </div>
        )}
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)' }}>
        <div className="panel-box">
          <div className="rows">
            {Array.from({ length: count }, (_, i) => {
              const m = project.macros.find((x) => x.index === i);
              return (
                <button key={i} className={`row ${i === selected ? 'is-active' : ''}`} style={{ ['--row-cols' as string]: '44px minmax(0,1fr) auto', textAlign: 'left' }} onClick={() => setSelected(i)}>
                  <span className="num">MC_{i}</span>
                  <span>{m?.name ?? <span className="field-hint">{t('empty', 'пусто')}</span>}</span>
                  <span className="kicker">{m ? `${m.steps.length}` : ''}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="panel-box">
          <div className="panel-box-head">
            <input className="input" style={{ flex: 1 }} value={macro.name} maxLength={60} onChange={(e) => update((m) => ({ ...m, name: e.target.value }), t('macro name', 'имя макроса'), `mname:${selected}`)} aria-label={t('Macro name', 'Имя макроса')} />
            <button
              className="btn"
              onClick={() => {
                assignToSelection(encode(spec, { kind: 'named', def: spec.byName.get(`QK_MACRO_${selected}`)! }));
                navigate({ section: 'keyboard' });
              }}
              disabled={!spec.byName.get(`QK_MACRO_${selected}`)}
              title={t('Assign MC to the key selected on the layout', 'Назначить MC выбранной на схеме клавише')}
            >
              → {t('to selected key', 'на выбранную клавишу')}
            </button>
          </div>
          <div className="panel-box-body field">
            <MacroSteps
              steps={macro.steps}
              keys="basic"
              onChange={setSteps}
              coalesceKey={`mstep:${selected}`}
              actions={
                <>
                  <button className={`btn ${recording ? 'btn--danger' : ''}`} onClick={() => (recording ? finishRecording() : setRecording(true))}>
                    {recording ? <Square {...ICON} /> : <Circle {...ICON} />} {recording ? t('stop recording', 'остановить запись') : t('record keys', 'записать нажатия')}
                  </button>
                  {macro.steps.length > 0 && (
                    <button className="btn btn--ghost" onClick={() => setSteps([], t('clear macro', 'очистить макрос'))}>
                      {t('clear', 'очистить')}
                    </button>
                  )}
                </>
              }
            />
            {recording && <p className="field-hint">{t('Recording: press keys on your keyboard… (Esc is recorded too — use the button to stop)', 'Идёт запись: нажимайте клавиши… (Esc тоже записывается — остановите кнопкой)')}</p>}
            {issues.map((iss, i) => (
              <div key={i} className="issue">
                <span className="issue-where">
                  {t('step', 'шаг')} {(iss.step ?? 0) + 1}
                </span>
                {lang === 'ru' ? iss.message.ru : iss.message.en}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="field-hint" style={{ marginTop: 'var(--gap)' }}>
        {t('Macros are written to the keyboard by “to keyboard” (bottom bar) with the “macros” box checked.', 'Макросы записываются в клавиатуру кнопкой «в клавиатуру» (внизу) с отмеченным пунктом «макросы».')}
      </p>
    </div>
  );
}

