/** Small helpers for colors in the #rrggbb format. */

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Relative luminance per WCAG (0 — black, 1 — white). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Returns almost-black or almost-white — whichever reads better on the background. */
export function readableTextOn(background: string): string {
  return luminance(background) > 0.35 ? '#0a0b0a' : '#f7f7f5';
}

/** WCAG contrast ratio of two #rrggbb colors (1…21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes `top` over `bottom` with the given alpha (0…1), like a translucent fill. */
export function mixHex(bottom: string, top: string, alpha: number): string {
  const a = hexToRgb(bottom);
  const b = hexToRgb(top);
  return rgbToHex(a.r + (b.r - a.r) * alpha, a.g + (b.g - a.g) * alpha, a.b + (b.b - a.b) * alpha);
}
