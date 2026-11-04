/**
 * Transit and aspectarian search.
 *
 * Exact times are SOLVED, not scanned: the search brackets a sign change in the
 * signed aspect error and converges with Brent's method. A calendar scan could
 * never resolve an event to better than its own step, and would misreport the
 * time by hours.
 *
 * ## Retrograde passes
 *
 * A slow planet typically crosses a natal point three times — direct, then
 * retrograde, then direct again — over months. Every crossing is found and
 * numbered, because reporting only the first would misdate the other two
 * badly, and the second and third are the ones people plan around.
 *
 * ## Cost
 *
 * Each body's longitude is sampled ONCE onto a shared grid and reused across
 * every target and aspect. A year of transits for 10 bodies against 12 targets
 * and 5 aspects is 600 combinations; evaluating the ephemeris per combination
 * would be ~220,000 calls, against ~3,600 with the grid. Only Brent refinement
 * touches the ephemeris again, and only near an actual root.
 */
import { aspectError } from '../aspects/engine.js';
import { findCrossings } from '../aspects/crossing.js';
import { ASPECT_DEFINITIONS, type AspectName } from '../aspects/definitions.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import type { Body, ZodiacMode } from '../ephemeris/types.js';
import { julianDayToIsoUtc } from '../time/julian.js';
import {
  DEFAULT_STEP_DAYS,
  type AspectEvent,
  type CrossingDirection,
  type TransitHit,
  type TransitSearchOptions,
  type TransitTarget,
} from './types.js';

/** Longitude and speed of one body across a uniform time grid. */
interface BodyTrack {
  readonly jds: readonly number[];
  readonly longitudes: readonly number[];
  readonly speeds: readonly number[];
}

function sampleTrack(
  provider: EphemerisProvider,
  body: Body,
  fromJd: number,
  toJd: number,
  stepDays: number,
  zodiac: ZodiacMode | undefined,
): BodyTrack {
  const jds: number[] = [];
  const longitudes: number[] = [];
  const speeds: number[] = [];

  for (let jd = fromJd; jd <= toJd + stepDays * 0.5; jd += stepDays) {
    const clamped = Math.min(jd, toJd);
    const position = provider.calc(clamped, body, zodiac ? { zodiac } : {});
    jds.push(clamped);
    longitudes.push(position.longitude);
    speeds.push(position.longitudeSpeed);
    if (clamped === toJd) break;
  }

  return { jds, longitudes, speeds };
}


export interface TransitOptions extends TransitSearchOptions {
  readonly zodiac?: ZodiacMode;
}

/**
 * Every exact transit hit in a date range.
 *
 * Results are ordered by time, which is how a reader consumes them.
 */
export function findTransitHits(
  provider: EphemerisProvider,
  options: TransitOptions,
): TransitHit[] {
  const { fromJd, toJd, transitBodies, targets, aspects } = options;
  if (!(toJd > fromJd)) {
    throw new RangeError(`Transit search requires toJd > fromJd (got ${fromJd}, ${toJd})`);
  }

  const detectTangencies = options.detectTangencies ?? true;
  const hits: TransitHit[] = [];

  for (const body of transitBodies) {
    const step = options.stepDays ?? DEFAULT_STEP_DAYS[body];
    const track = sampleTrack(provider, body, fromJd, toJd, step, options.zodiac);

    for (const target of targets) {
      for (const aspect of aspects) {
        const angle = ASPECT_DEFINITIONS[aspect].angle;

        const values = track.longitudes.map((lon) => aspectError(lon, target.longitude, angle));
        const f = (jd: number) =>
          aspectError(
            provider.calc(jd, body, options.zodiac ? { zodiac: options.zodiac } : {}).longitude,
            target.longitude,
            angle,
          );

        const roots = findCrossings(track.jds, values, f, { detectTangencies });

        roots.forEach((jd, index) => {
          const position = provider.calc(jd, body, options.zodiac ? { zodiac: options.zodiac } : {});
          const direction: CrossingDirection =
            position.longitudeSpeed < 0 ? 'retrograde' : 'direct';
          hits.push({
            transitBody: body,
            target,
            aspect,
            exactJd: jd,
            exactUtcIso: julianDayToIsoUtc(jd),
            direction,
            passIndex: index + 1,
            totalPasses: roots.length,
            speed: position.longitudeSpeed,
          });
        });
      }
    }
  }

  return hits.sort((a, b) => a.exactJd - b.exactJd);
}

export interface AspectarianOptions {
  readonly fromJd: number;
  readonly toJd: number;
  readonly bodies: readonly Body[];
  readonly aspects: readonly AspectName[];
  readonly stepDays?: number;
  readonly detectTangencies?: boolean;
  readonly zodiac?: ZodiacMode;
  /** Pairs to skip; defaults to the node axis, which is a definition. */
  readonly excludePairs?: readonly (readonly [Body, Body])[];
}

const DEFAULT_EXCLUDED_PAIRS: readonly (readonly [Body, Body])[] = [
  ['trueNode', 'southNode'],
  ['meanNode', 'southNode'],
];

/**
 * Exact aspects between transiting bodies over a date range — the aspectarian.
 *
 * Both sides move here, so the scan step is taken from the FASTER body of each
 * pair: the Moon squaring Pluto moves at the Moon's pace, and a step sized for
 * Pluto would step straight over it.
 */
export function buildAspectarian(
  provider: EphemerisProvider,
  options: AspectarianOptions,
): AspectEvent[] {
  const { fromJd, toJd, bodies, aspects } = options;
  if (!(toJd > fromJd)) {
    throw new RangeError(`Aspectarian requires toJd > fromJd (got ${fromJd}, ${toJd})`);
  }

  const excluded = options.excludePairs ?? DEFAULT_EXCLUDED_PAIRS;
  const isExcluded = (a: Body, b: Body) =>
    excluded.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

  const events: AspectEvent[] = [];
  const trackCache = new Map<string, BodyTrack>();

  const trackFor = (body: Body, step: number): BodyTrack => {
    const key = `${body}@${step}`;
    let track = trackCache.get(key);
    if (!track) {
      track = sampleTrack(provider, body, fromJd, toJd, step, options.zodiac);
      trackCache.set(key, track);
    }
    return track;
  };

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      if (isExcluded(a, b)) continue;

      // The faster body dictates the grid.
      const step = options.stepDays ?? Math.min(DEFAULT_STEP_DAYS[a], DEFAULT_STEP_DAYS[b]);
      const trackA = trackFor(a, step);
      const trackB = trackFor(b, step);

      for (const aspect of aspects) {
        const angle = ASPECT_DEFINITIONS[aspect].angle;
        const values = trackA.longitudes.map((lonA, index) =>
          aspectError(lonA, trackB.longitudes[index]!, angle),
        );
        const zodiacOption = options.zodiac ? { zodiac: options.zodiac } : {};
        const f = (jd: number) =>
          aspectError(
            provider.calc(jd, a, zodiacOption).longitude,
            provider.calc(jd, b, zodiacOption).longitude,
            angle,
          );

        const roots = findCrossings(trackA.jds, values, f, {
          detectTangencies: options.detectTangencies ?? true,
        });

        roots.forEach((jd, index) => {
          const posA = provider.calc(jd, a, zodiacOption);
          const posB = provider.calc(jd, b, zodiacOption);
          events.push({
            bodyA: a,
            bodyB: b,
            aspect,
            exactJd: jd,
            exactUtcIso: julianDayToIsoUtc(jd),
            relativeSpeed: posA.longitudeSpeed - posB.longitudeSpeed,
            retrogradeA: posA.retrograde,
            retrogradeB: posB.retrograde,
            passIndex: index + 1,
            totalPasses: roots.length,
          });
        });
      }
    }
  }

  return events.sort((x, y) => x.exactJd - y.exactJd);
}

/**
 * Build the target list for a natal chart: planets, angles and house cusps.
 *
 * Extracted so the transit engine never has to know what a NatalChart looks
 * like — it works on longitudes.
 */
export function targetsFromChart(chart: {
  readonly bodies: readonly { readonly position: { readonly body: Body; readonly longitude: number } }[];
  readonly houses?: {
    readonly ascendant: number;
    readonly midheaven: number;
    readonly descendant: number;
    readonly imumCoeli: number;
    readonly cusps: readonly number[];
  };
}): TransitTarget[] {
  const targets: TransitTarget[] = chart.bodies.map((placed) => ({
    kind: 'natalBody',
    id: placed.position.body,
    longitude: placed.position.longitude,
  }));

  if (chart.houses) {
    targets.push(
      { kind: 'angle', id: 'asc', longitude: chart.houses.ascendant },
      { kind: 'angle', id: 'mc', longitude: chart.houses.midheaven },
      { kind: 'angle', id: 'dsc', longitude: chart.houses.descendant },
      { kind: 'angle', id: 'ic', longitude: chart.houses.imumCoeli },
    );
  }

  return targets;
}
