/**
 * ═══════════════════════════════════════════════════════════════════════
 *  THEME CONFIG — palettes and the settings schema of NAVI (the palettes are the same as in the CARRIER player).
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  • THEME_PRESETS     — ready-made palettes. Add your own — it becomes available
 *                         in the config ("theme": "your-id") and in the preset list.
 *  • AppSettings       — all settings. Exactly this structure is written in the config
 *                         in the app (Settings → Config). Every field is described
 *                         with comments in default.config.jsonc.
 *  • DEFAULT_SETTINGS  — default values (must match default.config.jsonc,
 *                         a test checks this).
 *
 *  Components do not know concrete colors — only CSS variables
 *  (var(--accent-color) etc.). The values are computed by src/theme/applyTheme.ts.
 */

export type ColorScheme = 'dark' | 'light';

/** Colors of one palette. All values are HEX (#rrggbb). */
export interface ThemePalette {
  scheme: ColorScheme;
  /** Window background. */
  background: string;
  /** Panel background (sidebar, main area, bottom deck). */
  panel: string;
  /** Background of cells inside panels and input fields. */
  cell: string;
  /** Hover highlight. */
  hover: string;
  /** Borders. */
  border: string;
  /** Main text. */
  text: string;
  /** Secondary text. */
  textDim: string;
  /** Uppercase labels, service text. */
  label: string;
  /** Accent: active elements, selection. */
  accent: string;
  /** Text on top of the accent. */
  accentText: string;
  /** Meters (progress, sliders): gradient from meterFrom to meterTo. */
  meterFrom: string;
  meterTo: string;
  danger: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  /** Description in two languages: { en, ru }. */
  description: { en: string; ru: string };
  palette: ThemePalette;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'mono',
    name: 'MONO',
    description: { en: 'Monochrome, thin borders, blue-mint meters.', ru: 'Монохром, тонкие рамки, голубо-мятные шкалы.' },
    palette: {
      scheme: 'dark',
      background: '#050505',
      panel: '#0c0c0c',
      cell: '#080808',
      hover: '#151515',
      border: '#262626',
      text: '#e8e8e8',
      textDim: '#9a9a9a',
      label: '#6a6a6a',
      accent: '#e8e8e8',
      accentText: '#050505',
      meterFrom: '#6ec6ff',
      meterTo: '#7fe3a8',
      danger: '#ff5d6c',
    },
  },
  {
    id: 'phosphor',
    name: 'PHOSPHOR',
    description: { en: 'Green phosphor of an old terminal.', ru: 'Зелёный люминофор старого терминала.' },
    palette: {
      scheme: 'dark',
      background: '#030503',
      panel: '#070b07',
      cell: '#050805',
      hover: '#0d150d',
      border: '#1a281a',
      text: '#b8f5b0',
      textDim: '#6fa86a',
      label: '#4a6e47',
      accent: '#9cff8f',
      accentText: '#031003',
      meterFrom: '#3cff7a',
      meterTo: '#c8ff6a',
      danger: '#ff6b5a',
    },
  },
  {
    id: 'amber',
    name: 'AMBER',
    description: { en: 'Amber monitor.', ru: 'Янтарный монитор.' },
    palette: {
      scheme: 'dark',
      background: '#070502',
      panel: '#0d0a04',
      cell: '#090703',
      hover: '#181208',
      border: '#2c2210',
      text: '#ffcf7a',
      textDim: '#b88f4a',
      label: '#7a5f30',
      accent: '#ffb000',
      accentText: '#120c00',
      meterFrom: '#ff8a00',
      meterTo: '#ffd36a',
      danger: '#ff5a3c',
    },
  },
  {
    id: 'alert',
    name: 'ALERT',
    description: { en: 'Dark red: shadows and alarm meters.', ru: 'Тёмно-красный: тени и тревожные шкалы.' },
    palette: {
      scheme: 'dark',
      background: '#060303',
      panel: '#0d0606',
      cell: '#090404',
      hover: '#180a0a',
      border: '#2c1212',
      text: '#ead6d6',
      textDim: '#a07f7f',
      label: '#6e4a4a',
      accent: '#ff3b4e',
      accentText: '#140203',
      meterFrom: '#ff3b4e',
      meterTo: '#ff9a6b',
      danger: '#ffb000',
    },
  },
  {
    id: 'paper',
    name: 'PAPER',
    description: { en: 'Light: a printer printout.', ru: 'Светлая: распечатка с принтера.' },
    palette: {
      scheme: 'light',
      background: '#e9e6df',
      panel: '#f2efe8',
      cell: '#faf8f3',
      hover: '#e2ded5',
      border: '#c9c3b6',
      text: '#161512',
      textDim: '#5a554b',
      label: '#8a8476',
      accent: '#161512',
      accentText: '#f2efe8',
      meterFrom: '#2b6cb0',
      meterTo: '#2f9e6b',
      danger: '#c0262d',
    },
  },
];

export type Density = 'compact' | 'comfortable' | 'spacious';
export type UiFont = 'mono' | 'sans';
export type LogoStyle = 'ascii' | 'pixel' | 'text';
export type AsciiFont = 'ANSI Shadow' | 'ANSI Regular' | 'Calvin S';
export type HostOsSetting = 'windows' | 'macos' | 'linux';

/** Old palette ids → new ones (so old configs keep working). */
export const THEME_ALIASES: Record<string, string> = {
  lanvoid: 'mono',
  'red-room': 'alert',
};

export const DENSITY: Record<Density, { space: number; rowHeight: number }> = {
  compact: { space: 0.72, rowHeight: 40 },
  comfortable: { space: 1, rowHeight: 52 },
  spacious: { space: 1.3, rowHeight: 64 },
};

export const UI_FONTS: Record<UiFont, string> = {
  mono: "'JetBrains Mono Variable', 'Cascadia Mono', Consolas, monospace",
  sans: "'Segoe UI', system-ui, sans-serif",
};

export const MONO_FONT_STACK = UI_FONTS.mono;
export const PIXEL_FONT_STACK = "'Silkscreen', 'JetBrains Mono Variable', monospace";

/** Palette colors that can be overridden in the config (the "colors" section). */
export const PALETTE_KEYS = [
  'background',
  'panel',
  'cell',
  'hover',
  'border',
  'text',
  'textDim',
  'label',
  'accent',
  'accentText',
  'meterFrom',
  'meterTo',
  'danger',
] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

/** All app settings. Exactly this structure is written in the config. */
export interface AppSettings {
  /** Interface language: "en" — English, "ru" — Russian. */
  language: 'en' | 'ru';
  brand: {
    name: string;
    tagline: string;
    logo: LogoStyle;
    asciiFont: AsciiFont;
    asciiFontSmall: AsciiFont;
  };
  /** Palette id from THEME_PRESETS. */
  theme: string;
  /** Palette color overrides. null — take from the palette. */
  colors: Partial<Record<PaletteKey, string | null>>;
  layout: {
    density: Density;
    sidebar: boolean;
    /** Right panel — inspector of the selected key. */
    inspector: boolean;
    systemLabels: boolean;
    statusLine: boolean;
    sidebarWidth: number;
    inspectorWidth: number;
  };
  shape: {
    /** Panel corner radius, px. */
    panelRadius: number;
    /** Key corner radius on the drawing, px. */
    keyRadius: number;
  };
  typography: {
    font: UiFont;
    scale: number;
  };
  surfaces: {
    opacity: number;
    blur: number;
  };
  effects: {
    scanlines: number;
    noise: number;
    vignette: number;
    glow: number;
    glitch: boolean;
    wires: boolean;
    animations: boolean;
  };
  keyboard: {
    /** How to label GUI: Win / Cmd / Super. */
    os: HostOsSetting;
    /** Second label on keys — the computer's layout ("none", "russian", "german"…). */
    hostLayout: string;
    /** Show the matrix position [row,col] on keys. */
    showMatrix: boolean;
    /** On transparent keys show what “shows through” from a lower layer. */
    showTransparentSource: boolean;
    /** Key size on the drawing at 100% zoom, px. */
    keySize: number;
  };
  editor: {
    /** Snap step in the geometry editor, u (0 — no snapping). */
    snap: number;
    /** Ask before writing to the keyboard. */
    confirmDeviceWrite: boolean;
  };
  device: {
    /** Connect to a known keyboard automatically on start. */
    autoConnect: boolean;
    /** Write every change to the keyboard right away (like VIA). */
    liveWrite: boolean;
  };
  qmk: {
    /** qmk_firmware folder. Empty — ask the QMK CLI (qmk config user.qmk_home). */
    home: string;
    /** QMK MSYS folder (Windows). Empty — look in C:\QMK_MSYS. */
    msys: string;
    /** WSL distro with QMK (Windows). Empty — the distro where qmk is found. */
    wsl: string;
  };
  /** Any CSS variables directly: { "--panel-border-width": "2px" }. */
  vars: Record<string, string>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  brand: {
    name: 'NAVI',
    tagline: 'keys / layers / firmware',
    logo: 'ascii',
    asciiFont: 'ANSI Shadow',
    asciiFontSmall: 'Calvin S',
  },
  theme: 'mono',
  colors: {},
  layout: {
    density: 'comfortable',
    sidebar: true,
    inspector: true,
    systemLabels: true,
    statusLine: true,
    sidebarWidth: 232,
    inspectorWidth: 340,
  },
  shape: { panelRadius: 0, keyRadius: 2 },
  typography: { font: 'mono', scale: 1 },
  surfaces: { opacity: 1, blur: 0 },
  effects: {
    scanlines: 0.3,
    noise: 0.12,
    vignette: 0.6,
    glow: 0,
    glitch: false,
    wires: false,
    animations: true,
  },
  keyboard: {
    os: 'windows',
    hostLayout: 'none',
    showMatrix: false,
    showTransparentSource: true,
    keySize: 54,
  },
  editor: { snap: 0.25, confirmDeviceWrite: true },
  device: { autoConnect: true, liveWrite: false },
  qmk: { home: '', msys: '', wsl: '' },
  vars: {},
};

/** Allowed values and ranges — the config is checked against them. */
export const SETTINGS_ENUMS: Record<string, readonly string[]> = {
  language: ['en', 'ru'],
  'brand.logo': ['ascii', 'pixel', 'text'],
  'brand.asciiFont': ['ANSI Shadow', 'ANSI Regular', 'Calvin S'],
  'brand.asciiFontSmall': ['ANSI Shadow', 'ANSI Regular', 'Calvin S'],
  'layout.density': ['compact', 'comfortable', 'spacious'],
  'typography.font': ['mono', 'sans'],
  'keyboard.os': ['windows', 'macos', 'linux'],
};

/** Width limits of the side panels, px (shared by the config and mouse dragging). */
export const PANEL_WIDTH_LIMITS: Record<'sidebarWidth' | 'inspectorWidth', [number, number]> = {
  sidebarWidth: [64, 420],
  inspectorWidth: [280, 600],
};

export const SETTINGS_RANGES: Record<string, [number, number]> = {
  'layout.sidebarWidth': PANEL_WIDTH_LIMITS.sidebarWidth,
  'layout.inspectorWidth': PANEL_WIDTH_LIMITS.inspectorWidth,
  'shape.panelRadius': [0, 32],
  'shape.keyRadius': [0, 30],
  'typography.scale': [0.8, 1.3],
  'surfaces.opacity': [0.3, 1],
  'surfaces.blur': [0, 40],
  'effects.scanlines': [0, 1],
  'effects.noise': [0, 1],
  'effects.vignette': [0, 1],
  'effects.glow': [0, 1],
  'keyboard.keySize': [32, 96],
  'editor.snap': [0, 1],
};

export function getPreset(id: string): ThemePreset {
  const realId = THEME_ALIASES[id] ?? id;
  return THEME_PRESETS.find((p) => p.id === realId) ?? THEME_PRESETS[0];
}
