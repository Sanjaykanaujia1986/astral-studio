/**
 * Stations.
 *
 * A station is the instant a body's longitude speed passes through zero. The
 * engine already reports `stationary` as a FLAG on a position — "this speed is
 * too small to trust the sign of" — which answers a different question: that
 * flag says a position is ambiguous, this module says when the turn happened.
 *
 * Solved rather than detected, for the same reason as ingresses: speed near a
 * station changes slowly, so a grid scan places the turn anywhere within a
 * sample and a half, which for Mars is most of a day.
 */
import { brentRoot } from '../math/roots.js';
import { julianDayToIsoUtc } from '../time/julian.js';
import { isGenuineRoot } from '../aspects/crossing.js';
import { DEFAULT_STEP_DAYS } from '../transits/types.js';
import { SIGNS } from '../zodiac/signs.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import type { Body, ZodiacMode } from '../ephemeris/types.js';
import type { EventSearchOptions, StationEvent } from './types.js';
import { signIndexOf } from './ingress.js';

/** Bodies that never station, so asking is a caller's mistake worth naming. */
const ALWAYS_DIRECT: ReadonlySet<Body> = new Set(['sun', 'moon']);
/** Mean points move uniformly: the mean node is always retrograde, never turns. */
const UNIFORM: ReadonlySet<Body> = new Set(['meanNode', 'meanSouthNode']);

export class NoStationsError extends RangeError {
  readonly code = 'bodyNeverStations';
  constructor(body: Body) {
    super(
      `${body} never stations: its longitude speed does not change sign. `
      + 'Searching for one would always return nothing, which reads as "none in this window".',
    );
    this.name = 'NoStationsError';
  }
}

export interface StationOptions extends EventSearchOptions {
  readonly zodiac?: ZodiacMode;
  /**
   * Throw for a body that cannot station instead of returning an empty list.
   * Defaults to true: silence is the wrong answer to "when does the Sun turn
   * retrograde", because it is indistinguishable from "not in this window".
   */
  readonly strict?: boolean;
}

export function findStations(
  provider: EphemerisProvider,
  options: StationOptions,
): StationEvent[] {
  const { fromJd, toJd, bodies } = options;
  if (!(toJd > fromJd)) {
    throw new RangeError(`Station search requires toJd > fromJd (got ${fromJd}, ${toJd})`);
  }

  const strict = options.strict ?? true;
  const zodiacOption = options.zodiac ? { zodiac: options.zodiac } : {};
  const events: StationEvent[] = [];

  for (const body of bodies) {
    if (ALWAYS_DIRECT.has(body) || UNIFORM.has(body)) {
      if (strict) throw new NoStationsError(body);
      continue;
    }

    const speedAt = (jd: number) => provider.calc(jd, body, zodiacOption).longitudeSpeed;
    const step = options.stepDays ?? DEFAULT_STEP_DAYS[body];

    let previousJd = fromJd;
    let previousSpeed = speedAt(fromJd);

    for (let jd = fromJd + step; ; jd += step) {
      const clamped = Math.min(jd, toJd);
      const speed = speedAt(clamped);

      if (previousSpeed * speed < 0) {
        const root = brentRoot(speedAt, previousJd, clamped, { tolerance: 1e-9 });
        // Speed is already the quantity being zeroed, so a genuine root means
        // the speed really is ~0 there rather than the solver landing on a
        // discontinuity — which speed, unlike longitude, does not have.
        if (isGenuineRoot(speedAt, root)) {
          const position = provider.calc(root, body, zodiacOption);
          const signIndex = signIndexOf(position.longitude);
          events.push({
            kind: 'station',
            jd: root,
            utcIso: julianDayToIsoUtc(root),
            body,
            // Going from positive to negative speed is turning retrograde.
            direction: previousSpeed > 0 ? 'retrograde' : 'direct',
            longitude: position.longitude,
            sign: SIGNS[signIndex]!,
            signIndex,
          });
        }
      }

      previousJd = clamped;
      previousSpeed = speed;
      if (clamped === toJd) break;
    }
  }

  return events.sort((a, b) => a.jd - b.jd);
}
