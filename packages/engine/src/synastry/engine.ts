/**
 * Synastry: comparing two charts.
 *
 * ## Why these aspects carry no applying/separating
 *
 * Both charts are fixed. "Applying" describes an orb that is closing, which
 * requires motion; two birth moments do not move relative to one another. The
 * natal speeds are still in the data, and multiplying them together would
 * produce a number — it would just not mean anything, because it would describe
 * two bodies converging in two different years.
 *
 * {@link SynastryAspect} therefore has no motion field at all. Omitting it says
 * plainly that the concept does not apply here, which a value like "stationary"
 * would obscure.
 *
 * ## House overlays
 *
 * Where each person's planets fall in the OTHER's houses. Both directions are
 * computed, because they are different statements and neither implies the
 * other.
 */
import { norm360, separation, type Degrees } from '../math/angles.js';
import { aspectError } from '../aspects/engine.js';
import {
  ASPECT_DEFINITIONS,
  MAJOR_ASPECTS,
  maxOrbFor,
  STANDARD_ORBS,
  type AspectName,
  type OrbProfile,
} from '../aspects/definitions.js';
import type { Body, HouseCusps } from '../ephemeris/types.js';
import { houseOf, type InstantChart } from '../chart/instant.js';

/** A point in a chart that can take part in a comparison. */
export interface ChartPointRef {
  readonly kind: 'body' | 'angle';
  /** A body name, or one of `asc` / `mc` / `dsc` / `ic`. */
  readonly id: string;
  readonly longitude: Degrees;
}

export interface SynastryAspect {
  /** The point in chart A. */
  readonly from: ChartPointRef;
  /** The point in chart B. */
  readonly to: ChartPointRef;
  readonly aspect: AspectName;
  readonly exactAngle: Degrees;
  readonly separation: Degrees;
  readonly orb: Degrees;
  readonly maxOrb: Degrees;
  /** 1 at exact, falling linearly to 0 at the orb limit. */
  readonly strength: number;
}

export interface HouseOverlay {
  readonly body: Body;
  readonly longitude: Degrees;
  /** 1-12, in the OTHER chart's houses. */
  readonly house: number;
}

export interface SynastryResult {
  readonly aspects: readonly SynastryAspect[];
  /** Chart A's planets placed in chart B's houses. Empty if B has no houses. */
  readonly overlayAinB: readonly HouseOverlay[];
  /** Chart B's planets placed in chart A's houses. Empty if A has no houses. */
  readonly overlayBinA: readonly HouseOverlay[];
}

export interface SynastryOptions {
  readonly orbProfile?: OrbProfile;
  readonly aspects?: readonly AspectName[];
  /** Include the angles (ASC/MC/DSC/IC) as comparison points. Default true. */
  readonly includeAngles?: boolean;
}

/** Comparison points for a chart: its bodies, plus its angles when known. */
export function chartPoints(chart: InstantChart, includeAngles: boolean): ChartPointRef[] {
  const points: ChartPointRef[] = chart.bodies.map((placed) => ({
    kind: 'body',
    id: placed.position.body,
    longitude: placed.position.longitude,
  }));

  if (includeAngles && chart.houses) {
    const h: HouseCusps = chart.houses;
    points.push(
      { kind: 'angle', id: 'asc', longitude: h.ascendant },
      { kind: 'angle', id: 'mc', longitude: h.midheaven },
      { kind: 'angle', id: 'dsc', longitude: h.descendant },
      { kind: 'angle', id: 'ic', longitude: h.imumCoeli },
    );
  }
  return points;
}

/**
 * Widest orb for a pair of points.
 *
 * Orb profiles are defined per body; an angle has no entry, so a pair involving
 * one falls back to the aspect's base orb. Angles are conventionally given tight
 * orbs, and inheriting a luminary's widened allowance would be wrong.
 */
function orbFor(
  profile: OrbProfile,
  aspect: AspectName,
  a: ChartPointRef,
  b: ChartPointRef,
): Degrees {
  const bodyA = a.kind === 'body' ? (a.id as Body) : undefined;
  const bodyB = b.kind === 'body' ? (b.id as Body) : undefined;
  if (bodyA && bodyB) return maxOrbFor(profile, aspect, bodyA, bodyB);
  // Base orb, unmultiplied.
  return profile.byAspect[aspect] ?? 0;
}

/**
 * Compare two charts.
 *
 * Every point in A is tested against every point in B. Same-chart pairs are
 * never compared: those are the individual charts' own aspects and belong to
 * them, not to the comparison.
 */
export function analyseSynastry(
  chartA: InstantChart,
  chartB: InstantChart,
  options: SynastryOptions = {},
): SynastryResult {
  const profile = options.orbProfile ?? STANDARD_ORBS;
  const aspects = options.aspects ?? MAJOR_ASPECTS;
  const includeAngles = options.includeAngles ?? true;

  const pointsA = chartPoints(chartA, includeAngles);
  const pointsB = chartPoints(chartB, includeAngles);

  const hits: SynastryAspect[] = [];

  for (const from of pointsA) {
    for (const to of pointsB) {
      let best: SynastryAspect | null = null;

      for (const aspect of aspects) {
        const definition = ASPECT_DEFINITIONS[aspect];
        const maxOrb = orbFor(profile, aspect, from, to);
        if (maxOrb <= 0) continue;

        const orb = Math.abs(aspectError(from.longitude, to.longitude, definition.angle));
        if (orb > maxOrb) continue;

        if (!best || orb < best.orb) {
          best = {
            from,
            to,
            aspect,
            exactAngle: definition.angle,
            separation: separation(from.longitude, to.longitude),
            orb,
            maxOrb,
            strength: Math.max(0, Math.min(1, 1 - orb / maxOrb)),
          };
        }
      }

      if (best) hits.push(best);
    }
  }

  hits.sort((x, y) => x.orb - y.orb);

  return {
    aspects: hits,
    overlayAinB: overlay(chartA, chartB),
    overlayBinA: overlay(chartB, chartA),
  };
}

/** Place one chart's bodies in the other's houses. */
function overlay(source: InstantChart, target: InstantChart): HouseOverlay[] {
  if (!target.houses) return [];
  return source.bodies.map((placed) => ({
    body: placed.position.body,
    longitude: placed.position.longitude,
    house: houseOf(placed.position.longitude, target.houses!.cusps),
  }));
}

/**
 * Midpoint of two longitudes on the SHORTER arc.
 *
 * Re-exported here because both synastry summaries and composite charts need
 * it and it is the single most load-bearing operation in either.
 */
export function midpointOf(a: Degrees, b: Degrees): Degrees {
  const delta = ((b - a + 540) % 360) - 180;
  return norm360(a + delta / 2);
}
