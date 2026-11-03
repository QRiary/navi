import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CONFIG_TEXT, parseConfig, setConfigValue, type ConfigIssue } from '../config/configFile';
import { DEFAULT_SETTINGS, type AppSettings } from '../config/theme.config';

/**
 * App settings (look, keyboard, device, QMK paths).
 * The single source of truth is the config TEXT (configText) you edit
 * in Settings → Config. The settings object is computed from it.
 * Quick buttons (palette choice, panel widths) also change the config text,
 * so everything you see is always written in the config.
 */

interface SettingsState {
  configText: string;
  settings: AppSettings;
  /** Check and apply a new config text. Errors come in the answer, the settings do not change. */
  applyConfig: (text: string) => ConfigIssue[];
  /** Change one value in the config: setValue('theme', 'amber'). */
  setValue: (key: string, value: string | boolean | number) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      configText: DEFAULT_CONFIG_TEXT,
      settings: DEFAULT_SETTINGS,
      applyConfig: (text) => {
        const { settings, issues } = parseConfig(text);
        if (settings) set({ configText: text, settings });
        return issues;
      },
      setValue: (key, value) => {
        get().applyConfig(setConfigValue(get().configText, key, value));
      },
      reset: () => set({ configText: DEFAULT_CONFIG_TEXT, settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'navi.settings',
      version: 1,
      partialize: (s) => ({ configText: s.configText }),
      // On start the saved config text is parsed again.
      merge: (persisted, current) => {
        const text = (persisted as { configText?: string } | undefined)?.configText ?? DEFAULT_CONFIG_TEXT;
        const { settings } = parseConfig(text);
        return settings ? { ...current, configText: text, settings } : current;
      },
    },
  ),
);
