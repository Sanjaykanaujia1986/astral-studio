/**
 * Chart wheel colour theme.
 *
 * Colours are resolved to LITERAL values in JavaScript rather than emitted as
 * CSS custom properties.
 *
 * The reason is portability. `var(--x, fallback)` resolves only inside a
 * browser with a live cascade; a standalone SVG rasteriser — the kind used for
 * PDF export, print output and server-side thumbnails — has no cascade and
 * renders every such value as black. Since this chart must survive being
 * printed at A3 and embedded in a report, the theme is plain data and the SVG
 * is self-contained.
 *
 * Retheming stays easy: pass a partial theme, or one of the presets.
 */
import type { AspectName, Element } from '@astro/engine';

export type AspectClass = 'hard' | 'soft' | 'neutral' | 'minor';

export interface ChartTheme {
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly faint: string;
  readonly elements: Readonly<Record<Element, string>>;
  readonly aspects: Readonly<Record<AspectClass, string>>;
  /** Opacity of the element tint behind each zodiac sector. */
  readonly signTintOpacity: number;
}

export const LIGHT_THEME: ChartTheme = {
  surface: '#ffffff',
  ink: '#1f2937',
  muted: '#8b93a1',
  faint: '#d8dce3',
  elements: {
    fire: '#d1442f',
    earth: '#1f7a4d',
    air: '#b07d18',
    water: '#1d6fa5',
  },
  aspects: {
    hard: '#c2410c',
    soft: '#1d4ed8',
    neutral: '#6b7280',
    minor: '#a8adb8',
  },
  signTintOpacity: 0.13,
};

export const DARK_THEME: ChartTheme = {
  surface: '#111827',
  ink: '#e5e7eb',
  muted: '#8f97a6',
  faint: '#374151',
  elements: {
    fire: '#f0785f',
    earth: '#4cb583',
    air: '#e0b44a',
    water: '#5aa9dd',
  },
  aspects: {
    hard: '#f08a5d',
    soft: '#7aa5f0',
    neutral: '#9ca3af',
    minor: '#6b7280',
  },
  signTintOpacity: 0.18,
};

/** Pure black on white, for laser printing and fax-grade reproduction. */
export const PRINT_THEME: ChartTheme = {
  surface: '#ffffff',
  ink: '#000000',
  muted: '#555555',
  faint: '#bbbbbb',
  elements: { fire: '#000000', earth: '#000000', air: '#000000', water: '#000000' },
  aspects: { hard: '#000000', soft: '#666666', neutral: '#333333', minor: '#999999' },
  signTintOpacity: 0.06,
};

export function resolveTheme(theme?: Partial<ChartTheme>): ChartTheme {
  if (!theme) return LIGHT_THEME;
  return {
    ...LIGHT_THEME,
    ...theme,
    elements: { ...LIGHT_THEME.elements, ...theme.elements },
    aspects: { ...LIGHT_THEME.aspects, ...theme.aspects },
  };
}

/**
 * How aspects are coloured: by the traditional hard/soft division, which is
 * the distinction a reader scans the wheel for.
 */
export const ASPECT_CLASSES: Readonly<Record<AspectName, AspectClass>> = {
  conjunction: 'neutral',
  opposition: 'hard',
  square: 'hard',
  trine: 'soft',
  sextile: 'soft',
  quincunx: 'minor',
  semisextile: 'minor',
  semisquare: 'minor',
  sesquiquadrate: 'minor',
  quintile: 'minor',
  biquintile: 'minor',
};
