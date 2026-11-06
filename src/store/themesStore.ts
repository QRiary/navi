import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setOwnPresets } from '../config/theme.config';
import { navi } from '../desktop/bridge';
import { parseTheme, serializeTheme, toPreset, type UserTheme } from '../theme/userThemes';

/**
 * The user's own themes. Desktop: the files in <userData>/themes are the truth, localStorage only a cache so the
 * theme is there before the first paint (the files are read right after start, `load`). Browser: localStorage only.
 * Every change also goes to the palette registry (setOwnPresets), which the config parser and applyTheme read;
 * settingsStore re-parses the config when the list changes.
 */
interface ThemesState {
  themes: UserTheme[];
  /** Read the theme files (desktop); files that fail to parse come back as their names. */
  load: () => Promise<string[]>;
  /** Write (new or replace by id). */
  put: (theme: UserTheme) => Promise<void>;
  /** Remove; the file text for an undo (null when there was no such theme). */
  remove: (id: string) => Promise<string | null>;
}

const byName = (a: UserTheme, b: UserTheme) => a.name.localeCompare(b.name);

function publish(themes: UserTheme[]) {
  setOwnPresets(themes.map(toPreset));
}

export const useThemesStore = create<ThemesState>()(
  persist(
    (set, get) => ({
      themes: [],
      load: async () => {
        if (!navi) return [];
        const files = await navi.themes.list();
        const themes: UserTheme[] = [];
        const broken: string[] = [];
        for (const { id, text } of files) {
          const parsed = parseTheme(text);
          if (parsed.ok) themes.push({ id, name: parsed.name, palette: parsed.palette, effects: parsed.effects });
          else broken.push(id);
        }
        themes.sort(byName);
        publish(themes);
        set({ themes });
        return broken;
      },
      put: async (theme) => {
        if (navi) await navi.themes.write(theme.id, serializeTheme(theme));
        const themes = [...get().themes.filter((t) => t.id !== theme.id), theme].sort(byName);
        publish(themes);
        set({ themes });
      },
      remove: async (id) => {
        const theme = get().themes.find((t) => t.id === id);
        if (!theme) return null;
        const text = navi ? ((await navi.themes.remove(id)) ?? serializeTheme(theme)) : serializeTheme(theme);
        const themes = get().themes.filter((t) => t.id !== id);
        publish(themes);
        set({ themes });
        return text;
      },
    }),
    {
      name: 'navi.themes',
      version: 1,
      partialize: (s) => ({ themes: s.themes }),
      merge: (persisted, current) => {
        const themes = (persisted as { themes?: UserTheme[] } | undefined)?.themes;
        const valid = Array.isArray(themes)
          ? themes.filter((t) => {
              try {
                return typeof t.id === 'string' && parseTheme(serializeTheme(t)).ok;
              } catch {
                return false; // a damaged cache entry: the files (load) are the truth anyway
              }
            })
          : [];
        publish(valid);
        return { ...current, themes: valid };
      },
    },
  ),
);
