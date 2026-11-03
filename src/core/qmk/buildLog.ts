/**
 * PARSING QMK BUILD OUTPUT: compiler errors and warnings (file:line:column),
 * QMK CLI messages (☒ / ⚠), firmware size, the resulting file.
 */

export type LogLevel = 'error' | 'warning' | 'note' | 'info';

export interface BuildMessage {
  level: LogLevel;
  file?: string;
  line?: number;
  column?: number;
  text: string;
  /** Line number in the log (from 0). */
  at: number;
}

export interface BuildSummary {
  messages: BuildMessage[];
  errors: number;
  warnings: number;
  /** «35212/2097152 (1%, 2061940 bytes free)» */
  size: { used: number; max: number } | null;
  firmwareFile: string | null;
}

const GCC = /^(.+?):(\d+):(\d+):\s+(fatal error|error|warning|note):\s+(.*)$/;
const GCC_NO_COL = /^(.+?):(\d+):\s+(error|warning):\s+(.*)$/;
const MAKE_ERR = /^make(?:\[\d+\])?: \*\*\* (.*)$/;
const SIZE = /firmware size is (?:fine|too large|approaching).*?-?\s*(\d+)\/(\d+)/i;
const COPY = /Copying\s+(\S+\.(?:uf2|hex|bin))\s+to qmk_firmware folder/i;

export function parseBuildLog(lines: string[]): BuildSummary {
  const messages: BuildMessage[] = [];
  let size: BuildSummary['size'] = null;
  let firmwareFile: string | null = null;
  lines.forEach((raw, at) => {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
    let m = line.match(GCC);
    if (m) {
      const level = m[4] === 'note' ? 'note' : m[4] === 'warning' ? 'warning' : 'error';
      messages.push({ level, file: m[1].trim(), line: Number(m[2]), column: Number(m[3]), text: m[5], at });
      return;
    }
    m = line.match(GCC_NO_COL);
    if (m && !/^make/.test(line)) {
      messages.push({ level: m[3] === 'warning' ? 'warning' : 'error', file: m[1].trim(), line: Number(m[2]), text: m[4], at });
      return;
    }
    m = line.match(MAKE_ERR);
    if (m) {
      messages.push({ level: 'error', text: `make: ${m[1]}`, at });
      return;
    }
    if (/^\s*☒/.test(line) || /^Ψ?\s*ERROR\b/i.test(line)) messages.push({ level: 'error', text: line.replace(/^\s*☒\s*/, ''), at });
    else if (/^\s*⚠/.test(line)) messages.push({ level: 'warning', text: line.replace(/^\s*⚠\s*/, ''), at });
    const s = line.match(SIZE);
    if (s) size = { used: Number(s[1]), max: Number(s[2]) };
    const c = line.match(COPY);
    if (c) firmwareFile = c[1];
  });
  return {
    messages,
    errors: messages.filter((x) => x.level === 'error').length,
    warnings: messages.filter((x) => x.level === 'warning').length,
    size,
    firmwareFile,
  };
}

/** Class of a log line for highlighting. */
export function lineLevel(line: string): LogLevel | null {
  if (/\berror\b|☒|\*\*\*/i.test(line)) return 'error';
  if (/\bwarning\b|⚠/i.test(line)) return 'warning';
  if (/\[OK\]|Copying .* to qmk_firmware folder|firmware size is fine/i.test(line)) return 'info';
  return null;
}
