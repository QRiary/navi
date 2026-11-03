/**
 * How to put the keyboard into bootloader mode (for flashing). Hints follow the known
 * hardware of the project; where the hardware is unknown — the general QMK ways. VIA cannot
 * switch to the bootloader (QMK does not handle the id_bootloader_jump command) — and it says so.
 */
import { activeKeymap } from '../../core/project/ops';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { t } from '../../i18n';

export function BootloaderHelp() {
  const project = useProjectStore((s) => s.project);
  const spec = useSpec();
  const boot = spec.byName.get('QK_BOOT')?.value ?? 0x7c00;
  const km = project ? activeKeymap(project) : null;
  const cols = project?.hardware.matrix.cols ?? 1;
  const bootKeys: string[] = [];
  km?.layers.forEach((l, li) =>
    l.keys.forEach((v, i) => {
      if (v === boot) bootKeys.push(`${t('layer', 'слой')} ${li}, [${Math.floor(i / cols)},${i % cols}]`);
    }),
  );
  const proc = project?.hardware.processor?.toLowerCase() ?? '';
  const bl = project?.hardware.bootloader?.toLowerCase() ?? '';
  const rp = proc.includes('rp2040') || bl.includes('rp2040') || proc === '';

  return (
    <section className="panel-box">
      <div className="panel-box-head">
        <span className="cell-label">{t('bootloader mode (for flashing)', 'режим загрузчика (для прошивки)')}</span>
      </div>
      <div className="panel-box-body field">
        <ol className="steps-list">
          <li>
            <strong>QK_BOOT</strong> —{' '}
            {bootKeys.length
              ? t(`press the key with QK_BOOT: ${bootKeys.join('; ')} (in the keyboard only after writing the keymap).`, `нажмите клавишу с QK_BOOT: ${bootKeys.join('; ')} (в клавиатуре — только после записи раскладки).`)
              : t('assign QK_BOOT (catalog → QMK functions) to a key on a rarely used layer and write it to the keyboard over VIA — then that key enters the bootloader.', 'назначьте QK_BOOT (каталог → Функции QMK) клавише на редком слое и запишите в клавиатуру по VIA — эта клавиша будет включать загрузчик.')}
          </li>
          <li>
            <strong>Bootmagic</strong> — {t('hold the top-left key (matrix [0,0]) while plugging the USB cable in. On a split keyboard — into the half where that key is. Works if the firmware has Bootmagic. Note: Bootmagic also resets the settings saved in the keyboard (keymap changed over VIA, lighting) to the firmware defaults — QK_BOOT does not.', 'держите левую верхнюю клавишу (матрица [0,0]) и подключите USB-кабель. У сплита — в ту половину, где эта клавиша. Работает, если в прошивке есть Bootmagic. Важно: Bootmagic ещё и сбрасывает настройки, сохранённые в клавиатуре (раскладку, изменённую по VIA, подсветку), к заводским в прошивке — QK_BOOT их не трогает.')}
          </li>
          {rp && (
            <li>
              <strong>RP2040</strong> — {t('double-press the reset button quickly, or hold the BOOTSEL button on the controller while plugging in. A drive “RPI-RP2” appears.', 'быстро дважды нажмите кнопку reset или держите BOOTSEL на контроллере при подключении. Появится диск «RPI-RP2».')}
            </li>
          )}
          {(proc.includes('32u4') || bl.includes('caterina')) && (
            <li>
              <strong>Pro Micro (Caterina)</strong> — {t('short RST to GND twice; the bootloader waits only ~8 seconds.', 'дважды замкните RST на GND; загрузчик ждёт всего ~8 секунд.')}
            </li>
          )}
          {(proc.includes('stm32') || bl.includes('dfu')) && (
            <li>
              <strong>STM32</strong> — {t('hold BOOT0 and press RESET (or the board’s boot button).', 'зажмите BOOT0 и нажмите RESET (или кнопку загрузчика на плате).')}
            </li>
          )}
          <li className="field-hint">{t('VIA cannot switch the keyboard to the bootloader: QMK does not handle that command over VIA.', 'По VIA перевести клавиатуру в загрузчик нельзя: QMK не обрабатывает эту команду через VIA.')}</li>
        </ol>
        {project?.hardware.split.enabled && (
          <p className="field-hint">
            {t('Split keyboard: each half has its own controller. Save a copy and flash each half in turn — the USB cable goes into the half you are working with.', 'Сплит: у каждой половины свой контроллер. Копию и прошивку делайте для каждой половины по очереди — USB-кабель вставляется в ту половину, с которой работаете.')}
          </p>
        )}
        <p className="field-hint">{t('In bootloader mode the keyboard does not type and is not listed under VIA devices — it shows up in “Firmware → flash”.', 'В режиме загрузчика клавиатура не печатает и пропадает из списка VIA — она появится в «Прошивка → прошить».')}</p>
      </div>
    </section>
  );
}
