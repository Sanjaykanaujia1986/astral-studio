import { describe, it, expect } from 'vitest';
import {
  chartShape,
  hemispheres,
  quadrants,
  SHAPE_BODIES,
} from '../../src/chart/shape.js';
import { signPosition } from '../../src/zodiac/signs.js';
import { norm360 } from '../../src/math/angles.js';
import type { PlacedBody } from '../../src/chart/instant.js';
import type { Body, HouseCusps } from '../../src/ephemeris/types.js';

/**
 * Synthetic placements, so each pattern boundary can be constructed exactly.
 * Shape classification depends only on longitude, which makes a hand-built set
 * a fair test of it — the ephemeris is not involved in the decision at all.
 */
function placed(body: Body, longitude: number, house?: number): PlacedBody {
  const lon = norm360(longitude);
  return {
    position: {
      body,
      longitude: lon,
      latitude: 0,
      distanceAu: 1,
      longitudeSpeed: 1,
      latitudeSpeed: 0,
      distanceSpeed: 0,
      retrograde: false,
      stationary: false,
      source: 'swiss',
    },
    sign: signPosition(lon),
    ...(house === undefined ? {} : { house }),
  };
}

/** The ten shape bodies spread across the given longitudes, in order. */
function spread(longitudes: readonly number[]): PlacedBody[] {
  return longitudes.map((longitude, i) => placed(SHAPE_BODIES[i]!, longitude));
}

/** Equal houses from a given ascendant, enough to exercise the counting. */
function equalHouses(ascendant: number): HouseCusps {
  return {
    cusps: Array.from({ length: 12 }, (_, i) => norm360(ascendant + i * 30)),
    ascendant: norm360(ascendant),
    midheaven: norm360(ascendant + 270),
    descendant: norm360(ascendant + 180),
    imumCoeli: norm360(ascendant + 90),
    armc: 0,
    vertex: 0,
    system: 'equal',
  };
}

describe('chartShape', () => {
  it('refuses to classify fewer than three bodies', () => {
    expect(chartShape(spread([0, 10]))).toBeUndefined();
  });

  it('ignores nodes, Chiron and Lilith', () => {
    // Nodes are exactly opposite by definition; if they counted, this bundle
    // would be split in half and read as something else entirely.
    const bodies = [
      ...spread([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]),
      placed('trueNode', 200),
      placed('southNode', 20),
      placed('chiron', 250),
    ];
    const shape = chartShape(bodies)!;
    expect(shape.name).toBe('bundle');
    expect(shape.bodies).toHaveLength(10);
    expect(shape.bodies).not.toContain('trueNode');
  });

  it('calls a tight group a bundle, even with a wide internal gap', () => {
    // Only three bodies, spanning 120 exactly, with two 60 degree gaps inside.
    const shape = chartShape(spread([0, 60, 120]))!;
    expect(shape.name).toBe('bundle');
    expect(shape.occupiedArc).toBeCloseTo(120, 9);
    expect(shape.largestGap).toBeCloseTo(240, 9);
  });

  it('places the bundle boundary at exactly 120 degrees', () => {
    expect(chartShape(spread([0, 30, 120]))!.name).toBe('bundle');
    // A hair wider and it is no longer inside a trine.
    expect(chartShape(spread([0, 30, 120.5]))!.name).not.toBe('bundle');
  });

  it('recognises a bowl and names the leading body', () => {
    // Ten bodies inside 180 degrees, starting at the Sun.
    const shape = chartShape(spread([0, 20, 40, 60, 80, 100, 120, 140, 160, 180]))!;
    expect(shape.name).toBe('bowl');
    expect(shape.occupiedArc).toBeCloseTo(180, 9);
    // The widest gap runs from Pluto at 180 back round to the Sun at 0.
    expect(shape.gapStart).toBeCloseTo(180, 9);
    expect(shape.leadingBody).toBe('sun');
  });

  it('recognises a locomotive by its empty trine', () => {
    const shape = chartShape(spread([0, 26, 52, 78, 104, 130, 156, 182, 208, 234]))!;
    expect(shape.name).toBe('locomotive');
    expect(shape.largestGap).toBeCloseTo(126, 9);
  });

  it('recognises a bucket and identifies the handle', () => {
    // Nine bodies inside a bowl, one alone across the circle.
    const shape = chartShape(spread([0, 15, 30, 45, 60, 75, 90, 105, 120, 250]))!;
    expect(shape.name).toBe('bucket');
    expect(shape.handle).toBe('pluto');
  });

  it('finds the handle when it sits at the start of the sorted order', () => {
    // Same chart, but the isolated body has the lowest longitude, so the two
    // wide gaps land at the ends of the array rather than in the middle. This
    // is the wrap case the index arithmetic has to get right.
    const shape = chartShape(spread([200, 215, 230, 245, 260, 275, 290, 305, 320, 90]))!;
    expect(shape.name).toBe('bucket');
    expect(shape.handle).toBe('pluto');
  });

  it('recognises a seesaw: two groups, neither of them a singleton', () => {
    const shape = chartShape(spread([0, 10, 20, 30, 40, 190, 200, 210, 220, 230]))!;
    expect(shape.name).toBe('seesaw');
    expect(shape.handle).toBeUndefined();
  });

  it('recognises a splash when nothing is more than 60 degrees from a neighbour', () => {
    const shape = chartShape(spread([0, 36, 72, 108, 144, 180, 216, 252, 288, 324]))!;
    expect(shape.name).toBe('splash');
    expect(shape.largestGap).toBeCloseTo(36, 9);
  });

  it('falls back to splay for an irregular spread', () => {
    // One wide gap, but too wide a total spread for a locomotive.
    const shape = chartShape(spread([0, 20, 40, 60, 130, 150, 170, 190, 260, 280]))!;
    expect(shape.name).toBe('splay');
  });

  it('is invariant under rotation of the whole chart', () => {
    // The pattern is a property of the spacing, not of where Aries happens to
    // fall, so rotating everything must not change the classification.
    const longitudes = [0, 15, 30, 45, 60, 75, 90, 105, 120, 250];
    const base = chartShape(spread(longitudes))!;
    for (const offset of [1, 47, 179, 200, 359]) {
      const rotated = chartShape(spread(longitudes.map((l) => l + offset)))!;
      expect(rotated.name).toBe(base.name);
      expect(rotated.handle).toBe(base.handle);
      expect(rotated.occupiedArc).toBeCloseTo(base.occupiedArc, 9);
      expect(rotated.leadingBody).toBe(base.leadingBody);
    }
  });

  it('gaps sum to a full circle', () => {
    const shape = chartShape(spread([0, 15, 30, 45, 60, 75, 90, 105, 120, 250]))!;
    expect(shape.occupiedArc + shape.largestGap).toBeCloseTo(360, 9);
  });
});

describe('hemispheres and quadrants', () => {
  it('return undefined without houses, rather than assuming an ascendant', () => {
    const bodies = spread([0, 30, 60]);
    expect(hemispheres(bodies, undefined)).toBeUndefined();
    expect(quadrants(bodies, undefined)).toBeUndefined();
  });

  it('split on the horizon and the meridian', () => {
    const houses = equalHouses(0);
    // One body in each house, 15 degrees into it.
    const bodies = Array.from({ length: 12 }, (_, i) =>
      placed(i < SHAPE_BODIES.length ? SHAPE_BODIES[i]! : 'chiron', i * 30 + 15, i + 1),
    );
    const split = hemispheres(bodies, houses)!;
    expect(split.belowHorizon).toBe(6);
    expect(split.aboveHorizon).toBe(6);
    expect(split.eastern).toBe(6);
    expect(split.western).toBe(6);
    expect(split.total).toBe(12);

    const quads = quadrants(bodies, houses)!;
    expect(quads.counts).toEqual([3, 3, 3, 3]);
  });

  it('derive the house when a placement does not carry one', () => {
    // A body with no house field must be located from the cusps, not skipped.
    const houses = equalHouses(100);
    const bodies = [placed('sun', 115)]; // 15 degrees past the ascendant: house 1
    expect(hemispheres(bodies, houses)!.eastern).toBe(1);
    expect(quadrants(bodies, houses)!.counts).toEqual([1, 0, 0, 0]);
  });

  it('count every body given, not only the shape ten', () => {
    // Emphasis is about weight of tenancy, so an included node counts. This is
    // the deliberate difference from chartShape, which excludes them.
    const houses = equalHouses(0);
    const bodies = [placed('sun', 15, 1), placed('trueNode', 15, 1)];
    expect(hemispheres(bodies, houses)!.total).toBe(2);
    expect(quadrants(bodies, houses)!.counts).toEqual([2, 0, 0, 0]);
  });
});
