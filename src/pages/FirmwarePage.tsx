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
import { currentTab, tabItems, tabRoute } from '../lib/sections';
import { t } from '../i18n';

export function FirmwarePage({ tab }: { tab?: string }) {
  const tabs = tabItems('firmware');
  const current = currentTab('firmware', tab);
  return (
    <div className="page">
      <Tabs idBase="firmware" label={t('Firmware steps', 'Шаги прошивки')} items={tabs} current={current} href={(id) => href(tabRoute('firmware', id))} sticky />
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
