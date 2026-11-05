import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CONFIG_TEXT, parseConfig, setConfigValue, type ConfigIssue } from '../config/configFile';
import { DEFAULT_SETTINGS, type AppSettings } from '../config/theme.config';
// First: its cache fills the palette registry before the config below is parsed (no flash of another palette).
import { useThemesStore } from './themesStore';

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
  setValue: (key: string, value: string | boolean | number | null) => void;
  /** Several values in one step (one config parse): setValues([['theme', 'x'], ['colors.text', null]]). */
  setValues: (edits: [string, string | boolean | number | null][]) => void;
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
      setValues: (edits) => {
        get().applyConfig(edits.reduce((text, [key, value]) => setConfigValue(text, key, value), get().configText));
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

// A theme saved, renamed, removed or read from disk: parse the config again, so "theme": "<own id>" resolves
// (and a changed theme's colors are applied).
useThemesStore.subscribe((state, prev) => {
  if (state.themes !== prev.themes) useSettingsStore.getState().applyConfig(useSettingsStore.getState().configText);
});
