/**
 * Statistics checked against worked examples from the literature and against
 * closed forms, plus behavioural checks that the tests actually control their
 * error rate on data where nothing is happening.
 */
import { describe, it, expect } from 'vitest';
import {
  describe as summarise,
  welchTTest,
  rotationTest,
  partition,
  mulberry32,
  countActiveBlocks,
  rotationPValueFloor,
} from '../src/stats/tests.js';
import {
  holmBonferroni,
  benjaminiHochberg,
  survivorCounts,
} from '../src/stats/multiple.js';

describe('descriptive statistics', () => {
  it('uses the n−1 denominator', () => {
    // Population sd of [2,4,4,4,5,5,7,9] is 2; the sample sd is larger.
    const stats = summarise([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats.mean).toBeCloseTo(5, 12);
    expect(stats.standardDeviation).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it('reports NaN rather than a fake zero for a single observation', () => {
    // One observation has a mean but no spread. Returning 0 would make every
    // downstream t-statistic infinite.
    expect(summarise([3]).standardDeviation).toBeNaN();
  });
});

describe("Welch's t-test", () => {
  it('matches an independently computed worked example', () => {
    /*
     * Two groups of ten with deliberately unequal variances (18.48 against
     * 3.66), which is where Welch and the pooled test part company.
     *
     * The expected values were computed independently: t and df from the
     * Welch–Satterthwaite formulae worked by hand, and the p-value by
     * numerically integrating the Student-t density — a completely different
     * method from the incomplete-beta continued fraction under test, so
     * agreement is corroboration rather than a tautology.
     */
    const a = [27.5, 21.0, 19.0, 23.6, 17.0, 17.9, 16.9, 15.3, 13.1, 22.5];
    const b = [27.1, 22.0, 20.8, 23.4, 23.4, 23.5, 25.8, 22.0, 24.6, 22.2];
    const result = welchTTest(a, b);
    expect(result.meanA).toBeCloseTo(19.38, 10);
    expect(result.meanB).toBeCloseTo(23.48, 10);
    expect(result.t).toBeCloseTo(-2.7552447, 6);
    expect(result.degreesOfFreedom).toBeCloseTo(12.4316151, 6);
    expect(result.pValue).toBeCloseTo(0.016951, 6);
  });

  it('gives t = 0 and p = 1 for identical groups', () => {
    const values = [1, 2, 3, 4, 5];
    const result = welchTTest(values, values);
    expect(result.t).toBeCloseTo(0, 12);
    expect(result.pValue).toBeCloseTo(1, 12);
    expect(result.effectSize).toBeCloseTo(0, 12);
  });

  it('reduces to the pooled test when the groups match in size and variance', () => {
    // With equal n and equal variance, Welch's df equals 2n−2 exactly.
    const a = [1, 2, 3, 4, 5, 6];
    const b = [3, 4, 5, 6, 7, 8];
    expect(welchTTest(a, b).degreesOfFreedom).toBeCloseTo(10, 8);
  });

  it('refuses a group too small to have a variance', () => {
    expect(() => welchTTest([1], [1, 2, 3])).toThrow(/at least two/);
  });
});

describe('partition', () => {
  it('splits into disjoint groups that together account for everything', () => {
    const { inSignal, outOfSignal } = partition(
      [1, 2, 3, 4],
      [true, false, true, false],
    );
    expect(inSignal).toEqual([1, 3]);
    expect(outOfSignal).toEqual([2, 4]);
    expect(inSignal.length + outOfSignal.length).toBe(4);
  });
});

describe('the rotation test', () => {
  it('is deterministic for a given seed', () => {
    const values = Array.from({ length: 200 }, (_, i) => Math.sin(i / 7));
    const active = Array.from({ length: 200 }, (_, i) => i % 10 < 3);
    const a = rotationTest(values, active, { iterations: 500, seed: 42 });
    const b = rotationTest(values, active, { iterations: 500, seed: 42 });
    expect(a.pValue).toBe(b.pValue);
    expect(a.observed).toBe(b.observed);
  });

  it('never returns a p-value of zero', () => {
    // With N rotations the strongest claim available is 1/(N+1). A test that
    // can print p = 0 is making a statement no finite sample supports.
    const values = Array.from({ length: 120 }, (_, i) => (i < 30 ? 100 : -1));
    const active = Array.from({ length: 120 }, (_, i) => i < 30);
    const result = rotationTest(values, active, { iterations: 200, seed: 7 });
    expect(result.pValue).toBeGreaterThan(0);
    expect(result.pValue).toBeCloseTo(1 / 201, 10);
  });

  it('finds nothing in pure noise, at roughly the nominal rate', () => {
    /*
     * The check that matters: run the test on independent noise many times and
     * confirm that about 5% of runs land below 0.05. A test that fired far more
     * often than this would be manufacturing findings, which is the exact
     * failure this package exists to avoid.
     */
    const random = mulberry32(20260826);
    let below = 0;
    const runs = 200;
    for (let run = 0; run < runs; run++) {
      const values = Array.from({ length: 300 }, () => random() - 0.5);
      const active = Array.from({ length: 300 }, () => random() < 0.3);
      const result = rotationTest(values, active, { iterations: 300, seed: run });
      if (result.pValue <= 0.05) below += 1;
    }
    // Binomial(200, 0.05) has sd ≈ 3.1, so a generous band around 10.
    expect(below).toBeGreaterThan(2);
    expect(below).toBeLessThan(22);
  });

  it('detects a genuine, strongly aligned effect', () => {
    // A large mean shift confined to the active days must be found. The signal
    // here is aperiodic, so the periodicity floor below does not apply.
    const random = mulberry32(11);
    const active = Array.from({ length: 400 }, () => random() < 0.2);
    const values = active.map((on) => (random() - 0.5) + (on ? 2 : 0));
    const result = rotationTest(values, active, { iterations: 1000, seed: 3 });
    expect(result.observed).toBeGreaterThan(1.5);
    expect(result.pValue).toBeLessThan(0.01);
  });

  it('cannot beat its own periodicity floor, however large the effect', () => {
    /*
     * The limitation that matters most for this package, and the reason
     * `rotationPValueFloor` exists.
     *
     * A signal with period 20 bars has 20 cycles in 400 observations, and
     * rotating by any whole multiple of 20 puts the mask back exactly where it
     * started — reproducing the observed statistic. About 1 offset in 20 is
     * such a no-op, so p cannot fall below ~0.05 even when the effect is
     * overwhelming. Every astrological signal is periodic, so this is the
     * normal case, not a corner one.
     */
    const active = Array.from({ length: 400 }, (_, i) => i % 20 < 5);
    // An enormous, unmistakable effect: +100 on every active day.
    const values = active.map((on) => (on ? 100 : 0));

    const floor = rotationPValueFloor(active);
    expect(floor).toBeCloseTo(0.05, 10);

    const result = rotationTest(values, active, { iterations: 2000, seed: 3 });
    expect(result.observed).toBe(100);
    // Despite a perfect separation, the test cannot report significance.
    expect(result.pValue).toBeGreaterThan(0.04);
    expect(result.pValue).toBeLessThan(0.07);
  });
});

describe('the periodicity floor', () => {
  it('counts a run that wraps the end of the series as one block', () => {
    // Circular, because the rotation test treats the series as a circle.
    expect(countActiveBlocks([true, false, false, true])).toBe(1);
    expect(countActiveBlocks([true, false, true, false])).toBe(2);
    expect(countActiveBlocks([false, true, true, false])).toBe(1);
  });

  it('handles the degenerate all-active and all-inactive masks', () => {
    expect(countActiveBlocks([true, true, true])).toBe(1);
    expect(countActiveBlocks([false, false, false])).toBe(0);
    expect(countActiveBlocks([])).toBe(0);
  });

  it('equals one over the period in bars', () => {
    for (const period of [5, 10, 25, 50]) {
      const active = Array.from({ length: 1000 }, (_, i) => i % period < 2);
      expect(rotationPValueFloor(active)).toBeCloseTo(1 / period, 10);
    }
  });

  it('shows that a lunar signal on ten years of daily bars cannot reach 0.05', () => {
    /*
     * Concrete and sobering. About 2,520 trading bars in ten years; the
     * synodic month is ~29.53 days, which is ~20.4 trading bars, giving ~123
     * cycles. The floor lands right on the conventional threshold, so such a
     * study is incapable of producing a significant result under this test —
     * which the study layer must say out loud rather than let a reader
     * conclude "no effect found".
     */
    const bars = 2520;
    const periodBars = 29.53 * (252 / 365.25);
    const active = Array.from(
      { length: bars },
      (_, i) => (i % Math.round(periodBars)) < 5,
    );
    const floor = rotationPValueFloor(active);
    expect(floor).toBeGreaterThan(0.045);
    expect(floor).toBeLessThan(0.06);
  });

  it('rejects a signal that is always or never active', () => {
    expect(() => rotationTest([1, 2, 3], [true, true, true])).toThrow(/both active and inactive/);
    expect(() => rotationTest([1, 2, 3], [false, false, false])).toThrow(/both active and inactive/);
  });

  it('rejects mismatched lengths', () => {
    expect(() => rotationTest([1, 2, 3], [true, false])).toThrow(/matching lengths/);
  });
});

describe('Holm–Bonferroni', () => {
  it('matches a hand-worked example', () => {
    // p = [0.01, 0.02, 0.03, 0.04, 0.05], m = 5
    // scaled: 0.05, 0.08, 0.09, 0.08→0.09, 0.05→0.09 (monotone running max)
    const result = holmBonferroni([0.01, 0.02, 0.03, 0.04, 0.05]);
    expect(result.map((r) => r.adjusted)).toEqual([0.05, 0.08, 0.09, 0.09, 0.09]);
  });

  it('reduces to plain Bonferroni for the smallest p-value', () => {
    const result = holmBonferroni([0.001, 0.6, 0.7, 0.8]);
    expect(result[0]!.adjusted).toBeCloseTo(0.004, 12);
  });

  it('never decreases along the sorted sequence', () => {
    const raw = [0.001, 0.2, 0.02, 0.9, 0.04, 0.5];
    const sorted = holmBonferroni(raw).sort((a, b) => a.raw - b.raw);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.adjusted).toBeGreaterThanOrEqual(sorted[i - 1]!.adjusted);
    }
  });

  it('caps at 1', () => {
    expect(holmBonferroni([0.5, 0.6, 0.7]).every((r) => r.adjusted <= 1)).toBe(true);
  });

  it('returns results in input order', () => {
    const result = holmBonferroni([0.9, 0.001, 0.5]);
    expect(result.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(result[1]!.raw).toBe(0.001);
  });
});

describe('Benjamini–Hochberg', () => {
  it('reproduces the worked example from the 1995 paper', () => {
    /*
     * The p-values from Benjamini & Hochberg (1995), Table 1 — the multiple
     * endpoints of the Newcombe cardiac trial. At q = 0.05 the procedure
     * rejects the four smallest, where Bonferroni rejects only the smallest.
     */
    const p = [
      0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344,
      0.0459, 0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.0000,
    ];
    const adjusted = benjaminiHochberg(p).map((r) => r.adjusted);

    expect(adjusted[0]).toBeCloseTo(0.0015, 4);
    expect(adjusted[1]).toBeCloseTo(0.0030, 4);
    expect(adjusted[2]).toBeCloseTo(0.0095, 4);
    expect(adjusted[3]).toBeCloseTo(0.03563, 4);
    // The fifth is where the procedure stops rejecting at q = 0.05.
    expect(adjusted[4]!).toBeGreaterThan(0.05);

    const surviving = adjusted.filter((q) => q <= 0.05).length;
    expect(surviving).toBe(4);
  });

  it('is never more conservative than Holm', () => {
    // BH controls a weaker error rate, so it must reject at least as much.
    const raw = [0.001, 0.008, 0.02, 0.04, 0.3, 0.6, 0.9];
    const holm = holmBonferroni(raw);
    const fdr = benjaminiHochberg(raw);
    for (let i = 0; i < raw.length; i++) {
      expect(fdr[i]!.adjusted).toBeLessThanOrEqual(holm[i]!.adjusted + 1e-12);
    }
  });

  it('leaves a single test unchanged', () => {
    expect(benjaminiHochberg([0.03])[0]!.adjusted).toBeCloseTo(0.03, 12);
    expect(holmBonferroni([0.03])[0]!.adjusted).toBeCloseTo(0.03, 12);
  });

  it('rejects values outside [0,1]', () => {
    expect(() => benjaminiHochberg([0.5, 1.2])).toThrow(/\[0,1\]/);
    expect(() => holmBonferroni([-0.1])).toThrow(/\[0,1\]/);
  });
});

describe('survivorCounts', () => {
  it('shows how much of an apparent finding was the cost of asking', () => {
    /*
     * The scenario this package exists to prevent: a thousand signals screened
     * against a market where nothing is happening. Around fifty come back at
     * p < 0.05 and every one looks like a discovery; correction leaves none.
     */
    const random = mulberry32(99);
    const nothingHappening = Array.from({ length: 1000 }, () => random());
    const counts = survivorCounts(nothingHappening, 0.05);

    expect(counts.tested).toBe(1000);
    expect(counts.expectedByChance).toBe(50);
    // Uniform p-values under the null: about 50 below 0.05.
    expect(counts.rawBelowAlpha).toBeGreaterThan(30);
    expect(counts.rawBelowAlpha).toBeLessThan(75);
    // And essentially none of them survive correction.
    expect(counts.holmBelowAlpha).toBe(0);
    expect(counts.fdrBelowAlpha).toBe(0);
  });

  it('lets a real effect through the correction', () => {
    // Five genuinely tiny p-values among 995 null ones still survive.
    const random = mulberry32(5);
    const p = [
      1e-8, 1e-7, 1e-7, 5e-7, 1e-6,
      ...Array.from({ length: 995 }, () => random()),
    ];
    const counts = survivorCounts(p, 0.05);
    expect(counts.fdrBelowAlpha).toBeGreaterThanOrEqual(5);
    expect(counts.holmBelowAlpha).toBeGreaterThanOrEqual(4);
  });
});
