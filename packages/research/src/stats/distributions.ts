/**
 * Probability distributions, implemented rather than imported.
 *
 * A p-value is the number a reader will act on, so the function that produces
 * it has to be checkable. These are the standard continued-fraction and
 * series expansions (Lentz's method for the incomplete beta, Lanczos for the
 * log gamma), written out plainly and tested against values published in
 * statistical tables rather than against another implementation of the same
 * algorithm.
 *
 * Accuracy target is 1e-10 relative, far tighter than anything a study built
 * on a few thousand daily bars can justify claiming.
 */

/** Lanczos coefficients, g = 7, n = 9. Standard published set. */
const LANCZOS: readonly number[] = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** log Γ(x) for x > 0. */
export function logGamma(x: number): number {
  if (!Number.isFinite(x) || x <= 0) {
    throw new RangeError(`logGamma requires a positive finite argument, received ${x}`);
  }
  // Reflection is unnecessary here: every caller passes x > 0.
  const z = x - 1;
  let series = LANCZOS[0]!;
  for (let i = 1; i < LANCZOS.length; i++) series += LANCZOS[i]! / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series);
}

const BETACF_MAX_ITERATIONS = 300;
const BETACF_EPSILON = 3e-16;
/** Guard against division by zero in Lentz's method. */
const TINY = 1e-300;

/**
 * Continued fraction for the incomplete beta function (Lentz's method).
 *
 * Converges quickly for x < (a+1)/(a+b+2); `incompleteBeta` uses the symmetry
 * relation to ensure that, so this is never called in the slow regime.
 */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= BETACF_MAX_ITERATIONS; m++) {
    const m2 = 2 * m;

    // Even step.
    let numerator = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;

    // Odd step.
    numerator = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < BETACF_EPSILON) return h;
  }

  // Reaching here means the fraction did not converge, which for the domain
  // this library uses would be a bug rather than a hard input. Failing loudly
  // beats returning a plausible number.
  throw new Error(`incomplete beta failed to converge for a=${a}, b=${b}, x=${x}`);
}

/** Regularised incomplete beta function I_x(a, b), for x in [0, 1]. */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) throw new RangeError(`incompleteBeta requires x in [0,1], received ${x}`);
  if (x === 0) return 0;
  if (x === 1) return 1;

  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b)
      + a * Math.log(x) + b * Math.log(1 - x),
  );

  // Symmetry: I_x(a,b) = 1 - I_{1-x}(b,a). Used so the continued fraction is
  // always evaluated where it converges fast.
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * Two-tailed p-value for Student's t with `df` degrees of freedom.
 *
 * Expressed directly rather than as 2 * (1 - CDF), which loses precision in
 * the tail where the answer matters most.
 */
export function studentTTwoTailed(t: number, df: number): number {
  if (df <= 0) throw new RangeError(`degrees of freedom must be positive, received ${df}`);
  if (!Number.isFinite(t)) return 0;
  const x = df / (df + t * t);
  return incompleteBeta(df / 2, 0.5, x);
}

/** Cumulative distribution of the standard normal. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Error function, via the incomplete gamma series/continued fraction.
 *
 * Abramowitz & Stegun 7.1.26 would be shorter but is only good to ~1e-7, which
 * is not enough to distinguish a p of 0.001 from 0.0001 in a tail.
 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (ax === 0) return 0;
  // erf(x) = P(1/2, x^2), the regularised lower incomplete gamma.
  return sign * regularisedGammaP(0.5, ax * ax);
}

const GAMMA_MAX_ITERATIONS = 300;
const GAMMA_EPSILON = 3e-16;

/** Regularised lower incomplete gamma P(a, x). */
export function regularisedGammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) throw new RangeError(`regularisedGammaP requires a>0, x>=0`);
  if (x === 0) return 0;
  // Series below the crossover, continued fraction above it.
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let term = sum;
    for (let i = 0; i < GAMMA_MAX_ITERATIONS; i++) {
      ap += 1;
      term *= x / ap;
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * GAMMA_EPSILON) {
        return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
      }
    }
    throw new Error(`incomplete gamma series failed to converge for a=${a}, x=${x}`);
  }

  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= GAMMA_MAX_ITERATIONS; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < GAMMA_EPSILON) {
      return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
    }
  }
  throw new Error(`incomplete gamma fraction failed to converge for a=${a}, x=${x}`);
}
