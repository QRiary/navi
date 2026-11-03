import figlet from 'figlet';
import ansiRegular from 'figlet/fonts/ANSI Regular';
import ansiShadow from 'figlet/fonts/ANSI Shadow';
import calvinS from 'figlet/fonts/Calvin S';
import type { AsciiFont } from '../config/theme.config';

/**
 * ASCII logo from the name (the figlet library, classic terminal fonts).
 * A new font: import it from 'figlet/fonts/<Name>' and add it to FONTS
 * and to the AsciiFont type (theme.config.ts).
 */

const FONTS: Record<AsciiFont, string> = {
  'ANSI Shadow': ansiShadow,
  'ANSI Regular': ansiRegular,
  'Calvin S': calvinS,
};

let registered = false;
function registerFonts() {
  if (registered) return;
  for (const [name, data] of Object.entries(FONTS)) figlet.parseFont(name, data);
  registered = true;
}

/** Characters these fonts have. No Cyrillic — then the logo is plain text. */
const SUPPORTED = /^[A-Za-z0-9 .,:;!?\-_/+*'"()[\]#&@$%]+$/;

const cache = new Map<string, string | null>();

/** Returns ASCII art or null if the name has unsupported characters. */
export function renderAscii(text: string, font: AsciiFont): string | null {
  const key = `${font}\n${text}`;
  if (cache.has(key)) return cache.get(key)!;
  let result: string | null = null;
  if (text.trim() && SUPPORTED.test(text)) {
    registerFonts();
    const art = figlet.textSync(text.toUpperCase(), { font });
    // Remove empty lines at the bottom and extra spaces on the right.
    result = art
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');
  }
  cache.set(key, result);
  return result;
}
