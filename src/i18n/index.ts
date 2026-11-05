/**
 * INTERFACE LANGUAGE: English (default) or Russian.
 * Changed in the config: "language": "en" | "ru" (Settings → Config).
 *
 * A translation is written right in the code as a pair of strings: t('English text', 'Russian text').
 * So both texts sit next to each other and neither gets lost. App.tsx subscribes to the language,
 * so when the language changes the whole app re-renders with the new strings.
 */

export type Language = 'en' | 'ru';

let current: Language = 'en';

export function setLanguage(language: Language) {
  if (current === language) return;
  current = language;
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}

export function getLanguage(): Language {
  return current;
}

/** Runs `fn` with `t()` answering in another language (the search indexes titles in both). */
export function withLanguage<T>(language: Language, fn: () => T): T {
  const saved = current;
  current = language;
  try {
    return fn();
  } finally {
    current = saved;
  }
}

/** Both languages of a text made by `t()` calls, joined (search fields). */
export function bothLanguages(fn: () => string): string {
  const en = withLanguage('en', fn);
  const ru = withLanguage('ru', fn);
  return en === ru ? en : `${en} ${ru}`;
}

/** String in the current language: t('English text', 'Russian text'). */
export function t(en: string, ru: string): string {
  return current === 'ru' ? ru : en;
}

/**
 * Number with a word: count(5, ['track', 'tracks'], [three Russian plural forms]) → "5 tracks" / the Russian form.
 */
export function count(n: number, en: [string, string], ru: [string, string, string]): string {
  return `${n} ${plural(n, en, ru)}`;
}

/** Only the word in the right form (without the number). */
export function plural(n: number, en: [string, string], ru: [string, string, string]): string {
  if (current !== 'ru') return n === 1 ? en[0] : en[1];
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return ru[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return ru[1];
  return ru[2];
}

/** Locale for dates and numbers. */
export const locale = () => (current === 'ru' ? 'ru-RU' : 'en-US');
