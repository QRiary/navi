import { useMemo } from 'react';
import { renderAscii } from '../lib/asciiLogo';
import { useSettingsStore } from '../store/settingsStore';

/** Splits an ASCII-art line into “fill” (█) and “outline” (╗║═ etc.) for two colors. */
function splitRuns(line: string) {
  const runs: { fill: boolean; text: string }[] = [];
  for (const ch of line) {
    const fill = ch === '█';
    const last = runs[runs.length - 1];
    if (last && last.fill === fill) last.text += ch;
    else runs.push({ fill, text: ch });
  }
  return runs;
}

/**
 * Logo from the config: "brand": { "name", "logo": "ascii" | "pixel" | "text" }.
 * size="lg" — large (main page), size="sm" — small (sidebar).
 */
export function Logo({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const brand = useSettingsStore((s) => s.settings.brand);
  const font = size === 'lg' ? brand.asciiFont : brand.asciiFontSmall;
  const art = useMemo(() => (brand.logo === 'ascii' ? renderAscii(brand.name, font) : null), [brand.logo, brand.name, font]);

  if (art) {
    return (
      <pre
        className={`ascii-logo ascii-logo--${size} ${art.includes('█') ? '' : 'ascii-logo--line'}`}
        role="img"
        aria-label={brand.name}
      >
        {art.split('\n').map((line, i) => (
          <span key={i} className="ascii-line">
            {splitRuns(line).map((run, j) => (
              <span key={j} className={run.fill ? 'ascii-fill' : 'ascii-edge'}>
                {run.text}
              </span>
            ))}
            {'\n'}
          </span>
        ))}
      </pre>
    );
  }

  if (brand.logo === 'pixel') {
    return (
      <span className={`logo logo--${size}`} role="img" aria-label={brand.name}>
        <span className="logo-shadow" aria-hidden="true">
          {brand.name}
        </span>
        <span className="logo-face" aria-hidden="true">
          {brand.name}
        </span>
      </span>
    );
  }

  return <span className={`text-logo text-logo--${size}`}>{brand.name}</span>;
}
