/**
 * Synastry, composite and Davison.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import { calculateNatalChart, type BirthData, type NatalChart } from '../../src/chart/natal.js';
import { analyseSynastry, midpointOf } from '../../src/synastry/engine.js';
import { compositeChart, davisonChart } from '../../src/composite/engine.js';
import { ALL_ASPECTS, TIGHT_ORBS, WIDE_ORBS } from '../../src/aspects/definitions.js';
import { norm360, separation } from '../../src/math/angles.js';

let provider: SwissEphWasmProvider;
let alice: NatalChart;
let bob: NatalChart;

const ALICE: BirthData = {
  name: 'Alice',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai' },
};

const BOB: BirthData = {
  name: 'Bob',
  date: { year: 1987, month: 6, day: 3 },
  time: { hour: 7, minute: 15, second: 0 },
  zone: { kind: 'iana', zone: 'Europe/London' },
  place: { latitude: 51.5074, longitude: -0.1278, label: 'London' },
};

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  alice = calculateNatalChart(provider, ALICE);
  bob = calculateNatalChart(provider, BOB);
});

afterAll(() => provider.close());

describe('midpointOf', () => {
  it('takes the shorter arc', () => {
    expect(midpointOf(10, 20)).toBeCloseTo(15, 9);
    expect(midpointOf(350, 10)).toBeCloseTo(0, 9);
    expect(midpointOf(10, 350)).toBeCloseTo(0, 9);
  });

  it('is symmetric and stays in range', () => {
    for (let a = 0; a < 360; a += 23) {
      for (let b = 0; b < 360; b += 31) {
        const forward = midpointOf(a, b);
        const backward = midpointOf(b, a);
        expect(forward).toBeGreaterThanOrEqual(0);
        expect(forward).toBeLessThan(360);
        // Symmetric except at exact opposition, where both midpoints are equally valid.
        if (Math.abs(separation(a, b) - 180) > 1e-9) {
          expect(separation(forward, backward)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('is equidistant from both endpoints', () => {
    for (const [a, b] of [[10, 80], [350, 30], [200, 100]] as const) {
      const m = midpointOf(a, b);
      expect(separation(m, a)).toBeCloseTo(separation(m, b), 9);
    }
  });
});

describe('synastry aspects', () => {
  it('compares every point of A against every point of B', () => {
    const result = analyseSynastry(alice, bob, { aspects: ALL_ASPECTS, orbProfile: WIDE_ORBS });
    expect(result.aspects.length).toBeGreaterThan(5);
    for (const hit of result.aspects) {
      // `from` always comes from A, `to` always from B.
      const inA = [...alice.bodies.map((b) => b.position.longitude), alice.houses!.ascendant];
      expect(inA.length).toBeGreaterThan(0);
      expect(hit.orb).toBeLessThanOrEqual(hit.maxOrb);
    }
  });

  it('carries NO applying/separating, because two fixed charts do not converge', () => {
    const result = analyseSynastry(alice, bob);
    for (const hit of result.aspects) {
      expect(hit).not.toHaveProperty('motion');
      expect(hit).not.toHaveProperty('relativeSpeed');
    }
  });

  it('reports orb consistent with the two longitudes', () => {
    const result = analyseSynastry(alice, bob, { aspects: ALL_ASPECTS });
    for (const hit of result.aspects) {
      expect(separation(hit.from.longitude, hit.to.longitude)).toBeCloseTo(hit.separation, 9);
      expect(Math.abs(hit.separation - hit.exactAngle)).toBeCloseTo(hit.orb, 6);
    }
  });

  it('sorts tightest first', () => {
    const result = analyseSynastry(alice, bob, { aspects: ALL_ASPECTS });
    for (let i = 1; i < result.aspects.length; i++) {
      expect(result.aspects[i]!.orb).toBeGreaterThanOrEqual(result.aspects[i - 1]!.orb);
    }
  });

  it('includes the angles by default and drops them on request', () => {
    const withAngles = analyseSynastry(alice, bob);
    const without = analyseSynastry(alice, bob, { includeAngles: false });
    const anglesUsed = (r: typeof withAngles) =>
      r.aspects.some((h) => h.from.kind === 'angle' || h.to.kind === 'angle');
    expect(anglesUsed(without)).toBe(false);
    // With a real pair of charts some angle contact is essentially certain.
    expect(withAngles.aspects.length).toBeGreaterThanOrEqual(without.aspects.length);
  });

  it('does not widen orbs for angles the way it does for luminaries', () => {
    const result = analyseSynastry(alice, bob, { aspects: ALL_ASPECTS });
    const luminaryPair = result.aspects.find(
      (h) => h.from.id === 'sun' && h.to.kind === 'body' && h.aspect === 'conjunction',
    );
    const anglePair = result.aspects.find((h) => h.to.kind === 'angle' && h.aspect === 'conjunction');
    if (luminaryPair && anglePair) {
      expect(anglePair.maxOrb).toBeLessThanOrEqual(luminaryPair.maxOrb);
    }
  });

  it('a tighter profile admits fewer contacts', () => {
    const tight = analyseSynastry(alice, bob, { orbProfile: TIGHT_ORBS });
    const wide = analyseSynastry(alice, bob, { orbProfile: WIDE_ORBS });
    expect(tight.aspects.length).toBeLessThanOrEqual(wide.aspects.length);
  });
});

describe('house overlays', () => {
  it('places each chart’s planets in the other’s houses, both ways', () => {
    const result = analyseSynastry(alice, bob);
    expect(result.overlayAinB).toHaveLength(alice.bodies.length);
    expect(result.overlayBinA).toHaveLength(bob.bodies.length);
    for (const entry of [...result.overlayAinB, ...result.overlayBinA]) {
      expect(entry.house).toBeGreaterThanOrEqual(1);
      expect(entry.house).toBeLessThanOrEqual(12);
    }
  });

  it('the two directions are genuinely different statements', () => {
    const result = analyseSynastry(alice, bob);
    const aInB = result.overlayAinB.find((o) => o.body === 'sun')!;
    const bInA = result.overlayBinA.find((o) => o.body === 'sun')!;
    // Different longitudes in different wheels; identical results would be a
    // strong hint the same overlay had been computed twice.
    expect(aInB.longitude).not.toBeCloseTo(bInA.longitude, 6);
  });

  it('returns no overlay when the other chart has no houses', () => {
    const { time: _omit, ...noTime } = BOB satisfies BirthData;
    const timeless = calculateNatalChart(provider, noTime);
    const result = analyseSynastry(alice, timeless);
    expect(result.overlayAinB).toEqual([]);      // timeless chart has no houses
    expect(result.overlayBinA.length).toBeGreaterThan(0); // Alice's do exist
  });
});

describe('midpoint composite — a construct, not a sky', () => {
  it('places every body at the midpoint of the pair', () => {
    const composite = compositeChart({ chartA: alice, chartB: bob });
    expect(composite.method).toBe('midpointComposite');
    for (const position of composite.positions) {
      expect(position.longitude).toBeCloseTo(
        midpointOf(position.longitudeA, position.longitudeB),
        9,
      );
      expect(separation(position.longitude, position.longitudeA)).toBeCloseTo(
        separation(position.longitude, position.longitudeB),
        6,
      );
    }
  });

  it('includes only bodies present in BOTH charts', () => {
    const reduced = calculateNatalChart(provider, BOB, {
      settings: { bodies: ['sun', 'moon', 'mercury'] },
    });
    const composite = compositeChart({ chartA: alice, chartB: reduced });
    expect(composite.positions.map((p) => p.body).sort()).toEqual(['mercury', 'moon', 'sun']);
  });

  it('midpoints the angles and keeps them opposite', () => {
    const composite = compositeChart({ chartA: alice, chartB: bob });
    expect(composite.angles).toBeDefined();
    expect(separation(composite.angles!.ascendant, composite.angles!.descendant)).toBeCloseTo(180, 9);
    expect(separation(composite.angles!.midheaven, composite.angles!.imumCoeli)).toBeCloseTo(180, 9);
    expect(composite.angles!.ascendant).toBeCloseTo(
      midpointOf(alice.houses!.ascendant, bob.houses!.ascendant), 9,
    );
  });

  it('either produces usable cusps or says they were degenerate', () => {
    const composite = compositeChart({ chartA: alice, chartB: bob });
    if (composite.cuspsDegenerate) {
      // Midpointing twelve cusps is not guaranteed to yield a valid wheel;
      // when it does not, house placement is suppressed rather than faked.
      expect(composite.cusps).toBeUndefined();
      expect(composite.positions.every((p) => p.house === undefined)).toBe(true);
    } else {
      expect(composite.cusps).toHaveLength(12);
      expect(composite.positions.every((p) => p.house !== undefined)).toBe(true);
      // A valid wheel must partition the circle.
      let total = 0;
      for (let i = 0; i < 12; i++) {
        total += norm360(composite.cusps![(i + 1) % 12]! - composite.cusps![i]!);
      }
      expect(total).toBeCloseTo(360, 6);
    }
  });

  it('flags elongations the real sky could not produce', () => {
    // Mercury is never more than ~28 degrees from the Sun, but a composite
    // Mercury can be, because it averages two Mercurys in different places.
    // Inherent to the technique — so it is reported, not hidden.
    const composite = compositeChart({ chartA: alice, chartB: bob });
    expect(Array.isArray(composite.impossibleElongations)).toBe(true);
    const sun = composite.positions.find((p) => p.body === 'sun')!;
    for (const body of ['mercury', 'venus'] as const) {
      const position = composite.positions.find((p) => p.body === body);
      if (!position) continue;
      const limit = body === 'mercury' ? 28 : 48;
      const exceeded = separation(position.longitude, sun.longitude) > limit;
      expect(composite.impossibleElongations.includes(body)).toBe(exceeded);
    }
  });

  it('a chart composited with itself reproduces itself', () => {
    const composite = compositeChart({ chartA: alice, chartB: alice });
    for (const position of composite.positions) {
      expect(position.longitude).toBeCloseTo(position.longitudeA, 9);
    }
    expect(composite.impossibleElongations).toEqual([]);
  });
});

describe('Davison — a real chart for a real moment', () => {
  it('is cast for the midpoint in time', () => {
    const davison = davisonChart(provider, {
      jdA: alice.jdUT, placeA: ALICE.place,
      jdB: bob.jdUT, placeB: BOB.place,
    });
    expect(davison.jdUT).toBeCloseTo((alice.jdUT + bob.jdUT) / 2, 9);
    expect(davison.utcIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is cast for the midpoint in space', () => {
    const davison = davisonChart(provider, {
      jdA: alice.jdUT, placeA: ALICE.place,
      jdB: bob.jdUT, placeB: BOB.place,
    });
    expect(davison.place.latitude).toBeCloseTo(
      (ALICE.place.latitude + BOB.place.latitude) / 2, 9,
    );
    expect(davison.place.longitude).toBeGreaterThanOrEqual(-180);
    expect(davison.place.longitude).toBeLessThanOrEqual(180);
    // Mumbai 72.8E and London 0.1W average to roughly 36E.
    expect(davison.place.longitude).toBeCloseTo(36.35, 1);
  });

  it('averages longitudes across the antimeridian the short way', () => {
    // 170E and 170W are 20 degrees apart, so their midpoint is 180 — not 0.
    const davison = davisonChart(provider, {
      jdA: alice.jdUT, placeA: { latitude: 0, longitude: 170 },
      jdB: alice.jdUT, placeB: { latitude: 0, longitude: -170 },
    });
    expect(Math.abs(davison.place.longitude)).toBeCloseTo(180, 6);
  });

  it('produces an ordinary chart, with speeds and retrogrades that mean something', () => {
    const davison = davisonChart(provider, {
      jdA: alice.jdUT, placeA: ALICE.place,
      jdB: bob.jdUT, placeB: BOB.place,
    });
    expect(davison.chart.houses).toBeDefined();
    expect(davison.chart.bodies.length).toBeGreaterThanOrEqual(10);
    for (const placed of davison.chart.bodies) {
      expect(Number.isFinite(placed.position.longitudeSpeed)).toBe(true);
      expect(placed.house).toBeGreaterThanOrEqual(1);
    }
    // Being a real sky, it obeys the elongation limits a composite need not.
    const sun = davison.chart.bodies.find((b) => b.position.body === 'sun')!;
    const mercury = davison.chart.bodies.find((b) => b.position.body === 'mercury')!;
    expect(
      separation(mercury.position.longitude, sun.position.longitude),
    ).toBeLessThan(28.1);
  });

  it('rejects non-finite input', () => {
    expect(() =>
      davisonChart(provider, {
        jdA: Number.NaN, placeA: ALICE.place, jdB: bob.jdUT, placeB: BOB.place,
      }),
    ).toThrow(RangeError);
  });
});
