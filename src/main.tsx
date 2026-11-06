import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/keyboard.css';
import './styles/effects.css';
import { App } from './App';
import { isDesktop, navi } from './desktop/bridge';
import { runDeviceProbe } from './device/probeRun';
import { useSettingsStore } from './store/settingsStore';
import { applyTheme } from './theme/applyTheme';
import { installFocusRing } from './lib/focusRing';
import { installAriaDisabledGuard } from './lib/ariaDisabled';
import { setLanguage } from './i18n';

// Theme before the first render, so there is no “flash” of default colors.
applyTheme(useSettingsStore.getState().settings);
setLanguage(useSettingsStore.getState().settings.language);
installFocusRing(window, document.documentElement);
installAriaDisabledGuard(document);
if (isDesktop) document.documentElement.setAttribute('data-desktop', navi!.platform);

if (location.hash === '#/probe' && navi) {
  // Keyboard probe mode (npm run device:probe): no interface.
  void runDeviceProbe()
    .catch((err: unknown) => ({ ok: false, error: (err as Error).message }))
    .then((result) => navi!.probeResult(result));
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
