import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  SwissEphWasmProvider,
  calculateNatalChart,
  ALL_ASPECTS,
  type BirthData,
  type NatalChart,
} from '@astro/engine';
import { chartFacts } from '../src/index.js';

let provider: SwissEphWasmProvider;
let chart: NatalChart;
let timeless: NatalChart;

const SUBJECT: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  chart = calculateNatalChart(provider, SUBJECT, { settings: { aspects: ALL_ASPECTS } });
  // Omit the key entirely rather than setting it undefined: under
  // exactOptionalPropertyTypes those are different types, and "no birth time"
  // means the field is absent, not present-and-empty.
  const { time: _time, ...withoutTime } = SUBJECT;
  timeless = calculateNatalChart(
    provider,
    withoutTime,
    { settings: { aspects: ALL_ASPECTS } },
  );
});

afterAll(() => provider.close());

describe('the chart fact sheet', () => {
  it('survives a JSON round trip unchanged', () => {
    // This payload exists to be handed to something else — a file, a request
    // body, a worker. Anything that does not survive serialisation (a Date, a
    // class instance, an undefined in an array) is a defect here.
    const facts = chartFacts(chart);
    expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
  });

  it('is versioned so a consumer can refuse a payload it does not understand', () => {
    expect(chartFacts(chart).schema).toBe('astro.chart-facts/1');
  });

  it('reports exactly the positions the chart holds, and no others', () => {
    const facts = chartFacts(chart);
    expect(facts.positions).toHaveLength(chart.bodies.length);
    for (const position of facts.positions) {
      const placed = chart.bodies.find((b) => b.position.body === position.body)!;
      expect(placed).toBeDefined();
      expect(position.longitude).toBeCloseTo(placed.position.longitude, 6);
      expect(position.sign).toBe(placed.sign.sign);
      expect(position.retrograde).toBe(placed.position.retrograde);
    }
  });

  it('carries the ephemeris provenance with the numbers', () => {
    // A consumer must not be able to present a Moshier chart as sub-arcsecond
    // because the source was left behind in the object it came from.
    const facts = chartFacts(chart);
    expect(facts.provenance.ephemeris).toBe(chart.precision.source);
    expect(facts.provenance.warnings).toEqual(chart.precision.warnings.map((w) => w.code));
  });

  it('distinguishes "separating" from "direction unknown"', () => {
    const facts = chartFacts(chart);
    for (const aspect of facts.aspects) {
      const hit = chart.aspects.find(
        (h) => h.bodyA === aspect.bodyA && h.bodyB === aspect.bodyB && h.aspect === aspect.aspect,
      )!;
      if (hit.motion === 'applying') expect(aspect.applying).toBe(true);
      else if (hit.motion === 'separating') expect(aspect.applying).toBe(false);
      else expect(aspect.applying).toBeNull();
    }
  });

  it('omits angles and emphasis when the birth time is unknown', () => {
    const facts = chartFacts(timeless);
    expect(facts.angles).toBeUndefined();
    expect(facts.hemispheres).toBeUndefined();
    expect(facts.quadrants).toBeUndefined();
    // Positions do not depend on houses, so they are still there.
    expect(facts.positions.length).toBeGreaterThan(0);
  });

  it('records the zodiac actually used', () => {
    expect(chartFacts(chart).zodiac).toBe('tropical');
    const sidereal = calculateNatalChart(provider, SUBJECT, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } },
    });
    const facts = chartFacts(sidereal);
    expect(facts.zodiac).toBe('sidereal:lahiri');
    // And the ayanamsha that produced the shift travels with it, so the
    // positions can be checked rather than taken on trust.
    expect(facts.ayanamshaDegrees).toBeGreaterThan(20);
    expect(facts.ayanamshaDegrees).toBeLessThan(30);
  });

  it('rounds no coarser than a milliarcsecond', () => {
    // Rounding is for readability of the payload, not a precision claim. A
    // milliarcsecond is far finer than anything the report asserts.
    const facts = chartFacts(chart);
    for (const position of facts.positions) {
      const placed = chart.bodies.find((b) => b.position.body === position.body)!;
      const errorArcsec = Math.abs(position.longitude - placed.position.longitude) * 3600;
      expect(errorArcsec).toBeLessThan(0.001);
    }
  });
});
