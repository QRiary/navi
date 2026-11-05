/**
 * FIRMWARE SECTION: QMK environment → keyboard (target) → features → keymap files → build → flash.
 * Tab order = work order. Nothing is faked: building is qmk compile, flashing is
 * a UF2 copy or qmk flash, the result is the keyboard actually appearing.
 */
import { BuildTab } from '../components/firmware/BuildTab';
import { FeaturesTab } from '../components/firmware/FeaturesTab';
import { FilesTab } from '../components/firmware/FilesTab';
import { FlashTab } from '../components/firmware/FlashTab';
import { SetupTab } from '../components/firmware/SetupTab';
import { TargetTab } from '../components/firmware/TargetTab';
import { TabPanels, Tabs } from '../components/Tabs';
import { href } from '../lib/router';
import { t } from '../i18n';

const TABS = () => [
  { id: 'setup', label: t('1 · Environment', '1 · Окружение') },
  { id: 'target', label: t('2 · Keyboard', '2 · Клавиатура') },
  { id: 'features', label: t('3 · Features', '3 · Функции') },
  { id: 'files', label: t('4 · Keymap files', '4 · Файлы keymap') },
  { id: 'build', label: t('5 · Build', '5 · Сборка') },
  { id: 'flash', label: t('6 · Flash', '6 · Прошить') },
];

export function FirmwarePage({ tab }: { tab?: string }) {
  const tabs = TABS();
  const current = tabs.some((i) => i.id === tab) ? tab! : 'setup';
  return (
    <div className="page">
      <Tabs idBase="firmware" label={t('Firmware steps', 'Шаги прошивки')} items={tabs} current={current} href={(id) => href({ section: 'firmware', tab: id })} sticky />
      <TabPanels
        idBase="firmware"
        ids={tabs.map((i) => i.id)}
        current={current}
        render={(id, active) => {
          switch (id) {
            case 'setup':
              return <SetupTab active={active} />;
            case 'target':
              return <TargetTab />;
            case 'features':
              return <FeaturesTab />;
            case 'files':
              return <FilesTab />;
            case 'build':
              return <BuildTab />;
            case 'flash':
              return <FlashTab active={active} />;
          }
        }}
      />
    </div>
  );
}
