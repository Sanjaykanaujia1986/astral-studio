/**
 * Display settings.
 *
 * These are presentation preferences only — how the chart is shown, not how it
 * is calculated. Calculation settings (house system, zodiac, ayanamsha) belong
 * to the individual chart and are snapshotted with it, so an old chart keeps
 * reproducing correctly after the defaults change.
 *
 * Persisted to localStorage behind a try/catch: a preference is not worth
 * crashing the app over in a privacy mode that blocks storage.
 */
import { create } from 'zustand';
import type { DegreePrecision } from '@astro/ui';

export type GlyphStyle = 'symbol' | 'abbreviation';
/**
 * `auto` follows the page. It is the default because the chart theme and the
 * page theme were independent, and a light wheel on a dark page reads as a
 * pasted screenshot rather than part of the product.
 */
export type ChartThemeName = 'auto' | 'light' | 'dark' | 'print';
export type OrbProfileId = 'standard' | 'tight' | 'wide';
/**
 * How large the wheel is drawn. Named rather than a pixel count, because the
 * figure is an SVG that scales freely — the number only decides how much room
 * the glyphs get before they start crowding.
 */
export type WheelSize = 'compact' | 'standard' | 'large';

/** Rendered edge length for each named size, in px. */
export const WHEEL_SIZES: Readonly<Record<WheelSize, number>> = {
  compact: 520,
  standard: 680,
  large: 900,
};

export interface DisplaySettings {
  readonly precision: DegreePrecision;
  readonly glyphStyle: GlyphStyle;
  readonly theme: ChartThemeName;
  readonly orbProfile: OrbProfileId;
  /*
   * How the wheel is DRAWN. None of these change a number: the aspects are
   * computed either way and the orb profile above is what decides which ones
   * exist. Hiding the lines hides lines.
   */
  readonly wheelAspects: boolean;
  readonly wheelTicks: boolean;
  readonly wheelSize: WheelSize;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  precision: 'minute',
  glyphStyle: 'symbol',
  theme: 'auto',
  orbProfile: 'standard',
  // Aspects on by default: a wheel without them is a position diagram, and
  // the relationships are most of what the figure is read for.
  wheelAspects: true,
  wheelTicks: true,
  wheelSize: 'standard',
};

const STORAGE_KEY = 'astro.display';

function load(): DisplaySettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
    // Merge over the defaults rather than trusting the stored shape: a value
    // saved by an older version may be missing keys or carry retired ones.
    return { ...DEFAULT_DISPLAY_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

function persist(settings: DisplaySettings): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* preference simply will not persist */
  }
}

interface SettingsStore extends DisplaySettings {
  set: <K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>((setState, getState) => ({
  ...load(),
  set(key, value) {
    setState({ [key]: value } as Partial<SettingsStore>);
    const { set: _s, reset: _r, ...rest } = getState();
    persist({ ...rest, [key]: value } as DisplaySettings);
  },
  reset() {
    setState({ ...DEFAULT_DISPLAY_SETTINGS });
    persist(DEFAULT_DISPLAY_SETTINGS);
  },
}));
