/**
 * WRITING TO THE KEYBOARD: first show what exactly will change (the plan), then write
 * and verify by reading back. “Done” — only if the check passed.
 */
import { useMemo, useState } from 'react';
import { friendlyName } from '../../core/keycodes/friendly';
import { KeyName } from '../KeyName';
import { Modal } from '../Modal';
import { planWrite, type ApplyResult } from '../../core/via/sync';
import { activeKeymap } from '../../core/project/ops';
import { hardwareFacts } from '../../lib/hardwareFacts';
import { useLabelContext } from '../../lib/projectContext';
import { useDeviceStore } from '../../store/deviceStore';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { toast } from '../../store/toastStore';
import { getLanguage, t } from '../../i18n';
import { whyDisabled } from '../../lib/whyDisabled';
import { InfoTip } from '../InfoTip';

export function WriteDialog({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const spec = useSpec();
  const labelCtx = useLabelContext();
  const snapshot = useDeviceStore((s) => s.snapshot);
  const write = useDeviceStore((s) => s.write);
  const status = useDeviceStore((s) => s.status);
  const progress = useDeviceStore((s) => s.progress);
  const [includeMacros, setIncludeMacros] = useState(project ? project.macros.length > 0 : false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lang = getLanguage();

  const plan = useMemo(() => {
    if (!project || !snapshot) return null;
    return planWrite({ project, keymap: activeKeymap(project), snapshot, spec, hardware: hardwareFacts(project), includeMacros });
  }, [project, snapshot, spec, includeMacros]);

  if (!project || !snapshot || !plan || !labelCtx) return null;
  const km = activeKeymap(project);
  const nothing = plan.keys.length === 0 && plan.encoders.length === 0 && !plan.macros.buffer;
  const busy = status === 'busy';

  const run = async () => {
    setError(null);
    try {
      const res = await write(plan);
      setResult(res);
      if (res.verified) toast(t('Written to the keyboard and verified', 'Записано в клавиатуру и проверено'));
      else toast(t('Written, but verification found differences', 'Записано, но проверка нашла отличия'), 'error');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal
      title={<>{t('write to keyboard', 'запись в клавиатуру')} · VIA</>}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button className="btn" onClick={onClose} {...whyDisabled(busy && t('Wait: writing…', 'Подождите: идёт запись…'))}>
            {result ? t('close', 'закрыть') : t('cancel', 'отмена')}
          </button>
          {!result && (
            <button
              className="btn btn--primary"
              {...whyDisabled(
                (!plan.ok && t('The write plan has errors: see the messages above', 'В плане записи есть ошибки: см. сообщения выше')) ||
                  (nothing && t('The keyboard already matches the project', 'Клавиатура уже совпадает с проектом')) ||
                  (busy && t('Wait: writing…', 'Подождите: идёт запись…')),
              )}
              onClick={() => void run()}
            >
              {busy ? t('writing…', 'запись…') : t('write', 'записать')}
            </button>
          )}
        </>
      }
    >
      {plan.warnings.map((w, i) => (
        <div key={i} className="notice" role={w.level === 'error' ? 'alert' : 'status'} style={{ borderColor: w.level === 'error' ? 'var(--danger-color)' : undefined }}>
          <span>{lang === 'ru' ? w.message.ru : w.message.en}</span>
        </div>
      ))}
      {!result && (
        <>
          <p className="field-hint">
            {t(
              `Keymap “${km.name}” → keyboard. Only differences are written; the keyboard keeps them after unplugging (EEPROM).`,
              `Раскладка «${km.name}» → клавиатура. Пишутся только отличия; клавиатура сохранит их и после отключения (EEPROM).`,
            )}{' '}
            <InfoTip label={t('write plan', 'план записи')}>
              {t(
                'The write plan lists exactly which keys and encoder actions will change. After writing, NAVI reads everything back from the keyboard and says “verified” only if it matches. VIA is the protocol over USB that lets a program change the keymap without flashing.',
                'План записи перечисляет, какие именно клавиши и действия энкодеров изменятся. После записи NAVI читает всё обратно с клавиатуры и пишет «проверено», только если данные совпали. VIA — протокол по USB, позволяющий программе менять раскладку без прошивки.',
              )}
            </InfoTip>
          </p>
          <dl className="kv">
            <dt>{t('keys', 'клавиши')}</dt>
            <dd>{plan.keys.length}</dd>
            <dt>{t('encoders', 'энкодеры')}</dt>
            <dd>{plan.encoders.length}</dd>
            <dt>{t('macros', 'макросы')}</dt>
            <dd>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={includeMacros}
                  onChange={(e) => setIncludeMacros(e.target.checked)}
                  {...whyDisabled(!snapshot.capabilities.macros && t('This keyboard’s firmware does not report macro support', 'Прошивка этой клавиатуры не сообщает о поддержке макросов'))}
                />
                {plan.macros.buffer ? t('will be rewritten', 'будут перезаписаны') : t('no changes', 'без изменений')}
              </label>
            </dd>
          </dl>
          {(plan.keys.length > 0 || plan.encoders.length > 0) && (
            <div className="diff" style={{ maxHeight: 260 }}>
              {plan.keys.map((k, i) => (
                <div key={`k${i}`}>
                  L{k.layer} [{k.row},{k.col}] <KeyName className="d-del" name={friendlyName(spec, k.before, labelCtx)} /> → <KeyName className="d-add" name={friendlyName(spec, k.after, labelCtx)} />
                </div>
              ))}
              {plan.encoders.map((e, i) => (
                <div key={`e${i}`}>
                  L{e.layer} E{e.encoder} {e.clockwise ? '↻' : '↺'} <KeyName className="d-del" name={friendlyName(spec, e.before, labelCtx)} /> →{' '}
                  <KeyName className="d-add" name={friendlyName(spec, e.after, labelCtx)} />
                </div>
              ))}
            </div>
          )}
          {nothing && <p className="status-ok">{t('The keyboard already matches the project.', 'Клавиатура уже совпадает с проектом.')}</p>}
          {busy && progress && (
            <div className="progress" aria-label={t('Progress', 'Прогресс')}>
              <i style={{ width: `${Math.round(progress.part * 100)}%` }} />
            </div>
          )}
        </>
      )}
      {result && (
        <div className="notice" role={result.verified ? 'status' : 'alert'} style={{ borderColor: result.verified ? 'var(--meter-to)' : 'var(--danger-color)' }}>
          <span>
            {result.verified
              ? t(
                  `Done: ${result.written.keys} keys, ${result.written.encoders} encoder actions${result.written.macros ? ', macros' : ''}. Read back and verified.`,
                  `Готово: клавиш ${result.written.keys}, действий энкодеров ${result.written.encoders}${result.written.macros ? ', макросы' : ''}. Прочитано обратно и проверено.`,
                )
              : t(`Verification failed at: ${result.mismatches.join('; ')}`, `Проверка не совпала: ${result.mismatches.join('; ')}`)}
          </span>
        </div>
      )}
      {error && (
        <div className="notice" role="alert" style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}>
          {error} — {t('part of the changes may have been written; reconnect and compare again.', 'часть изменений могла записаться; переподключите и сравните ещё раз.')}
        </div>
      )}
    </Modal>
  );
}
