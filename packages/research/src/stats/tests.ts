/**
 * Comparing returns on signal days against returns on other days.
 *
 * ## Why there are two tests, and which one to believe
 *
 * The parametric t-test is here because readers expect it and because it is a
 * useful sanity check. Its assumptions are, however, false for this data in
 * three separate ways: daily returns are not normal (they are fat-tailed),
 * they are not independent (volatility clusters), and signal days are not
 * scattered at random (a retrograde signal is active in long unbroken runs).
 * Each of those inflates significance, and they compound.
 *
 * The **rotation test** is the one to believe. It leaves both series exactly
 * as they are and slides the signal along the returns by a random offset,
 * wrapping at the ends. That preserves the autocorrelation of the returns AND
 * the run-length structure of the signal, and destroys only the alignment
 * between them — which is precisely the null hypothesis worth testing: *is
 * this signal's phase relative to the market anything other than arbitrary?*
 *
 * A permutation test that shuffled days individually would destroy the
 * clustering along with the alignment, and would report far more significance
 * than the data supports. That is the standard trap in calendar-effect
 * research, and it is worth being explicit about not falling into it.
 *
 * ## Nothing here says anything causal
 *
 * A small p-value from these functions means "this alignment would be unusual
 * under random rotation". It does not mean the configuration moved the market,
 * and it does not mean the pattern will continue. The study layer attaches the
 * warnings that say so.
 */
import { studentTTwoTailed } from './distributions.js';

export interface GroupStats {
  readonly count: number;
  readonly mean: number;
  /** Sample standard deviation, n−1 denominator. */
  readonly standardDeviation: number;
}

export function describe(values: readonly number[]): GroupStats {
  const count = values.length;
  if (count === 0) return { count: 0, mean: Number.NaN, standardDeviation: Number.NaN };
  const mean = values.reduce((sum, v) => sum + v, 0) / count;
  if (count === 1) return { count, mean, standardDeviation: Number.NaN };
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (count - 1);
  return { count, mean, standardDeviation: Math.sqrt(variance) };
}

export interface WelchResult {
  readonly meanA: number;
  readonly meanB: number;
  readonly difference: number;
  readonly t: number;
  readonly degreesOfFreedom: number;
  readonly pValue: number;
  /** Cohen's d, using the pooled standard deviation. */
  readonly effectSize: number;
}

/**
 * Welch's two-sample t-test — unequal variances assumed by default.
 *
 * Student's pooled-variance form is not offered. Signal and non-signal days
 * routinely differ in volatility as well as in mean, and the pooled test is
 * badly behaved exactly then. There is no reason to make the wrong test
 * available for the sake of symmetry.
 */
export function welchTTest(a: readonly number[], b: readonly number[]): WelchResult {
  const statsA = describe(a);
  const statsB = describe(b);
  if (statsA.count < 2 || statsB.count < 2) {
    throw new RangeError('Welch test needs at least two observations in each group');
  }

  const varA = statsA.standardDeviation ** 2;
  const varB = statsB.standardDeviation ** 2;
  const seA = varA / statsA.count;
  const seB = varB / statsB.count;
  const standardError = Math.sqrt(seA + seB);

  const difference = statsA.mean - statsB.mean;
  const t = standardError === 0 ? 0 : difference / standardError;

  // Welch-Satterthwaite.
  const degreesOfFreedom =
    (seA + seB) ** 2
    / (seA ** 2 / (statsA.count - 1) + seB ** 2 / (statsB.count - 1));

  const pooledSd = Math.sqrt(
    ((statsA.count - 1) * varA + (statsB.count - 1) * varB)
    / (statsA.count + statsB.count - 2),
  );

  return {
    meanA: statsA.mean,
    meanB: statsB.mean,
    difference,
    t,
    degreesOfFreedom,
    pValue: standardError === 0 ? 1 : studentTTwoTailed(t, degreesOfFreedom),
    effectSize: pooledSd === 0 ? 0 : difference / pooledSd,
  };
}

/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * Seeded on purpose. A study whose p-value changes each time it is run cannot
 * be checked by anyone, and "run it again until it looks better" is not a
 * method. The seed is part of the result.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RotationResult {
  /** Observed mean difference, signal days minus other days. */
  readonly observed: number;
  /** Two-tailed p-value under random circular rotation of the signal. */
  readonly pValue: number;
  readonly iterations: number;
  readonly seed: number;
  /** Rotations whose |difference| was at least the observed one. */
  readonly atLeastAsExtreme: number;
  /** Mean and spread of the null distribution, for plotting. */
  readonly nullMean: number;
  readonly nullStandardDeviation: number;
}

/**
 * Circular rotation test.
 *
 * The signal mask is rotated by a random offset and the mean difference
 * recomputed; the p-value is the share of rotations at least as extreme as the
 * observed alignment.
 *
 * The +1 in the numerator and denominator is deliberate — it counts the
 * observed arrangement as one of its own null draws. Without it a test can
 * return p = 0, which is never a defensible statement: with 10,000 rotations
 * the strongest claim available is p < 1/10,001.
 */
export function rotationTest(
  values: readonly number[],
  active: readonly boolean[],
  options: { readonly iterations?: number; readonly seed?: number } = {},
): RotationResult {
  if (values.length !== active.length) {
    throw new RangeError(
      `rotationTest needs matching lengths, received ${values.length} and ${active.length}`,
    );
  }
  const n = values.length;
  const activeCount = active.reduce<number>((sum, on) => sum + (on ? 1 : 0), 0);
  if (activeCount === 0 || activeCount === n) {
    throw new RangeError('rotationTest needs both active and inactive observations');
  }

  const iterations = options.iterations ?? 10_000;
  const seed = options.seed ?? 20260826;
  const random = mulberry32(seed);

  const differenceAt = (offset: number): number => {
    let activeSum = 0;
    let inactiveSum = 0;
    for (let i = 0; i < n; i++) {
      // Rotate the signal, not the returns: the returns keep their own order
      // and therefore their own autocorrelation.
      if (active[(i + offset) % n]!) activeSum += values[i]!;
      else inactiveSum += values[i]!;
    }
    return activeSum / activeCount - inactiveSum / (n - activeCount);
  };

  const observed = differenceAt(0);

  let atLeastAsExtreme = 0;
  let sum = 0;
  let sumSquares = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    // Offset 0 is excluded so the observed value is not drawn twice; it is
    // added back explicitly by the +1 below.
    const offset = 1 + Math.floor(random() * (n - 1));
    const difference = differenceAt(offset);
    if (Math.abs(difference) >= Math.abs(observed)) atLeastAsExtreme += 1;
    sum += difference;
    sumSquares += difference * difference;
  }

  const nullMean = sum / iterations;
  const nullVariance = sumSquares / iterations - nullMean * nullMean;

  return {
    observed,
    pValue: (atLeastAsExtreme + 1) / (iterations + 1),
    iterations,
    seed,
    atLeastAsExtreme,
    nullMean,
    nullStandardDeviation: Math.sqrt(Math.max(0, nullVariance)),
  };
}

/**
 * Number of separate runs of active observations, counted circularly.
 *
 * A run that wraps the end of the series is one run, not two, because the
 * rotation test treats the series as a circle and so must this.
 */
export function countActiveBlocks(active: readonly boolean[]): number {
  const n = active.length;
  if (n === 0) return 0;
  let blocks = 0;
  for (let i = 0; i < n; i++) {
    // A block starts where an active observation follows an inactive one.
    if (active[i] && !active[(i - 1 + n) % n]) blocks += 1;
  }
  // An all-active mask has no start edge but is one continuous block.
  return blocks === 0 && active[0] ? 1 : blocks;
}

/**
 * The smallest p-value a rotation test can possibly return for this signal.
 *
 * **This is the most important caveat in the package**, and it is not obvious.
 *
 * Rotating a perfectly periodic signal by a whole multiple of its period puts
 * the mask back exactly where it started, so that rotation reproduces the
 * observed statistic precisely and counts as "at least as extreme". With k
 * cycles in n observations, roughly k of the n offsets are such no-ops, and
 * therefore
 *
 *     p ≥ k / n  =  1 / (period in bars)
 *
 * regardless of how strong the effect is.
 *
 * Every astrological signal is periodic, so this bites constantly. A lunar
 * phase signal over ten years of daily bars has about 126 cycles in about
 * 2,520 bars — a floor of 0.05. **Such a study cannot return a significant
 * result under this test no matter what the data does.** The honest response
 * is to say so, not to swap in a test whose assumptions are violated in a way
 * that happens to produce smaller numbers.
 *
 * Real signals are only near-periodic, which softens the floor rather than
 * removing it. Treat this as a lower bound on what is attainable, and compare
 * it against the α you intended to use before reading the p-value at all.
 */
export function rotationPValueFloor(active: readonly boolean[]): number {
  const n = active.length;
  if (n === 0) return 1;
  return countActiveBlocks(active) / n;
}

/**
 * Split values by a mask.
 *
 * Trivial, but it exists so every caller partitions the same way and no study
 * accidentally compares signal days against ALL days — which would share
 * observations between the two groups and understate the difference while
 * making the sample look larger.
 */
export function partition(
  values: readonly number[],
  active: readonly boolean[],
): { readonly inSignal: number[]; readonly outOfSignal: number[] } {
  if (values.length !== active.length) {
    throw new RangeError('partition needs matching lengths');
  }
  const inSignal: number[] = [];
  const outOfSignal: number[] = [];
  for (let i = 0; i < values.length; i++) {
    (active[i] ? inSignal : outOfSignal).push(values[i]!);
  }
  return { inSignal, outOfSignal };
}
