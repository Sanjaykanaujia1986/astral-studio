/**
 * The aspect engine.
 *
 * The delicate part is applying vs separating. It is NOT derivable from the
 * static longitude difference: two bodies at the same separation are applying
 * or separating depending entirely on their relative motion, which reverses
 * when either goes retrograde.
 *
 * ## How the direction is decided
 *
 * For an aspect of angle theta, define the signed error
 *
 *     e = norm180(signedDelta(lonA, lonB) -/+ theta)
 *
 * taking whichever of the two branches (+theta / -theta) is nearer zero, since
 * any non-symmetric aspect can form with either body leading. `e` is zero
 * exactly at the aspect and — critically — is SMOOTH through it: the 0/360
 * wrap and the 180 kink both sit half a circle away from where e is near zero,
 * so no discontinuity can occur near the event.
 *
 * Its rate of change is the relative speed, so the aspect is applying when e is
 * travelling toward zero:
 *
 *     applying  <=>  e * (speedA - speedB) < 0
 *
 * This handles retrograde motion (the rate flips sign), the 0/360 boundary and
 * the exact opposition uniformly, with no special cases.
 */
import { norm180, separation, signedDelta, type Degrees } from '../math/angles.js';
import type { Body, BodyPosition } from '../ephemeris/types.js';
import {
  ASPECT_DEFINITIONS,
  MAJOR_ASPECTS,
  maxOrbFor,
  STANDARD_ORBS,
  type AspectName,
  type OrbProfile,
} from './definitions.js';

/**
 * Direction of travel.
 *
 * 'stationary' is reported when the relative speed is too small for the sign to
 * be meaningful — guessing a direction there would be fabrication.
 */
export type AspectMotion = 'applying' | 'separating' | 'stationary';

export interface AspectHit {
  readonly bodyA: Body;
  readonly bodyB: Body;
  readonly aspect: AspectName;
  /** The aspect's exact angle, e.g. 90 for a square. */
  readonly exactAngle: Degrees;
  /** Actual angular separation of the two bodies, [0, 180]. */
  readonly separation: Degrees;
  /** Distance from exact, always >= 0. */
  readonly orb: Degrees;
  /** Widest orb the profile allows for this pair. */
  readonly maxOrb: Degrees;
  /** 1 at exact, falling linearly to 0 at the orb limit. */
  readonly strength: number;
  readonly motion: AspectMotion;
  /** True when the orb is below the exactness threshold. Independent of motion. */
  readonly exact: boolean;
  /** speedA - speedB, degrees/day. Signed; the basis of `motion`. */
  readonly relativeSpeed: number;
}

export interface AspectOptions {
  readonly orbProfile?: OrbProfile;
  readonly aspects?: readonly AspectName[];
  /** Orb below which `exact` is set. Default 1 arcminute. */
  readonly exactThreshold?: Degrees;
  /**
   * Relative speed below which motion is reported 'stationary' rather than
   * guessed. Default 1e-5 deg/day.
   */
  readonly stationaryThreshold?: number;
  /**
   * Body pairs to skip. Defaults to {@link DEFINITIONAL_PAIRS}.
   * Pass an empty array to report everything.
   */
  readonly excludePairs?: readonly (readonly [Body, Body])[];
}

/**
 * Pairs whose aspect is a definition rather than an observation.
 *
 * The south node IS the north node plus 180 degrees, so they are permanently
 * in exact opposition at identical speed. Reporting that as an aspect adds a
 * guaranteed row to every chart, always exact, always 'stationary' — noise that
 * crowds out real configurations.
 */
export const DEFINITIONAL_PAIRS: readonly (readonly [Body, Body])[] = [
  ['trueNode', 'southNode'],
  ['meanNode', 'meanSouthNode'],
  // Cross pairs: a chart showing one axis alongside the other node would
  // otherwise report a near-exact opposition that is also definitional, just
  // blurred by the true node's oscillation.
  ['meanNode', 'southNode'],
  ['trueNode', 'meanSouthNode'],
  ['trueNode', 'meanNode'],
  ['southNode', 'meanSouthNode'],
];

function isExcluded(
  a: Body,
  b: Body,
  pairs: readonly (readonly [Body, Body])[],
): boolean {
  return pairs.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x),
  );
}

const DEFAULT_EXACT_THRESHOLD = 1 / 60; // one arcminute
const DEFAULT_STATIONARY_THRESHOLD = 1e-5;

/**
 * Signed error from exact for one aspect, in degrees.
 *
 * Zero at the aspect, smooth through it, and signed so that its product with
 * the relative speed gives the direction of travel. Exported for the transit
 * and aspectarian engines, which root-find on exactly this function.
 */
export function aspectError(lonA: Degrees, lonB: Degrees, exactAngle: Degrees): Degrees {
  const delta = signedDelta(lonA, lonB);
  const forward = norm180(delta - exactAngle);
  const backward = norm180(delta + exactAngle);
  return Math.abs(forward) <= Math.abs(backward) ? forward : backward;
}

/**
 * Classify motion from positions and speeds.
 *
 * Deliberately takes raw numbers rather than BodyPosition so the transit engine
 * can call it with projected values.
 */
export function classifyMotion(
  lonA: Degrees,
  speedA: number,
  lonB: Degrees,
  speedB: number,
  exactAngle: Degrees,
  stationaryThreshold = DEFAULT_STATIONARY_THRESHOLD,
): AspectMotion {
  const relativeSpeed = speedA - speedB;
  if (Math.abs(relativeSpeed) < stationaryThreshold) return 'stationary';

  const error = aspectError(lonA, lonB, exactAngle);
  // Sitting exactly on the aspect: the next instant decides, and that is the
  // direction the relative motion is already carrying it.
  if (error === 0) return 'applying';

  return error * relativeSpeed < 0 ? 'applying' : 'separating';
}

/** Test one ordered pair against one aspect. Returns null when out of orb. */
export function testAspect(
  a: BodyPosition,
  b: BodyPosition,
  aspect: AspectName,
  options: AspectOptions = {},
): AspectHit | null {
  const definition = ASPECT_DEFINITIONS[aspect];
  const profile = options.orbProfile ?? STANDARD_ORBS;
  const maxOrb = maxOrbFor(profile, aspect, a.body, b.body);
  if (maxOrb <= 0) return null;

  const error = aspectError(a.longitude, b.longitude, definition.angle);
  const orb = Math.abs(error);
  if (orb > maxOrb) return null;

  const stationaryThreshold = options.stationaryThreshold ?? DEFAULT_STATIONARY_THRESHOLD;
  const exactThreshold = options.exactThreshold ?? DEFAULT_EXACT_THRESHOLD;

  return {
    bodyA: a.body,
    bodyB: b.body,
    aspect,
    exactAngle: definition.angle,
    separation: separation(a.longitude, b.longitude),
    orb,
    maxOrb,
    strength: Math.max(0, Math.min(1, 1 - orb / maxOrb)),
    motion: classifyMotion(
      a.longitude, a.longitudeSpeed,
      b.longitude, b.longitudeSpeed,
      definition.angle,
      stationaryThreshold,
    ),
    exact: orb < exactThreshold,
    relativeSpeed: a.longitudeSpeed - b.longitudeSpeed,
  };
}

/**
 * Every aspect among a set of bodies.
 *
 * Each unordered pair is tested once. Where a pair satisfies more than one
 * aspect — possible only with wide orbs and close angles — the tightest is
 * kept, since reporting both would double-count the same configuration.
 */
export function findAspects(
  positions: readonly BodyPosition[],
  options: AspectOptions = {},
): AspectHit[] {
  const aspects = options.aspects ?? MAJOR_ASPECTS;
  const excluded = options.excludePairs ?? DEFINITIONAL_PAIRS;
  const hits: AspectHit[] = [];

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i]!;
      const b = positions[j]!;
      if (isExcluded(a.body, b.body, excluded)) continue;

      let best: AspectHit | null = null;
      for (const aspect of aspects) {
        const hit = testAspect(a, b, aspect, options);
        if (hit && (!best || hit.orb < best.orb)) best = hit;
      }
      if (best) hits.push(best);
    }
  }

  // Tightest first — the ordering a reader wants.
  hits.sort((x, y) => x.orb - y.orb);
  return hits;
}

/**
 * Aspects between two separate charts (synastry), where every ordered
 * cross-pair matters and same-chart pairs are excluded.
 */
export function findCrossAspects(
  chartA: readonly BodyPosition[],
  chartB: readonly BodyPosition[],
  options: AspectOptions = {},
): AspectHit[] {
  const aspects = options.aspects ?? MAJOR_ASPECTS;
  const excluded = options.excludePairs ?? DEFINITIONAL_PAIRS;
  const hits: AspectHit[] = [];

  for (const a of chartA) {
    for (const b of chartB) {
      if (isExcluded(a.body, b.body, excluded)) continue;

      let best: AspectHit | null = null;
      for (const aspect of aspects) {
        const hit = testAspect(a, b, aspect, options);
        if (hit && (!best || hit.orb < best.orb)) best = hit;
      }
      if (best) hits.push(best);
    }
  }

  hits.sort((x, y) => x.orb - y.orb);
  return hits;
}
