/**
 * Declination events.
 *
 * Declination is how far north or south of the celestial equator a body sits.
 * It is a different measurement from ecliptic longitude, and the relationships
 * it produces are not aspects: two bodies at the same declination are
 * **parallel** whether or not they are anywhere near each other in longitude.
 *
 * Four kinds are searched here:
 *
 * - **parallel** — equal declinations, same side of the equator
 * - **contra-parallel** — equal and opposite
 * - **equator crossing** — declination through zero
 * - **maximum / minimum** — the turning points, where declination stops
 *   increasing or decreasing. These are solved on the RATE of change, so they
 *   are found properly rather than picked as the largest grid sample.
 *
 * Every position here is requested with `includeEquatorial`, which costs a
 * second ephemeris call per sample. That is the price of the measurement and
 * is not optional: declination cannot be derived from longitude alone.
 */
import { brentRoot } from '../math/roots.js';
import { julianDayToIsoUtc } from '../time/julian.js';
import { isGenuineRoot } from '../aspects/crossing.js';
import { DEFAULT_STEP_DAYS } from '../transits/types.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import type { Body } from '../ephemeris/types.js';
import type { Degrees } from '../math/angles.js';
import type { DeclinationEvent, EventSearchOptions } from './types.js';

export class NoDeclinationError extends Error {
  readonly code = 'declinationUnavailable';
  constructor(body: Body) {
    super(
      `The provider returned no equatorial coordinates for ${body}, so its `
      + 'declination is unknown. Reporting 0 would place it exactly on the equator.',
    );
    this.name = 'NoDeclinationError';
  }
}

function declinationAt(
  provider: EphemerisProvider,
  jd: number,
  body: Body,
): Degrees {
  const position = provider.calc(jd, body, { includeEquatorial: true });
  if (!position.equatorial) throw new NoDeclinationError(body);
  return position.equatorial.declination;
}

export interface DeclinationOptions extends EventSearchOptions {
  /**
   * Pairs to test for parallels and contra-parallels. Left empty, only the
   * single-body events (equator crossings and extrema) are searched.
   */
  readonly pairs?: readonly (readonly [Body, Body])[];
  /** Which kinds to search. Defaults to all of them. */
  readonly include?: readonly DeclinationEvent['type'][];
}

const ALL_TYPES: readonly DeclinationEvent['type'][] = [
  'parallel', 'contraParallel', 'equatorCrossing', 'maximum', 'minimum',
];

/** Central difference, in degrees per day. */
function rateOfChange(
  provider: EphemerisProvider,
  jd: number,
  body: Body,
  h: number,
): number {
  return (declinationAt(provider, jd + h, body) - declinationAt(provider, jd - h, body)) / (2 * h);
}

export function findDeclinationEvents(
  provider: EphemerisProvider,
  options: DeclinationOptions,
): DeclinationEvent[] {
  const { fromJd, toJd, bodies } = options;
  if (!(toJd > fromJd)) {
    throw new RangeError(`Declination search requires toJd > fromJd (got ${fromJd}, ${toJd})`);
  }

  const wanted = new Set(options.include ?? ALL_TYPES);
  const events: DeclinationEvent[] = [];

  const scan = (
    step: number,
    f: (jd: number) => number,
    onRoot: (jd: number) => void,
  ) => {
    let previousJd = fromJd;
    let previous = f(fromJd);
    for (let jd = fromJd + step; ; jd += step) {
      const clamped = Math.min(jd, toJd);
      const value = f(clamped);
      if (previous * value < 0) {
        const root = brentRoot(f, previousJd, clamped, { tolerance: 1e-8 });
        if (isGenuineRoot(f, root)) onRoot(root);
      }
      previousJd = clamped;
      previous = value;
      if (clamped === toJd) break;
    }
  };

  for (const body of bodies) {
    const step = options.stepDays ?? DEFAULT_STEP_DAYS[body];

    if (wanted.has('equatorCrossing')) {
      scan(step, (jd) => declinationAt(provider, jd, body), (jd) => {
        events.push({
          kind: 'declination',
          type: 'equatorCrossing',
          jd,
          utcIso: julianDayToIsoUtc(jd),
          body,
          declination: declinationAt(provider, jd, body),
        });
      });
    }

    if (wanted.has('maximum') || wanted.has('minimum')) {
      // The derivative step is a fraction of the sampling step: too small and
      // the central difference is dominated by the ephemeris's own rounding,
      // too large and a sharp turn is smoothed into nothing.
      const h = Math.max(step / 20, 1e-3);
      scan(step, (jd) => rateOfChange(provider, jd, body, h), (jd) => {
        const declination = declinationAt(provider, jd, body);
        // Second derivative by sign of the rate either side: falling after a
        // zero means the turning point was a maximum.
        const after = rateOfChange(provider, jd + h, body, h);
        const type = after < 0 ? 'maximum' : 'minimum';
        if (!wanted.has(type)) return;
        events.push({
          kind: 'declination',
          type,
          jd,
          utcIso: julianDayToIsoUtc(jd),
          body,
          declination,
        });
      });
    }
  }

  for (const [a, b] of options.pairs ?? []) {
    const step = Math.min(DEFAULT_STEP_DAYS[a], DEFAULT_STEP_DAYS[b]);

    if (wanted.has('parallel')) {
      scan(
        options.stepDays ?? step,
        (jd) => declinationAt(provider, jd, a) - declinationAt(provider, jd, b),
        (jd) => {
          events.push({
            kind: 'declination',
            type: 'parallel',
            jd,
            utcIso: julianDayToIsoUtc(jd),
            body: a,
            otherBody: b,
            declination: declinationAt(provider, jd, a),
          });
        },
      );
    }

    if (wanted.has('contraParallel')) {
      scan(
        options.stepDays ?? step,
        (jd) => declinationAt(provider, jd, a) + declinationAt(provider, jd, b),
        (jd) => {
          events.push({
            kind: 'declination',
            type: 'contraParallel',
            jd,
            utcIso: julianDayToIsoUtc(jd),
            body: a,
            otherBody: b,
            declination: declinationAt(provider, jd, a),
          });
        },
      );
    }
  }

  return events.sort((x, y) => x.jd - y.jd);
}
