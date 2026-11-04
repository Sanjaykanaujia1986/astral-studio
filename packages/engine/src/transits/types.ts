/**
 * Transit and aspectarian domain types.
 */
import type { Degrees } from '../math/angles.js';
import type { AspectName } from '../aspects/definitions.js';
import type { Body } from '../ephemeris/types.js';

/**
 * A fixed point a transit is measured against.
 *
 * Natal planets, the angles and the house cusps are all just longitudes once
 * the chart is cast, so they share one shape. `kind` exists for display and
 * filtering, not for the mathematics.
 */
export interface TransitTarget {
  readonly kind: 'natalBody' | 'angle' | 'cusp' | 'point';
  /** Stable identifier: a body name, `asc`/`mc`/`dsc`/`ic`, `cusp7`, … */
  readonly id: string;
  readonly longitude: Degrees;
}

/** Which direction the transiting body was moving as it crossed. */
export type CrossingDirection = 'direct' | 'retrograde';

export interface TransitHit {
  readonly transitBody: Body;
  readonly target: TransitTarget;
  readonly aspect: AspectName;
  /** Julian Day (UT) at which the aspect is exact. */
  readonly exactJd: number;
  readonly exactUtcIso: string;
  /** Motion of the transiting body at the moment of exactness. */
  readonly direction: CrossingDirection;
  /**
   * Which pass of a retrograde loop this is, 1-based, together with how many
   * passes that body makes over that aspect within the searched range.
   *
   * A slow planet typically crosses a natal point three times — direct,
   * retrograde, direct. Reporting only the first would misdate the other two by
   * months, so both numbers travel with every hit.
   */
  readonly passIndex: number;
  readonly totalPasses: number;
  /** Speed of the transiting body at exactness, degrees/day. */
  readonly speed: number;
}

/**
 * An aspect between two moving bodies, for the aspectarian.
 * Distinct from {@link TransitHit}, where one side is fixed.
 */
export interface AspectEvent {
  readonly bodyA: Body;
  readonly bodyB: Body;
  readonly aspect: AspectName;
  readonly exactJd: number;
  readonly exactUtcIso: string;
  /** Relative speed at exactness; its sign gives the crossing direction. */
  readonly relativeSpeed: number;
  readonly retrogradeA: boolean;
  readonly retrogradeB: boolean;
  readonly passIndex: number;
  readonly totalPasses: number;
}

/**
 * Default scan steps in days, by body.
 *
 * The step must be smaller than the shortest gap between two consecutive exact
 * hits, or the pair cancels within one step and BOTH are missed — the failure
 * mode pinned by `findBrackets`' own tests. These values come from each body's
 * motion: the Moon covers 13°/day and needs a fine grid, Pluto covers 0.04°/day
 * and does not.
 *
 * Smaller is always safe, only slower.
 */
export const DEFAULT_STEP_DAYS: Readonly<Record<Body, number>> = {
  moon: 0.2,
  mercury: 0.5,
  venus: 0.5,
  sun: 0.5,
  mars: 1,
  jupiter: 2,
  saturn: 2,
  uranus: 3,
  neptune: 3,
  pluto: 3,
  meanNode: 2,
  trueNode: 1,
  southNode: 1,
  meanSouthNode: 1,
  chiron: 2,
  lilith: 1,
};

export interface TransitSearchOptions {
  readonly fromJd: number;
  readonly toJd: number;
  readonly transitBodies: readonly Body[];
  readonly targets: readonly TransitTarget[];
  readonly aspects: readonly AspectName[];
  /** Override the per-body default scan step. */
  readonly stepDays?: number;
  /**
   * Also search for near-tangential hits, where a body stations almost exactly
   * on an aspect and crosses twice within a very short window. Costs an extra
   * refinement pass; on by default because those are real hits.
   */
  readonly detectTangencies?: boolean;
}
