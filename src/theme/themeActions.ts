/**
 * What the palette buttons do with the user's own themes: pick, save as new, save into the picked one, revert,
 * rename, remove (with undo), import, export. Color edits stay loose overrides in the config ("colors") until saved.
 */
import { PALETTE_KEYS, THEME_PRESETS, type AppSettings } from '../config/theme.config';
import { t } from '../i18n';
import { openTextFile, saveTextFile } from '../lib/files';
import { useSettingsStore } from '../store/settingsStore';
import { useThemesStore } from '../store/themesStore';
import { toast, toastError } from '../store/toastStore';
import { resolvePalette } from './applyTheme';
import {
  THEME_EFFECT_KEYS,
  THEME_FILE_EXT,
  THEME_FILTERS,
  cleanName,
  effectsDiffer,
  idForName,
  parseTheme,
  pickEffects,
  serializeTheme,
  uniqueName,
  type UserTheme,
} from './userThemes';

type Edit = [string, string | boolean | number | null];

const settings = () => useSettingsStore.getState().settings;
const themes = () => useThemesStore.getState().themes;
const findTheme = (id: string) => themes().find((th) => th.id === id);

const clearColors = (): Edit[] => PALETTE_KEYS.filter((k) => settings().colors[k]).map((k) => [`colors.${k}`, null]);
const effectEdits = (theme: UserTheme | undefined): Edit[] => (theme?.effects ? THEME_EFFECT_KEYS.map((k) => [`effects.${k}`, theme.effects![k]]) : []);

/** The picked theme of the user, or undefined for a built-in palette. */
export function currentOwnTheme(s: AppSettings = settings()): UserTheme | undefined {
  return findTheme(s.theme);
}

/** What differs from the picked palette / theme: changed colors, and for an own theme with effects, changed effects. */
export function unsavedChanges(s: AppSettings, own: UserTheme | undefined): { colors: number; effects: boolean } {
  return { colors: PALETTE_KEYS.filter((k) => s.colors[k]).length, effects: effectsDiffer(own?.effects, s.effects) };
}

/** Pick a palette or theme: an own theme also sets its effects. Changed colors stay (like switching palettes). */
export function pickTheme(id: string) {
  useSettingsStore.getState().setValues([['theme', id], ...effectEdits(findTheme(id))]);
}

/** Back to the picked palette / theme: colors overrides cleared, an own theme's effects restored. */
export function revertToTheme() {
  useSettingsStore.getState().setValues([...clearColors(), ...effectEdits(currentOwnTheme())]);
}

/** The look on screen now: the palette with the changed colors, and the look effects. */
function currentLook(): Pick<UserTheme, 'palette' | 'effects'> {
  return { palette: resolvePalette(settings()), effects: pickEffects(settings().effects) };
}

/** A name for "save as new": the picked theme's name (made unique), else "My theme". */
export function suggestedName(): string {
  const own = currentOwnTheme();
  return uniqueName(own ? own.name : t('My theme', 'Моя тема'), themes().map((th) => th.name));
}

/** Save what is on screen as a new theme and pick it. The error text, or null. */
export async function saveAsNew(rawName: string): Promise<string | null> {
  const name = cleanName(rawName);
  if (!name) return t('Type a name', 'Введите имя');
  if (themes().some((th) => th.name.toLowerCase() === name.toLowerCase())) return t('A theme with this name already exists', 'Тема с таким именем уже есть');
  const theme: UserTheme = { id: idForName(name, themes().map((th) => th.id)), name, ...currentLook() };
  try {
    await useThemesStore.getState().put(theme);
  } catch (err) {
    return t(`Could not save: ${(err as Error).message}`, `Не удалось сохранить: ${(err as Error).message}`);
  }
  useSettingsStore.getState().setValues([['theme', theme.id], ...clearColors()]);
  toast(t(`Theme “${name}” saved`, `Тема «${name}» сохранена`));
  return null;
}

/** Write what is on screen into the picked own theme. */
export async function saveToCurrent() {
  const own = currentOwnTheme();
  if (!own) return;
  try {
    await useThemesStore.getState().put({ ...own, ...currentLook() });
  } catch (err) {
    toastError(t(`Could not save theme “${own.name}”`, `Не удалось сохранить тему «${own.name}»`), (err as Error).message);
    return;
  }
  useSettingsStore.getState().setValues(clearColors());
  toast(t(`Theme “${own.name}” saved`, `Тема «${own.name}» сохранена`));
}

/** Rename; the id (file name and the config's "theme" value) follows the name. The error text, or null. */
export async function renameTheme(id: string, rawName: string): Promise<string | null> {
  const theme = findTheme(id);
  if (!theme) return null;
  const name = cleanName(rawName);
  if (!name) return t('Type a name', 'Введите имя');
  if (themes().some((th) => th.id !== id && th.name.toLowerCase() === name.toLowerCase())) return t('A theme with this name already exists', 'Тема с таким именем уже есть');
  const others = themes().filter((th) => th.id !== id).map((th) => th.id);
  const newId = idForName(name, others);
  const store = useThemesStore.getState();
  try {
    await store.put({ ...theme, id: newId, name });
    if (newId !== id) await store.remove(id);
  } catch (err) {
    return t(`Could not rename: ${(err as Error).message}`, `Не удалось переименовать: ${(err as Error).message}`);
  }
  if (newId !== id && settings().theme === id) useSettingsStore.getState().setValue('theme', newId);
  return null;
}

/** Remove, with an undo in the toast (the file also stays in themes/.trash). */
export async function removeTheme(id: string) {
  const theme = findTheme(id);
  if (!theme) return;
  const wasPicked = settings().theme === id;
  try {
    await useThemesStore.getState().remove(id);
  } catch (err) {
    toastError(t(`Could not remove theme “${theme.name}”`, `Не удалось удалить тему «${theme.name}»`), (err as Error).message);
    return;
  }
  // The palette falls back to the first built-in one; the effects stay as they are.
  if (wasPicked) useSettingsStore.getState().setValue('theme', THEME_PRESETS[0].id);
  toast(t(`Theme “${theme.name}” removed`, `Тема «${theme.name}» удалена`), 'info', {
    action: {
      label: t('undo', 'отменить'),
      run: () =>
        void useThemesStore
          .getState()
          .put(theme)
          .then(() => wasPicked && useSettingsStore.getState().setValue('theme', theme.id))
          .catch((err: Error) => toastError(t('Could not bring the theme back', 'Не удалось вернуть тему'), err.message)),
    },
  });
}

export async function exportTheme(id: string) {
  const theme = findTheme(id);
  if (!theme) return;
  try {
    const saved = await saveTextFile(`${theme.name}.${THEME_FILE_EXT}`, serializeTheme(theme), THEME_FILTERS);
    if (saved) toast(t(`Theme “${theme.name}” exported`, `Тема «${theme.name}» экспортирована`));
  } catch (err) {
    toastError(t('Could not export the theme', 'Не удалось экспортировать тему'), (err as Error).message);
  }
}

/** Import a theme file; a name already used gets " (2)". Not picked: the toast offers it. */
export async function importTheme() {
  let file: { name: string; text: string } | null;
  try {
    file = await openTextFile(THEME_FILTERS);
  } catch (err) {
    toastError(t('Could not open the file', 'Не удалось открыть файл'), (err as Error).message);
    return;
  }
  if (!file) return;
  const parsed = parseTheme(file.text);
  if (!parsed.ok) {
    toastError(t(`“${file.name}” is not a theme NAVI can use`, `«${file.name}» — не тема, которую NAVI может открыть`), t(parsed.error.en, parsed.error.ru));
    return;
  }
  const name = uniqueName(parsed.name, themes().map((th) => th.name));
  const theme: UserTheme = { id: idForName(name, themes().map((th) => th.id)), name, palette: parsed.palette, effects: parsed.effects };
  try {
    await useThemesStore.getState().put(theme);
  } catch (err) {
    toastError(t('Could not save the imported theme', 'Не удалось сохранить импортированную тему'), (err as Error).message);
    return;
  }
  toast(t(`Theme “${name}” imported`, `Тема «${name}» импортирована`), 'info', { action: { label: t('use it', 'включить'), run: () => pickTheme(theme.id) } });
}
