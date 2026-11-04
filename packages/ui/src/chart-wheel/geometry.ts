/**
 * Chart-wheel geometry.
 *
 * Pure maths, no React and no SVG strings, so the layout can be tested
 * numerically. Rendering consumes what this produces.
 *
 * ## Orientation
 *
 * Western charts put the Ascendant on the LEFT and run longitude
 * counter-clockwise, which places the IC at the bottom, the Descendant on the
 * right and the MC at the top.
 *
 * SVG's y-axis points down, so a screen angle `t` (measured counter-clockwise
 * from east, the usual mathematical convention) maps to
 *
 *     x = cx + r*cos(t)
 *     y = cy - r*sin(t)      <- note the minus: it flips SVG's downward y
 *
 * and the mapping from ecliptic longitude is
 *
 *     t(lambda) = 180 + (lambda - ascendant)
 *
 * so that lambda = ascendant lands at t = 180 (due left).
 */
import { norm360, type Degrees } from '@astro/engine';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Ring radii, as fractions of the wheel's outer radius.
 *
 * Kept as ratios so the wheel is resolution-independent: the same layout
 * serves a 320px phone and an A3 print.
 */
export interface RingRatios {
  readonly zodiacOuter: number;
  readonly zodiacInner: number;
  /** Where planet glyphs sit. */
  readonly planets: number;
  /** Degree/retrograde text, on its own ring below the glyphs. */
  readonly degrees: number;
  readonly houseNumbers: number;
  /** Inner circle that aspect lines are drawn against. */
  readonly aspects: number;
}

/**
 * Tuned by rendering rather than by arithmetic: the aspect circle is large
 * enough that the aspect pattern reads as the centre of the chart, and the
 * planet band is tight to the zodiac so no dead white ring opens up between
 * them.
 */
export const DEFAULT_RINGS: RingRatios = {
  zodiacOuter: 1.0,
  zodiacInner: 0.855,
  planets: 0.775,
  degrees: 0.695,
  houseNumbers: 0.638,
  aspects: 0.59,
};

export interface WheelLayout {
  readonly size: number;
  readonly cx: number;
  readonly cy: number;
  readonly outerRadius: number;
  readonly rings: RingRatios;
  /** Ecliptic longitude placed at due left. */
  readonly ascendant: Degrees;
}

export function createLayout(
  size: number,
  ascendant: Degrees,
  options: { readonly padding?: number; readonly rings?: RingRatios } = {},
): WheelLayout {
  if (!Number.isFinite(size) || size <= 0) {
    throw new RangeError(`Wheel size must be a positive number, received ${size}`);
  }
  const padding = options.padding ?? size * 0.04;
  return {
    size,
    cx: size / 2,
    cy: size / 2,
    outerRadius: size / 2 - padding,
    rings: options.rings ?? DEFAULT_RINGS,
    ascendant: norm360(ascendant),
  };
}

/** Radius in pixels for a named ring. */
export function radiusOf(layout: WheelLayout, ring: keyof RingRatios): number {
  return layout.outerRadius * layout.rings[ring];
}

/**
 * Ecliptic longitude -> screen angle in degrees (counter-clockwise from east).
 *
 * This single function fixes the wheel's orientation. Everything else derives
 * from it, so there is exactly one place the convention can be wrong.
 */
export function longitudeToAngle(longitude: Degrees, ascendant: Degrees): Degrees {
  return norm360(180 + (longitude - ascendant));
}

/** Inverse of {@link longitudeToAngle}. */
export function angleToLongitude(angle: Degrees, ascendant: Degrees): Degrees {
  return norm360(angle - 180 + ascendant);
}

/** Polar -> cartesian, accounting for SVG's downward y-axis. */
export function pointAt(
  layout: WheelLayout,
  radius: number,
  angle: Degrees,
): Point {
  const radians = (angle * Math.PI) / 180;
  return {
    x: layout.cx + radius * Math.cos(radians),
    y: layout.cy - radius * Math.sin(radians),
  };
}

/** Convenience: the point for an ecliptic longitude at a given radius. */
export function pointForLongitude(
  layout: WheelLayout,
  radius: number,
  longitude: Degrees,
): Point {
  return pointAt(layout, radius, longitudeToAngle(longitude, layout.ascendant));
}

/**
 * Spread angles apart so no two are closer than `minSeparation`, preserving
 * their cyclic order and keeping each as near its true angle as possible.
 *
 * Stelliums are the reason this exists: five bodies inside two degrees would
 * otherwise render as an unreadable blot. Glyphs are drawn at the adjusted
 * angle with a leader line back to the true position, so the display stays
 * honest about where the body actually is.
 *
 * Solved exactly, not iteratively: the circle is cut at its widest gap and the
 * minimum-gap constraint is recast as isotonic regression, which
 * pool-adjacent-violators solves in linear time. That yields the arrangement
 * with the smallest total displacement, so no glyph moves further than it must.
 *
 * (An earlier version relaxed the constraints repeatedly instead. Spreading one
 * cluster pushed it into the next, which re-merged them, and the two states
 * alternated forever — it converged only asymptotically and never actually met
 * the minimum separation.)
 *
 * When the bodies cannot all fit (n * minSeparation >= 360) they are spread
 * evenly around the whole circle, which is the best available answer.
 */
export function resolveCollisions(
  angles: readonly Degrees[],
  minSeparation: Degrees,
): Degrees[] {
  const count = angles.length;
  if (count === 0) return [];
  if (count === 1) return [norm360(angles[0]!)];

  const order = angles
    .map((angle, index) => ({ angle: norm360(angle), index }))
    .sort((a, b) => a.angle - b.angle);

  // Impossible to satisfy: spread evenly around the whole circle, anchored on
  // the first body so the result still tracks the input.
  if (count * minSeparation >= 360) {
    const step = 360 / count;
    const anchor = order[0]!.angle;
    const out = new Array<number>(count);
    order.forEach((entry, position) => {
      out[entry.index] = norm360(anchor + position * step);
    });
    return out;
  }

  // Cut the circle at its widest gap, turning the cyclic problem into a linear
  // one. The widest gap is where there is most slack, so the solution is least
  // likely to need to push across the seam.
  let cutAt = 0;
  let widestGap = -1;
  for (let k = 0; k < count; k++) {
    const gap = norm360(order[(k + 1) % count]!.angle - order[k]!.angle);
    if (gap > widestGap) {
      widestGap = gap;
      cutAt = (k + 1) % count;
    }
  }

  // Unwrap into a strictly increasing sequence starting at the cut.
  const positions: number[] = [order[cutAt]!.angle];
  for (let k = 1; k < count; k++) {
    const previous = positions[k - 1]!;
    const next = order[(cutAt + k) % count]!.angle;
    positions.push(previous + norm360(next - previous));
  }

  // Substituting z_i = x_i - i*minSeparation turns the constraint
  // y_(i+1) - y_i >= minSeparation into "z must be non-decreasing", which is
  // isotonic regression — solved exactly by pool-adjacent-violators. The result
  // is the arrangement with the SMALLEST total squared displacement, so no glyph
  // moves further than it must.
  const shifted = positions.map((value, i) => value - i * minSeparation);
  const fitted = poolAdjacentViolators(shifted);
  const spread = fitted.map((value, i) => value + i * minSeparation);

  const out = new Array<number>(count);
  for (let k = 0; k < count; k++) {
    out[order[(cutAt + k) % count]!.index] = norm360(spread[k]!);
  }
  return out;
}

/**
 * Pool-adjacent-violators: the least-squares non-decreasing fit to `values`.
 *
 * Runs in linear time and terminates exactly — unlike relaxing the constraints
 * repeatedly, which can oscillate between two configurations and converge only
 * asymptotically.
 */
function poolAdjacentViolators(values: readonly number[]): number[] {
  const blocks: { sum: number; count: number }[] = [];

  for (const value of values) {
    blocks.push({ sum: value, count: 1 });
    // Merge back while the previous block's mean exceeds this one's.
    while (blocks.length >= 2) {
      const last = blocks[blocks.length - 1]!;
      const previous = blocks[blocks.length - 2]!;
      if (previous.sum / previous.count <= last.sum / last.count) break;
      blocks.pop();
      blocks.pop();
      blocks.push({ sum: previous.sum + last.sum, count: previous.count + last.count });
    }
  }

  const out: number[] = [];
  for (const block of blocks) {
    const mean = block.sum / block.count;
    for (let i = 0; i < block.count; i++) out.push(mean);
  }
  return out;
}

export interface TickSpec {
  readonly longitude: Degrees;
  /** Larger for sign boundaries and decans; smallest for single degrees. */
  readonly weight: 'major' | 'medium' | 'minor';
}

/**
 * Degree ticks around the zodiac ring.
 *
 * Sign boundaries every 30 degrees are 'major', every 10 degrees 'medium',
 * every degree 'minor'. Minor ticks are omitted at small sizes, where they
 * would merge into a grey band and cost legibility for no information.
 */
export function generateTicks(includeMinor: boolean): TickSpec[] {
  const ticks: TickSpec[] = [];
  for (let degree = 0; degree < 360; degree++) {
    if (degree % 30 === 0) ticks.push({ longitude: degree, weight: 'major' });
    else if (degree % 10 === 0) ticks.push({ longitude: degree, weight: 'medium' });
    else if (includeMinor) ticks.push({ longitude: degree, weight: 'minor' });
  }
  return ticks;
}

/**
 * Where a text label should sit relative to its anchor point, so that labels on
 * the left half of the wheel do not run inward across the chart.
 */
export function textAnchorFor(angle: Degrees): 'start' | 'middle' | 'end' {
  const a = norm360(angle);
  if (a > 95 && a < 265) return 'end';
  if (a < 85 || a > 275) return 'start';
  return 'middle';
}
