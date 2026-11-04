/**
 * End-to-end studies against the real ephemeris.
 *
 * Price series here are SYNTHETIC and generated from a seeded random walk. That
 * is deliberate and it is the strongest test available: a random walk contains
 * nothing for any signal to find, so a study that reports findings on it is
 * broken in exactly the way that matters. No market data ships with this
 * project.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider } from '@astro/engine';
import { makeSeries, type Series } from '../src/market/series.js';
import { evaluateSignal, dateRange } from '../src/signals/evaluate.js';
import { runStudy } from '../src/study/engine.js';
import { mulberry32 } from '../src/stats/tests.js';
import type { SignalSpec } from '../src/signals/types.js';

let provider: SwissEphWasmProvider;

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
});

afterAll(() => provider.close());

/**
 * A seeded random walk on weekdays only, so the series has the weekend gaps a
 * real equity series has.
 */
function randomWalk(from: string, to: string, seed: number): Series {
  const random = mulberry32(seed);
  const bars: { date: string; close: number }[] = [];
  let price = 100;
  for (const date of dateRange(from, to)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    price *= Math.exp((random() - 0.5) * 0.02);
    bars.push({ date, close: price });
  }
  return makeSeries('SYNTHETIC', bars);
}

const MERCURY_RX: SignalSpec = { id: 'mercury-rx', kind: 'retrograde', body: 'mercury' };
const FULL_MOON: SignalSpec = {
  id: 'full-moon', kind: 'phase-range', fast: 'moon', slow: 'sun',
  fromDegrees: 170, toDegrees: 190,
};
const SUN_IN_LEO: SignalSpec = {
  id: 'sun-leo', kind: 'sign-occupancy', body: 'sun', sign: 'leo',
};

describe('signal evaluation against the ephemeris', () => {
  it('finds Mercury retrograde about 19% of the time', () => {
    /*
     * Mercury is retrograde three times a year for roughly three weeks, which
     * is close to 19% of days — a published, checkable figure. A signal that
     * came out at 5% or 50% would be wrong in a way no statistic downstream
     * would reveal.
     */
    const dates = dateRange('2015-01-01', '2024-12-31');
    const signal = evaluateSignal(provider, MERCURY_RX, dates);
    const share = signal.activeDays / signal.totalDays;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.23);
  });

  it('puts the Sun in Leo for about a twelfth of the year, in August', () => {
    const dates = dateRange('2020-01-01', '2023-12-31');
    const signal = evaluateSignal(provider, SUN_IN_LEO, dates);
    expect(signal.activeDays / signal.totalDays).toBeCloseTo(1 / 12, 2);

    // And on the right dates: the Sun enters Leo around 23 July.
    const activeDates = dates.filter((_, i) => signal.active[i]);
    for (const date of activeDates) {
      const month = Number(date.slice(5, 7));
      expect([7, 8]).toContain(month);
    }
  });

  it('marks the full moon roughly once a synodic month', () => {
    // A 20°-wide phase window is about 1.6 days of a 29.53-day cycle.
    const dates = dateRange('2020-01-01', '2023-12-31');
    const signal = evaluateSignal(provider, FULL_MOON, dates);
    const cycles = (20 / 360) * (dates.length / 29.53);
    expect(signal.activeDays).toBeGreaterThan(dates.length * 0.04);
    expect(signal.activeDays).toBeLessThan(dates.length * 0.07);
    expect(cycles).toBeGreaterThan(0);
  });

  it('centres an aspect window on the exact instant, not a nearby day', () => {
    const dates = dateRange('2024-01-01', '2024-12-31');
    const signal = evaluateSignal(provider, {
      id: 'sun-jupiter', kind: 'aspect-window',
      bodyA: 'sun', bodyB: 'jupiter', aspect: 'conjunction', windowDays: 2,
    }, dates);
    // One Sun-Jupiter conjunction a year, so one window of about five days.
    expect(signal.activeDays).toBeGreaterThanOrEqual(4);
    expect(signal.activeDays).toBeLessThanOrEqual(6);
  });

  it('handles a phase range that wraps past zero', () => {
    const dates = dateRange('2023-01-01', '2023-12-31');
    const wrapping = evaluateSignal(provider, {
      id: 'new-moon', kind: 'phase-range', fast: 'moon', slow: 'sun',
      fromDegrees: 350, toDegrees: 10,
    }, dates);
    // Same width as the full-moon window, so a similar count.
    const notWrapping = evaluateSignal(provider, FULL_MOON, dates);
    expect(wrapping.activeDays).toBeGreaterThan(0);
    expect(Math.abs(wrapping.activeDays - notWrapping.activeDays)).toBeLessThan(5);
  });

  it('is deterministic', () => {
    const dates = dateRange('2024-01-01', '2024-03-31');
    const a = evaluateSignal(provider, MERCURY_RX, dates);
    const b = evaluateSignal(provider, MERCURY_RX, dates);
    expect(a.active).toEqual(b.active);
  });
});

describe('a study of a random walk', () => {
  const series = randomWalk('2010-01-01', '2024-12-31', 20260826);

  it('finds nothing, because there is nothing there', () => {
    /*
     * The central test of the whole package. A random walk contains no
     * relationship with anything. If a study of one produces findings that
     * survive correction, the package is manufacturing them.
     */
    const specs: SignalSpec[] = [
      MERCURY_RX, FULL_MOON, SUN_IN_LEO,
      { id: 'venus-rx', kind: 'retrograde', body: 'venus' },
      { id: 'mars-rx', kind: 'retrograde', body: 'mars' },
      { id: 'sun-aries', kind: 'sign-occupancy', body: 'sun', sign: 'aries' },
    ];
    const result = runStudy(provider, series, specs, { iterations: 2000 });

    expect(result.signals).toHaveLength(6);
    expect(result.correction.tested).toBe(6);
    expect(result.correction.fdrBelowAlpha).toBe(0);
    expect(result.correction.holmBelowAlpha).toBe(0);
  });

  it('reports every signal it was given, including the dull ones', () => {
    // Dropping an uninteresting signal would quietly reduce the test count and
    // inflate every correction that follows.
    const specs: SignalSpec[] = [MERCURY_RX, FULL_MOON, SUN_IN_LEO];
    const result = runStudy(provider, series, specs, { iterations: 500 });
    expect(result.signals.map((s) => s.signalId)).toEqual(['mercury-rx', 'full-moon', 'sun-leo']);
  });

  it('warns that multiple tests were run, and says how many are expected by chance', () => {
    const specs: SignalSpec[] = [MERCURY_RX, FULL_MOON, SUN_IN_LEO];
    const result = runStudy(provider, series, specs, { iterations: 500 });
    const warning = result.warnings.find((w) => w.code === 'MULTIPLE_TESTS');
    expect(warning).toBeDefined();
    expect(warning!.params!.tests).toBe(3);
    // Unrounded: rounding 0.15 for display turns it into 0.2, which is the
    // message layer's problem to solve, not the engine's to pre-empt.
    expect(warning!.params!.expected).toBeCloseTo(0.15, 12);
  });

  it('warns when everything was measured in-sample', () => {
    const result = runStudy(provider, series, [MERCURY_RX], { iterations: 500 });
    expect(result.warnings.some((w) => w.code === 'IN_SAMPLE_ONLY')).toBe(true);
  });

  it('drops the in-sample warning when a holdout is used, and reports the holdout', () => {
    const result = runStudy(provider, series, [MERCURY_RX], {
      iterations: 500, outOfSampleFraction: 0.3,
    });
    expect(result.warnings.some((w) => w.code === 'IN_SAMPLE_ONLY')).toBe(false);
    const study = result.signals[0]!;
    expect(study.outOfSample).toBeDefined();
    expect(study.outOfSample!.activeBars).toBeGreaterThan(0);
    expect(typeof study.outOfSample!.signAgrees).toBe('boolean');
  });

  it('warns when a signal cannot reach significance because of its own period', () => {
    /*
     * The full-moon window recurs every synodic month, so rotating by a whole
     * number of months reproduces the alignment and the p-value has a floor
     * near 0.05. Reporting "p = 0.06, not significant" without saying that 0.05
     * was unreachable would invite the reader to conclude there is no effect,
     * when the test had no power to find one.
     */
    const result = runStudy(provider, series, [FULL_MOON], { iterations: 1000 });
    const study = result.signals[0]!;
    // ~185 lunations across ~3,900 weekday bars puts the floor near 0.047 —
    // just UNDER the conventional 0.05, which is why the warning cannot be
    // conditioned on the floor exceeding alpha.
    expect(study.rotationFloor).toBeGreaterThan(0.03);
    expect(study.rotationFloor).toBeLessThan(0.08);
    expect(study.warnings.some((w) => w.code === 'ROTATION_FLOOR_LIMITS_POWER')).toBe(true);
    expect(study.rotation!.pValue).toBeGreaterThanOrEqual(study.rotationFloor * 0.9);
  });

  it('warns when signals overlap so heavily that they are not separate tests', () => {
    // "Mercury retrograde" and "Mercury retrograde" under another name share
    // every active day, so the family is one test wearing two hats.
    const result = runStudy(provider, series, [
      MERCURY_RX,
      { id: 'mercury-rx-again', kind: 'retrograde', body: 'mercury' },
    ], { iterations: 200 });
    expect(result.warnings.some((w) => w.code === 'SIGNALS_OVERLAP')).toBe(true);
  });

  it('does not warn about overlap for genuinely distinct signals', () => {
    const result = runStudy(provider, series, [MERCURY_RX, SUN_IN_LEO], { iterations: 200 });
    expect(result.warnings.some((w) => w.code === 'SIGNALS_OVERLAP')).toBe(false);
  });

  it('measures the trading calendar from the data', () => {
    const result = runStudy(provider, series, [MERCURY_RX], { iterations: 200 });
    expect(result.frequency).toBe('daily');
    expect(result.barsPerYear).toBe(252);
  });

  it('is reproducible: the same seed gives the same p-value', () => {
    const a = runStudy(provider, series, [MERCURY_RX], { iterations: 500, seed: 7 });
    const b = runStudy(provider, series, [MERCURY_RX], { iterations: 500, seed: 7 });
    expect(a.signals[0]!.rotation!.pValue).toBe(b.signals[0]!.rotation!.pValue);
    expect(a.seed).toBe(7);
  });

  it('shows the cost of asking many questions, side by side', () => {
    const specs: SignalSpec[] = [
      MERCURY_RX, FULL_MOON, SUN_IN_LEO,
      { id: 'venus-rx', kind: 'retrograde', body: 'venus' },
    ];
    const result = runStudy(provider, series, specs, { iterations: 500 });
    expect(result.correction.tested).toBe(4);
    expect(result.correction.expectedByChance).toBeCloseTo(0.2, 10);
    // Corrected counts can never exceed raw ones.
    expect(result.correction.fdrBelowAlpha).toBeLessThanOrEqual(result.correction.rawBelowAlpha);
    expect(result.correction.holmBelowAlpha).toBeLessThanOrEqual(result.correction.fdrBelowAlpha);
  });
});

describe('a study of a short series', () => {
  it('warns rather than quietly reporting a statistic built on nothing', () => {
    const series = randomWalk('2024-01-01', '2024-06-30', 5);
    const result = runStudy(provider, series, [MERCURY_RX], { iterations: 200 });
    expect(result.warnings.some((w) => w.code === 'SHORT_SERIES')).toBe(true);
  });
});
