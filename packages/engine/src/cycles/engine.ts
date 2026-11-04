/**
 * Synodic cycles.
 *
 * One engine for every pair. A synodic cycle is the interval between successive
 * conjunctions of two bodies, and the phase at any moment is simply their
 * elongation — so Sun/Moon lunations, the Jupiter-Saturn great conjunction and
 * the Mars-Jupiter cycle are the same calculation with different arguments.
 * There is deliberately no per-planet code path.
 *
 * ## Phase, not aspect
 *
 * The phase is the SIGNED elongation `lonA - lonB`, taken over the full circle.
 * That distinguishes the waxing square at 90 degrees from the waning square at
 * 270, which the aspect engine cannot: to it both are "a square". A cycle needs
 * to know which side of the opposition it is on, so it uses its own measure.
 *
 * `bodyA` should be the FASTER body, so the phase advances rather than
 * retreats. {@link orderBySpeed} does that for a caller who would rather not
 * think about it.
 *
 * ## Triple conjunctions are real
 *
 * When the faster body is retrograde near conjunction the pair can conjoin
 * three times in a few months — the Jupiter-Saturn conjunction of 1980-81 did
 * exactly that. Those three passes are ONE event in the cycle, not three
 * cycles, so consecutive crossings that fall far closer together than the mean
 * period are grouped, and the period is measured between groups.
 */
import { norm180, norm360, type Degrees } from '../math/angles.js';
import { findCrossings } from '../aspects/crossing.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import type { Body, ZodiacMode } from '../ephemeris/types.js';
import { julianDayToIsoUtc } from '../time/julian.js';

/** Approximate sidereal periods in days, used only to size the scan. */
const SIDEREAL_PERIOD_DAYS: Readonly<Record<Body, number>> = {
  moon: 27.321661,
  sun: 365.256363,
  mercury: 87.9691,
  venus: 224.701,
  mars: 686.98,
  jupiter: 4332.589,
  saturn: 10_759.22,
  uranus: 30_685.4,
  neptune: 60_189,
  pluto: 90_560,
  meanNode: 6798.38,
  trueNode: 6798.38,
  southNode: 6798.38,
  meanSouthNode: 6798.38,
  chiron: 18_500,
  lilith: 3232,
};

/**
 * Expected synodic period from two sidereal periods.
 *
 * `1/T_syn = |1/T_a - 1/T_b|`. Geocentric motion is not truly Keplerian, so
 * this is an estimate used to size the search and to decide what counts as a
 * cluster — never to date an event.
 */
export function expectedSynodicPeriod(bodyA: Body, bodyB: Body): number {
  const a = SIDEREAL_PERIOD_DAYS[bodyA];
  const b = SIDEREAL_PERIOD_DAYS[bodyB];
  const difference = Math.abs(1 / a - 1 / b);
  return difference === 0 ? Number.POSITIVE_INFINITY : 1 / difference;
}

/** Put the faster body first, so the phase advances. */
export function orderBySpeed(bodyA: Body, bodyB: Body): [Body, Body] {
  return SIDEREAL_PERIOD_DAYS[bodyA] <= SIDEREAL_PERIOD_DAYS[bodyB]
    ? [bodyA, bodyB]
    : [bodyB, bodyA];
}

/** Elongation of A from B over the full circle, `[0, 360)`. */
export function phaseAngle(longitudeA: Degrees, longitudeB: Degrees): Degrees {
  return norm360(longitudeA - longitudeB);
}

/**
 * Signed distance from a target phase, zero at it and smooth through it.
 *
 * Discontinuous half a circle away, like the aspect error — the same guards in
 * {@link findCrossings} handle that.
 */
export function phaseError(
  longitudeA: Degrees,
  longitudeB: Degrees,
  targetPhase: Degrees,
): Degrees {
  return norm180(phaseAngle(longitudeA, longitudeB) - targetPhase);
}

/** Names for the quarter and eighth divisions of a cycle. */
const PHASE_LABELS: Readonly<Record<number, string>> = {
  0: 'conjunction',
  45: 'waxingSemisquare',
  90: 'waxingSquare',
  135: 'waxingSesquiquadrate',
  180: 'opposition',
  225: 'waningSesquiquadrate',
  270: 'waningSquare',
  315: 'waningSemisquare',
};

export function labelForPhase(phase: Degrees): string {
  return PHASE_LABELS[norm360(phase)] ?? `phase${Math.round(norm360(phase))}`;
}

export interface CycleEvent {
  readonly bodyA: Body;
  readonly bodyB: Body;
  /** Target phase, `[0, 360)`. 0 is conjunction, 180 opposition. */
  readonly phase: Degrees;
  readonly label: string;
  readonly jd: number;
  readonly utcIso: string;
  /** Which pass of a retrograde multiple this is, and how many there are. */
  readonly passIndex: number;
  readonly totalPasses: number;
}

export interface ConjunctionGroup {
  /** Every pass belonging to this one conjunction event. */
  readonly passes: readonly CycleEvent[];
  /** Julian Day of the first pass — the conventional date of the event. */
  readonly jd: number;
  readonly utcIso: string;
  /** True when the pair conjoined more than once, e.g. a triple conjunction. */
  readonly multiple: boolean;
}

export interface CycleSearchOptions {
  readonly bodyA: Body;
  readonly bodyB: Body;
  readonly fromJd: number;
  readonly toJd: number;
  /**
   * How many equal divisions of the cycle to report. 1 gives conjunctions only,
   * 4 the quarters, 8 the eighths. Ignored if `phases` is supplied.
   */
  readonly divisions?: number;
  /** Explicit target phases in degrees, overriding `divisions`. */
  readonly phases?: readonly Degrees[];
  readonly stepDays?: number;
  readonly zodiac?: ZodiacMode;
}

export interface CycleAnalysis {
  readonly bodyA: Body;
  readonly bodyB: Body;
  /** From the sidereal periods; an estimate, never used to date an event. */
  readonly expectedPeriodDays: number;
  /**
   * Mean interval between successive conjunction EVENTS actually found.
   * Undefined when fewer than two were found in the range.
   */
  readonly observedPeriodDays?: number;
  readonly conjunctions: readonly ConjunctionGroup[];
  /** Every phase crossing found, in time order. */
  readonly events: readonly CycleEvent[];
}

/** Scan step: a fraction of the expected period, clamped to something sane. */
function scanStep(bodyA: Body, bodyB: Body, override?: number): number {
  if (override !== undefined) return override;
  const period = expectedSynodicPeriod(bodyA, bodyB);
  if (!Number.isFinite(period)) return 1;
  // ~200 samples per cycle resolves a retrograde triple pass comfortably.
  return Math.min(Math.max(period / 200, 0.05), 5);
}

/**
 * Analyse the synodic cycle of a body pair over a date range.
 */
export function analyseCycle(
  provider: EphemerisProvider,
  options: CycleSearchOptions,
): CycleAnalysis {
  const { bodyA, bodyB, fromJd, toJd } = options;
  if (!(toJd > fromJd)) {
    throw new RangeError(`Cycle search requires toJd > fromJd (got ${fromJd}, ${toJd})`);
  }
  if (bodyA === bodyB) {
    throw new RangeError('A synodic cycle needs two different bodies');
  }

  const divisions = options.divisions ?? 4;
  if (!options.phases && (!Number.isInteger(divisions) || divisions < 1)) {
    throw new RangeError(`divisions must be a positive integer, received ${divisions}`);
  }

  const targets =
    options.phases ??
    Array.from({ length: divisions }, (_, index) => norm360((index * 360) / divisions));

  const step = scanStep(bodyA, bodyB, options.stepDays);
  const zodiacOption = options.zodiac ? { zodiac: options.zodiac } : {};

  // Sample both bodies once; every target phase reuses the grid.
  const jds: number[] = [];
  const phases: number[] = [];
  for (let jd = fromJd; jd <= toJd; jd += step) {
    const a = provider.calc(jd, bodyA, zodiacOption).longitude;
    const b = provider.calc(jd, bodyB, zodiacOption).longitude;
    jds.push(jd);
    phases.push(phaseAngle(a, b));
  }

  // A retrograde multiple spans months against a cycle of years, so anything
  // closer together than a quarter period is one event with several passes.
  const expectedPeriod = expectedSynodicPeriod(bodyA, bodyB);
  const clusterThreshold = Number.isFinite(expectedPeriod)
    ? expectedPeriod / 4
    : Number.POSITIVE_INFINITY;

  const events: CycleEvent[] = [];
  for (const phase of targets) {
    const values = phases.map((value) => norm180(value - phase));
    const f = (jd: number) =>
      phaseError(
        provider.calc(jd, bodyA, zodiacOption).longitude,
        provider.calc(jd, bodyB, zodiacOption).longitude,
        phase,
      );

    const roots = findCrossings(jds, values, f);
    // Pass numbering is per CLUSTER, not per range. Two conjunctions twenty
    // years apart are separate events; labelling them "1 of 4" and "2 of 4"
    // would claim a retrograde multiple that does not exist.
    for (const cluster of clusterByProximity(roots, clusterThreshold)) {
      cluster.forEach((jd, index) => {
        events.push({
          bodyA,
          bodyB,
          phase: norm360(phase),
          label: labelForPhase(phase),
          jd,
          utcIso: julianDayToIsoUtc(jd),
          passIndex: index + 1,
          totalPasses: cluster.length,
        });
      });
    }
  }

  events.sort((x, y) => x.jd - y.jd);

  const conjunctions = groupConjunctions(
    events.filter((event) => event.phase === 0),
    clusterThreshold,
  );

  const observedPeriodDays =
    conjunctions.length >= 2
      ? (conjunctions[conjunctions.length - 1]!.jd - conjunctions[0]!.jd) /
        (conjunctions.length - 1)
      : undefined;

  return {
    bodyA,
    bodyB,
    expectedPeriodDays: expectedSynodicPeriod(bodyA, bodyB),
    ...(observedPeriodDays !== undefined ? { observedPeriodDays } : {}),
    conjunctions,
    events,
  };
}

/**
 * Split a sorted list of times into runs closer together than `threshold`.
 *
 * The single rule for "these belong to the same event", used both for pass
 * numbering and for conjunction grouping so the two cannot disagree.
 */
function clusterByProximity(times: readonly number[], threshold: number): number[][] {
  if (times.length === 0) return [];
  const clusters: number[][] = [[times[0]!]];
  for (let i = 1; i < times.length; i++) {
    if (times[i]! - times[i - 1]! < threshold) clusters[clusters.length - 1]!.push(times[i]!);
    else clusters.push([times[i]!]);
  }
  return clusters;
}

/**
 * Collapse a retrograde multiple into one conjunction event.
 *
 * Passes closer together than a quarter of the expected period belong to the
 * same conjunction: a triple conjunction spans months against a cycle of years,
 * and counting it as three would halve the apparent period.
 */
function groupConjunctions(
  passes: readonly CycleEvent[],
  threshold: number,
): ConjunctionGroup[] {
  if (passes.length === 0) return [];

  const groups: CycleEvent[][] = [[passes[0]!]];

  for (let i = 1; i < passes.length; i++) {
    const previous = passes[i - 1]!;
    const current = passes[i]!;
    if (current.jd - previous.jd < threshold) groups[groups.length - 1]!.push(current);
    else groups.push([current]);
  }

  return groups.map((group) => ({
    passes: group,
    jd: group[0]!.jd,
    utcIso: group[0]!.utcIso,
    multiple: group.length > 1,
  }));
}

export interface CurrentPhase {
  readonly bodyA: Body;
  readonly bodyB: Body;
  readonly phaseAngle: Degrees;
  /** Position within the cycle, `[0, 1)`. 0 at conjunction, 0.5 at opposition. */
  readonly fraction: number;
  /** Nearest named eighth of the cycle. */
  readonly nearestLabel: string;
  readonly waxing: boolean;
}

/**
 * Where a pair sits in its cycle at a given moment.
 *
 * `waxing` is true for the first half, between conjunction and opposition — the
 * separating half. It is read from the phase, not from the relative speed, so a
 * temporary retrograde does not flip it.
 */
export function currentPhase(
  provider: EphemerisProvider,
  jdUT: number,
  bodyA: Body,
  bodyB: Body,
  zodiac?: ZodiacMode,
): CurrentPhase {
  const zodiacOption = zodiac ? { zodiac } : {};
  const angle = phaseAngle(
    provider.calc(jdUT, bodyA, zodiacOption).longitude,
    provider.calc(jdUT, bodyB, zodiacOption).longitude,
  );

  const eighth = Math.round(angle / 45) % 8;
  return {
    bodyA,
    bodyB,
    phaseAngle: angle,
    fraction: angle / 360,
    nearestLabel: labelForPhase(eighth * 45),
    waxing: angle < 180,
  };
}
