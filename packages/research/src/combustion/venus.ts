/**
 * Venus combustion: Venus close to the Sun, measured as the shortest arc
 * between their geocentric ecliptic longitudes.
 *
 * ## Measurement, rule and outcome are three things
 *
 * - The **measurement** is astronomy: both longitudes and speeds at an
 *   instant, their separation, and whether it is shrinking (applying) or
 *   growing (separating). Taken from the Swiss Ephemeris in one frame, so the
 *   separation does not depend on the zodiac chosen; the longitudes shown do.
 * - The **rule** is a research preset: bands of separation, each with a
 *   label and a score. The scores are PROPOSED research weights, versioned
 *   and editable; they are not results and are not derived from prices.
 * - The **outcome** — what prices did — is measured separately by the event
 *   study, and never folded back into the score.
 *
 * ## Episodes
 *
 * One episode is one stretch of Venus inside the outermost band's orb around
 * a conjunction with the Sun, from entry to exit. Every event and every daily
 * observation inside it carries the same episode id. Venus meets the Sun
 * twice a synodic cycle (584 days): at superior conjunction moving direct,
 * and at inferior conjunction moving retrograde; which one is recorded.
 */
import {
  findAspectWindows, aspectStateAt, julianDayToIsoUtc,
  type AspectState, type EphemerisProvider, type ZodiacMode,
} from '@astro/engine';

export interface CombustionBand {
  /** Stable id, also the message-catalogue suffix. */
  readonly id: string;
  /** Upper bound of the band in degrees, inclusive; null for the open band above the last bound. */
  readonly upTo: number | null;
  /** Proposed research weight; not a result. */
  readonly score: number;
}

export interface CombustionPreset {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  /**
   * Ordered by bound. The first band is [0, upTo]; each later one is
   * (previous upTo, upTo]; the last is (previous upTo, ∞) and has upTo null.
   * Contiguous by construction, so validation only has to check the order.
   */
  readonly bands: readonly CombustionBand[];
}

/** The research preset proposed in the brief, version 1. */
export const VENUS_COMBUSTION_V1: CombustionPreset = {
  id: 'venus-combustion-research',
  version: '1.0.0',
  name: 'Venus combustion, research preset',
  bands: [
    { id: 'very-strong', upTo: 1, score: -90 },
    { id: 'strong', upTo: 3, score: -70 },
    { id: 'moderate', upTo: 5, score: -40 },
    { id: 'transition', upTo: 8, score: -20 },
    { id: 'outside', upTo: null, score: 0 },
  ],
};

export type PresetProblem =
  | { readonly code: 'NO_BANDS' }
  | { readonly code: 'LAST_BAND_NOT_OPEN' }
  | { readonly code: 'OPEN_BAND_NOT_LAST'; readonly index: number }
  | { readonly code: 'BOUND_NOT_INCREASING'; readonly index: number }
  | { readonly code: 'NEGATIVE_BOUND'; readonly index: number }
  | { readonly code: 'SCORE_NOT_FINITE'; readonly index: number }
  | { readonly code: 'DUPLICATE_ID'; readonly index: number }
  | { readonly code: 'NO_VERSION' };

/** Every problem with a preset; empty when it is usable. Gaps and overlaps show up as bounds out of order. */
export function validatePreset(preset: CombustionPreset): PresetProblem[] {
  const out: PresetProblem[] = [];
  if (!preset.version.trim()) out.push({ code: 'NO_VERSION' });
  const { bands } = preset;
  if (bands.length === 0) return [...out, { code: 'NO_BANDS' }];
  const ids = new Set<string>();
  let previous = -Infinity;
  bands.forEach((band, index) => {
    if (ids.has(band.id)) out.push({ code: 'DUPLICATE_ID', index });
    ids.add(band.id);
    if (!Number.isFinite(band.score)) out.push({ code: 'SCORE_NOT_FINITE', index });
    if (band.upTo === null) {
      if (index !== bands.length - 1) out.push({ code: 'OPEN_BAND_NOT_LAST', index });
      return;
    }
    if (band.upTo < 0) out.push({ code: 'NEGATIVE_BOUND', index });
    if (!(band.upTo > previous)) out.push({ code: 'BOUND_NOT_INCREASING', index });
    previous = band.upTo;
  });
  if (bands[bands.length - 1]!.upTo !== null) out.push({ code: 'LAST_BAND_NOT_OPEN' });
  return out;
}

/** The band a separation falls in. Bounds are inclusive from above: exactly 1° is very strong, 1.0000001° strong. */
export function bandFor(separation: number, preset: CombustionPreset): CombustionBand {
  for (const band of preset.bands) if (band.upTo === null || separation <= band.upTo) return band;
  return preset.bands[preset.bands.length - 1]!;
}

/** The orb of the outermost bounded band: where an episode begins and ends. */
export function windowOrb(preset: CombustionPreset): number {
  const bounded = preset.bands.filter((b) => b.upTo !== null);
  return bounded[bounded.length - 1]!.upTo!;
}

export type CombustionEventKind = 'entry' | 'band-entry' | 'exact' | 'band-exit' | 'exit';
export type ConjunctionKind = 'superior' | 'inferior';

export interface CombustionEvent {
  readonly kind: CombustionEventKind;
  readonly jd: number;
  readonly utcIso: string;
  readonly episodeId: string;
  /** For band crossings: the band entered (on the way in) or left (on the way out). */
  readonly band?: string;
  readonly state: AspectState;
}

export interface CombustionEpisode {
  readonly id: string;
  /** Null when the episode was already under way at the start of the range. */
  readonly entryJd: number | null;
  /** Null when it was still under way at the end. */
  readonly exitJd: number | null;
  /** Refined conjunction instant(s). */
  readonly exactJds: readonly number[];
  readonly conjunction: ConjunctionKind | null;
  readonly closestJd: number;
  readonly closestSeparation: number;
  readonly events: readonly CombustionEvent[];
}

export interface CombustionProfile {
  readonly zodiac: ZodiacMode;
  readonly preset: CombustionPreset;
}

const SUN = { role: 'transit', body: 'sun' } as const;
const VENUS = { role: 'transit', body: 'venus' } as const;

function episodeIdOf(anchorJd: number): string {
  return `venus-sun-${julianDayToIsoUtc(anchorJd).slice(0, 10)}`;
}

/**
 * Every combustion episode in a range, with its entry, band crossings, exact
 * conjunction(s) and exit, each refined by root-finding on the ephemeris.
 */
export function combustionEpisodes(
  provider: EphemerisProvider,
  fromJd: number,
  toJd: number,
  profile: CombustionProfile,
): CombustionEpisode[] {
  const orb = windowOrb(profile.preset);
  const { zodiac } = profile;
  const outer = findAspectWindows(provider, { fromJd, toJd, sideA: SUN, sideB: VENUS, aspects: ['conjunction'], orbs: orb, zodiac });
  const inner = profile.preset.bands.filter((b) => b.upTo !== null && b.upTo < orb);
  const stateAt = (jd: number): AspectState => aspectStateAt(provider, jd, SUN, VENUS, 'conjunction', orb, zodiac);

  return outer.map((w) => {
    const anchor = w.exacts[0]?.jd ?? w.closestJd;
    const id = episodeIdOf(anchor);
    const events: CombustionEvent[] = [];
    const push = (kind: CombustionEventKind, jd: number, band?: string): void => {
      events.push({ kind, jd, utcIso: julianDayToIsoUtc(jd), episodeId: id, ...(band ? { band } : {}), state: stateAt(jd) });
    };
    if (w.entryJd !== null) push('entry', w.entryJd, bandFor(orb, profile.preset).id);
    // Each inner bound crossed on the way in and out.
    const from = w.entryJd ?? fromJd; const to = w.exitJd ?? toJd;
    if (to > from) {
      for (const band of inner) {
        const crossings = findAspectWindows(provider, { fromJd: from, toJd: to, sideA: SUN, sideB: VENUS, aspects: ['conjunction'], orbs: band.upTo!, zodiac });
        for (const c of crossings) {
          if (c.entryJd !== null) push('band-entry', c.entryJd, band.id);
          if (c.exitJd !== null) push('band-exit', c.exitJd, band.id);
        }
      }
    }
    for (const e of w.exacts) push('exact', e.jd);
    if (w.exitJd !== null) push('exit', w.exitJd, bandFor(orb, profile.preset).id);
    events.sort((a, b) => a.jd - b.jd);
    const first = w.exacts[0];
    return {
      id,
      entryJd: w.entryJd,
      exitJd: w.exitJd,
      exactJds: w.exacts.map((e) => e.jd),
      conjunction: first ? (first.retrogradeB ? 'inferior' : 'superior') : null,
      closestJd: w.closestJd,
      closestSeparation: w.closestOrb,
      events,
    };
  });
}

/** One sampled observation of the Sun–Venus state, e.g. at a session's close. */
export interface CombustionSample {
  readonly jd: number;
  readonly utcIso: string;
  readonly state: AspectState;
  readonly band: CombustionBand;
  /** The episode this sample falls in, or null outside every episode. */
  readonly episodeId: string | null;
}

/** Sample the state at given instants (sorted), tagging each with its band and episode. */
export function sampleCombustion(
  provider: EphemerisProvider,
  jds: readonly number[],
  episodes: readonly CombustionEpisode[],
  profile: CombustionProfile,
): CombustionSample[] {
  const orb = windowOrb(profile.preset);
  return jds.map((jd) => {
    const state = aspectStateAt(provider, jd, SUN, VENUS, 'conjunction', orb, profile.zodiac);
    const episode = episodes.find((e) => (e.entryJd ?? -Infinity) <= jd && jd <= (e.exitJd ?? Infinity));
    return { jd, utcIso: julianDayToIsoUtc(jd), state, band: bandFor(state.separation, profile.preset), episodeId: episode?.id ?? null };
  });
}
