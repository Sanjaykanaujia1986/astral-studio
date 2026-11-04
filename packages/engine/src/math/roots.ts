/**
 * Root finding for exact astronomical events.
 *
 * Exact aspect times, planetary returns and transit hits are all "when does
 * this angle difference reach zero". They are found by bracketing a sign change
 * and then converging on it numerically — never by scanning calendar days and
 * rounding to the nearest, which cannot resolve an event to better than the
 * scan step and misses events entirely between steps.
 */

export interface RootOptions {
  /** Absolute tolerance on the abscissa (usually Julian days). */
  readonly tolerance?: number;
  readonly maxIterations?: number;
}

export interface Bracket {
  readonly lo: number;
  readonly hi: number;
}

const DEFAULT_TOLERANCE = 1e-9; // ~0.1 ms in Julian days
const DEFAULT_MAX_ITERATIONS = 100;

/**
 * Brent's method: bracketed, guaranteed to converge, superlinear in practice.
 *
 * `f(lo)` and `f(hi)` must have opposite signs. Throws if they do not, because
 * a silent "closest guess" here would surface as a plausible but wrong event
 * time in a chart.
 */
export function brentRoot(
  f: (x: number) => number,
  lo: number,
  hi: number,
  options: RootOptions = {},
): number {
  const tol = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);

  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) {
    throw new RangeError(
      `brentRoot: interval [${lo}, ${hi}] does not bracket a root (f(lo)=${fa}, f(hi)=${fb})`,
    );
  }

  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }

  let c = a;
  let fc = fa;
  let d = a;
  let usedBisection = true;

  for (let i = 0; i < maxIterations; i++) {
    if (fb === 0) return b;
    if (Math.abs(b - a) < tol) return b;

    let s: number;
    if (fa !== fc && fb !== fc) {
      // inverse quadratic interpolation
      s =
        (a * fb * fc) / ((fa - fb) * (fa - fc)) +
        (b * fa * fc) / ((fb - fa) * (fb - fc)) +
        (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      // secant
      s = b - (fb * (b - a)) / (fb - fa);
    }

    const boundA = (3 * a + b) / 4;
    const outsideInterval = !(s > Math.min(boundA, b) && s < Math.max(boundA, b));
    const slowShrink = usedBisection
      ? Math.abs(s - b) >= Math.abs(b - c) / 2
      : Math.abs(s - b) >= Math.abs(c - d) / 2;
    const tinyStep = usedBisection
      ? Math.abs(b - c) < tol
      : Math.abs(c - d) < tol;

    if (outsideInterval || slowShrink || tinyStep) {
      s = (a + b) / 2;
      usedBisection = true;
    } else {
      usedBisection = false;
    }

    const fs = f(s);
    d = c;
    c = b;
    fc = fb;

    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }

    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }

  throw new Error(
    `brentRoot: failed to converge within ${maxIterations} iterations on [${lo}, ${hi}]`,
  );
}

/**
 * Scan `[from, to]` at `step` and return every sub-interval where `f` changes
 * sign — i.e. every bracket containing a root.
 *
 * `step` must be smaller than the shortest gap between two roots, otherwise a
 * pair of roots inside one step cancels out and both are missed. Callers pick
 * the step from the physics: for a retrograde planet crossing the same aspect
 * three times, the step must be well under the shortest of those passes.
 *
 * Exact zeros landing on a sample point are reported as a degenerate bracket
 * `[x, x]`, which `brentRoot` returns immediately.
 */
export function findBrackets(
  f: (x: number) => number,
  from: number,
  to: number,
  step: number,
): Bracket[] {
  if (!(step > 0)) throw new RangeError(`findBrackets: step must be positive, received ${step}`);
  if (!(to > from)) throw new RangeError(`findBrackets: require to > from`);

  const brackets: Bracket[] = [];
  let x = from;
  let fx = f(x);

  while (x < to) {
    const nextX = Math.min(x + step, to);
    const fNext = f(nextX);

    if (fx === 0) {
      brackets.push({ lo: x, hi: x });
    } else if (fx * fNext < 0) {
      brackets.push({ lo: x, hi: nextX });
    }

    if (nextX === to) {
      if (fNext === 0) brackets.push({ lo: nextX, hi: nextX });
      break;
    }
    x = nextX;
    fx = fNext;
  }

  return brackets;
}

/**
 * Convenience: bracket-scan then solve, returning every root in `[from, to]`.
 */
export function findRoots(
  f: (x: number) => number,
  from: number,
  to: number,
  step: number,
  options: RootOptions = {},
): number[] {
  return findBrackets(f, from, to, step).map((bracket) =>
    bracket.lo === bracket.hi ? bracket.lo : brentRoot(f, bracket.lo, bracket.hi, options),
  );
}
