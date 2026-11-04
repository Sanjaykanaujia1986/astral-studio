/**
 * Whole-chart pattern analysis: hemisphere emphasis, quadrant emphasis and
 * the classical planetary shape.
 *
 * This is calculation, not interpretation. Everything here is a deterministic
 * function of longitudes and cusps, and it reports only WHERE the bodies are —
 * never what that is supposed to mean. The interpretation layer consumes these
 * results; it does not produce them.
 *
 * A caution about the shapes. Unlike a house cusp or an aspect orb, the Jones
 * patterns are a CONVENTION, not a measurement, and published thresholds
 * disagree at the margins. What follows is one explicit ruleset with its
 * numbers stated in the open rather than buried in a chain of conditionals, so
 * a reader can see which convention they are being shown and every boundary
 * can be tested. It is not offered as the only defensible one.
 */
import { norm360, type Degrees } from '../math/angles.js';
import type { Body, HouseCusps } from '../ephemeris/types.js';
import { houseOf, type PlacedBody } from './instant.js';

/**
 * The ten bodies a shape is judged on.
 *
 * Nodes are excluded because they are not bodies but the intersection of two
 * planes, and being exactly opposite one another they would plant a spurious
 * pair at either end of every gap. Chiron and Lilith are excluded because the
 * patterns predate them, and including them silently reclassifies charts that
 * the textbooks agree on.
 */
export const SHAPE_BODIES: readonly Body[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
];

/** A gap wide enough to read as a division rather than as mere spacing. */
export const SHAPE_GAP_THRESHOLD: Degrees = 60;
/** Bundle: everything inside a trine. */
export const BUNDLE_ARC: Degrees = 120;
/** Bowl: everything inside a hemisphere. */
export const BOWL_ARC: Degrees = 180;
/** Locomotive: everything inside two thirds of the circle. */
export const LOCOMOTIVE_ARC: Degrees = 240;

export type ChartShapeName =
  | 'bundle' | 'bowl' | 'bucket' | 'locomotive' | 'seesaw' | 'splash' | 'splay';

export interface ChartShape {
  readonly name: ChartShapeName;
  /** Smallest arc containing every body, in degrees. */
  readonly occupiedArc: Degrees;
  /** Widest empty arc, in degrees. */
  readonly largestGap: Degrees;
  /** Longitude at which the widest empty arc begins, in zodiacal order. */
  readonly gapStart: Degrees;
  /**
   * The body immediately after the widest gap in zodiacal order — the
   * "leading" planet of a bowl or a locomotive.
   */
  readonly leadingBody: Body;
  /** The isolated body of a bucket. Present for that shape only. */
  readonly handle?: Body;
  /** The bodies actually used, after filtering to SHAPE_BODIES. */
  readonly bodies: readonly Body[];
}

export interface HemisphereEmphasis {
  /**
   * Named by observation rather than by compass. The literature uses
   * "northern hemisphere" for both halves depending on the author, so the
   * ambiguous words are avoided here entirely.
   */
  readonly aboveHorizon: number;
  readonly belowHorizon: number;
  readonly eastern: number;
  readonly western: number;
  readonly total: number;
}

export interface QuadrantEmphasis {
  /** Houses 1-3, 4-6, 7-9, 10-12, in that order. */
  readonly counts: readonly [number, number, number, number];
  readonly total: number;
}

interface Placement {
  readonly body: Body;
  readonly longitude: Degrees;
}

function shapePlacements(bodies: readonly PlacedBody[]): Placement[] {
  const wanted = new Set<Body>(SHAPE_BODIES);
  return bodies
    .filter((placed) => wanted.has(placed.position.body))
    .map((placed) => ({
      body: placed.position.body,
      longitude: norm360(placed.position.longitude),
    }))
    .sort((a, b) => a.longitude - b.longitude);
}

/**
 * Classify how the ten bodies are spread around the circle.
 *
 * Returns undefined rather than guessing when fewer than three are present: a
 * shape drawn from two points is not a shape, and the caller has to be able to
 * tell that apart from a genuine classification.
 */
export function chartShape(bodies: readonly PlacedBody[]): ChartShape | undefined {
  const placements = shapePlacements(bodies);
  if (placements.length < 3) return undefined;

  // Gap i is the empty arc running forward from placement i to placement i+1,
  // wrapping at the end. By construction they sum to 360.
  const gaps = placements.map((placement, i) => {
    const next = placements[(i + 1) % placements.length]!;
    return norm360(next.longitude - placement.longitude);
  });

  let widest = 0;
  for (let i = 1; i < gaps.length; i++) {
    if (gaps[i]! > gaps[widest]!) widest = i;
  }

  const largestGap = gaps[widest]!;
  const occupiedArc = 360 - largestGap;
  const base = {
    occupiedArc,
    largestGap,
    gapStart: placements[widest]!.longitude,
    leadingBody: placements[(widest + 1) % placements.length]!.body,
    bodies: placements.map((p) => p.body),
  } as const;

  // Bundle is tested first: a tight group can also show a wide internal gap,
  // and the tightness is the more telling fact about it.
  if (occupiedArc <= BUNDLE_ARC) return { name: 'bundle', ...base };

  // Two significant gaps cut the circle into two groups. Which shape that is
  // depends only on whether one of the groups is a single body.
  const wideGaps: number[] = [];
  gaps.forEach((gap, i) => {
    if (gap >= SHAPE_GAP_THRESHOLD) wideGaps.push(i);
  });

  if (wideGaps.length === 2) {
    const [first, second] = wideGaps as [number, number];
    // The bodies after the first gap and up to the second form one group.
    const groupA = second - first;
    const groupB = placements.length - groupA;
    if (groupA === 1 || groupB === 1) {
      const handleIndex = groupA === 1 ? second : first;
      return { name: 'bucket', ...base, handle: placements[handleIndex]!.body };
    }
    return { name: 'seesaw', ...base };
  }

  if (occupiedArc <= BOWL_ARC) return { name: 'bowl', ...base };
  if (occupiedArc <= LOCOMOTIVE_ARC) return { name: 'locomotive', ...base };
  if (largestGap < SHAPE_GAP_THRESHOLD) return { name: 'splash', ...base };
  return { name: 'splay', ...base };
}

/**
 * How the bodies divide across the horizon and the meridian.
 *
 * Needs houses, so it returns undefined for a chart cast without a known birth
 * time rather than inventing an ascendant to measure from.
 */
export function hemispheres(
  bodies: readonly PlacedBody[],
  houses: HouseCusps | undefined,
): HemisphereEmphasis | undefined {
  if (!houses) return undefined;

  let aboveHorizon = 0;
  let belowHorizon = 0;
  let eastern = 0;
  let western = 0;

  for (const placed of bodies) {
    const house = placed.house ?? houseOf(placed.position.longitude, houses.cusps);
    // Houses 1-6 lie below the horizon, 7-12 above it.
    if (house <= 6) belowHorizon += 1;
    else aboveHorizon += 1;
    // Houses 10-12 and 1-3 lie on the ascendant side of the meridian.
    if (house <= 3 || house >= 10) eastern += 1;
    else western += 1;
  }

  return { aboveHorizon, belowHorizon, eastern, western, total: bodies.length };
}

/** Bodies per quadrant: houses 1-3, 4-6, 7-9, 10-12. */
export function quadrants(
  bodies: readonly PlacedBody[],
  houses: HouseCusps | undefined,
): QuadrantEmphasis | undefined {
  if (!houses) return undefined;

  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const placed of bodies) {
    const house = placed.house ?? houseOf(placed.position.longitude, houses.cusps);
    counts[Math.floor((house - 1) / 3) as 0 | 1 | 2 | 3] += 1;
  }
  return { counts, total: bodies.length };
}
