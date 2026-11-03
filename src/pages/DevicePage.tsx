/**
 * DEVICE SECTION: found keyboards (VIA over WebHID), connection, what the firmware can do,
 * key tester (matrix state), reading the keymap from the keyboard into the project, comparison,
 * bootloader instructions. Everything shown as “present” is confirmed by the keyboard's answer.
 */
import { useEffect, useMemo, useState } from 'react';
import { Cable, Download, Plug, PlugZap, RefreshCw } from 'lucide-react';
import { activeKeymap, patchProject } from '../core/project/ops';
import { snapshotToKeymap } from '../core/via/sync';
import { keyLabel } from '../core/keycodes/labels';
import { LayoutPreview } from '../components/keyboard/LayoutPreview';
import { newId } from '../core/layout/geometry';
import { useActive, useLabelContext } from '../lib/projectContext';
import { href, navigate } from '../lib/router';
import { useDeviceStore } from '../store/deviceStore';
import { useEditorStore } from '../store/editorStore';
import { useProjectStore, useSpec } from '../store/projectStore';
import { toast } from '../store/toastStore';
import { t } from '../i18n';
import { BootloaderHelp } from '../components/device/BootloaderHelp';

const ICON = { size: 15, strokeWidth: 1.5 };
const hex4 = (n: number) => `0x${n.toString(16).toUpperCase().padStart(4, '0')}`;

function Tester() {
  const active = useActive();
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const testerActive = useDeviceStore((s) => s.testerActive);
  const sawData = useDeviceStore((s) => s.testerSawData);
  const start = useDeviceStore((s) => s.startTester);
  const stop = useDeviceStore((s) => s.stopTester);
  const matrix = useDeviceStore((s) => s.matrix);
  const pressed = useEditorStore((s) => s.pressed);
  const setPressed = useEditorStore((s) => s.setPressed);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [typed, setTyped] = useState<string[]>([]);

  useEffect(() => () => stop(), [stop]);
  // Fallback: what came from the keyboard as normal key presses (event.code) — visible even without the matrix test.
  useEffect(() => {
    if (!testerActive) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      setTyped((list) => [e.code, ...list].slice(0, 12));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [testerActive]);

  if (!active || !labelCtx || !matrix) return null;
  const km = activeKeymap(active.project);
  const cols = active.project.hardware.matrix.cols;
  const elapsed = startedAt ? Date.now() - startedAt : 0;
  return (
    <section className="panel-box">
      <div className="panel-box-head">
        <span className="cell-label">{t('key tester', 'тест клавиш')}</span>
        <button
          className={`btn ${testerActive ? 'btn--danger' : ''}`}
          onClick={() => {
            if (testerActive) return stop();
            setSeen(new Set());
            setStartedAt(Date.now());
            start((p) => {
              setPressed(p);
              if (p.size) setSeen((s) => new Set([...s, ...p]));
            });
          }}
        >
          {testerActive ? t('stop', 'стоп') : t('start', 'начать')}
        </button>
      </div>
      <div className="panel-box-body field">
        <p className="field-hint">
          {t(
            'Press keys on the keyboard: they light up by their matrix position (read over VIA). This checks the switches and which physical key is which position.',
            'Нажимайте клавиши: они подсветятся по позиции в матрице (чтение по VIA). Так проверяются переключатели и то, какая физическая клавиша — какая позиция.',
          )}
        </p>
        <LayoutPreview
          geometry={active.geometry}
          label={([r, c]) => keyLabel(spec, km.layers[0].keys[r * cols + c], labelCtx)}
          marked={new Set([...pressed, ...seen])}
          height={180}
        />
        {testerActive && (
          <span className="kicker">
            {t('pressed now', 'нажато сейчас')}: {[...pressed].join('  ') || '—'} · {t('seen', 'было нажато')}: {seen.size}
          </span>
        )}
        {testerActive && !sawData && elapsed > 4000 && (
          <div className="notice">
            <span>
              {t(
                'No key presses arrive over VIA. Newer QMK (≈2025+) returns an empty matrix unless built with VIA_INSECURE — the key tester is disabled in this firmware. Below are the keys the computer receives as normal typing:',
                'По VIA не приходит ни одного нажатия. Новые QMK (≈с 2025) отдают пустую матрицу, если прошивка собрана без VIA_INSECURE — в этой прошивке тест клавиш выключен. Ниже — что компьютер получает как обычный набор:',
              )}{' '}
              <code>{typed.join(' ') || '—'}</code>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

export function DevicePage() {
  const supported = useDeviceStore((s) => s.supported);
  const devices = useDeviceStore((s) => s.devices);
  const status = useDeviceStore((s) => s.status);
  const current = useDeviceStore((s) => s.current);
  const caps = useDeviceStore((s) => s.caps);
  const matrix = useDeviceStore((s) => s.matrix);
  const snapshot = useDeviceStore((s) => s.snapshot);
  const error = useDeviceStore((s) => s.error);
  const lastWrite = useDeviceStore((s) => s.lastWrite);
  const refresh = useDeviceStore((s) => s.refresh);
  const connect = useDeviceStore((s) => s.connect);
  const disconnect = useDeviceStore((s) => s.disconnect);
  const reread = useDeviceStore((s) => s.reread);
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const setCompare = useEditorStore((s) => s.setCompare);
  const connected = status === 'connected' || status === 'busy';

  const differs = useMemo(() => {
    if (!project || !snapshot) return null;
    const km = activeKeymap(project);
    if (project.hardware.matrix.rows !== snapshot.rows || project.hardware.matrix.cols !== snapshot.cols) return 'matrix';
    let n = 0;
    snapshot.keymap.forEach((l, li) => l.forEach((v, i) => (km.layers[li] && km.layers[li].keys[i] !== v ? n++ : null)));
    return n;
  }, [project, snapshot]);

  const linkedOk = project?.device && current ? project.device.vid === current.vendorId && project.device.pid === current.productId : null;

  return (
    <div className="page">
      {!supported && (
        <div className="notice">
          <span>{t('WebHID is not available here. Run the desktop app (npm run app).', 'WebHID здесь недоступен. Запустите настольное приложение (npm run app).')}</span>
        </div>
      )}
      <div className="toolbar">
        <span className="kicker">{t('keyboards with VIA (Raw HID 0xFF60)', 'клавиатуры с VIA (Raw HID 0xFF60)')}</span>
        <div className="toolbar-actions">
          <button className="btn" onClick={() => void refresh()}>
            <RefreshCw {...ICON} /> {t('search', 'искать')}
          </button>
        </div>
      </div>
      <div className="panel-box rows">
        {devices.map((d) => {
          const isCurrent = current?.key === d.key && connected;
          return (
            <div key={d.key} className={`row ${isCurrent ? 'is-active' : ''}`} style={{ ['--row-cols' as string]: '24px minmax(0,1fr) 150px auto' }}>
              <Cable size={15} strokeWidth={1.5} />
              <span>
                <strong>{d.productName}</strong>
              </span>
              <span className="kicker">
                {hex4(d.vendorId)}:{hex4(d.productId)}
              </span>
              {isCurrent ? (
                <button className="btn" onClick={() => void disconnect()}>
                  <Plug {...ICON} /> {t('disconnect', 'отключить')}
                </button>
              ) : (
                <button className="btn btn--primary" disabled={status === 'connecting' || status === 'busy'} onClick={() => void connect(d.key)}>
                  <PlugZap {...ICON} /> {t('connect', 'подключить')}
                </button>
              )}
            </div>
          );
        })}
        {devices.length === 0 && (
          <div className="row" style={{ ['--row-cols' as string]: '1fr' }}>
            <span className="field-hint">
              {t('No keyboard with VIA found. Plug it in by USB. If it is in bootloader mode or its firmware has no VIA, it is not listed here — see “Firmware”.', 'Клавиатура с VIA не найдена. Подключите по USB. Если она в режиме загрузчика или в её прошивке нет VIA — здесь её не будет, см. «Прошивка».')}
            </span>
          </div>
        )}
      </div>
      {error && (
        <div className="notice" style={{ borderColor: 'var(--danger-color)', marginTop: 'var(--gap)' }}>
          <span>{error}</span>
        </div>
      )}
      {status === 'disconnected' && <p className="field-hint">{t('The keyboard was disconnected. Plug it back and press “connect”.', 'Клавиатура отключена. Подключите снова и нажмите «подключить».')}</p>}

      {connected && caps && matrix && snapshot && (
        <>
          <div className="grid-2" style={{ marginTop: 'var(--gap)' }}>
            <section className="panel-box">
              <div className="panel-box-head">
                <span className="cell-label">{t('what the firmware reports', 'что сообщает прошивка')}</span>
                <button className="text-btn" onClick={() => void reread().catch((e: Error) => toast(e.message, 'error'))}>
                  {t('read again', 'прочитать снова')}
                </button>
              </div>
              <div className="panel-box-body">
                <dl className="kv">
                  <dt>{t('device', 'устройство')}</dt>
                  <dd>
                    {current?.productName} · {hex4(current!.vendorId)}:{hex4(current!.productId)}
                  </dd>
                  <dt>VIA</dt>
                  <dd>
                    {t('protocol', 'протокол')} {caps.protocol}
                    {caps.keycodesVersion ? ` · keycodes ${caps.keycodesVersion}` : ` · ${t('keycode version not reported (protocol < 13)', 'версия keycodes не сообщается (протокол < 13)')}`}
                  </dd>
                  <dt>{t('matrix', 'матрица')}</dt>
                  <dd>
                    {matrix.rows} × {matrix.cols}
                    {matrix.candidates.length > 1 ? ` (${t('other candidates', 'другие варианты')}: ${matrix.candidates.slice(1).map((c) => c.join('×')).join(', ')})` : ''}
                  </dd>
                  <dt>{t('layers', 'слои')}</dt>
                  <dd>{caps.layers}</dd>
                  <dt>{t('encoders', 'энкодеры')}</dt>
                  <dd>{caps.encoderMap ? `${snapshot.encoderCount} · encoder map` : t('no encoder map', 'карты энкодеров нет')}</dd>
                  <dt>{t('macros', 'макросы')}</dt>
                  <dd>{caps.macros ? `${caps.macros.count} · ${caps.macros.bufferSize} B · ${t('used', 'занято')} ${snapshot.macros?.filter((m) => m.length).length ?? 0}` : t('not supported', 'не поддерживаются')}</dd>
                  <dt>{t('lighting', 'подсветка')}</dt>
                  <dd>
                    {[caps.lighting.rgbMatrix && 'RGB Matrix', caps.lighting.rgblight && 'RGB Light', caps.lighting.ledMatrix && 'LED Matrix', caps.lighting.backlight && 'Backlight'].filter(Boolean).join(', ') || t('no VIA lighting', 'нет подсветки через VIA')}
                  </dd>
                  <dt>{t('fw version', 'версия')}</dt>
                  <dd>{caps.firmwareVersion}</dd>
                  <dt>{t('read at', 'прочитано')}</dt>
                  <dd>{new Date(snapshot.readAt).toLocaleTimeString()}</dd>
                </dl>
                {snapshot.macroIssues.length > 0 && <p className="field-hint">{snapshot.macroIssues.join('; ')}</p>}
              </div>
            </section>
            <section className="panel-box">
              <div className="panel-box-head">
                <span className="cell-label">{t('project ⇄ keyboard', 'проект ⇄ клавиатура')}</span>
              </div>
              <div className="panel-box-body field">
                {project ? (
                  <>
                    {linkedOk === false && (
                      <p className="field-hint" style={{ color: 'var(--danger-color)' }}>
                        {t('This keyboard is not the one the project is made for (VID:PID differ).', 'Это не та клавиатура, для которой сделан проект (VID:PID другие).')}
                      </p>
                    )}
                    {differs === 'matrix' ? (
                      <p className="field-hint" style={{ color: 'var(--danger-color)' }}>
                        {t(`Matrix differs: project ${project.hardware.matrix.rows}×${project.hardware.matrix.cols}, keyboard ${snapshot.rows}×${snapshot.cols}.`, `Матрица не совпадает: в проекте ${project.hardware.matrix.rows}×${project.hardware.matrix.cols}, в клавиатуре ${snapshot.rows}×${snapshot.cols}.`)}
                      </p>
                    ) : (
                      <p className="field-hint">
                        {differs === 0 ? t('The keymap in the keyboard is the same as in the project.', 'Раскладка в клавиатуре такая же, как в проекте.') : t(`${differs} keys differ from the project.`, `Отличается клавиш: ${differs}.`)}
                      </p>
                    )}
                    <div className="field-row">
                      <button
                        className="btn"
                        disabled={differs === 'matrix'}
                        onClick={() => {
                          apply((p) => {
                            const km = activeKeymap(p);
                            const fromDev = { ...snapshotToKeymap(km, snapshot), id: newId('keymap'), name: `${current?.productName ?? 'keyboard'} ${new Date().toLocaleDateString()}` };
                            return { ...p, keymaps: [...p.keymaps, fromDev], activeKeymapId: fromDev.id };
                          }, t('read keymap from keyboard', 'раскладка с клавиатуры'));
                          toast(t('The keyboard keymap is added to the project as a new keymap', 'Раскладка клавиатуры добавлена в проект новой раскладкой'));
                        }}
                      >
                        <Download {...ICON} /> {t('read keymap into project (new keymap)', 'прочитать раскладку в проект (новая)')}
                      </button>
                      <button
                        className="btn"
                        disabled={differs === 'matrix' || differs === 0}
                        onClick={() => {
                          setCompare('device');
                          navigate({ section: 'keyboard' });
                        }}
                      >
                        {t('show differences', 'показать отличия')}
                      </button>
                      {!project.device && current && (
                        <button className="btn btn--ghost" onClick={() => apply((p) => patchProject(p, { device: { vid: current.vendorId, pid: current.productId, product: current.productName } }), t('link keyboard', 'привязка клавиатуры'))}>
                          {t('link this keyboard to the project', 'привязать клавиатуру к проекту')}
                        </button>
                      )}
                    </div>
                    <p className="field-hint">{t('Writing to the keyboard: bottom bar → “to keyboard” (you see all changes before writing; the result is verified by reading back).', 'Запись в клавиатуру: внизу → «в клавиатуру» (сначала показываются все изменения; результат проверяется чтением).')}</p>
                    {lastWrite && (
                      <span className="kicker">
                        {t('last write', 'последняя запись')}: {new Date(lastWrite.at).toLocaleTimeString()} · {lastWrite.verified ? t('verified', 'проверено') : t('NOT verified', 'НЕ подтверждено')}
                      </span>
                    )}
                  </>
                ) : (
                  <a className="btn btn--primary" href={href({ section: 'projects', tab: 'new' })}>
                    {t('create a project from this keyboard', 'создать проект по этой клавиатуре')}
                  </a>
                )}
              </div>
            </section>
          </div>
          <div style={{ marginTop: 'var(--gap)' }}>
            <Tester />
          </div>
        </>
      )}
      <div style={{ marginTop: 'var(--gap)' }}>
        <BootloaderHelp />
      </div>
    </div>
  );
}
