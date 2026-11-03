import {
  DEFAULT_SETTINGS,
  PALETTE_KEYS,
  SETTINGS_ENUMS,
  SETTINGS_RANGES,
  THEME_ALIASES,
  THEME_PRESETS,
  type AppSettings,
} from './theme.config';
import defaultConfigText from './default.config.jsonc?raw';
import { t } from '../i18n';

/**
 * Text config (JSON with comments): parsing and checking.
 * Errors come back as clear text with a line number.
 */

export const DEFAULT_CONFIG_TEXT: string = defaultConfigText;

export interface ConfigIssue {
  /** Line number (from 1), if known. */
  line?: number;
  path?: string;
  message: string;
  level: 'error' | 'warning';
}

export interface ConfigResult {
  settings: AppSettings | null;
  issues: ConfigIssue[];
}

/** Removes comments and trailing commas while keeping character positions (for line numbers). */
export function stripJsonc(text: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
    } else if (ch === '"') {
      inString = true;
      out += ch;
      i++;
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else {
      out += ch;
      i++;
    }
  }
  // Trailing commas: ", }" and ", ]" — the comma is replaced with a space.
  return out.replace(/,(\s*[}\]])/g, ' $1');
}

function lineOf(text: string, position: number): number {
  return text.slice(0, position).split('\n').length;
}

/** Finds the line where a key occurs in the text — to point at the error. */
function findKeyLine(text: string, path: string): number | undefined {
  const key = path.split('.').pop()!;
  const idx = stripJsonc(text).indexOf(`"${key}"`);
  return idx >= 0 ? lineOf(text, idx) : undefined;
}

export function parseConfig(text: string): ConfigResult {
  const issues: ConfigIssue[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonc(text));
  } catch (err) {
    const message = (err as Error).message;
    const pos = message.match(/position (\d+)/);
    const lineCol = message.match(/line (\d+)/);
    const line = lineCol ? Number(lineCol[1]) : pos ? lineOf(text, Number(pos[1])) : undefined;
    issues.push({
      level: 'error',
      line,
      message: t(
        `Syntax error: ${humanizeJsonError(message)}. Check quotes, commas and brackets.`,
        `Ошибка синтаксиса: ${humanizeJsonError(message)}. Проверьте кавычки, запятые и скобки.`,
      ),
    });
    return { settings: null, issues };
  }
  if (!isObject(raw)) {
    return { settings: null, issues: [{ level: 'error', message: t('The config must be an object in { curly braces }.', 'Конфиг должен быть объектом в { фигурных скобках }.') }] };
  }

  const settings = structuredClone(DEFAULT_SETTINGS);
  mergeChecked(settings as unknown as Record<string, unknown>, raw, '', issues, text);
  return { settings: issues.some((i) => i.level === 'error') ? null : settings, issues };
}

function mergeChecked(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  prefix: string,
  issues: ConfigIssue[],
  text: string,
) {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const issue = (message: string, level: ConfigIssue['level'] = 'error') =>
      issues.push({ path, message, level, line: findKeyLine(text, path) });

    if (path === 'colors') {
      if (!isObject(value)) {
        issue(t('“colors” must be an object', '«colors» должен быть объектом'));
        continue;
      }
      const colors: Record<string, string> = {};
      for (const [name, color] of Object.entries(value)) {
        if (color === null) continue;
        if (!(PALETTE_KEYS as readonly string[]).includes(name)) {
          issues.push({ path: `colors.${name}`, level: 'warning', line: findKeyLine(text, name), message: t(`unknown color “${name}” — skipped`, `неизвестный цвет «${name}» — пропущен`) });
        } else if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
          issues.push({ path: `colors.${name}`, level: 'error', line: findKeyLine(text, name), message: t(`color must be in "#rrggbb" format, now: ${JSON.stringify(color)}`, `цвет должен быть в формате "#rrggbb", сейчас: ${JSON.stringify(color)}`) });
        } else {
          colors[name] = color;
        }
      }
      target.colors = colors;
      continue;
    }
    if (path === 'vars') {
      if (!isObject(value)) {
        issue(t('“vars” must be an object', '«vars» должен быть объектом'));
        continue;
      }
      const vars: Record<string, string> = {};
      for (const [name, v] of Object.entries(value)) {
        if (!name.startsWith('--')) issues.push({ path: `vars.${name}`, level: 'error', line: findKeyLine(text, name), message: t('a CSS variable name must start with “--”', 'имя CSS-переменной должно начинаться с «--»') });
        else if (typeof v !== 'string' && typeof v !== 'number') issues.push({ path: `vars.${name}`, level: 'error', line: findKeyLine(text, name), message: t('the value must be a string', 'значение должно быть строкой') });
        else vars[name] = String(v);
      }
      target.vars = vars;
      continue;
    }

    if (!(key in target)) {
      issue(t(`unknown setting “${path}” — skipped`, `неизвестный параметр «${path}» — пропущен`), 'warning');
      continue;
    }
    const expected = target[key];
    if (isObject(expected)) {
      if (!isObject(value)) issue(t(`“${path}” must be an object { … }`, `«${path}» должен быть объектом { … }`));
      else mergeChecked(expected, value, path, issues, text);
      continue;
    }
    if (typeof value !== typeof expected) {
      const kind =
        typeof expected === 'boolean'
          ? t('true or false', 'true или false')
          : typeof expected === 'number'
            ? t('a number', 'число')
            : t('a string in quotes', 'строка в кавычках');
      issue(t(`expected ${kind}, now: ${JSON.stringify(value)}`, `ожидается ${kind}, сейчас: ${JSON.stringify(value)}`));
      continue;
    }
    const allowed = SETTINGS_ENUMS[path];
    if (allowed && !allowed.includes(value as string)) {
      const list = allowed.map((a) => `"${a}"`).join(' | ');
      issue(t(`allowed: ${list}; now: ${JSON.stringify(value)}`, `допустимо: ${list}; сейчас: ${JSON.stringify(value)}`));
      continue;
    }
    if (path === 'theme' && !THEME_PRESETS.some((p) => p.id === value)) {
      const renamed = THEME_ALIASES[value as string];
      if (renamed) {
        issue(
          t(
            `palette "${value}" was renamed to "${renamed}" — update the value`,
            `палитра "${value}" переименована в "${renamed}" — поправьте значение`,
          ),
          'warning',
        );
        target[key] = renamed;
      } else {
        const ids = THEME_PRESETS.map((p) => `"${p.id}"`).join(' | ');
        issue(t(`no palette "${value}". Available: ${ids}`, `нет палитры "${value}". Есть: ${ids}`));
      }
      continue;
    }
    const range = SETTINGS_RANGES[path];
    if (range && ((value as number) < range[0] || (value as number) > range[1])) {
      issue(t(`must be from ${range[0]} to ${range[1]}; now: ${value}`, `должно быть от ${range[0]} до ${range[1]}; сейчас: ${value}`));
      continue;
    }
    target[key] = value;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function humanizeJsonError(message: string): string {
  if (/Unexpected end/i.test(message)) return t('the file ends too early — a closing bracket is missing', 'файл обрывается — не хватает закрывающей скобки');
  if (/Expected ',' or '}'/i.test(message) || /Expected ',' or ']'/i.test(message)) return t('a comma between values is missing', 'пропущена запятая между значениями');
  if (/Expected property name|Expected double-quoted/i.test(message)) return t('a setting name must be in "double quotes"', 'имя параметра должно быть в "двойных кавычках"');
  if (/Unexpected token/i.test(message)) return t('unexpected character', 'неожиданный символ');
  return message;
}

/**
 * Changes one value in the config text while keeping comments (for quick buttons like choosing a palette).
 * The key is a parameter name ("theme") or a path with a section ("layout.sidebarWidth"): if the parameter
 * is not in the text yet, it is added inside its section.
 */
export function setConfigValue(text: string, key: string, value: string | boolean | number): string {
  const parts = key.split('.');
  const name = parts.pop()!;
  const section = parts.pop();
  const re = new RegExp(`("${name}"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|true|false|null|-?\\d+(?:\\.\\d+)?)`);
  if (re.test(stripJsonc(text)) && re.test(text)) return text.replace(re, `$1${JSON.stringify(value)}`);
  const entry = `"${name}": ${JSON.stringify(value)},`;
  if (section) {
    const sectionRe = new RegExp(`("${section}"\\s*:\\s*\\{)`);
    if (sectionRe.test(stripJsonc(text)) && sectionRe.test(text)) return text.replace(sectionRe, `$1\n    ${entry}`);
    return text.replace('{', `{\n  "${section}": { ${entry} },`);
  }
  // No key — add it right after the first “{”.
  return text.replace('{', `{\n  ${entry}`);
}
