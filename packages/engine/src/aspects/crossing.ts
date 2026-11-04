/**
 * Finding the exact moments an aspect becomes exact.
 *
 * Shared by the transit search, the aspectarian and the return finder, so the
 * guards below exist in exactly one place. They are easy to omit and produce
 * convincing wrong answers when omitted — see `isWrap`.
 */
import { brentRoot } from '../math/roots.js';

/**
 * The signed aspect error is zero at the aspect and smooth through it, but it is
 * DISCONTINUOUS half a circle away, where it jumps between +180 and -180. That
 * jump is a sign change, so a bracket scanner reads it as a root and Brent's
 * method converges on it.
 *
 * The symptom is quiet and convincing. Searching for the Sun CONJUNCT 0 Aries
 * also returned the September equinox, where the Sun is 180 degrees away; a list
 * of "new moons" contained the full moons. Every date was a real astronomical
 * event, just the wrong one, so nothing looked broken.
 *
 * A genuine crossing moves the error continuously through zero, changing by at
 * most one step's worth of motion. A wrap changes it by nearly 360.
 */
export function isWrap(a: number, b: number): boolean {
  return Math.abs(a - b) > 180;
}

/**
 * Second line of defence: a root is genuine only if the function really is zero
 * there. At a discontinuity Brent converges on the jump, where |f| is about 180.
 */
export function isGenuineRoot(f: (x: number) => number, root: number): boolean {
  return Math.abs(f(root)) < 1e-4;
}

export interface CrossingOptions {
  /**
   * Also search for near-tangential crossings, where a body stations almost
   * exactly on the aspect and crosses twice within a very short window. Those
   * two roots can hide entirely between two grid samples, which see the same
   * sign either side and report nothing.
   */
  readonly detectTangencies?: boolean;
  readonly tolerance?: number;
}

/**
 * Every root of `f` over a pre-sampled grid, in ascending order.
 *
 * `values[i]` must be `f(jds[i])`; the grid exists so the expensive ephemeris
 * evaluation happens once per sample rather than once per aspect.
 */
export function findCrossings(
  jds: readonly number[],
  values: readonly number[],
  f: (jd: number) => number,
  options: CrossingOptions = {},
): number[] {
  const tolerance = options.tolerance ?? 1e-8;
  const detectTangencies = options.detectTangencies ?? true;
  const roots: number[] = [];

  const push = (root: number) => {
    if (!roots.some((existing) => Math.abs(existing - root) < 1e-6)) roots.push(root);
  };

  for (let i = 1; i < jds.length; i++) {
    const a = values[i - 1]!;
    const b = values[i]!;
    if (a === 0) {
      push(jds[i - 1]!);
    } else if (a * b < 0 && !isWrap(a, b)) {
      const root = brentRoot(f, jds[i - 1]!, jds[i]!, { tolerance });
      if (isGenuineRoot(f, root)) push(root);
    }
  }

  if (detectTangencies) {
    for (let i = 1; i < jds.length - 1; i++) {
      const previous = Math.abs(values[i - 1]!);
      const current = Math.abs(values[i]!);
      const next = Math.abs(values[i + 1]!);
      if (!(current < previous && current < next)) continue;

      // How far could f plausibly move between two samples here? If the dip at
      // this minimum is smaller than that, a pair of roots could be hiding.
      const reach = Math.max(previous - current, next - current);
      if (current > reach) continue;

      const lo = jds[i - 1]!;
      const hi = jds[i + 1]!;
      const fineStep = (hi - lo) / 40;
      let previousJd = lo;
      let previousValue = f(lo);
      for (let jd = lo + fineStep; jd <= hi; jd += fineStep) {
        const value = f(jd);
        if (previousValue * value < 0 && !isWrap(previousValue, value)) {
          const root = brentRoot(f, previousJd, jd, { tolerance });
          if (isGenuineRoot(f, root)) push(root);
        }
        previousJd = jd;
        previousValue = value;
      }
    }
  }

  return roots.sort((x, y) => x - y);
}
