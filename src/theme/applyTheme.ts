import {
  DENSITY,
  MONO_FONT_STACK,
  PALETTE_KEYS,
  PIXEL_FONT_STACK,
  UI_FONTS,
  completePalette,
  getPreset,
  type AppSettings,
  type PresetPalette,
  type ThemePalette,
} from '../config/theme.config';
import { hexToRgb, isHexColor } from './color';

/**
 * The resulting palette: the preset + own colors from the "colors" section. Box and key colors the preset and
 * the config both leave out follow the resulting `cell` / `border`, so an own `cell` still recolors them.
 */
export function resolvePalette(settings: AppSettings): ThemePalette {
  const palette: PresetPalette = { ...getPreset(settings.theme).palette };
  for (const key of PALETTE_KEYS) {
    const override = settings.colors[key];
    if (override && isHexColor(override)) palette[key] = override;
  }
  return completePalette(palette);
}

/**
 * Turns the settings into a set of CSS variables.
 * A pure function (no side effects) — so it is easy to test.
 */
export function computeThemeVariables(settings: AppSettings): Record<string, string> {
  const p = resolvePalette(settings);
  const density = DENSITY[settings.layout.density];
  const opacity = clamp(settings.surfaces.opacity, 0.3, 1);
  const glow = clamp(settings.effects.glow, 0, 1);
  const rgba = (hex: string, a: number) => {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${round(a)})`;
  };

  return {
    '--app-background': p.background,
    '--panel-background': rgba(p.panel, opacity),
    '--cell-background': p.cell,
    '--card-background': p.card,
    '--hover-background': p.hover,
    '--border-color': p.border,
    '--key-background': p.key,
    '--key-border': p.keyBorder,
    '--text-primary': p.text,
    '--text-secondary': p.textDim,
    '--text-label': p.label,
    '--accent-color': p.accent,
    '--accent-contrast': p.accentText,
    '--accent-soft': rgba(p.accent, 0.08),
    '--meter-from': p.meterFrom,
    '--meter-to': p.meterTo,
    '--meter-gradient': `linear-gradient(90deg, ${p.meterFrom}, ${p.meterTo})`,
    '--danger-color': p.danger,
    '--glow-shadow': glow > 0 ? `0 0 ${round(4 + glow * 18)}px ${rgba(p.meterTo, 0.1 + glow * 0.4)}` : 'none',
    '--panel-radius': `${settings.shape.panelRadius}px`,
    '--key-radius': `${settings.shape.keyRadius}px`,
    '--key-size': `${settings.keyboard.keySize}px`,
    '--space': `${density.space}`,
    '--row-height': `${density.rowHeight}px`,
    '--sidebar-width': `${settings.layout.sidebarWidth}px`,
    '--inspector-width': `${settings.layout.inspectorWidth}px`,
    '--panel-blur': `${clamp(settings.surfaces.blur, 0, 40)}px`,
    '--scanline-opacity': `${round(clamp(settings.effects.scanlines, 0, 1) * 0.45)}`,
    '--noise-opacity': `${round(clamp(settings.effects.noise, 0, 1) * 0.25)}`,
    '--vignette-strength': `${round(clamp(settings.effects.vignette, 0, 1))}`,
    '--font-ui': UI_FONTS[settings.typography.font],
    '--font-mono': MONO_FONT_STACK,
    '--font-pixel': PIXEL_FONT_STACK,
    '--font-scale': `${clamp(settings.typography.scale, 0.8, 1.3)}`,
    // Own variables from the "vars" section — last, so they override everything else.
    ...settings.vars,
  };
}

/** Attributes on <html> that turn on modes in CSS (data-scheme="light" etc.). */
export function computeThemeAttributes(settings: AppSettings): Record<string, string> {
  return {
    'data-scheme': resolvePalette(settings).scheme,
    'data-density': settings.layout.density,
    'data-motion': settings.effects.animations ? 'full' : 'reduced',
    'data-glitch': settings.effects.glitch && settings.effects.animations ? 'on' : 'off',
    'data-wires': settings.effects.wires ? 'on' : 'off',
  };
}

/** Builds the CSS rule :root { … } from the variables. Dangerous characters in values are dropped. */
export function buildVariablesCss(vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .filter(([name, value]) => /^--[\w-]+$/.test(name) && !/[{}<;]/.test(value))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `:root {\n${body}\n}`;
}

/**
 * Applies the theme to the page. Called on every settings change.
 * The variables are written into a separate <style>, not into style="" on <html>:
 * so styles loaded later can still override them.
 */
export function applyTheme(settings: AppSettings, root: HTMLElement = document.documentElement) {
  const vars = computeThemeVariables(settings);
  let style = document.getElementById('navi-theme-vars');
  if (!style) {
    style = document.createElement('style');
    style.id = 'navi-theme-vars';
    document.head.appendChild(style);
  }
  style.textContent = buildVariablesCss(vars);
  for (const [name, value] of Object.entries(computeThemeAttributes(settings))) root.setAttribute(name, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--app-background']);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
