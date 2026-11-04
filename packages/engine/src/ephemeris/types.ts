/**
 * Ephemeris domain types.
 *
 * These are the engine's own vocabulary. Swiss Ephemeris integer constants are
 * confined to the adapter, so nothing above this layer deals in magic numbers.
 */
import type { Degrees } from '../math/angles.js';

/** Bodies the engine can place. */
export type Body =
  | 'sun'
  | 'moon'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto'
  | 'meanNode'
  | 'trueNode'
  | 'southNode'
  | 'meanSouthNode'
  | 'chiron'
  | 'lilith';

export const ALL_BODIES: readonly Body[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto', 'trueNode', 'southNode',
  'meanNode', 'meanSouthNode', 'chiron', 'lilith',
];

/**
 * Which lunar node a chart uses — Rahu/Ketu in the Vedic tradition.
 *
 * The two are different points, not two names for one. The MEAN node is the
 * smoothed orbital element: perfectly uniform, always retrograde at about
 * -0.0529 degrees a day. The TRUE (osculating) node is where the Moon's
 * instantaneous orbital plane actually crosses the ecliptic; it oscillates
 * around the mean position by up to roughly 1.5 degrees and is direct on about
 * a quarter of all days.
 *
 * Western practice and most Swiss Ephemeris output default to the true node;
 * a great deal of Indian practice, and every classical table, uses the mean.
 * Neither is an approximation of the other, so the choice is the reader's and
 * is recorded with the chart.
 */
export type NodeType = 'true' | 'mean';

/** North and south node body for each choice. */
export const NODE_BODIES: Readonly<Record<NodeType, readonly [north: Body, south: Body]>> = {
  true: ['trueNode', 'southNode'],
  mean: ['meanNode', 'meanSouthNode'],
};

/**
 * The classical seven plus the modern outers — the default chart set.
 * Nodes and Chiron are opt-in because not every tradition uses them.
 */
export const DEFAULT_BODIES: readonly Body[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto', 'trueNode', 'southNode',
];

/**
 * Which underlying ephemeris produced a result.
 *
 * This is not decoration. Swiss Ephemeris silently substitutes the
 * lower-precision Moshier theory outside its data range and still returns a
 * plausible number, so every position carries its provenance and the UI
 * labels anything that is not 'swiss'.
 */
export type EphemerisSource = 'swiss' | 'moshier';

/** Equatorial coordinates, present only when explicitly requested. */
export interface EquatorialPosition {
  readonly rightAscension: Degrees;
  readonly declination: Degrees;
}

export interface BodyPosition {
  readonly body: Body;
  /** Ecliptic longitude, [0, 360). */
  readonly longitude: Degrees;
  /** Ecliptic latitude, degrees. */
  readonly latitude: Degrees;
  /** Distance from Earth in astronomical units. */
  readonly distanceAu: number;
  /** Change in longitude, degrees per day. Negative means retrograde. */
  readonly longitudeSpeed: number;
  readonly latitudeSpeed: number;
  readonly distanceSpeed: number;
  /** True when longitudeSpeed < 0. */
  readonly retrograde: boolean;
  /**
   * True when the body is close enough to stationary that the sign of its
   * speed should not be trusted to indicate direction.
   */
  readonly stationary: boolean;
  readonly source: EphemerisSource;
  readonly equatorial?: EquatorialPosition;
}

/**
 * House systems, by their Swiss Ephemeris letter code.
 *
 * Adding one is a table entry, not a change to the chart engine.
 */
export const HOUSE_SYSTEMS = {
  placidus: 'P',
  koch: 'K',
  wholeSign: 'W',
  equal: 'A',
  campanus: 'C',
  regiomontanus: 'R',
  porphyry: 'O',
  alcabitius: 'B',
  topocentric: 'T',
  morinus: 'M',
  meridian: 'X',
  horizontal: 'H',
} as const;

export type HouseSystem = keyof typeof HOUSE_SYSTEMS;

/**
 * House systems that are mathematically undefined inside the polar circles,
 * because they divide by a quantity that vanishes when the ecliptic does not
 * rise and set normally.
 */
export const POLAR_UNSAFE_SYSTEMS: readonly HouseSystem[] = [
  'placidus', 'koch', 'topocentric', 'alcabitius',
];

export interface HouseCusps {
  /** Twelve cusps, index 0 = 1st house. Always length 12. */
  readonly cusps: readonly Degrees[];
  readonly ascendant: Degrees;
  readonly midheaven: Degrees;
  readonly descendant: Degrees;
  readonly imumCoeli: Degrees;
  /** Right ascension of the MC. */
  readonly armc: Degrees;
  readonly vertex: Degrees;
  readonly system: HouseSystem;
  /**
   * Set when the requested system could not be computed and a fallback was
   * used — near the poles, for example. Never silently substituted.
   */
  readonly fallbackFrom?: HouseSystem;
}

/**
 * Sidereal modes (ayanamshas), by Swiss Ephemeris `SE_SIDM_*` value.
 * Configuration, not code branches.
 */
export const AYANAMSHAS = {
  fagenBradley: 0,
  lahiri: 1,
  raman: 3,
  krishnamurti: 5,
  yukteshwar: 7,
  trueChitrapaksha: 27,
  /** User-supplied offset; requires an explicit t0/ayan_t0. */
  custom: 255,
} as const;

export type Ayanamsha = keyof typeof AYANAMSHAS;

export type ZodiacMode =
  | { readonly kind: 'tropical' }
  | { readonly kind: 'sidereal'; readonly ayanamsha: Ayanamsha; readonly customOffset?: Degrees };

export const TROPICAL: ZodiacMode = { kind: 'tropical' };
