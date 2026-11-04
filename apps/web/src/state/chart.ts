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

const ORB_PROFILES = { standard: STANDARD_ORBS, tight: TIGHT_ORBS, wide: WIDE_ORBS };
export type OrbProfileId = keyof typeof ORB_PROFILES;

interface ChartState {
  readonly chart: NatalChart | null;
  readonly busy: boolean;
  /** Engine error code, or `unknown` for a fault the reader cannot act on. */
  readonly errorCode: EngineErrorCode | 'unknown' | null;
  cast: (
    birth: BirthData,
    settings: Partial<ChartSettings>,
    orbProfile: OrbProfileId,
  ) => Promise<void>;
  clear: () => void;
}

export const useChartStore = create<ChartState>((set) => ({
  chart: null,
  busy: false,
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

  clear() {
    set({ chart: null, errorCode: null });
  },
}));
