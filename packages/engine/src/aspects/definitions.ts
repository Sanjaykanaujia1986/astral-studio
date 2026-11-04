/**
 * Aspect and orb configuration.
 *
 * Aspects and orbs are DATA, not code branches. Adding a minor aspect or a new
 * orb school is a table entry; the engine in `engine.ts` never needs to change.
 */
import type { Degrees } from '../math/angles.js';
import type { Body } from '../ephemeris/types.js';

export type AspectName =
  | 'conjunction'
  | 'opposition'
  | 'trine'
  | 'square'
  | 'sextile'
  | 'quincunx'
  | 'semisextile'
  | 'semisquare'
  | 'sesquiquadrate'
  | 'quintile'
  | 'biquintile';

export interface AspectDefinition {
  readonly name: AspectName;
  /** Exact separation the aspect represents, in [0, 180]. */
  readonly angle: Degrees;
  readonly family: 'major' | 'minor';
  /**
   * True when the aspect is its own mirror image, so it can only form one way.
   * Conjunction (0) and opposition (180) are symmetric; every other aspect can
   * form with either body leading.
   */
  readonly symmetric: boolean;
}

export const ASPECT_DEFINITIONS: Readonly<Record<AspectName, AspectDefinition>> = {
  conjunction:    { name: 'conjunction',    angle: 0,   family: 'major', symmetric: true },
  opposition:     { name: 'opposition',     angle: 180, family: 'major', symmetric: true },
  trine:          { name: 'trine',          angle: 120, family: 'major', symmetric: false },
  square:         { name: 'square',         angle: 90,  family: 'major', symmetric: false },
  sextile:        { name: 'sextile',        angle: 60,  family: 'major', symmetric: false },
  quincunx:       { name: 'quincunx',       angle: 150, family: 'minor', symmetric: false },
  semisextile:    { name: 'semisextile',    angle: 30,  family: 'minor', symmetric: false },
  semisquare:     { name: 'semisquare',     angle: 45,  family: 'minor', symmetric: false },
  sesquiquadrate: { name: 'sesquiquadrate', angle: 135, family: 'minor', symmetric: false },
  quintile:       { name: 'quintile',       angle: 72,  family: 'minor', symmetric: false },
  biquintile:     { name: 'biquintile',     angle: 144, family: 'minor', symmetric: false },
};

export const MAJOR_ASPECTS: readonly AspectName[] = [
  'conjunction', 'opposition', 'trine', 'square', 'sextile',
];

export const ALL_ASPECTS: readonly AspectName[] = Object.keys(
  ASPECT_DEFINITIONS,
) as AspectName[];

/**
 * An orb profile.
 *
 * There is no single correct orb system, so the engine ships several and never
 * hard-codes one. `bodyOverrides` widens or narrows orbs for particular bodies
 * — most schools allow the luminaries a wider orb than the outer planets.
 */
export interface OrbProfile {
  readonly id: string;
  readonly label: string;
  readonly byAspect: Readonly<Partial<Record<AspectName, Degrees>>>;
  /**
   * Per-body multipliers applied to the aspect orb. The wider of the two
   * bodies' multipliers wins, so Sun-square-Pluto uses the Sun's allowance.
   */
  readonly bodyMultipliers?: Readonly<Partial<Record<Body, number>>>;
}

/** Moderate, widely-used defaults. */
export const STANDARD_ORBS: OrbProfile = {
  id: 'standard',
  label: 'Standard',
  byAspect: {
    conjunction: 8, opposition: 8, trine: 7, square: 7, sextile: 5,
    quincunx: 3, semisextile: 2, semisquare: 2, sesquiquadrate: 2,
    quintile: 1.5, biquintile: 1.5,
  },
  bodyMultipliers: { sun: 1.25, moon: 1.25 },
};

/** Narrow orbs, for research and tight event timing. */
export const TIGHT_ORBS: OrbProfile = {
  id: 'tight',
  label: 'Tight',
  byAspect: {
    conjunction: 5, opposition: 5, trine: 4, square: 4, sextile: 3,
    quincunx: 2, semisextile: 1, semisquare: 1, sesquiquadrate: 1,
    quintile: 1, biquintile: 1,
  },
};

/** Generous orbs, closer to traditional practice. */
export const WIDE_ORBS: OrbProfile = {
  id: 'wide',
  label: 'Wide',
  byAspect: {
    conjunction: 10, opposition: 10, trine: 9, square: 9, sextile: 6,
    quincunx: 4, semisextile: 3, semisquare: 3, sesquiquadrate: 3,
    quintile: 2, biquintile: 2,
  },
  bodyMultipliers: { sun: 1.3, moon: 1.3 },
};

export const ORB_PROFILES: readonly OrbProfile[] = [STANDARD_ORBS, TIGHT_ORBS, WIDE_ORBS];

/**
 * Maximum orb allowed for one aspect between two specific bodies.
 *
 * Returns 0 when the profile does not define the aspect, which excludes it —
 * that is how a profile opts out of minor aspects entirely.
 */
export function maxOrbFor(
  profile: OrbProfile,
  aspect: AspectName,
  bodyA: Body,
  bodyB: Body,
): Degrees {
  const base = profile.byAspect[aspect];
  if (base === undefined || base <= 0) return 0;

  const multipliers = profile.bodyMultipliers;
  if (!multipliers) return base;

  const multiplier = Math.max(multipliers[bodyA] ?? 1, multipliers[bodyB] ?? 1);
  return base * multiplier;
}
