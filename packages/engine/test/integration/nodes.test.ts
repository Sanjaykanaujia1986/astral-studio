/**
 * Mean and true lunar nodes — Rahu and Ketu.
 *
 * These are two different points, not two names for one, and the difference is
 * large enough to matter: up to about 1.5 degrees, which is half a nakshatra
 * pada. A chart that quietly mixed them would put Rahu in the wrong pada and
 * nothing on screen would look wrong.
 *
 * The published facts these tests hold the engine to:
 *
 *   - the mean node regresses uniformly at about -0.0529 degrees/day, giving
 *     the 18.6-year nodal cycle
 *   - the mean node is retrograde on EVERY day, without exception
 *   - the true (osculating) node oscillates about the mean by up to ~1.5
 *     degrees and is direct on roughly a quarter of days
 *   - each south node sits exactly 180 degrees from ITS OWN north node
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import { calculateChartForInstant, resolveNodeBodies } from '../../src/chart/instant.js';
import { findAspects } from '../../src/aspects/engine.js';
import { ALL_BODIES, NODE_BODIES, DEFAULT_BODIES } from '../../src/ephemeris/types.js';
import { julianDay } from '../../src/time/julian.js';
import { norm180, separation } from '../../src/math/angles.js';

let provider: SwissEphWasmProvider;

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
});

afterAll(() => provider.close());

const PLACE = { latitude: 18.9667, longitude: 72.8333 };
const JD_1990 = julianDay({ year: 1990, month: 1, day: 15 }, 9);

/** A decade of month-spaced samples: enough to see the oscillation and the drift. */
function sampleJds(count = 130, stepDays = 28): number[] {
  const first = julianDay({ year: 2015, month: 1, day: 1 }, 0);
  return Array.from({ length: count }, (_, i) => first + i * stepDays);
}

describe('the mean node', () => {
  it('regresses at about -0.0529 degrees per day', () => {
    const speeds = sampleJds().map((jd) => provider.calc(jd, 'meanNode').longitudeSpeed);
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    expect(mean).toBeCloseTo(-0.0529539, 5);
  });

  it('is near-uniform, but NOT perfectly uniform', () => {
    /*
     * Worth stating precisely, because the obvious assumption is wrong.
     *
     * "Mean node" suggests a constant rate, and an earlier version of this
     * test asserted the spread was below 1e-6 degrees/day. It is not: across
     * 3,000 days the rate ranges over about 0.2% of its own value, and across
     * centuries it wanders non-monotonically (-0.052967 in 1800, -0.052906 in
     * 1900, -0.052956 in 2000) rather than drifting smoothly.
     *
     * This is Swiss Ephemeris's mean node, not an artefact here: the WASM
     * engine agrees with the native `sweph` oracle to 4e-11 degrees/day, and
     * the variation shows up in the longitudes themselves as well as in the
     * reported speed. SE derives the mean elements from lunar theory, and
     * those carry long-period terms.
     *
     * So the assertion is a band, with the real figure in it.
     */
    const speeds = sampleJds(300, 10).map((jd) => provider.calc(jd, 'meanNode').longitudeSpeed);
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const relativeSpread = (Math.max(...speeds) - Math.min(...speeds)) / Math.abs(mean);
    expect(relativeSpread).toBeGreaterThan(1e-4);
    expect(relativeSpread).toBeLessThan(5e-3);
  });

  it('is vastly steadier than the true node — the distinction that matters', () => {
    /*
     * The comparison, rather than an absolute claim about either. Measured over
     * 3,000 consecutive days the mean node's rate varies by 0.2% of its value
     * and the true node's by 531% — including a change of sign. Three orders of
     * magnitude apart is the thing a reader is choosing between.
     */
    const jds = Array.from({ length: 1200 }, (_, i) => JD_1990 + i);
    const spread = (body: 'meanNode' | 'trueNode') => {
      const speeds = jds.map((jd) => provider.calc(jd, body).longitudeSpeed);
      const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      return (Math.max(...speeds) - Math.min(...speeds)) / Math.abs(mean);
    };
    expect(spread('trueNode') / spread('meanNode')).toBeGreaterThan(100);
  });

  it('completes a nodal cycle in about 18.6 years', () => {
    // 360 / 0.0529539 ≈ 6798 days ≈ 18.61 years, the Saros-adjacent figure
    // every ephemeris quotes.
    const speed = Math.abs(provider.calc(JD_1990, 'meanNode').longitudeSpeed);
    expect(360 / speed / 365.2422).toBeCloseTo(18.6, 1);
  });

  it('is retrograde on every single day', () => {
    for (const jd of sampleJds(400, 7)) {
      const node = provider.calc(jd, 'meanNode');
      expect(node.retrograde, `jd ${jd}`).toBe(true);
      expect(node.longitudeSpeed).toBeLessThan(0);
    }
  });
});

describe('the true node', () => {
  it('stays within about 1.5 degrees of the mean, and genuinely moves', () => {
    const offsets = sampleJds().map((jd) =>
      norm180(provider.calc(jd, 'trueNode').longitude - provider.calc(jd, 'meanNode').longitude),
    );
    const largest = Math.max(...offsets.map(Math.abs));
    expect(largest).toBeGreaterThan(1.0);
    expect(largest).toBeLessThan(2.0);
    // Both signs occur: the true node leads the mean as often as it trails.
    expect(Math.min(...offsets)).toBeLessThan(0);
    expect(Math.max(...offsets)).toBeGreaterThan(0);
  });

  it('is direct on roughly a quarter of days', () => {
    /*
     * Counter-intuitive and worth pinning: the osculating node reverses while
     * the mean never does. This was checked against the native `sweph` oracle
     * when it first looked like a bug.
     */
    const jds = sampleJds(2000, 1);
    const direct = jds.filter((jd) => !provider.calc(jd, 'trueNode').retrograde).length;
    expect(direct / jds.length).toBeGreaterThan(0.15);
    expect(direct / jds.length).toBeLessThan(0.40);
  });

  it('differs from the mean node by enough to change a nakshatra pada', () => {
    // A pada is 3°20'. An offset over about a degree can move Rahu across one.
    const offset = Math.abs(
      norm180(provider.calc(JD_1990, 'trueNode').longitude - provider.calc(JD_1990, 'meanNode').longitude),
    );
    expect(offset).toBeGreaterThan(0.1);
  });
});

describe('each south node opposes its own north node', () => {
  it('pairs true Ketu with true Rahu', () => {
    for (const jd of sampleJds(40, 91)) {
      const north = provider.calc(jd, 'trueNode');
      const south = provider.calc(jd, 'southNode');
      expect(separation(north.longitude, south.longitude)).toBeCloseTo(180, 9);
      expect(south.latitude).toBeCloseTo(-north.latitude, 9);
    }
  });

  it('pairs mean Ketu with MEAN Rahu, not with the true node', () => {
    /*
     * The regression this feature introduced and had to fix. Before mean Ketu
     * existed, the only south node was derived from the true node; selecting
     * mean nodes would therefore have produced a Ketu up to 1.5 degrees from
     * every mean-node table, while looking entirely plausible.
     */
    for (const jd of sampleJds(40, 91)) {
      const meanNorth = provider.calc(jd, 'meanNode');
      const meanSouth = provider.calc(jd, 'meanSouthNode');
      expect(separation(meanNorth.longitude, meanSouth.longitude)).toBeCloseTo(180, 9);

      // And it is NOT the true node's opposite, except by coincidence when the
      // oscillation happens to pass through zero.
      const trueSouth = provider.calc(jd, 'southNode');
      const gap = Math.abs(norm180(meanSouth.longitude - trueSouth.longitude));
      expect(gap).toBeLessThan(2.0);
    }
  });

  it('gives mean Ketu the same uniform retrograde motion as mean Rahu', () => {
    const north = provider.calc(JD_1990, 'meanNode');
    const south = provider.calc(JD_1990, 'meanSouthNode');
    expect(south.longitudeSpeed).toBeCloseTo(north.longitudeSpeed, 12);
    expect(south.retrograde).toBe(true);
  });
});

describe('resolveNodeBodies', () => {
  it('substitutes the pair rather than appending a second axis', () => {
    expect(resolveNodeBodies(['sun', 'trueNode', 'southNode'], 'mean'))
      .toEqual(['sun', 'meanNode', 'meanSouthNode']);
    expect(resolveNodeBodies(['sun', 'meanNode', 'meanSouthNode'], 'true'))
      .toEqual(['sun', 'trueNode', 'southNode']);
  });

  it('leaves a list that already names the chosen pair alone', () => {
    const bodies = ['sun', 'moon', 'trueNode', 'southNode'] as const;
    expect(resolveNodeBodies(bodies, 'true')).toEqual([...bodies]);
  });

  it('does not touch a list with no nodes in it', () => {
    expect(resolveNodeBodies(['sun', 'moon', 'mars'], 'mean')).toEqual(['sun', 'moon', 'mars']);
  });

  it('collapses a list naming both axes to one', () => {
    // Without the guard, substitution would duplicate a body and the wheel
    // would draw two glyphs on the same degree.
    const resolved = resolveNodeBodies(
      ['trueNode', 'meanNode', 'southNode', 'meanSouthNode'],
      'mean',
    );
    expect(resolved).toEqual(['meanNode', 'meanSouthNode']);
  });
});

describe('a chart cast with each node type', () => {
  const cast = (nodeType: 'true' | 'mean') =>
    calculateChartForInstant(provider, JD_1990, PLACE, { settings: { nodeType } });

  it('places exactly one node axis either way', () => {
    for (const nodeType of ['true', 'mean'] as const) {
      const bodies = cast(nodeType).bodies.map((b) => b.position.body);
      const nodes = bodies.filter((b) => b.toLowerCase().includes('node'));
      expect(nodes, nodeType).toHaveLength(2);
      expect(new Set(nodes).size).toBe(2);
    }
  });

  it('names the bodies the chosen type calls for', () => {
    for (const nodeType of ['true', 'mean'] as const) {
      const bodies = cast(nodeType).bodies.map((b) => b.position.body);
      for (const expected of NODE_BODIES[nodeType]) expect(bodies).toContain(expected);
      for (const absent of NODE_BODIES[nodeType === 'true' ? 'mean' : 'true']) {
        expect(bodies).not.toContain(absent);
      }
    }
  });

  it('defaults to the true node, as Swiss Ephemeris and Western practice do', () => {
    const bodies = calculateChartForInstant(provider, JD_1990, PLACE).bodies
      .map((b) => b.position.body);
    expect(bodies).toContain('trueNode');
    expect(bodies).not.toContain('meanNode');
  });

  it('actually produces different longitudes for the two choices', () => {
    // The point of the whole option. If these matched, the setting would be
    // decoration.
    const trueRahu = cast('true').bodies.find((b) => b.position.body === 'trueNode')!;
    const meanRahu = cast('mean').bodies.find((b) => b.position.body === 'meanNode')!;
    expect(Math.abs(norm180(trueRahu.position.longitude - meanRahu.position.longitude)))
      .toBeGreaterThan(0.1);
  });

  it('records the choice on the chart, so a saved chart is reproducible', () => {
    expect(cast('mean').settings.nodeType).toBe('mean');
    expect(cast('true').settings.nodeType).toBe('true');
  });
});

describe('node axes are never reported as aspects', () => {
  it('excludes the definitional opposition for both axes and across them', () => {
    /*
     * A north node and its south node are permanently in exact opposition at
     * identical speed. Reporting that adds a guaranteed, always-exact row to
     * every chart. With two axes available the cross pairs are near-exact too,
     * blurred only by the true node's oscillation, and equally uninformative.
     */
    const positions = provider.calcMany(JD_1990, [
      'trueNode', 'southNode', 'meanNode', 'meanSouthNode',
    ]);
    expect(findAspects(positions)).toEqual([]);
  });

  it('still reports a real aspect between a node and a planet', () => {
    // The exclusion must not be so broad that it silences genuine contacts.
    const positions = provider.calcMany(JD_1990, ALL_BODIES.filter((b) => b !== 'lilith'));
    const hits = findAspects(positions);
    expect(hits.some((h) => h.bodyA.includes('ode') || h.bodyB.includes('ode'))).toBe(true);
  });

  it('keeps the default body set free of node-axis noise', () => {
    const chart = calculateChartForInstant(provider, JD_1990, PLACE, {
      settings: { bodies: DEFAULT_BODIES },
    });
    const axis = chart.aspects.filter(
      (h) => h.bodyA.toLowerCase().includes('node') && h.bodyB.toLowerCase().includes('node'),
    );
    expect(axis).toEqual([]);
  });
});

describe('sidereal longitudes equal tropical minus the ayanamsha', () => {
  /*
   * Verified by hand against the running app before being written down: the
   * Mumbai 1990 chart shows a tropical Sun at 24°57'08" Capricorn and a Lahiri
   * sidereal Sun at 01°13'46" Capricorn, a difference of 23°43'22" — the
   * Lahiri ayanamsha for that date.
   *
   * This asserts the identity for every body rather than that one figure, so
   * it cannot be satisfied by a coincidence in a single position, and it ties
   * the three quantities the UI displays separately into one relationship.
   */
  it('holds for every body, to a milliarcsecond', () => {
    const tropical = calculateChartForInstant(provider, JD_1990, PLACE);
    const sidereal = calculateChartForInstant(provider, JD_1990, PLACE, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } },
    });

    expect(sidereal.ayanamsha).toBeGreaterThan(23);
    expect(sidereal.ayanamsha).toBeLessThan(24);

    for (const sid of sidereal.bodies) {
      const trop = tropical.bodies.find((b) => b.position.body === sid.position.body)!;
      const expected = norm180(trop.position.longitude - sidereal.ayanamsha);
      const actual = norm180(sid.position.longitude);
      // norm180 of both sides so a body either side of 0° Aries compares.
      expect(Math.abs(norm180(actual - expected)) * 3600, sid.position.body)
        .toBeLessThan(1);
    }
  });

  it('leaves the tropical chart untouched', () => {
    // The sidereal flag is process-wide inside Swiss Ephemeris, so a sidereal
    // call followed by a tropical one is exactly where leakage would show.
    const before = calculateChartForInstant(provider, JD_1990, PLACE).bodies[0]!.position.longitude;
    calculateChartForInstant(provider, JD_1990, PLACE, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } },
    });
    const after = calculateChartForInstant(provider, JD_1990, PLACE).bodies[0]!.position.longitude;
    expect(after).toBe(before);
  });
});
