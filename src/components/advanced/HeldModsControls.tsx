/**
 * Held modifiers while NAVI types text (firmware.liftHeldMods, `heldMods` of a macro / send-string key): the global
 * row on Advanced → NAVI additions and the per-macro / per-key select ("default" follows the global setting).
 */
import type { HeldMods, Project } from '../../core/project/types';
import { useProjectStore } from '../../store/projectStore';
import { t } from '../../i18n';
import { findAttr } from '../../lib/find';
import { InfoTip } from '../InfoTip';

const tip = () =>
  t(
    'While the keyboard types the text, the modifiers you hold (a real Shift, Ctrl…) are let go and put back after, so a held Shift does not turn “;” into “:”. One-shot and weak modifiers are not touched. For a Shift version of a macro, use a key override.',
    'Пока клавиатура печатает текст, удерживаемые вами модификаторы (настоящие Shift, Ctrl…) отпускаются и возвращаются после, так что зажатый Shift не превращает «;» в «:». Одноразовые и слабые модификаторы не трогаются. Для версии макроса с Shift используйте key override.',
  );

export function LiftHeldModsRow({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const title = t('Macros type with held modifiers lifted', 'Макросы печатают с отпущенными модификаторами');
  return (
    <div className="row" {...findAttr('setting:firmware.liftHeldMods')} style={{ ['--row-cols' as string]: 'minmax(0,1.3fr) minmax(0,1fr) auto' }}>
      <span>
        {title}
        <span className="field-hint">
          {' — '}
          {t('A Shift you hold does not change the typed text. A macro or custom keycode can override this.', 'Зажатый Shift не меняет печатаемый текст. Макрос или свой keycode могут задать иначе.')} <InfoTip label={title}>{tip()}</InfoTip>
        </span>
      </span>
      <code className="kicker">{t('NAVI (keymap.c)', 'NAVI (keymap.c)')}</code>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={project.firmware.liftHeldMods}
          onChange={(e) => apply((p) => ({ ...p, firmware: { ...p.firmware, liftHeldMods: e.target.checked } }), title)}
          aria-label={title}
        />
      </label>
    </div>
  );
}

/** Per-macro / per-key choice: default (the global setting), lift or keep. */
export function HeldModsSelect({ value, global, onChange, showLabel = true }: { value: HeldMods | undefined; global: boolean; onChange: (v: HeldMods | undefined) => void; showLabel?: boolean }) {
  const label = t('Held modifiers', 'Удерживаемые модификаторы');
  const word = (lift: boolean) => (lift ? t('lift', 'отпускать') : t('keep', 'оставлять'));
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {showLabel && label}
      <InfoTip label={label}>{tip()}</InfoTip>
      <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : (e.target.value as HeldMods))} aria-label={label}>
        <option value="">{t('default', 'по умолчанию')} ({word(global)})</option>
        <option value="lift">{t('lift', 'отпускать')}</option>
        <option value="keep">{t('keep', 'оставлять')}</option>
      </select>
    </label>
  );
}
