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

export interface DisplaySettings {
  readonly precision: DegreePrecision;
  readonly glyphStyle: GlyphStyle;
  readonly theme: ChartThemeName;
  readonly orbProfile: OrbProfileId;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  precision: 'minute',
  glyphStyle: 'symbol',
  theme: 'auto',
  orbProfile: 'standard',
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
