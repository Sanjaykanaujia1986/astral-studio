import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  SwissEphWasmProvider,
  calculateNatalChart,
  ALL_ASPECTS,
  type BirthData,
  type NatalChart,
} from '@astro/engine';
import {
  interpretChart,
  sectionOf,
  catalogueCoverage,
  fill,
  EN_CATALOGUE,
  catalogueFor,
  INTERPRETATION_LOCALES,
  INTERPRETED_BODIES,
  SECTIONS,
} from '../src/index.js';
import type { Catalogue } from '../src/types.js';

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

describe('the English catalogue', () => {
  it('carries every key the composer can ask for', () => {
    const coverage = catalogueCoverage(EN_CATALOGUE);
    expect(coverage.missing).toEqual([]);
    expect(coverage.complete).toBe(true);
  });

  it('declares its provenance and review status', () => {
    // A reader is entitled to know where the words came from. An empty
    // provenance string would let unattributed text reach a printed report.
    expect(EN_CATALOGUE.provenance.length).toBeGreaterThan(40);
    expect(EN_CATALOGUE.reviewed).toBe(true);
    expect(EN_CATALOGUE.revision).toMatch(/^\d{4}-\d{2}-\d{2}\./);
  });

  it('has no unfilled placeholders left in any factor phrase', () => {
    // Placeholders belong in templates only. One that has drifted into a
    // phrase would print literal braces into a PDF.
    const groups = [
      EN_CATALOGUE.bodies, EN_CATALOGUE.signs, EN_CATALOGUE.houses,
      EN_CATALOGUE.aspects, EN_CATALOGUE.shapes, EN_CATALOGUE.elements,
      EN_CATALOGUE.modalities, EN_CATALOGUE.hemispheres,
    ];
    for (const group of groups) {
      for (const factor of Object.values(group)) {
        expect(factor.phrase).not.toMatch(/[{}]/);
        expect(factor.title).not.toMatch(/[{}]/);
        expect(factor.keywords.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('fill', () => {
  it('substitutes every placeholder', () => {
    expect(fill('{a} and {b}', { a: 'one', b: 'two' })).toBe('one and two');
  });

  it('throws rather than printing a placeholder the caller forgot', () => {
    expect(() => fill('{a} and {missing}', { a: 'one' })).toThrow(/unknown placeholder/);
  });
});

describe('interpreting a chart', () => {
  it('produces delineations in every section a timed chart supports', () => {
    const result = interpretChart(chart);
    expect(result.missing).toEqual([]);
    for (const section of SECTIONS) {
      expect(sectionOf(result, section).length, `section ${section}`).toBeGreaterThan(0);
    }
  });

  it('is deterministic — same chart, same output', () => {
    expect(interpretChart(chart)).toEqual(interpretChart(chart));
  });

  it('never emits an unfilled placeholder', () => {
    for (const d of interpretChart(chart).delineations) {
      expect(d.body, d.id).not.toMatch(/[{}]/);
      expect(d.title, d.id).not.toMatch(/[{}]/);
      expect(d.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('gives every delineation a unique, stable id', () => {
    const ids = interpretChart(chart).delineations.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('roots every delineation in a measured fact', () => {
    // The separation between calculation and interpretation is only real if
    // each sentence can be traced back to a number the engine produced.
    for (const d of interpretChart(chart).delineations) {
      expect(d.basis.kind, d.id).toBeTruthy();
      if (d.basis.kind === 'aspect') {
        expect(d.basis.bodies).toHaveLength(2);
        expect(d.basis.aspect).toBeTruthy();
        expect(d.basis.measure).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('quotes orbs that match the chart it was given', () => {
    const result = interpretChart(chart);
    for (const d of result.delineations) {
      if (d.basis.kind !== 'aspect') continue;
      const [a, b] = d.basis.bodies!;
      const hit = chart.aspects.find(
        (h) => h.bodyA === a && h.bodyB === b && h.aspect === d.basis.aspect,
      );
      expect(hit, d.id).toBeDefined();
      expect(d.basis.measure).toBeCloseTo(hit!.orb, 12);
    }
  });

  it('orders aspects by tightness, not by chart order', () => {
    const aspects = sectionOf(interpretChart(chart), 'aspects');
    for (let i = 1; i < aspects.length; i++) {
      expect(aspects[i - 1]!.weight).toBeGreaterThanOrEqual(aspects[i]!.weight);
    }
  });

  it('honours the aspect cap', () => {
    const result = interpretChart(chart, { maxAspects: 3 });
    expect(sectionOf(result, 'aspects')).toHaveLength(3);
  });

  it('interprets only the bodies the catalogue covers', () => {
    // Nodes are in the chart by default but have no catalogue entry, and must
    // not turn up as a missing-content report either — they are simply not
    // interpreted here.
    const result = interpretChart(chart);
    const bodies = result.delineations.flatMap((d) => d.basis.bodies ?? []);
    expect(bodies).not.toContain('trueNode');
    expect(bodies).not.toContain('southNode');
    expect(result.missing).toEqual([]);
  });
});

describe('a chart with no birth time', () => {
  it('omits everything that depends on houses rather than inventing an ascendant', () => {
    const result = interpretChart(timeless);
    expect(sectionOf(result, 'houses')).toHaveLength(0);
    expect(result.delineations.some((d) => d.basis.kind === 'angle')).toBe(false);
    expect(result.delineations.some((d) => d.basis.kind === 'hemisphere')).toBe(false);
    // The placements themselves survive: a sign does not need a birth time.
    expect(sectionOf(result, 'placements').length).toBeGreaterThan(0);
  });

  it('still reports no missing content — an absent fact is not a content gap', () => {
    expect(interpretChart(timeless).missing).toEqual([]);
  });
});

describe('an incomplete catalogue', () => {
  const { leo: _leo, ...signsWithoutLeo } = EN_CATALOGUE.signs;
  const { trine: _trine, ...aspectsWithoutTrine } = EN_CATALOGUE.aspects;
  const holed: Catalogue = {
    ...EN_CATALOGUE,
    signs: signsWithoutLeo,
    aspects: aspectsWithoutTrine,
  };

  it('is detected by the coverage check before it ships', () => {
    const coverage = catalogueCoverage(holed);
    expect(coverage.complete).toBe(false);
    expect(coverage.missing).toContainEqual({ group: 'signs', key: 'leo' });
    expect(coverage.missing).toContainEqual({ group: 'aspects', key: 'trine' });
  });

  it('reports the gap instead of printing an empty section', () => {
    const result = interpretChart(chart, { catalogue: holed });
    // Whatever the chart actually contains, the report must name what it could
    // not say. Silence here is the failure mode this exists to prevent.
    const asked = new Set(result.missing.map((m) => `${m.group}/${m.key}`));
    // Only placements the catalogue would actually be consulted for count.
    // A node sitting in Leo is never looked up, so its absence is not a gap.
    const interpreted = new Set(INTERPRETED_BODIES as readonly string[]);
    const usedLeo = chart.bodies.some(
      (b) => b.sign.sign === 'leo' && interpreted.has(b.position.body),
    );
    const usedTrine = chart.aspects.some(
      (a) => a.aspect === 'trine'
        && interpreted.has(a.bodyA) && interpreted.has(a.bodyB),
    );
    if (usedLeo) expect(asked.has('signs/leo')).toBe(true);
    if (usedTrine) expect(asked.has('aspects/trine')).toBe(true);
  });

  it('reports each gap once, however many times it was asked for', () => {
    const result = interpretChart(chart, { catalogue: holed });
    const keys = result.missing.map((m) => `${m.group}/${m.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the catalogue registry', () => {
  it('lists only languages that actually have content', () => {
    expect(INTERPRETATION_LOCALES).toEqual(['en']);
  });

  it('matches on the primary subtag', () => {
    expect(catalogueFor('en-IN')).toBe(EN_CATALOGUE);
    expect(catalogueFor('en')).toBe(EN_CATALOGUE);
  });

  it('returns undefined for a language with no catalogue, rather than English', () => {
    // The UI has to be able to tell the reader it is showing a fallback. If
    // this silently returned English, it could not.
    expect(catalogueFor('hi')).toBeUndefined();
    expect(catalogueFor('gu')).toBeUndefined();
  });
});
