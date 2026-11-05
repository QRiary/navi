import { useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useThemesStore } from '../store/themesStore';
import { toast, toastError } from '../store/toastStore';
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

    // Own themes: the files in %APPDATA%\NAVI\themes replace the cached list.
    void useThemesStore
      .getState()
      .load()
      .then((broken) => {
        if (broken.length) toastError(t('Some theme files could not be read and are not shown', 'Некоторые файлы тем не читаются и не показаны'), broken.map((id) => `themes\\${id}.navi-theme.json`).join('\n'));
      })
      .catch((err) => toastError(t('Could not read your themes', 'Не удалось прочитать ваши темы'), err));

    const applyFromFile = (text: string, source: 'start' | 'change') => {
      lastSynced = text;
      const issues = useSettingsStore.getState().applyConfig(text);
      const error = issues.find((i) => i.level === 'error');
      if (error) toastError(t('user.config.jsonc has an error, so the changes were not applied. Fix the file and save it again.', 'В user.config.jsonc ошибка, поэтому изменения не применены. Исправьте файл и сохраните снова.'), `${error.line ? `line ${error.line}: ` : ''}${error.message}`);
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
