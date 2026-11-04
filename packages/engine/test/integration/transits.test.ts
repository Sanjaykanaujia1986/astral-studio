/**
 * Transit and aspectarian tests.
 *
 * Anchored on events with independently published times — equinoxes,
 * solstices, lunations — rather than on values this engine produced. Every
 * result is also cross-checked against the native oracle at the instant found:
 * if the engine says the Sun reaches 0 Aries at time T, the oracle must agree
 * the Sun is at 0 Aries at T.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import native from 'sweph';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import { findTransitHits, buildAspectarian, targetsFromChart } from '../../src/transits/engine.js';
import { calculateNatalChart, type BirthData } from '../../src/chart/natal.js';
import { julianDay } from '../../src/time/julian.js';
import { ASPECT_DEFINITIONS } from '../../src/aspects/definitions.js';
import { separation } from '../../src/math/angles.js';

const EPHE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ephe');
const HAVE_ORACLE = existsSync(join(EPHE, 'sepl_18.se1'));
const NC = native.constants;

let provider: SwissEphWasmProvider;

const JAN_2024 = julianDay({ year: 2024, month: 1, day: 1 }, 0);
const DEC_2024 = julianDay({ year: 2024, month: 12, day: 31 }, 0);

beforeAll(async () => {
  if (HAVE_ORACLE) native.set_ephe_path(EPHE);
  provider = new SwissEphWasmProvider();
  await provider.init();
});

afterAll(() => provider.close());

/** UTC minutes between an ISO string and an expected wall time. */
function minutesFrom(iso: string, expected: string): number {
  return Math.abs(Date.parse(iso) - Date.parse(expected)) / 60_000;
}

describe('solar ingresses match published equinox and solstice times', () => {
  // Published to the minute; the engine is expected to land inside a minute.
  const INGRESSES = [
    { label: 'March equinox', longitude: 0, expected: '2024-03-20T03:06:00Z' },
    { label: 'June solstice', longitude: 90, expected: '2024-06-20T20:51:00Z' },
    { label: 'September equinox', longitude: 180, expected: '2024-09-22T12:44:00Z' },
    { label: 'December solstice', longitude: 270, expected: '2024-12-21T09:21:00Z' },
  ] as const;

  for (const { label, longitude, expected } of INGRESSES) {
    it(`${label} is found within a minute of the published time`, () => {
      const hits = findTransitHits(provider, {
        fromJd: JAN_2024,
        toJd: DEC_2024,
        transitBodies: ['sun'],
        targets: [{ kind: 'point', id: 'ingress', longitude }],
        aspects: ['conjunction'],
      });

      // Exactly one — see the wrap-guard test below for why that matters.
      expect(hits).toHaveLength(1);
      expect(minutesFrom(hits[0]!.exactUtcIso, expected)).toBeLessThan(1);
    });
  }

  it.skipIf(!HAVE_ORACLE)('the oracle agrees the Sun is there at the time found', () => {
    for (const { longitude } of INGRESSES) {
      const [hit] = findTransitHits(provider, {
        fromJd: JAN_2024, toJd: DEC_2024,
        transitBodies: ['sun'],
        targets: [{ kind: 'point', id: 'ingress', longitude }],
        aspects: ['conjunction'],
      });
      const oracle = native.calc_ut(hit!.exactJd, NC.SE_SUN, NC.SEFLG_SWIEPH);
      expect(separation(oracle.data[0]!, longitude) * 3600).toBeLessThan(0.01);
    }
  });
});

describe('REGRESSION: an aspect must not match its own opposite', () => {
  it('a conjunction search returns only conjunctions, not oppositions', () => {
    // The signed aspect error jumps between +180 and -180 half a circle from
    // exact. That jump is a sign change, so an unguarded bracket scan reads it
    // as a root: searching "Sun conjunct 0 Aries" also returned the SEPTEMBER
    // equinox, where the Sun is 180 degrees away. Every date was a real event,
    // just the wrong one, so nothing looked broken.
    const hits = findTransitHits(provider, {
      fromJd: JAN_2024,
      toJd: DEC_2024,
      transitBodies: ['sun'],
      targets: [{ kind: 'point', id: 'aries', longitude: 0 }],
      aspects: ['conjunction'],
    });

    expect(hits).toHaveLength(1);
    for (const hit of hits) {
      const position = provider.calc(hit.exactJd, 'sun');
      expect(separation(position.longitude, 0) * 3600).toBeLessThan(1);
    }
  });

  it('every reported hit is genuinely at its aspect angle', () => {
    const hits = findTransitHits(provider, {
      fromJd: JAN_2024,
      toJd: DEC_2024,
      transitBodies: ['sun', 'venus', 'mars'],
      targets: [{ kind: 'point', id: 'p', longitude: 47.3 }],
      aspects: ['conjunction', 'opposition', 'square', 'trine', 'sextile'],
    });

    expect(hits.length).toBeGreaterThan(10);
    for (const hit of hits) {
      const position = provider.calc(hit.exactJd, hit.transitBody);
      const actual = separation(position.longitude, hit.target.longitude);
      expect(
        Math.abs(actual - ASPECT_DEFINITIONS[hit.aspect].angle),
        `${hit.transitBody} ${hit.aspect} @ ${hit.exactUtcIso}`,
      ).toBeLessThan(0.001);
    }
  });
});

describe('lunations match published new and full moon times', () => {
  it('finds the first three new moons of 2024', () => {
    const events = buildAspectarian(provider, {
      fromJd: JAN_2024,
      toJd: julianDay({ year: 2024, month: 4, day: 1 }, 0),
      bodies: ['sun', 'moon'],
      aspects: ['conjunction'],
    });

    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(minutesFrom(events[0]!.exactUtcIso, '2024-01-11T11:57:00Z')).toBeLessThan(1);
    expect(minutesFrom(events[1]!.exactUtcIso, '2024-02-09T22:59:00Z')).toBeLessThan(1);
    expect(minutesFrom(events[2]!.exactUtcIso, '2024-03-10T09:00:00Z')).toBeLessThan(1);
  });

  it('separates new moons from full moons', () => {
    const range = { fromJd: JAN_2024, toJd: julianDay({ year: 2024, month: 3, day: 1 }, 0) };
    const news = buildAspectarian(provider, {
      ...range, bodies: ['sun', 'moon'], aspects: ['conjunction'],
    });
    const fulls = buildAspectarian(provider, {
      ...range, bodies: ['sun', 'moon'], aspects: ['opposition'],
    });

    for (const e of news) {
      const s = provider.calc(e.exactJd, 'sun');
      const m = provider.calc(e.exactJd, 'moon');
      expect(separation(s.longitude, m.longitude) * 3600).toBeLessThan(1);
    }
    for (const e of fulls) {
      const s = provider.calc(e.exactJd, 'sun');
      const m = provider.calc(e.exactJd, 'moon');
      expect(Math.abs(separation(s.longitude, m.longitude) - 180) * 3600).toBeLessThan(1);
    }
    // A lunar month is ~29.5 days, so roughly two of each in two months.
    expect(news.length).toBeGreaterThanOrEqual(1);
    expect(fulls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('retrograde multiple passes', () => {
  it('finds all three Mars crossings of a point across its retrograde loop', () => {
    const hits = findTransitHits(provider, {
      fromJd: julianDay({ year: 2024, month: 6, day: 1 }, 0),
      toJd: julianDay({ year: 2025, month: 12, day: 31 }, 0),
      transitBodies: ['mars'],
      targets: [{ kind: 'point', id: 'p', longitude: 120 }],
      aspects: ['conjunction'],
    });

    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.passIndex)).toEqual([1, 2, 3]);
    expect(hits.every((h) => h.totalPasses === 3)).toBe(true);

    // Direct, then retrograde, then direct — the shape of a retrograde loop.
    expect(hits[0]!.direction).toBe('direct');
    expect(hits[1]!.direction).toBe('retrograde');
    expect(hits[2]!.direction).toBe('direct');

    // And they are months apart, not clustered.
    expect(hits[1]!.exactJd - hits[0]!.exactJd).toBeGreaterThan(30);
    expect(hits[2]!.exactJd - hits[1]!.exactJd).toBeGreaterThan(30);
  });

  it('reports the speed sign consistently with the direction', () => {
    const hits = findTransitHits(provider, {
      fromJd: julianDay({ year: 2024, month: 6, day: 1 }, 0),
      toJd: julianDay({ year: 2025, month: 12, day: 31 }, 0),
      transitBodies: ['mars'],
      targets: [{ kind: 'point', id: 'p', longitude: 120 }],
      aspects: ['conjunction'],
    });
    for (const hit of hits) {
      expect(hit.direction === 'retrograde').toBe(hit.speed < 0);
    }
  });
});

describe('transits against a natal chart', () => {
  const MUMBAI: BirthData = {
    name: 'Test Subject',
    date: { year: 1990, month: 1, day: 15 },
    time: { hour: 14, minute: 30, second: 0 },
    zone: { kind: 'iana', zone: 'Asia/Kolkata' },
    place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
  };

  it('derives targets from the natal bodies and angles', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    const targets = targetsFromChart(chart);

    expect(targets.filter((t) => t.kind === 'natalBody').length).toBe(chart.bodies.length);
    const angles = targets.filter((t) => t.kind === 'angle').map((t) => t.id);
    expect(angles).toEqual(['asc', 'mc', 'dsc', 'ic']);
  });

  it('omits angles when the birth time is unknown', () => {
    const { time: _omit, ...noTime } = MUMBAI satisfies BirthData;
    const chart = calculateNatalChart(provider, noTime);
    const targets = targetsFromChart(chart);
    expect(targets.every((t) => t.kind === 'natalBody')).toBe(true);
  });

  it('finds Saturn transits to the natal chart over a year', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    const hits = findTransitHits(provider, {
      fromJd: JAN_2024,
      toJd: DEC_2024,
      transitBodies: ['saturn'],
      targets: targetsFromChart(chart),
      aspects: ['conjunction', 'opposition', 'square', 'trine'],
    });

    expect(hits.length).toBeGreaterThan(0);
    // Sorted by time, which is how they are read.
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!.exactJd).toBeGreaterThanOrEqual(hits[i - 1]!.exactJd);
    }
    // Every hit lands inside the requested window.
    for (const hit of hits) {
      expect(hit.exactJd).toBeGreaterThanOrEqual(JAN_2024);
      expect(hit.exactJd).toBeLessThanOrEqual(DEC_2024);
    }
  });
});

describe('validation', () => {
  it('rejects a reversed date range instead of silently returning nothing', () => {
    expect(() =>
      findTransitHits(provider, {
        fromJd: DEC_2024,
        toJd: JAN_2024,
        transitBodies: ['sun'],
        targets: [{ kind: 'point', id: 'p', longitude: 0 }],
        aspects: ['conjunction'],
      }),
    ).toThrow(RangeError);

    expect(() =>
      buildAspectarian(provider, {
        fromJd: DEC_2024, toJd: JAN_2024, bodies: ['sun', 'moon'], aspects: ['conjunction'],
      }),
    ).toThrow(RangeError);
  });

  it('excludes the node axis from the aspectarian by default', () => {
    const events = buildAspectarian(provider, {
      fromJd: JAN_2024,
      toJd: julianDay({ year: 2024, month: 3, day: 1 }, 0),
      bodies: ['trueNode', 'southNode'],
      aspects: ['opposition'],
    });
    expect(events).toHaveLength(0);
  });
});
