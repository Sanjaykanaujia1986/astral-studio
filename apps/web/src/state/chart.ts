/**
 * The active chart, shared across workspaces.
 *
 * Chart Studio, Relationships, Event Explorer, Calendar and Reports all work on
 * the same chart; passing it down through a router would mean either prop
 * drilling through the shell or recasting per route. Recasting is cheap (1.6 ms)
 * but not free of consequence: the chart carries a settings snapshot, and two
 * routes recasting independently could silently diverge.
 *
 * So one store holds it, and the brief's reproducibility requirement is met by
 * keeping the INPUT alongside the result.
 *
 * ## It survives a reload
 *
 * What is persisted is the INPUT, not the chart. Two reasons, and the second
 * matters more: a `NatalChart` is a large object whose shape belongs to a
 * particular engine version, so a stored one would start lying the first time
 * the ephemeris or the house code changed — and it would lie with full
 * confidence, because a reader cannot tell a stale chart from a fresh one.
 * Recasting from the birth data costs 1.6 ms and can only produce a chart this
 * build actually stands behind.
 *
 * Errors are stored as engine CODES, never as prose — the same rule the engine
 * follows, so the catalogue keeps ownership of the wording and a code can be
 * translated into any of the three languages at render time.
 */
import { create } from 'zustand';
import {
  calculateNatalChart,
  ALL_ASPECTS,
  STANDARD_ORBS,
  TIGHT_ORBS,
  WIDE_ORBS,
  type BirthData,
  type ChartSettings,
  type EngineErrorCode,
  type NatalChart,
} from '@astro/engine';
import { getProvider } from '../lib/engine.js';

const STORAGE_KEY = 'astro.chart.input';

/** Everything needed to rebuild the active chart from scratch. */
interface StoredInput {
  readonly birth: BirthData;
  readonly settings: Partial<ChartSettings>;
  readonly orbProfile: OrbProfileId;
}

/**
 * The stored input, or null.
 *
 * Validated rather than trusted. A half-written or hand-edited entry that
 * reached `calculateNatalChart` would throw deep inside the engine, and the
 * reader would meet a chart error on a page they had not asked to calculate
 * anything on.
 */
function loadInput(): StoredInput | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { birth, settings, orbProfile } = parsed as Partial<StoredInput>;
    if (typeof birth !== 'object' || birth === null) return null;
    const { date, zone, place } = birth;
    const numeric = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);
    if (!date || !numeric(date.year) || !numeric(date.month) || !numeric(date.day)) return null;
    if (!zone || !place || !numeric(place.latitude) || !numeric(place.longitude)) return null;
    if (orbProfile !== 'standard' && orbProfile !== 'tight' && orbProfile !== 'wide') return null;
    return { birth, settings: settings ?? {}, orbProfile };
  } catch {
    return null;
  }
}

const ORB_PROFILES = { standard: STANDARD_ORBS, tight: TIGHT_ORBS, wide: WIDE_ORBS };
export type OrbProfileId = keyof typeof ORB_PROFILES;

interface ChartState {
  readonly chart: NatalChart | null;
  readonly busy: boolean;
  /**
   * True from the first paint until a stored chart has been recast.
   *
   * The dashboard needs it: without it the welcome hero flashes up for the
   * ~200 ms the ephemeris takes to load, telling someone who has had a chart
   * for a week to cast their first one.
   */
  readonly hydrating: boolean;
  /** Engine error code, or `unknown` for a fault the reader cannot act on. */
  readonly errorCode: EngineErrorCode | 'unknown' | null;
  cast: (
    birth: BirthData,
    settings: Partial<ChartSettings>,
    orbProfile: OrbProfileId,
  ) => Promise<void>;
  /** Recast the stored chart, if there is one. Safe to call more than once. */
  restore: () => Promise<void>;
  clear: () => void;
}

export const useChartStore = create<ChartState>((set) => ({
  chart: null,
  busy: false,
  // Resolved at module load, before the first paint, so the dashboard knows
  // on its very first render whether a chart is on its way.
  hydrating: loadInput() !== null,
  errorCode: null,

  async cast(birth, settings, orbProfile) {
    set({ busy: true, errorCode: null });
    try {
      const provider = await getProvider();
      set({
        chart: calculateNatalChart(provider, birth, {
          settings: {
            ...settings,
            aspects: ALL_ASPECTS,
            orbProfile: ORB_PROFILES[orbProfile],
          },
        }),
        errorCode: null,
      });
      try {
        globalThis.localStorage?.setItem(
          STORAGE_KEY, JSON.stringify({ birth, settings, orbProfile } satisfies StoredInput),
        );
      } catch {
        /* The chart still works; it just will not outlive the tab. */
      }
    } catch (cause) {
      // Keep the technical detail where a developer finds it; show the reader
      // a sentence they can act on, which only a coded error can supply.
      console.error('chart calculation failed', cause);
      const code = (cause as { code?: EngineErrorCode } | null)?.code;
      set({ chart: null, errorCode: code ?? 'unknown' });
    } finally {
      set({ busy: false });
    }
  },

  async restore() {
    const stored = loadInput();
    if (!stored) {
      set({ hydrating: false });
      return;
    }
    try {
      const provider = await getProvider();
      set({
        chart: calculateNatalChart(provider, stored.birth, {
          settings: {
            ...stored.settings,
            aspects: ALL_ASPECTS,
            orbProfile: ORB_PROFILES[stored.orbProfile],
          },
        }),
        errorCode: null,
      });
    } catch (cause) {
      /*
       * A restore that fails is silent on purpose. The reader did not ask for
       * this calculation, and an error banner about a chart they cast last
       * week — on a page they have only just opened — is noise they cannot
       * act on. The stored input is dropped so the next load starts clean.
       */
      console.error('stored chart could not be restored', cause);
      try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* nothing to do */ }
    } finally {
      set({ hydrating: false });
    }
  },

  clear() {
    set({ chart: null, errorCode: null, hydrating: false });
    try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* already gone */ }
  },
}));
