import { describe, it, expect } from 'vitest';
import {
  angleToLongitude,
  createLayout,
  DEFAULT_RINGS,
  generateTicks,
  longitudeToAngle,
  pointAt,
  pointForLongitude,
  radiusOf,
  resolveCollisions,
  textAnchorFor,
} from '../src/chart-wheel/geometry.js';

const ASC = 61.8875; // from the verified Mumbai demo chart
const layout = createLayout(800, ASC);

/** Shortest absolute angular distance, for assertions. */
function apart(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

describe('wheel orientation', () => {
  it('puts the Ascendant due LEFT', () => {
    expect(longitudeToAngle(ASC, ASC)).toBeCloseTo(180, 9);
    const p = pointForLongitude(layout, layout.outerRadius, ASC);
    expect(p.x).toBeCloseTo(layout.cx - layout.outerRadius, 6);
    expect(p.y).toBeCloseTo(layout.cy, 6);
  });

  it('puts the Descendant due RIGHT', () => {
    const p = pointForLongitude(layout, layout.outerRadius, ASC + 180);
    expect(p.x).toBeCloseTo(layout.cx + layout.outerRadius, 6);
    expect(p.y).toBeCloseTo(layout.cy, 6);
  });

  it('puts the IC at the BOTTOM (90 degrees after the ASC)', () => {
    // SVG y grows downward, so "bottom" means y > cy.
    const p = pointForLongitude(layout, layout.outerRadius, ASC + 90);
    expect(p.y).toBeGreaterThan(layout.cy);
    expect(p.x).toBeCloseTo(layout.cx, 6);
  });

  it('puts the MC at the TOP (270 degrees after the ASC)', () => {
    const p = pointForLongitude(layout, layout.outerRadius, ASC + 270);
    expect(p.y).toBeLessThan(layout.cy);
    expect(p.x).toBeCloseTo(layout.cx, 6);
  });

  it('runs longitude COUNTER-CLOCKWISE, as Western charts do', () => {
    // Moving forward in longitude from the ASC must descend toward the IC.
    const a = pointForLongitude(layout, layout.outerRadius, ASC + 10);
    const b = pointForLongitude(layout, layout.outerRadius, ASC + 20);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('round-trips longitude and screen angle', () => {
    for (let lon = 0; lon < 360; lon += 13) {
      expect(angleToLongitude(longitudeToAngle(lon, ASC), ASC)).toBeCloseTo(lon, 9);
    }
  });

  it('keeps every point on its circle', () => {
    const r = radiusOf(layout, 'planets');
    for (let lon = 0; lon < 360; lon += 7) {
      const p = pointForLongitude(layout, r, lon);
      const distance = Math.hypot(p.x - layout.cx, p.y - layout.cy);
      expect(distance).toBeCloseTo(r, 6);
    }
  });
});

describe('layout', () => {
  it('is resolution independent — ratios hold at any size', () => {
    for (const size of [320, 800, 2400]) {
      const l = createLayout(size, ASC);
      expect(radiusOf(l, 'planets') / l.outerRadius).toBeCloseTo(DEFAULT_RINGS.planets, 12);
      expect(l.cx).toBeCloseTo(size / 2, 12);
    }
  });

  it('orders the rings from outside in', () => {
    const order = ['zodiacOuter', 'zodiacInner', 'planets', 'degrees', 'houseNumbers', 'aspects'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(radiusOf(layout, order[i]!)).toBeLessThan(radiusOf(layout, order[i - 1]!));
    }
  });

  it('rejects a nonsensical size', () => {
    expect(() => createLayout(0, ASC)).toThrow(RangeError);
    expect(() => createLayout(-10, ASC)).toThrow(RangeError);
    expect(() => createLayout(Number.NaN, ASC)).toThrow(RangeError);
  });

  it('normalises the ascendant', () => {
    expect(createLayout(800, 400).ascendant).toBeCloseTo(40, 9);
    expect(createLayout(800, -10).ascendant).toBeCloseTo(350, 9);
  });
});

describe('pointAt', () => {
  it('places 0 degrees due east and 90 degrees due north', () => {
    const east = pointAt(layout, 100, 0);
    expect(east.x).toBeCloseTo(layout.cx + 100, 9);
    expect(east.y).toBeCloseTo(layout.cy, 9);

    const north = pointAt(layout, 100, 90);
    expect(north.x).toBeCloseTo(layout.cx, 9);
    expect(north.y).toBeCloseTo(layout.cy - 100, 9); // up = smaller y
  });
});

describe('collision resolution', () => {
  it('leaves well-separated glyphs exactly where they are', () => {
    const input = [0, 40, 80, 200, 300];
    expect(resolveCollisions(input, 8)).toEqual(input.map((x) => x));
  });

  it('separates a tight stellium to at least the minimum', () => {
    const input = [100, 100.5, 101, 101.2, 102];
    const out = resolveCollisions(input, 8);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(apart(sorted[i]!, sorted[i - 1]!)).toBeGreaterThanOrEqual(8 - 1e-6);
    }
  });

  it('preserves cyclic order', () => {
    const input = [100, 101, 102, 103];
    const out = resolveCollisions(input, 10);
    // Order in the output must match order in the input.
    expect(out[0]!).toBeLessThan(out[1]!);
    expect(out[1]!).toBeLessThan(out[2]!);
    expect(out[2]!).toBeLessThan(out[3]!);
  });

  it('keeps the cluster centred on where the bodies actually are', () => {
    const input = [100, 101, 102];
    const out = resolveCollisions(input, 10);
    const mean = out.reduce((a, b) => a + b, 0) / out.length;
    expect(mean).toBeCloseTo(101, 6);
  });

  it('handles a cluster straddling 0 degrees', () => {
    const input = [358, 359, 0, 1];
    const out = resolveCollisions(input, 6);
    for (const angle of out) {
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(360);
    }
    const sorted = [...out].sort((a, b) => a - b);
    // Every neighbouring pair, measured the short way, must clear the minimum.
    for (let i = 0; i < sorted.length; i++) {
      const next = sorted[(i + 1) % sorted.length]!;
      expect(apart(sorted[i]!, next)).toBeGreaterThanOrEqual(6 - 1e-6);
    }
  });

  it('merges two clusters that collide after being spread', () => {
    // Two tight groups 9 degrees apart; spreading each at 8 degrees pushes them
    // into one another, so the algorithm must re-cluster.
    const input = [100, 100.5, 109, 109.5];
    const out = resolveCollisions(input, 8);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(apart(sorted[i]!, sorted[i - 1]!)).toBeGreaterThanOrEqual(8 - 1e-6);
    }
  });

  it('falls back to an even spread when the glyphs cannot possibly fit', () => {
    const input = Array.from({ length: 40 }, (_, i) => i * 0.1);
    const out = resolveCollisions(input, 15); // 40 * 15 = 600 > 360
    expect(out).toHaveLength(40);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(apart(sorted[i]!, sorted[i - 1]!)).toBeCloseTo(9, 6); // 360/40
    }
  });

  it('handles empty and single inputs', () => {
    expect(resolveCollisions([], 8)).toEqual([]);
    expect(resolveCollisions([123.4], 8)).toEqual([123.4]);
  });

  it('returns results aligned with the INPUT order, not sorted order', () => {
    // Deliberately unsorted input: out[i] must correspond to input[i].
    const input = [300, 10, 150];
    const out = resolveCollisions(input, 5);
    expect(out[0]).toBeCloseTo(300, 6);
    expect(out[1]).toBeCloseTo(10, 6);
    expect(out[2]).toBeCloseTo(150, 6);
  });
});

describe('collision resolution: properties hold for arbitrary input', () => {
  /** Deterministic PRNG so a failure is reproducible. */
  function makeRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  it('always satisfies the minimum separation and preserves cyclic order', () => {
    const random = makeRandom(20260824);

    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + Math.floor(random() * 12);
      const minSep = 2 + random() * 10;
      const input = Array.from({ length: n }, () => random() * 360);

      const out = resolveCollisions(input, minSep);
      expect(out).toHaveLength(n);

      for (const angle of out) {
        expect(angle, `trial ${trial}`).toBeGreaterThanOrEqual(0);
        expect(angle, `trial ${trial}`).toBeLessThan(360);
      }

      // Every neighbouring pair clears the minimum (when it is satisfiable).
      if (n * minSep < 360) {
        const sorted = [...out].sort((a, b) => a - b);
        for (let i = 0; i < sorted.length; i++) {
          const next = sorted[(i + 1) % sorted.length]!;
          expect(apart(sorted[i]!, next), `trial ${trial}, n=${n}, minSep=${minSep}`)
            .toBeGreaterThanOrEqual(minSep - 1e-9);
        }
      }
    }
  });

  it('never moves a glyph further than it has to', () => {
    // The pool-adjacent-violators fit is the minimum-displacement solution, so
    // no glyph should shift by more than the whole cluster width.
    const input = [100, 100.4, 100.8, 101.2, 101.6];
    const minSep = 7;
    const out = resolveCollisions(input, minSep);
    const maxWidth = (input.length - 1) * minSep;
    for (let i = 0; i < input.length; i++) {
      expect(apart(out[i]!, input[i]!)).toBeLessThanOrEqual(maxWidth / 2 + 1e-6);
    }
  });
});

describe('ticks', () => {
  it('marks every sign boundary as major', () => {
    const ticks = generateTicks(true);
    const majors = ticks.filter((t) => t.weight === 'major');
    expect(majors).toHaveLength(12);
    expect(majors.map((t) => t.longitude)).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
  });

  it('omits single-degree ticks when asked, for small renders', () => {
    expect(generateTicks(true)).toHaveLength(360);
    expect(generateTicks(false)).toHaveLength(36); // 12 major + 24 medium
  });
});

describe('text anchoring', () => {
  it('pushes labels outward on each side so they do not cross the wheel', () => {
    expect(textAnchorFor(0)).toBe('start');    // right side
    expect(textAnchorFor(180)).toBe('end');    // left side
    expect(textAnchorFor(90)).toBe('middle');  // top
    expect(textAnchorFor(270)).toBe('middle'); // bottom
  });
});
