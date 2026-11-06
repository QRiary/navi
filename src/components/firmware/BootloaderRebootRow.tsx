/**
 * “Let NAVI restart the keyboard into its bootloader” (firmware.bootloaderReboot): NAVI's own C code in keymap.c.
 * One checkbox row; the packet itself is src/core/qmk/bootloaderReboot.ts.
 */
import type { Project } from '../../core/project/types';
import { useProjectStore } from '../../store/projectStore';
import { t } from '../../i18n';
import { InfoTip } from '../InfoTip';

export function BootloaderRebootRow({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const on = project.firmware.bootloaderReboot;
  const title = t('Let NAVI restart the keyboard into its bootloader', 'Разрешить NAVI перезагружать клавиатуру в загрузчик');
  return (
    <div className="row" style={{ ['--row-cols' as string]: 'minmax(0,1.3fr) minmax(0,1fr) auto' }}>
      <span>
        {title}{' '}
        <InfoTip label={title}>
          {t(
            '“Build + flash” then needs no key press: NAVI sends the keyboard a message and it restarts into its bootloader. Any program on this PC can then do the same, and then write its own firmware into the keyboard without you pressing anything; QMK itself leaves this out of VIA for that reason. Leave it off unless you flash often. Works after the next flash; until then press QK_BOOT once.',
            '«Собрать и прошить» тогда не требует нажатия клавиши: NAVI отправляет клавиатуре сообщение, и она перезагружается в загрузчик. Так же сможет любая программа на этом компьютере — и затем записать в клавиатуру свою прошивку без нажатия чего-либо; поэтому сам QMK не делает этого в VIA. Не включайте, если прошиваете нечасто. Работает после следующей прошивки; до этого один раз нажмите QK_BOOT.',
          )}
        </InfoTip>
      </span>
      <code className="kicker">{t('NAVI (keymap.c)', 'NAVI (keymap.c)')}</code>
      <label className="checkbox">
        <input type="checkbox" checked={on} onChange={(e) => apply((p) => ({ ...p, firmware: { ...p.firmware, bootloaderReboot: e.target.checked } }), title)} aria-label={title} />
      </label>
    </div>
  );
}
