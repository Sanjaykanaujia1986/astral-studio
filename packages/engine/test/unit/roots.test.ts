import { describe, it, expect } from 'vitest';
import { brentRoot, findBrackets, findRoots } from '../../src/math/roots.js';

describe('brentRoot', () => {
  it('solves a simple linear root exactly', () => {
    expect(brentRoot((x) => x - 3, 0, 10)).toBeCloseTo(3, 12);
  });

  it('solves a smooth non-linear root', () => {
    expect(brentRoot((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 12);
    expect(brentRoot(Math.cos, 0, 3)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('returns an endpoint when the root sits exactly on it', () => {
    expect(brentRoot((x) => x, 0, 5)).toBe(0);
    expect(brentRoot((x) => x - 5, 0, 5)).toBe(5);
  });

  it('REFUSES to guess when the interval does not bracket a root', () => {
    // A silent "closest guess" here would surface as a plausible but wrong
    // event time in a chart, so this must throw.
    expect(() => brentRoot((x) => x * x + 1, -1, 1)).toThrow(RangeError);
    expect(() => brentRoot((x) => x - 100, 0, 10)).toThrow(/does not bracket/);
  });

  it('converges on a deliberately awkward, steep function', () => {
    const f = (x: number) => Math.exp(x) - 5;
    expect(brentRoot(f, -10, 10)).toBeCloseTo(Math.log(5), 10);
  });

  it('handles a root very close to an endpoint', () => {
    const root = brentRoot((x) => x - 1e-9, 0, 1);
    expect(root).toBeCloseTo(1e-9, 15);
  });

  it('reaches the requested tolerance', () => {
    const f = (x: number) => Math.sin(x);
    const root = brentRoot(f, 3, 4, { tolerance: 1e-12 });
    expect(Math.abs(root - Math.PI)).toBeLessThan(1e-9);
  });
});

describe('findBrackets', () => {
  it('finds every sign change', () => {
    // sin has roots at 0, pi, 2pi, 3pi within [0.1, 10]
    const brackets = findBrackets(Math.sin, 0.1, 10, 0.5);
    expect(brackets.length).toBe(3);
  });

  it('MISSES paired roots inside one step — the documented failure mode', () => {
    // Two roots 0.02 apart, scanned at step 1: f has the same sign at both
    // ends, so the pair cancels and both are missed. This is why callers must
    // choose the step from the physics of the bodies involved.
    // Roots deliberately off the scan grid, so neither is caught as an exact zero.
    const f = (x: number) => (x - 5.3) * (x - 5.32);
    expect(findBrackets(f, 0, 10, 1)).toHaveLength(0);
    // With a step below the root separation, both are found:
    expect(findBrackets(f, 0, 10, 0.005).length).toBe(2);
  });

  it('reports an exact zero landing on a sample point', () => {
    const brackets = findBrackets((x) => x - 2, 0, 4, 1);
    expect(brackets).toContainEqual({ lo: 2, hi: 2 });
  });

  it('validates its arguments instead of looping forever', () => {
    expect(() => findBrackets((x) => x, 0, 10, 0)).toThrow(RangeError);
    expect(() => findBrackets((x) => x, 0, 10, -1)).toThrow(RangeError);
    expect(() => findBrackets((x) => x, 10, 0, 1)).toThrow(RangeError);
  });
});

describe('findRoots — the retrograde multiple-pass case', () => {
  it('finds all three crossings of a retrograde loop', () => {
    // A transiting planet approaches an aspect, retrogrades back over it, then
    // moves forward over it again: three exact hits. A naive "first match"
    // search would report only the first.
    const f = (t: number) => (t - 10) * (t - 20) * (t - 30);
    const roots = findRoots(f, 0, 40, 1);
    expect(roots).toHaveLength(3);
    expect(roots[0]).toBeCloseTo(10, 9);
    expect(roots[1]).toBeCloseTo(20, 9);
    expect(roots[2]).toBeCloseTo(30, 9);
  });

  it('returns roots in ascending order', () => {
    const roots = findRoots(Math.sin, 0.1, 20, 0.4);
    for (let i = 1; i < roots.length; i++) {
      expect(roots[i]!).toBeGreaterThan(roots[i - 1]!);
    }
  });

  it('returns an empty array when there is genuinely no root', () => {
    expect(findRoots((x) => x * x + 1, -5, 5, 0.1)).toEqual([]);
  });
});
