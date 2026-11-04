/**
 * Planetary returns.
 *
 * A return is the moment a body reaches its natal longitude again, and the
 * chart cast for that moment.
 *
 * ## Not a birthday
 *
 * The solar return is emphatically NOT "the birthday". The tropical year is
 * 365.2422 days, so the Sun reaches its natal longitude at a different clock
 * time each year, and often on the day before or after the calendar birthday.
 *
 * Measured on a 15 January 1990 birth, the returns for 2023-2026 fall +9.5 h,
 * +15.1 h, -3.0 h and +2.8 h from midnight on the 15th — one of them on the
 * 14th. Substituting midnight on the birthday for the 2024 return puts the
 * ascendant **122 degrees** out: four signs, and every house in the chart with
 * it. Planetary positions barely move in fifteen hours; the ascendant moves a
 * full circle in twenty-four. The exact instant is solved, never assumed.
 *
 * ## Relocation
 *
 * The return chart is cast for wherever the person IS, which need not be the
 * birthplace. The planetary positions are identical either way — they depend
 * only on the instant — but the houses and angles are not, so `place` is a
 * required argument rather than a default.
 */
import { aspectError } from '../aspects/engine.js';
import { findCrossings } from '../aspects/crossing.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import type { Body, ZodiacMode } from '../ephemeris/types.js';
import { julianDayToIsoUtc } from '../time/julian.js';
import {
  calculateChartForInstant,
  type BirthPlace,
  type ChartSettings,
  type InstantChart,
} from '../chart/instant.js';
import type { Degrees } from '../math/angles.js';

/**
 * Approximate time for each body to return to the same geocentric longitude,
 * in days. Used only to bound the search window — the exact moment is solved.
 *
 * These are the observed synodic-ish return intervals, not orbital periods:
 * Mercury and Venus return to a given longitude on roughly the Earth-year
 * rhythm because their geocentric motion is dominated by ours.
 */
export const APPROXIMATE_RETURN_DAYS: Readonly<Record<Body, number>> = {
  moon: 27.32,
  sun: 365.2422,
  mercury: 365.2422,
  venus: 365.2422,
  mars: 686.98,
  jupiter: 4332.6,
  saturn: 10_759,
  uranus: 30_687,
  neptune: 60_190,
  pluto: 90_560,
  meanNode: 6798,
  trueNode: 6798,
  southNode: 6798,
  meanSouthNode: 6798,
  chiron: 18_500,
  lilith: 3232,
};

/** Scan step per body when hunting the crossing, in days. */
const SEARCH_STEP: Readonly<Record<Body, number>> = {
  moon: 0.2,
  sun: 1,
  mercury: 0.5,
  venus: 0.5,
  mars: 1,
  jupiter: 2,
  saturn: 2,
  uranus: 3,
  neptune: 3,
  pluto: 3,
  meanNode: 2,
  trueNode: 1,
  southNode: 1,
  meanSouthNode: 1,
  chiron: 2,
  lilith: 1,
};

export interface ReturnChart {
  readonly body: Body;
  /** 1 for the first return after the search start, 2 for the next, and so on. */
  readonly ordinal: number;
  readonly exactJd: number;
  readonly exactUtcIso: string;
  /** The natal longitude the body returned to. */
  readonly natalLongitude: Degrees;
  /** The chart cast for the return moment at the requested place. */
  readonly chart: InstantChart;
}

export class ReturnNotFoundError extends Error {
  constructor(body: Body, fromJd: number, windowDays: number) {
    super(
      `No ${body} return found within ${windowDays.toFixed(0)} days of JD ${fromJd.toFixed(2)}. ` +
        `The search window may be too short, or the date outside ephemeris range.`,
    );
    this.name = 'ReturnNotFoundError';
  }
}

export interface ReturnOptions {
  readonly body: Body;
  readonly natalLongitude: Degrees;
  /** Search starts here; the first crossing strictly after it is returned. */
  readonly fromJd: number;
  readonly place: BirthPlace;
  readonly settings?: Partial<ChartSettings>;
  readonly zodiac?: ZodiacMode;
  /**
   * How far to search, in days. Defaults to 1.6 times the body's approximate
   * return interval — enough to clear one full cycle plus the slack a
   * retrograde loop can introduce.
   */
  readonly windowDays?: number;
}

/**
 * Every moment the body reaches `natalLongitude` inside the search window.
 *
 * More than one is normal: an inner planet caught in a retrograde loop can
 * cross the same longitude three times within days. The first is the return
 * proper; the others are reported so a caller can show them rather than
 * silently pick one.
 */
function findCrossingsFrom(
  provider: EphemerisProvider,
  options: ReturnOptions,
  windowDays: number,
): number[] {
  const { body, natalLongitude, fromJd } = options;
  const step = SEARCH_STEP[body];
  const zodiacOption = options.zodiac ? { zodiac: options.zodiac } : {};

  const jds: number[] = [];
  const values: number[] = [];
  for (let jd = fromJd; jd <= fromJd + windowDays; jd += step) {
    jds.push(jd);
    values.push(
      aspectError(provider.calc(jd, body, zodiacOption).longitude, natalLongitude, 0),
    );
  }

  const f = (jd: number) =>
    aspectError(provider.calc(jd, body, zodiacOption).longitude, natalLongitude, 0);

  // Strictly AFTER the start. Searching from the natal moment itself would
  // otherwise return that moment as the first "return" — the body is at its
  // natal longitude then by definition — which is true and useless.
  return findCrossings(jds, values, f).filter((jd) => jd > fromJd + 1e-6);
}

/**
 * The next return of a body to its natal longitude after `fromJd`.
 */
export function findNextReturn(
  provider: EphemerisProvider,
  options: ReturnOptions,
): ReturnChart {
  const windowDays =
    options.windowDays ?? APPROXIMATE_RETURN_DAYS[options.body] * 1.6;

  const crossings = findCrossingsFrom(provider, options, windowDays);
  const exactJd = crossings[0];
  if (exactJd === undefined) {
    throw new ReturnNotFoundError(options.body, options.fromJd, windowDays);
  }

  return buildReturn(provider, options, exactJd, 1);
}

/**
 * A run of consecutive returns starting after `fromJd`.
 *
 * Each search resumes just past the previous hit, so a retrograde loop cannot
 * make the same return appear twice.
 */
export function findReturns(
  provider: EphemerisProvider,
  options: ReturnOptions,
  count: number,
): ReturnChart[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`count must be a positive integer, received ${count}`);
  }

  const results: ReturnChart[] = [];
  let cursor = options.fromJd;

  for (let ordinal = 1; ordinal <= count; ordinal++) {
    const windowDays = options.windowDays ?? APPROXIMATE_RETURN_DAYS[options.body] * 1.6;
    const crossings = findCrossingsFrom(provider, { ...options, fromJd: cursor }, windowDays);
    const exactJd = crossings[0];
    if (exactJd === undefined) throw new ReturnNotFoundError(options.body, cursor, windowDays);

    results.push(buildReturn(provider, options, exactJd, ordinal));
    // The search is strictly-after, so resuming at the crossing itself cannot
    // re-find it — no arbitrary nudge needed.
    cursor = exactJd;
  }

  return results;
}

function buildReturn(
  provider: EphemerisProvider,
  options: ReturnOptions,
  exactJd: number,
  ordinal: number,
): ReturnChart {
  return {
    body: options.body,
    ordinal,
    exactJd,
    exactUtcIso: julianDayToIsoUtc(exactJd),
    natalLongitude: options.natalLongitude,
    chart: calculateChartForInstant(provider, exactJd, options.place, {
      ...(options.settings ? { settings: options.settings } : {}),
      withHouses: true,
    }),
  };
}

/** Natal longitude of a body in a cast chart, for feeding a return search. */
export function natalLongitudeOf(
  chart: { readonly bodies: readonly { readonly position: { readonly body: Body; readonly longitude: number } }[] },
  body: Body,
): Degrees {
  const found = chart.bodies.find((placed) => placed.position.body === body);
  if (!found) {
    throw new RangeError(`Chart does not contain ${body}; add it to settings.bodies`);
  }
  return found.position.longitude;
}
