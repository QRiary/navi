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
import { href } from '../lib/router';
import { t } from '../i18n';

const TABS = () =>
  [
    ['setup', t('1 · environment', '1 · окружение')],
    ['target', t('2 · keyboard', '2 · клавиатура')],
    ['features', t('3 · features', '3 · функции')],
    ['files', t('4 · keymap files', '4 · файлы keymap')],
    ['build', t('5 · build', '5 · сборка')],
    ['flash', t('6 · flash', '6 · прошить')],
  ] as const;

export function FirmwarePage({ tab }: { tab?: string }) {
  const current = TABS().some(([id]) => id === tab) ? tab! : 'setup';
  return (
    <div className="page">
      <div className="tabs" role="tablist">
        {TABS().map(([id, title]) => (
          <a key={id} className={`tab ${current === id ? 'is-active' : ''}`} href={href({ section: 'firmware', tab: id })}>
            {title}
          </a>
        ))}
      </div>
      {current === 'setup' && <SetupTab />}
      {current === 'target' && <TargetTab />}
      {current === 'features' && <FeaturesTab />}
      {current === 'files' && <FilesTab />}
      {current === 'build' && <BuildTab />}
      {current === 'flash' && <FlashTab />}
    </div>
  );
}
