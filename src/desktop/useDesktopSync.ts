import { useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { toast } from '../store/toastStore';
import { navi } from './bridge';
import { t } from '../i18n';
import { resolvePalette } from '../theme/applyTheme';

/**
 * Desktop app: the config is the file %APPDATA%\NAVI\user.config.jsonc
 * (like in the player). An edit in the app → the file; an edit of the file in an editor → the app.
 */
export function useDesktopSync() {
  useEffect(() => {
    if (!navi) return;
    let lastSynced: string | null = null;
    let disposed = false;

    const applyFromFile = (text: string, source: 'start' | 'change') => {
      lastSynced = text;
      const issues = useSettingsStore.getState().applyConfig(text);
      const error = issues.find((i) => i.level === 'error');
      if (error) toast(`user.config.jsonc${error.line ? t(`, line ${error.line}`, `, строка ${error.line}`) : ''}: ${error.message}`, 'error');
      else if (source === 'change') toast(t('Config updated from file', 'Конфиг обновлён из файла'));
    };

    void navi.readConfig().then((fileText) => {
      if (disposed) return;
      const current = useSettingsStore.getState().configText;
      if (fileText === null) {
        lastSynced = current;
        void navi!.writeConfig(current);
      } else if (fileText !== current) applyFromFile(fileText, 'start');
      else lastSynced = fileText;
    });

    const unsubscribe = useSettingsStore.subscribe((state, prev) => {
      if (state.configText !== prev.configText && state.configText !== lastSynced) {
        lastSynced = state.configText;
        void navi!.writeConfig(state.configText);
      }
    });
    const off = navi.onConfigChanged((text) => {
      if (text !== lastSynced) applyFromFile(text, 'change');
    });
    return () => {
      disposed = true;
      unsubscribe();
      off();
    };
  }, []);
}

/** Color of the system title bar — matching the palette. */
export function syncTitleBar() {
  if (!navi) return;
  const p = resolvePalette(useSettingsStore.getState().settings);
  void navi.setTitleBarColors({ color: p.background, symbolColor: p.textDim });
}
