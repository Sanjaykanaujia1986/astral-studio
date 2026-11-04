import { describe, it, expect } from 'vitest';
import {
  norm360, norm180, signedDelta, separation, midpoint, unwrap, splitSign, toDms,
} from '../../src/math/angles.js';

describe('norm360', () => {
  it('leaves values already in range untouched', () => {
    expect(norm360(0)).toBe(0);
    expect(norm360(359.999)).toBeCloseTo(359.999, 10);
  });

  it('wraps negatives — the case a bare % 360 gets wrong', () => {
    expect(norm360(-1)).toBe(359);
    expect(norm360(-180)).toBe(180);
    expect(norm360(-359)).toBe(1);
    expect(norm360(-360)).toBe(0);
    expect(norm360(-721)).toBe(359);
  });

  it('wraps multiple positive turns', () => {
    expect(norm360(360)).toBe(0);
    expect(norm360(720)).toBe(0);
    expect(norm360(725)).toBe(5);
  });

  it('collapses negative zero, so equality checks behave', () => {
    expect(Object.is(norm360(-0), 0)).toBe(true);
    expect(Object.is(norm360(-360), 0)).toBe(true);
  });

  it('rejects non-finite input rather than propagating NaN', () => {
    expect(() => norm360(NaN)).toThrow(RangeError);
    expect(() => norm360(Infinity)).toThrow(RangeError);
  });
});

describe('norm180', () => {
  it('maps onto (-180, 180]', () => {
    expect(norm180(0)).toBe(0);
    expect(norm180(180)).toBe(180);
    expect(norm180(180.5)).toBeCloseTo(-179.5, 10);
    expect(norm180(270)).toBe(-90);
    expect(norm180(-270)).toBe(90);
  });

  it('keeps 180 positive at the boundary (half-open convention)', () => {
    expect(norm180(-180)).toBe(180);
    expect(norm180(540)).toBe(180);
  });
});

describe('signedDelta / separation across the 0/360 boundary', () => {
  it('takes the short arc, not the long way round', () => {
    // 1° past Aries vs 1° before it: 2° apart, not 358°
    expect(signedDelta(1, 359)).toBeCloseTo(2, 10);
    expect(signedDelta(359, 1)).toBeCloseTo(-2, 10);
    expect(separation(1, 359)).toBeCloseTo(2, 10);
    expect(separation(359, 1)).toBeCloseTo(2, 10);
  });

  it('is symmetric in magnitude and antisymmetric in sign', () => {
    // 180 deliberately excluded — see the degenerate-opposition test below.
    for (const [a, b] of [[10, 50], [350, 5], [123.456, 300.1]] as const) {
      expect(separation(a, b)).toBeCloseTo(separation(b, a), 12);
      expect(signedDelta(a, b)).toBeCloseTo(-signedDelta(b, a), 12);
    }
  });

  it('DEGENERATE CASE: at exactly 180 the sign carries no direction', () => {
    // The (-180, 180] convention maps -180 onto +180, so both orderings give
    // +180 and antisymmetry does not hold. This is a property of the exact
    // opposition, not a defect: 180 clockwise and 180 counter-clockwise are
    // the same point, so there is no "shorter arc" to take a sign from.
    //
    // CONSEQUENCE FOR THE ASPECT ENGINE: applying/separating at an exact
    // opposition must be decided by RELATIVE SPEED, never by the sign of the
    // delta. See src/aspects/.
    expect(signedDelta(0, 180)).toBe(180);
    expect(signedDelta(180, 0)).toBe(180);
    expect(separation(0, 180)).toBe(180);
    expect(separation(180, 0)).toBe(180);
  });

  it('caps separation at 180', () => {
    expect(separation(0, 180)).toBe(180);
    expect(separation(0, 181)).toBeCloseTo(179, 10);
  });
});

describe('midpoint', () => {
  it('bisects the short arc, including across 0°', () => {
    expect(midpoint(10, 20)).toBeCloseTo(15, 10);
    expect(midpoint(350, 10)).toBeCloseTo(0, 10);
    expect(midpoint(10, 350)).toBeCloseTo(0, 10);
  });

  it('stays inside [0, 360)', () => {
    for (let a = 0; a < 360; a += 37) {
      for (let b = 0; b < 360; b += 53) {
        const m = midpoint(a, b);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThan(360);
      }
    }
  });
});

describe('unwrap', () => {
  it('removes the saw-tooth so a root finder sees a smooth function', () => {
    const wrapped = [358, 359, 0, 1, 2];
    expect(unwrap(wrapped)).toEqual([358, 359, 360, 361, 362]);
  });

  it('handles decreasing (retrograde) series', () => {
    const wrapped = [2, 1, 0, 359, 358];
    expect(unwrap(wrapped)).toEqual([2, 1, 0, -1, -2]);
  });

  it('is a no-op for a series that never wraps', () => {
    expect(unwrap([10, 20, 30])).toEqual([10, 20, 30]);
  });

  it('returns an empty array unchanged', () => {
    expect(unwrap([])).toEqual([]);
  });
});

describe('splitSign', () => {
  it('maps longitudes onto sign index and degrees within sign', () => {
    expect(splitSign(0)).toEqual({ sign: 0, degreesInSign: 0 });        // 0 Aries
    expect(splitSign(29.99)).toMatchObject({ sign: 0 });                 // late Aries
    expect(splitSign(30)).toEqual({ sign: 1, degreesInSign: 0 });        // 0 Taurus
    expect(splitSign(359.5)).toMatchObject({ sign: 11 });                // late Pisces
  });

  it('never returns sign 12 at the wrap point', () => {
    expect(splitSign(360).sign).toBe(0);
    expect(splitSign(-0.0001).sign).toBe(11);
  });
});

describe('toDms', () => {
  it('splits decimal degrees for display', () => {
    const { d, m, s } = toDms(15.5);
    expect(d).toBe(15);
    expect(m).toBe(30);
    expect(s).toBeCloseTo(0, 6);
  });

  it('records sign separately rather than negating components', () => {
    const dms = toDms(-3.25);
    expect(dms.negative).toBe(true);
    expect(dms.d).toBe(3);
    expect(dms.m).toBe(15);
  });
});
