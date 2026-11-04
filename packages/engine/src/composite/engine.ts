/**
 * Composite and Davison relationship charts.
 *
 * These are two different things and are kept apart deliberately.
 *
 * ## Midpoint composite — a construct, not a sky
 *
 * Each position is the midpoint of the corresponding pair. The result is
 * DERIVED: no observer ever saw that sky. It is typed separately from a cast
 * chart for the same reason solar arc positions are — the longitudes are real
 * numbers, but they have no speed, no latitude and no retrograde state, and
 * treating them as observed positions invites code to ask for things that do
 * not exist.
 *
 * It also need not be internally consistent. Mercury is never more than about
 * 28 degrees from the Sun in the real sky; a composite Mercury can be further,
 * because it is an average of two Mercurys in different places. That is a
 * property of the technique, not a defect, and {@link CompositeChart} reports it
 * rather than hiding it.
 *
 * ## Davison — a real chart
 *
 * Cast for the midpoint in time AND space: a genuine moment at a genuine place,
 * so it comes back as an ordinary {@link InstantChart} with speeds, latitudes
 * and retrogrades that mean what they usually mean.
 */
import { norm360, separation, type Degrees } from '../math/angles.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import type { Body } from '../ephemeris/types.js';
import { julianDayToIsoUtc } from '../time/julian.js';
import {
  calculateChartForInstant,
  houseOf,
  type BirthPlace,
  type ChartSettings,
  type InstantChart,
} from '../chart/instant.js';
import { midpointOf } from '../synastry/engine.js';

export interface CompositePosition {
  readonly body: Body;
  readonly longitude: Degrees;
  readonly longitudeA: Degrees;
  readonly longitudeB: Degrees;
  /** 1-12, when composite cusps could be derived. */
  readonly house?: number;
}

export interface CompositeAngles {
  readonly ascendant: Degrees;
  readonly midheaven: Degrees;
  readonly descendant: Degrees;
  readonly imumCoeli: Degrees;
}

export interface CompositeChart {
  readonly method: 'midpointComposite';
  readonly positions: readonly CompositePosition[];
  readonly angles?: CompositeAngles;
  /** Midpointed cusps, present only when they came out in a usable order. */
  readonly cusps?: readonly Degrees[];
  /**
   * True when the midpointed cusps did not increase monotonically around the
   * circle, so house placement was suppressed.
   *
   * Midpointing twelve cusps pairwise is not guaranteed to produce a valid
   * house division: when the two charts' ascendants are far apart the results
   * can arrive out of order or overlap. Reporting that is better than
   * assigning planets to houses derived from a broken wheel.
   */
  readonly cuspsDegenerate: boolean;
  /**
   * Bodies whose composite longitude is further from the composite Sun than
   * they could ever be in the real sky. Informational: it is inherent to the
   * technique, and a reader should know when it has happened.
   */
  readonly impossibleElongations: readonly Body[];
}

/** Maximum elongation from the Sun, degrees, for the bodies that have one. */
const MAX_ELONGATION: Partial<Record<Body, number>> = {
  mercury: 28,
  venus: 48,
};

export interface CompositeInput {
  readonly chartA: InstantChart;
  readonly chartB: InstantChart;
}

/**
 * Midpoint composite of two charts.
 *
 * Only bodies present in BOTH charts are included: a midpoint needs two
 * endpoints, and silently substituting one chart's position for a missing pair
 * would invent data.
 */
export function compositeChart({ chartA, chartB }: CompositeInput): CompositeChart {
  const byBodyB = new Map(chartB.bodies.map((p) => [p.position.body, p.position.longitude]));

  const positions: CompositePosition[] = [];
  for (const placed of chartA.bodies) {
    const longitudeB = byBodyB.get(placed.position.body);
    if (longitudeB === undefined) continue;
    const longitudeA = placed.position.longitude;
    positions.push({
      body: placed.position.body,
      longitudeA,
      longitudeB,
      longitude: midpointOf(longitudeA, longitudeB),
    });
  }

  const housesA = chartA.houses;
  const housesB = chartB.houses;

  let angles: CompositeAngles | undefined;
  let cusps: Degrees[] | undefined;
  let cuspsDegenerate = false;

  if (housesA && housesB) {
    const ascendant = midpointOf(housesA.ascendant, housesB.ascendant);
    const midheaven = midpointOf(housesA.midheaven, housesB.midheaven);
    angles = {
      ascendant,
      midheaven,
      descendant: norm360(ascendant + 180),
      imumCoeli: norm360(midheaven + 180),
    };

    const midpointed = housesA.cusps.map((cusp, index) =>
      midpointOf(cusp, housesB.cusps[index]!),
    );
    if (cuspsAreValid(midpointed)) cusps = midpointed;
    else cuspsDegenerate = true;
  }

  const withHouses: CompositePosition[] = cusps
    ? positions.map((position) => ({ ...position, house: houseOf(position.longitude, cusps) }))
    : positions;

  return {
    method: 'midpointComposite',
    positions: withHouses,
    ...(angles ? { angles } : {}),
    ...(cusps ? { cusps } : {}),
    cuspsDegenerate,
    impossibleElongations: findImpossibleElongations(withHouses),
  };
}

/**
 * Do these cusps partition the circle?
 *
 * Each must advance strictly forwards from the last, and the twelve steps must
 * sum to exactly one turn. Anything else is not a house division.
 */
function cuspsAreValid(cusps: readonly Degrees[]): boolean {
  if (cusps.length !== 12) return false;
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const span = norm360(cusps[(i + 1) % 12]! - cusps[i]!);
    if (!(span > 0.001)) return false;
    total += span;
  }
  return Math.abs(total - 360) < 0.001;
}

function findImpossibleElongations(positions: readonly CompositePosition[]): Body[] {
  const sun = positions.find((p) => p.body === 'sun');
  if (!sun) return [];
  const flagged: Body[] = [];
  for (const position of positions) {
    const limit = MAX_ELONGATION[position.body];
    if (limit === undefined) continue;
    if (separation(position.longitude, sun.longitude) > limit) flagged.push(position.body);
  }
  return flagged;
}

export interface DavisonInput {
  readonly jdA: number;
  readonly placeA: BirthPlace;
  readonly jdB: number;
  readonly placeB: BirthPlace;
  readonly settings?: Partial<ChartSettings>;
}

export interface DavisonChart {
  readonly method: 'davison';
  readonly jdUT: number;
  readonly utcIso: string;
  readonly place: BirthPlace;
  /** A real chart for a real moment — speeds and retrogrades mean what they say. */
  readonly chart: InstantChart;
}

/**
 * Davison relationship chart: the midpoint in time and space.
 *
 * Latitude is the arithmetic mean; longitude is the SHORTER-arc midpoint, so a
 * pair straddling the antimeridian averages to the near side rather than being
 * flung to the opposite face of the Earth.
 *
 * This is the conventional construction. A great-circle midpoint would differ
 * slightly for widely separated places; the technique as practised uses the
 * simple mean, so that is what is implemented.
 */
export function davisonChart(
  provider: EphemerisProvider,
  input: DavisonInput,
): DavisonChart {
  const { jdA, jdB, placeA, placeB } = input;
  if (!Number.isFinite(jdA) || !Number.isFinite(jdB)) {
    throw new RangeError('Davison requires two finite Julian Days');
  }

  const jdUT = (jdA + jdB) / 2;

  const longitudeMidpoint = midpointOf(
    norm360(placeA.longitude),
    norm360(placeB.longitude),
  );
  const place: BirthPlace = {
    latitude: (placeA.latitude + placeB.latitude) / 2,
    // Back into the -180..180 range the rest of the engine expects.
    longitude: longitudeMidpoint > 180 ? longitudeMidpoint - 360 : longitudeMidpoint,
    label: 'Davison midpoint',
  };

  return {
    method: 'davison',
    jdUT,
    utcIso: julianDayToIsoUtc(jdUT),
    place,
    chart: calculateChartForInstant(provider, jdUT, place, {
      ...(input.settings ? { settings: input.settings } : {}),
      withHouses: true,
    }),
  };
}
