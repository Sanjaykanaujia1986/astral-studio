/**
 * Synodic cycles.
 *
 * Anchored on events with independently published dates — the great
 * conjunctions and the lunation quarters — rather than on this engine's own
 * output.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import {
  analyseCycle,
  currentPhase,
  expectedSynodicPeriod,
  labelForPhase,
  orderBySpeed,
  phaseAngle,
  phaseError,
} from '../../src/cycles/engine.js';
import { julianDay } from '../../src/time/julian.js';
import { separation } from '../../src/math/angles.js';

let provider: SwissEphWasmProvider;
const jd = (y: number, m: number, d: number) => julianDay({ year: y, month: m, day: d }, 0);

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
});

afterAll(() => provider.close());

describe('phase is the signed elongation, not an aspect', () => {
  it('distinguishes the waxing square from the waning one', () => {
    // The aspect engine calls both "a square"; a cycle must know which side of
    // the opposition it is on.
    expect(phaseAngle(90, 0)).toBeCloseTo(90, 9);
    expect(phaseAngle(270, 0)).toBeCloseTo(270, 9);
    expect(labelForPhase(90)).toBe('waxingSquare');
    expect(labelForPhase(270)).toBe('waningSquare');
  });

  it('runs over the whole circle', () => {
    expect(phaseAngle(10, 350)).toBeCloseTo(20, 9);
    expect(phaseAngle(350, 10)).toBeCloseTo(340, 9);
  });

  it('phaseError is zero at the target and smooth through it', () => {
    expect(phaseError(90, 0, 90)).toBeCloseTo(0, 9);
    expect(phaseError(89, 0, 90)).toBeCloseTo(-1, 9);
    expect(phaseError(91, 0, 90)).toBeCloseTo(1, 9);
    // Smooth across the 0/360 wrap of the phase itself.
    expect(phaseError(1, 0, 0)).toBeCloseTo(1, 9);
    expect(phaseError(359, 0, 0)).toBeCloseTo(-1, 9);
  });

  it('names the eighths and falls back for anything else', () => {
    expect(labelForPhase(0)).toBe('conjunction');
    expect(labelForPhase(180)).toBe('opposition');
    expect(labelForPhase(45)).toBe('waxingSemisquare');
    expect(labelForPhase(72)).toBe('phase72');
  });
});

describe('expected synodic periods match the analytic values', () => {
  it.each([
    ['moon', 'sun', 29.53, 0.05],
    ['jupiter', 'saturn', 7253.4, 1],
    ['sun', 'mars', 779.9, 1],
    ['venus', 'sun', 583.9, 1],
  ] as const)('%s-%s is about %d days', (a, b, expected, tolerance) => {
    expect(Math.abs(expectedSynodicPeriod(a, b) - expected)).toBeLessThan(tolerance);
  });

  it('is symmetric in its arguments', () => {
    expect(expectedSynodicPeriod('jupiter', 'saturn')).toBeCloseTo(
      expectedSynodicPeriod('saturn', 'jupiter'), 9,
    );
  });

  it('orderBySpeed puts the faster body first', () => {
    expect(orderBySpeed('sun', 'moon')).toEqual(['moon', 'sun']);
    expect(orderBySpeed('saturn', 'jupiter')).toEqual(['jupiter', 'saturn']);
    expect(orderBySpeed('moon', 'sun')).toEqual(['moon', 'sun']);
  });
});

describe('Jupiter-Saturn great conjunctions', () => {
  const analysis = () =>
    analyseCycle(provider, {
      bodyA: 'jupiter', bodyB: 'saturn',
      fromJd: jd(1960, 1, 1), toJd: jd(2050, 1, 1),
      divisions: 1,
    });

  it('finds them on their published dates', () => {
    const dates = analysis().conjunctions.map((c) => c.utcIso.slice(0, 10));
    expect(dates).toContain('1961-02-19');
    expect(dates).toContain('2000-05-28');
    // The "Christmas Star" conjunction.
    expect(dates).toContain('2020-12-21');
    expect(dates).toContain('2040-10-31');
  });

  it('groups the 1980-81 TRIPLE conjunction as one event, not three', () => {
    // Jupiter and Saturn conjoined three times across 1980-81 as Jupiter
    // retrograded over Saturn. Counting those as three cycles would halve the
    // apparent period.
    const triple = analysis().conjunctions.find((c) => c.utcIso.startsWith('1980'));
    expect(triple).toBeDefined();
    expect(triple!.multiple).toBe(true);
    expect(triple!.passes).toHaveLength(3);
    // All three fall inside a few months.
    const span = triple!.passes[2]!.jd - triple!.passes[0]!.jd;
    expect(span).toBeGreaterThan(30);
    expect(span).toBeLessThan(400);
  });

  it('recovers the ~20 year period from the events themselves', () => {
    const result = analysis();
    expect(result.observedPeriodDays).toBeDefined();
    const years = result.observedPeriodDays! / 365.2422;
    expect(years).toBeGreaterThan(19.5);
    expect(years).toBeLessThan(20.3);
    // And it agrees with the analytic estimate.
    expect(Math.abs(result.observedPeriodDays! - result.expectedPeriodDays)).toBeLessThan(60);
  });

  it('every reported conjunction really has the two bodies together', () => {
    for (const group of analysis().conjunctions) {
      const j = provider.calc(group.jd, 'jupiter').longitude;
      const s = provider.calc(group.jd, 'saturn').longitude;
      expect(separation(j, s) * 3600).toBeLessThan(1);
    }
  });
});

describe('lunations', () => {
  const analysis = () =>
    analyseCycle(provider, {
      bodyA: 'moon', bodyB: 'sun',
      fromJd: jd(2024, 1, 1), toJd: jd(2024, 2, 15),
      divisions: 4,
    });

  const minutesFrom = (iso: string, expected: string) =>
    Math.abs(Date.parse(iso) - Date.parse(expected)) / 60_000;

  it('matches the published quarter times for January 2024', () => {
    const events = analysis().events;
    const at = (label: string, after: string) =>
      events.find((e) => e.label === label && e.utcIso > after)!;

    expect(minutesFrom(at('conjunction', '2024-01-05').utcIso, '2024-01-11T11:57:00Z')).toBeLessThan(1);
    expect(minutesFrom(at('waxingSquare', '2024-01-12').utcIso, '2024-01-18T03:53:00Z')).toBeLessThan(1);
    expect(minutesFrom(at('opposition', '2024-01-19').utcIso, '2024-01-25T17:54:00Z')).toBeLessThan(1);
    expect(minutesFrom(at('waningSquare', '2024-01-26').utcIso, '2024-02-02T23:18:00Z')).toBeLessThan(1);
  });

  it('reports the quarters in cycle order', () => {
    const events = analysis().events;
    const start = events.findIndex((e) => e.label === 'conjunction');
    const sequence = events.slice(start, start + 4).map((e) => e.label);
    expect(sequence).toEqual([
      'conjunction', 'waxingSquare', 'opposition', 'waningSquare',
    ]);
  });

  it('gives an observed lunation close to the synodic month', () => {
    // A single interval varies by up to about half a day either side of the
    // 29.5306-day mean, so the band is deliberately generous.
    const result = analysis();
    expect(result.observedPeriodDays).toBeGreaterThan(29.2);
    expect(result.observedPeriodDays).toBeLessThan(29.9);
  });

  it('every reported phase really is at that elongation', () => {
    for (const event of analysis().events) {
      const moon = provider.calc(event.jd, 'moon').longitude;
      const sun = provider.calc(event.jd, 'sun').longitude;
      const actual = phaseAngle(moon, sun);
      const error = Math.abs(((actual - event.phase + 540) % 360) - 180);
      expect(error * 3600, `${event.label} @ ${event.utcIso}`).toBeLessThan(1);
    }
  });
});

describe('REGRESSION: pass numbering is per event, not per range', () => {
  it('does not label separate conjunctions as passes of one another', () => {
    // Four Jupiter-Saturn conjunctions twenty years apart are four events. An
    // earlier version numbered every crossing of a phase across the whole
    // range, so the 2020 great conjunction read "2 of 4" — claiming a
    // retrograde multiple that does not exist.
    const result = analyseCycle(provider, {
      bodyA: 'jupiter', bodyB: 'saturn',
      fromJd: jd(1990, 1, 1), toJd: jd(2070, 1, 1),
      divisions: 1,
    });

    const isolated = result.events.filter(
      (e) => !result.conjunctions.find((c) => c.multiple)?.passes.some((p) => p.jd === e.jd),
    );
    for (const event of isolated) {
      expect(event.totalPasses, `${event.utcIso} should stand alone`).toBe(1);
      expect(event.passIndex).toBe(1);
    }
  });

  it('DOES number the passes of a genuine triple conjunction', () => {
    const result = analyseCycle(provider, {
      bodyA: 'jupiter', bodyB: 'saturn',
      fromJd: jd(1975, 1, 1), toJd: jd(1990, 1, 1),
      divisions: 1,
    });
    expect(result.events).toHaveLength(3);
    expect(result.events.map((e) => e.passIndex)).toEqual([1, 2, 3]);
    expect(result.events.every((e) => e.totalPasses === 3)).toBe(true);
  });

  it('keeps event pass counts consistent with the conjunction grouping', () => {
    const result = analyseCycle(provider, {
      bodyA: 'jupiter', bodyB: 'saturn',
      fromJd: jd(1960, 1, 1), toJd: jd(2050, 1, 1),
      divisions: 1,
    });
    for (const group of result.conjunctions) {
      for (const pass of group.passes) {
        expect(pass.totalPasses).toBe(group.passes.length);
      }
    }
  });
});

describe('divisions are configurable, not hard-coded', () => {
  const range = { fromJd: jd(2024, 1, 1), toJd: jd(2024, 3, 1) };

  it('1 division gives conjunctions only', () => {
    const result = analyseCycle(provider, { bodyA: 'moon', bodyB: 'sun', ...range, divisions: 1 });
    expect(result.events.every((e) => e.phase === 0)).toBe(true);
  });

  it('8 divisions gives the eighths, all named', () => {
    const result = analyseCycle(provider, { bodyA: 'moon', bodyB: 'sun', ...range, divisions: 8 });
    const phases = [...new Set(result.events.map((e) => e.phase))].sort((a, b) => a - b);
    expect(phases).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(result.events.every((e) => !e.label.startsWith('phase'))).toBe(true);
  });

  it('accepts explicit phases, overriding divisions', () => {
    const result = analyseCycle(provider, {
      bodyA: 'moon', bodyB: 'sun', ...range, divisions: 4, phases: [120, 240],
    });
    expect([...new Set(result.events.map((e) => e.phase))].sort((a, b) => a - b)).toEqual([120, 240]);
  });

  it('works for any pair, with no per-planet code path', () => {
    for (const [a, b] of [['venus', 'mars'], ['mercury', 'venus'], ['mars', 'jupiter']] as const) {
      const result = analyseCycle(provider, {
        bodyA: a, bodyB: b, fromJd: jd(2020, 1, 1), toJd: jd(2030, 1, 1), divisions: 4,
      });
      expect(result.events.length).toBeGreaterThan(0);
      for (const event of result.events.slice(0, 20)) {
        const lonA = provider.calc(event.jd, a).longitude;
        const lonB = provider.calc(event.jd, b).longitude;
        const error = Math.abs(((phaseAngle(lonA, lonB) - event.phase + 540) % 360) - 180);
        expect(error * 3600, `${a}-${b} ${event.label}`).toBeLessThan(2);
      }
    }
  });
});

describe('currentPhase', () => {
  it('reads the opposition at a full moon', () => {
    const result = currentPhase(provider, jd(2024, 1, 25) + 17.9 / 24, 'moon', 'sun');
    expect(result.phaseAngle).toBeCloseTo(180, 1);
    expect(result.fraction).toBeCloseTo(0.5, 3);
    expect(result.nearestLabel).toBe('opposition');
  });

  it('reads the conjunction at a new moon', () => {
    const result = currentPhase(provider, jd(2024, 1, 11) + 11.96 / 24, 'moon', 'sun');
    expect(Math.min(result.phaseAngle, 360 - result.phaseAngle)).toBeLessThan(0.2);
    expect(result.nearestLabel).toBe('conjunction');
  });

  it('waxes in the first half and wanes in the second', () => {
    const waxing = currentPhase(provider, jd(2024, 1, 18), 'moon', 'sun');
    const waning = currentPhase(provider, jd(2024, 2, 3), 'moon', 'sun');
    expect(waxing.waxing).toBe(true);
    expect(waning.waxing).toBe(false);
  });
});

describe('validation', () => {
  it('rejects a reversed range', () => {
    expect(() =>
      analyseCycle(provider, {
        bodyA: 'moon', bodyB: 'sun', fromJd: jd(2024, 2, 1), toJd: jd(2024, 1, 1),
      }),
    ).toThrow(RangeError);
  });

  it('rejects a body paired with itself', () => {
    expect(() =>
      analyseCycle(provider, {
        bodyA: 'sun', bodyB: 'sun', fromJd: jd(2024, 1, 1), toJd: jd(2024, 2, 1),
      }),
    ).toThrow(RangeError);
  });

  it('rejects a nonsensical division count', () => {
    const range = { fromJd: jd(2024, 1, 1), toJd: jd(2024, 2, 1) };
    expect(() =>
      analyseCycle(provider, { bodyA: 'moon', bodyB: 'sun', ...range, divisions: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      analyseCycle(provider, { bodyA: 'moon', bodyB: 'sun', ...range, divisions: 2.5 }),
    ).toThrow(RangeError);
  });
});
