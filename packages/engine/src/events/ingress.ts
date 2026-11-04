/**
 * Sign ingresses.
 *
 * A body enters a sign when its longitude crosses a multiple of 30°. The
 * naive test — compare `floor(longitude / 30)` between two samples — misses
 * every crossing that happens and reverses between them, which is exactly
 * what a planet does around a station: Mars can enter a sign, turn
 * retrograde, leave it again and re-enter months later. All three are real
 * ingresses and the middle one is the easiest to lose.
 *
 * So this solves for the crossing instead of detecting it, using the same
 * root finder the aspect search uses, with the same wrap guard: the
 * difference between a longitude and a boundary is taken modulo 360 into
 * [-180, 180), so 359.9° → 0.1° reads as a small step rather than a jump of
 * nearly a full circle.
 */
import { norm360 } from '../math/angles.js';
import { brentRoot } from '../math/roots.js';
import { julianDayToIsoUtc } from '../time/julian.js';
import { isWrap, isGenuineRoot } from '../aspects/crossing.js';
import { DEFAULT_STEP_DAYS } from '../transits/types.js';
import { SIGNS } from '../zodiac/signs.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import type { Body, ZodiacMode } from '../ephemeris/types.js';
import type { EventSearchOptions, IngressEvent } from './types.js';

/** Signed distance from a longitude to a boundary, in [-180, 180). */
function offsetTo(longitude: number, boundary: number): number {
  return ((longitude - boundary + 540) % 360) - 180;
}

export interface IngressOptions extends EventSearchOptions {
  readonly zodiac?: ZodiacMode;
}

/**
 * Every sign ingress in a window, in time order.
 *
 * Ingresses are reported for the zodiac asked for: in a sidereal zodiac the
 * boundaries sit roughly 24° from their tropical positions, so the same
 * planet enters the same sign on a different date. The caller's choice is
 * carried through rather than defaulted silently.
 */
export function findIngresses(
  provider: EphemerisProvider,
  options: IngressOptions,
): IngressEvent[] {
  const { fromJd, toJd, bodies } = options;
  if (!(toJd > fromJd)) {
    throw new RangeError(`Ingress search requires toJd > fromJd (got ${fromJd}, ${toJd})`);
  }

  const zodiacOption = options.zodiac ? { zodiac: options.zodiac } : {};
  const events: IngressEvent[] = [];

  for (const body of bodies) {
    const step = options.stepDays ?? DEFAULT_STEP_DAYS[body];
    const longitudeAt = (jd: number) => provider.calc(jd, body, zodiacOption).longitude;

    // Sample once per body, not once per boundary: the ephemeris call is the
    // expensive part and twelve boundaries share the same track.
    const jds: number[] = [];
    const longitudes: number[] = [];
    for (let jd = fromJd; jd < toJd; jd += step) {
      jds.push(jd);
      longitudes.push(longitudeAt(jd));
    }
    jds.push(toJd);
    longitudes.push(longitudeAt(toJd));

    for (let boundaryIndex = 0; boundaryIndex < 12; boundaryIndex += 1) {
      const boundary = boundaryIndex * 30;
      const f = (jd: number) => offsetTo(longitudeAt(jd), boundary);
      const values = longitudes.map((lon) => offsetTo(lon, boundary));

      for (let i = 1; i < jds.length; i += 1) {
        const a = values[i - 1]!;
        const b = values[i]!;
        if (!(a * b < 0) || isWrap(a, b)) continue;

        const root = brentRoot(f, jds[i - 1]!, jds[i]!, { tolerance: 1e-8 });
        if (!isGenuineRoot(f, root)) continue;
        if (root < fromJd || root > toJd) continue;

        const position = provider.calc(root, body, zodiacOption);
        const entering = position.longitudeSpeed >= 0
          ? boundaryIndex
          : (boundaryIndex + 11) % 12;
        const leaving = position.longitudeSpeed >= 0
          ? (boundaryIndex + 11) % 12
          : boundaryIndex;

        events.push({
          kind: 'ingress',
          jd: root,
          utcIso: julianDayToIsoUtc(root),
          body,
          sign: SIGNS[entering]!,
          signIndex: entering,
          fromSign: SIGNS[leaving]!,
          fromSignIndex: leaving,
          retrograde: position.longitudeSpeed < 0,
          speed: position.longitudeSpeed,
        });
      }
    }
  }

  // Two boundaries can resolve to the same instant only through a numerical
  // accident; one ingress is one event.
  const unique = events.filter(
    (event, index) => events.findIndex(
      (other) => other.body === event.body && Math.abs(other.jd - event.jd) < 1e-5,
    ) === index,
  );

  return unique.sort((a, b) => a.jd - b.jd);
}

/** The sign a longitude falls in. Exported because callers keep rewriting it. */
export function signIndexOf(longitude: number): number {
  return Math.floor(norm360(longitude) / 30);
}

export type { Body };
