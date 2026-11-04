/**
 * Checked against values from published statistical tables and closed forms,
 * not against another implementation of the same algorithm. Agreeing with a
 * second copy of your own arithmetic proves nothing.
 */
import { describe, it, expect } from 'vitest';
import {
  logGamma,
  incompleteBeta,
  studentTTwoTailed,
  normalCdf,
  erf,
  regularisedGammaP,
} from '../src/stats/distributions.js';

describe('logGamma', () => {
  it('matches the closed forms at integers and half-integers', () => {
    // Γ(n) = (n-1)!
    expect(logGamma(1)).toBeCloseTo(0, 12);
    expect(logGamma(2)).toBeCloseTo(0, 12);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(logGamma(11)).toBeCloseTo(Math.log(3_628_800), 10);
    // Γ(1/2) = √π
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
    // Γ(3/2) = √π / 2
    expect(logGamma(1.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI) / 2), 12);
  });

  it('satisfies the recurrence Γ(x+1) = x·Γ(x)', () => {
    // An independent structural check: any coefficient error breaks this.
    for (const x of [0.3, 1.7, 4.2, 9.9, 40.5]) {
      expect(logGamma(x + 1) - logGamma(x)).toBeCloseTo(Math.log(x), 11);
    }
  });

  it('rejects arguments outside its domain', () => {
    expect(() => logGamma(0)).toThrow(/positive/);
    expect(() => logGamma(-1)).toThrow(/positive/);
    expect(() => logGamma(Number.NaN)).toThrow(/positive/);
  });
});

describe('incompleteBeta', () => {
  it('reduces to the identity when a = b = 1', () => {
    // I_x(1,1) = x exactly.
    for (const x of [0, 0.1, 0.5, 0.9, 1]) {
      expect(incompleteBeta(1, 1, x)).toBeCloseTo(x, 12);
    }
  });

  it('matches the binomial closed form for integer parameters', () => {
    // I_x(2,3) = 6x²(1-x)² + 4x³(1-x) + x⁴
    const closed = (x: number) =>
      6 * x ** 2 * (1 - x) ** 2 + 4 * x ** 3 * (1 - x) + x ** 4;
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(incompleteBeta(2, 3, x)).toBeCloseTo(closed(x), 12);
    }
  });

  it('obeys the symmetry relation I_x(a,b) = 1 − I_{1−x}(b,a)', () => {
    // This is the identity the implementation switches on, so checking it at
    // points either side of the crossover exercises both branches.
    for (const [a, b, x] of [[2, 5, 0.1], [2, 5, 0.9], [0.5, 0.5, 0.3], [30, 4, 0.85]] as const) {
      expect(incompleteBeta(a, b, x)).toBeCloseTo(1 - incompleteBeta(b, a, 1 - x), 12);
    }
  });

  it('rejects x outside [0,1]', () => {
    expect(() => incompleteBeta(1, 1, -0.1)).toThrow(/\[0,1\]/);
    expect(() => incompleteBeta(1, 1, 1.1)).toThrow(/\[0,1\]/);
  });
});

describe("Student's t, two-tailed", () => {
  it('reproduces published critical values', () => {
    /*
     * Standard two-tailed critical values. If the tail is computed even
     * slightly wrong these disagree in the third decimal, which is exactly the
     * range where a reader decides whether a result "counts".
     */
    const cases: readonly [t: number, df: number, p: number][] = [
      [12.7062047, 1, 0.05],
      [4.30265273, 2, 0.05],
      [2.22813885, 10, 0.05],
      [2.04227246, 30, 0.05],
      [1.95996398, 1e7, 0.05], // → the normal limit
      [3.16927267, 10, 0.01],
      [2.84533971, 20, 0.01],
      [4.58689386, 10, 0.001],
    ];
    for (const [t, df, p] of cases) {
      expect(studentTTwoTailed(t, df), `t=${t}, df=${df}`).toBeCloseTo(p, 7);
    }
  });

  it('gives p = 1 at t = 0 and is symmetric in t', () => {
    expect(studentTTwoTailed(0, 7)).toBeCloseTo(1, 12);
    expect(studentTTwoTailed(-2.5, 12)).toBeCloseTo(studentTTwoTailed(2.5, 12), 14);
  });

  it('decreases monotonically as t grows', () => {
    let previous = 1;
    for (const t of [0.5, 1, 1.5, 2, 3, 5, 8]) {
      const p = studentTTwoTailed(t, 15);
      expect(p).toBeLessThan(previous);
      previous = p;
    }
  });

  it('approaches the normal at the expected rate as df grows', () => {
    /*
     * Asserting the RATE rather than a tolerance at one df, because the
     * remaining gap is real mathematics, not error: the t distribution
     * converges to the normal as O(1/df), so at a million degrees of freedom
     * the two-tailed p at t = 1.96 still differs from Φ by about 3e-7. A test
     * demanding agreement to seven places there would be asserting something
     * false and would have to be "fixed" by loosening it.
     *
     * Ten times the degrees of freedom must close the gap roughly tenfold.
     */
    const normalP = 2 * (1 - normalCdf(1.96));
    const gap = (df: number) => Math.abs(studentTTwoTailed(1.96, df) - normalP);

    const g4 = gap(1e4);
    const g5 = gap(1e5);
    const g6 = gap(1e6);
    expect(g5 / g4).toBeCloseTo(0.1, 1);
    expect(g6 / g5).toBeCloseTo(0.1, 1);
    expect(g6).toBeLessThan(1e-6);
  });
});

describe('the normal distribution', () => {
  it('matches published values of Φ', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 14);
    expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 12);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 12);
    expect(normalCdf(2.5758293035489004)).toBeCloseTo(0.995, 10);
    expect(normalCdf(-1)).toBeCloseTo(1 - 0.8413447460685429, 12);
  });

  it('matches published values of erf', () => {
    expect(erf(0)).toBe(0);
    expect(erf(0.5)).toBeCloseTo(0.5204998778130465, 12);
    expect(erf(1)).toBeCloseTo(0.8427007929497149, 12);
    expect(erf(2)).toBeCloseTo(0.9953222650189527, 12);
    expect(erf(-1)).toBeCloseTo(-0.8427007929497149, 12);
  });

  it('exercises both branches of the incomplete gamma', () => {
    // The implementation switches at x = a + 1; sample either side.
    expect(regularisedGammaP(0.5, 0.25)).toBeCloseTo(erf(0.5), 12);
    expect(regularisedGammaP(0.5, 9)).toBeCloseTo(erf(3), 12);
    // P(1, x) = 1 − e^{−x}, a closed form independent of the algorithm.
    for (const x of [0.1, 1, 5, 20]) {
      expect(regularisedGammaP(1, x)).toBeCloseTo(1 - Math.exp(-x), 12);
    }
  });
});
