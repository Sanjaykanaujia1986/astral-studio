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

/**
 * Planet colour keys: the ten bodies, `point` for the nodes, Chiron and
 * Lilith, and `earth` for the Earth symbol at the centre of the wheel.
 */
export type PlanetColourKey =
  | 'sun' | 'moon' | 'mercury' | 'venus' | 'mars'
  | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto' | 'point' | 'earth';

const PLANET_KEYS = new Set<string>(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'earth']);

/** The colour key for any body: itself for the ten planets and Earth, `point` otherwise. */
export function planetColourKey(body: string): PlanetColourKey {
  return (PLANET_KEYS.has(body) ? body : 'point') as PlanetColourKey;
}

export interface ChartTheme {
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly faint: string;
  readonly elements: Readonly<Record<Element, string>>;
  readonly aspects: Readonly<Record<AspectClass, string>>;
  /** Planet glyph colours, the same values as the `pl*` design tokens. */
  readonly planets: Readonly<Record<PlanetColourKey, string>>;
  /** Opacity of the element tint behind each zodiac sector. */
  readonly signTintOpacity: number;
}

export const LIGHT_THEME: ChartTheme = {
  surface: '#ffffff',
  ink: '#1f2937',
  // Darkened from #8b8299, which measured 3.65:1 on this theme's white
  // surface and 2.61:1 on `faint`, the lagna wash — the sign labels of a
  // Vedic chart are drawn in it, so they were the least readable thing on
  // the figure. Chosen by search for the first value clearing 4.5:1 on both.
  muted: '#635c6d',
  faint: '#ded6f0',
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
  planets: {
    sun: '#c2530f',
    moon: '#2463a8',
    mercury: '#9a2fb0',
    venus: '#7d7110',
    mars: '#c22a20',
    jupiter: '#c0453e',
    saturn: '#a35f00',
    uranus: '#0b7a93',
    neptune: '#5b3fd6',
    pluto: '#b02a55',
    point: '#595073',
    earth: '#2e8540',
  },
  signTintOpacity: 0.13,
};

/*
 * Violet-grounded, to match the app's own dark palette.
 *
 * The earlier values were a blue-grey that predated the cosmic direction, so
 * the wheel painted a slate panel onto a violet page and read as a pasted
 * screenshot rather than part of the product. The element and aspect hues are
 * unchanged — they carry meaning, and re-tinting them towards the brand would
 * make fire and air harder to tell apart to serve a background.
 */
export const DARK_THEME: ChartTheme = {
  surface: '#140c2b',
  ink: '#efeafb',
  muted: '#9f93c4',
  faint: '#36275c',
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
  planets: {
    sun: '#f7853a',
    moon: '#5ea8f0',
    mercury: '#d062e6',
    venus: '#d9c94a',
    mars: '#ef5a4c',
    jupiter: '#f2817a',
    saturn: '#eba13c',
    uranus: '#36c3df',
    neptune: '#957cff',
    pluto: '#e2557f',
    point: '#b6abd6',
    earth: '#5cc46a',
  },
  signTintOpacity: 0.18,
};

/** Pure black on white, for laser printing and fax-grade reproduction. */
export const PRINT_THEME: ChartTheme = {
  surface: '#ffffff',
  ink: '#000000',
  muted: '#555555',
  // Lightened from #bbbbbb, where `muted` came out at 3.88:1. Raising the
  // wash rather than darkening the ink keeps the lagna mark a mark and not
  // a block of grey.
  faint: '#d0d0d0',
  elements: { fire: '#000000', earth: '#000000', air: '#000000', water: '#000000' },
  aspects: { hard: '#000000', soft: '#666666', neutral: '#333333', minor: '#999999' },
  planets: {
    sun: '#000000', moon: '#000000', mercury: '#000000', venus: '#000000', mars: '#000000', jupiter: '#000000',
    saturn: '#000000', uranus: '#000000', neptune: '#000000', pluto: '#000000', point: '#000000', earth: '#000000',
  },
  signTintOpacity: 0.06,
};

export function resolveTheme(theme?: Partial<ChartTheme>): ChartTheme {
  if (!theme) return LIGHT_THEME;
  return {
    ...LIGHT_THEME,
    ...theme,
    elements: { ...LIGHT_THEME.elements, ...theme.elements },
    aspects: { ...LIGHT_THEME.aspects, ...theme.aspects },
    planets: { ...LIGHT_THEME.planets, ...theme.planets },
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
