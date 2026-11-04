/**
 * A study: signals, a price series, and what can honestly be said about the
 * relationship between them.
 *
 * The three layers stay separate all the way through. Signals are computed
 * without reference to prices, prices without reference to signals, and this
 * module only joins the two already-finished results and measures the overlap.
 * Nothing here can tune a signal to fit a series, because by the time both
 * arrive they are immutable.
 *
 * ## What this produces, and what it does not
 *
 * It produces a description of a historical alignment, with its uncertainty
 * and its limitations attached. It does not produce a prediction, a
 * recommendation, or evidence of a mechanism. Those distinctions are not
 * decoration: a study of this kind is exceptionally easy to over-read, and the
 * warnings below are the part of the output most worth attending to.
 *
 * Warnings are CODES, never prose, so this layer stays language-neutral and the
 * message catalogue owns the wording — the same rule the calculation engine
 * follows.
 */
import type { EphemerisProvider } from '@astro/engine';
import { evaluateSignal } from '../signals/evaluate.js';
import type { SignalSpec } from '../signals/types.js';
import { logReturns, profileSeries, inferPeriodsPerYear, type Series } from '../market/series.js';
import {
  describe as summarise,
  partition,
  rotationTest,
  rotationPValueFloor,
  welchTTest,
  type GroupStats,
  type RotationResult,
  type WelchResult,
} from '../stats/tests.js';
import { benjaminiHochberg, holmBonferroni, survivorCounts } from '../stats/multiple.js';

export type StudyWarningCode =
  /** Too few active observations for the comparison to mean much. */
  | 'SMALL_ACTIVE_SAMPLE'
  /** The signal is active on almost all, or almost none, of the sample. */
  | 'IMBALANCED_SAMPLE'
  /** The signal's own periodicity leaves the rotation test little or no room. */
  | 'ROTATION_FLOOR_LIMITS_POWER'
  /** More than one signal was tested; read the corrected values, not the raw. */
  | 'MULTIPLE_TESTS'
  /** Everything was measured on the same data used to choose the signals. */
  | 'IN_SAMPLE_ONLY'
  /** The series has gaps longer than a long weekend. */
  | 'SERIES_HAS_GAPS'
  /** Fewer bars than any of this makes sense on. */
  | 'SHORT_SERIES'
  /** Signals overlap heavily, so the corrections lean on a dependence assumption. */
  | 'SIGNALS_OVERLAP';

export interface StudyWarning {
  readonly code: StudyWarningCode;
  /** Numbers for the message, never a sentence. */
  readonly params?: Readonly<Record<string, string | number>>;
}

/** Below this many active bars, the comparison is not worth reporting. */
export const MINIMUM_ACTIVE_BARS = 30;
/** Outside this share of the sample, the split is too lopsided to interpret. */
export const MINIMUM_ACTIVE_SHARE = 0.02;
/** Fewer bars than this and even a single well-balanced signal says little. */
export const MINIMUM_BARS = 250;
/** Jaccard overlap above which the corrections' independence assumption is strained. */
export const OVERLAP_WARNING_THRESHOLD = 0.8;
/**
 * Warn once the periodicity floor reaches this fraction of α.
 *
 * Not simply `floor > α`. A full-moon window over fifteen years has a floor
 * around 0.047 — technically below the 0.05 threshold, but leaving the test a
 * usable range of [0.047, 1]. Reporting "not significant" from a test with
 * almost no room to be anything else would mislead as badly as reporting a
 * false positive, so the warning fires while there is still headroom to
 * mention.
 */
export const ROTATION_FLOOR_WARNING_RATIO = 0.5;

export interface SignalStudy {
  readonly signalId: string;
  readonly spec: SignalSpec;
  readonly activeBars: number;
  readonly inactiveBars: number;
  readonly activeShare: number;
  readonly inSignal: GroupStats;
  readonly outOfSignal: GroupStats;
  /** Mean log-return difference, signal minus non-signal. */
  readonly difference: number;
  /** Parametric, assumptions violated — kept as a cross-check only. */
  readonly welch: WelchResult;
  /** The test to believe. Undefined when the signal never varies. */
  readonly rotation?: RotationResult;
  /**
   * Smallest p-value the rotation test could return for this signal, given its
   * periodicity. A p-value at or near this number carries no information.
   */
  readonly rotationFloor: number;
  /** Benjamini–Hochberg q-value across the whole family. */
  readonly falseDiscoveryRate?: number;
  /** Holm–Bonferroni adjusted p-value across the whole family. */
  readonly familyWiseAdjusted?: number;
  /** Same statistics on the held-out tail, when a split was requested. */
  readonly outOfSample?: {
    readonly activeBars: number;
    readonly difference: number;
    readonly rotationPValue: number;
    /** True when the out-of-sample difference has the same sign as in-sample. */
    readonly signAgrees: boolean;
  };
  readonly warnings: readonly StudyWarning[];
}

export interface StudyOptions {
  readonly alpha?: number;
  readonly iterations?: number;
  readonly seed?: number;
  /**
   * Fraction of the series held back and never used for selection.
   *
   * The single most effective guard against over-reading a screen. A pattern
   * chosen because it worked in the first 70% has to survive the last 30% it
   * was not chosen on, and most do not.
   */
  readonly outOfSampleFraction?: number;
}

export interface StudyResult {
  readonly symbol: string;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly bars: number;
  readonly barsPerYear: number;
  readonly frequency: 'daily' | 'weekly' | 'monthly' | 'irregular';
  readonly alpha: number;
  readonly seed: number;
  readonly signals: readonly SignalStudy[];
  /** Raw versus corrected survivor counts, side by side. */
  readonly correction: ReturnType<typeof survivorCounts>;
  readonly warnings: readonly StudyWarning[];
}

/**
 * Run a study.
 *
 * Every signal supplied is tested and reported, including the uninteresting
 * ones. Dropping a signal because it looked unpromising would silently reduce
 * the test count and inflate every correction that follows — which is the same
 * error as not correcting at all, arrived at more comfortably.
 */
export function runStudy(
  provider: EphemerisProvider,
  series: Series,
  specs: readonly SignalSpec[],
  options: StudyOptions = {},
): StudyResult {
  const alpha = options.alpha ?? 0.05;
  const seed = options.seed ?? 20260826;
  const iterations = options.iterations ?? 10_000;
  const holdout = options.outOfSampleFraction ?? 0;

  const profile = profileSeries(series);
  const { periodsPerYear, label } = inferPeriodsPerYear(profile);

  const returns = logReturns(series);
  const dates = returns.map((point) => point.date);
  const values = returns.map((point) => point.logReturn);

  // The in-sample/out-of-sample boundary, computed once so every signal is
  // split at the same date.
  const splitIndex = holdout > 0 ? Math.floor(values.length * (1 - holdout)) : values.length;

  const studies: SignalStudy[] = [];
  const masks: (readonly boolean[])[] = [];

  for (const spec of specs) {
    const evaluated = evaluateSignal(provider, spec, dates);
    const active = evaluated.active;
    const warnings: StudyWarning[] = [];

    masks.push(active);
    const { inSignal, outOfSignal } = partition(values, active);
    const activeShare = active.length === 0 ? 0 : evaluated.activeDays / active.length;
    const rotationFloor = rotationPValueFloor(active);

    if (evaluated.activeDays < MINIMUM_ACTIVE_BARS) {
      warnings.push({
        code: 'SMALL_ACTIVE_SAMPLE',
        params: { active: evaluated.activeDays, minimum: MINIMUM_ACTIVE_BARS },
      });
    }
    if (activeShare < MINIMUM_ACTIVE_SHARE || activeShare > 1 - MINIMUM_ACTIVE_SHARE) {
      warnings.push({
        code: 'IMBALANCED_SAMPLE',
        params: { share: activeShare },
      });
    }
    if (rotationFloor >= alpha * ROTATION_FLOOR_WARNING_RATIO) {
      warnings.push({
        code: 'ROTATION_FLOOR_LIMITS_POWER',
        params: { floor: rotationFloor, alpha },
      });
    }

    const canTest = inSignal.length >= 2 && outOfSignal.length >= 2;
    const welch = canTest
      ? welchTTest(inSignal, outOfSignal)
      : {
          meanA: Number.NaN, meanB: Number.NaN, difference: Number.NaN,
          t: Number.NaN, degreesOfFreedom: Number.NaN, pValue: 1, effectSize: Number.NaN,
        };

    const rotation = canTest
      ? rotationTest(values, active, { iterations, seed })
      : undefined;

    let outOfSampleResult: SignalStudy['outOfSample'];
    if (holdout > 0 && splitIndex < values.length) {
      const heldValues = values.slice(splitIndex);
      const heldActive = active.slice(splitIndex);
      const heldActiveCount = heldActive.reduce<number>((n, on) => n + (on ? 1 : 0), 0);
      if (heldActiveCount >= 2 && heldActiveCount <= heldActive.length - 2) {
        const held = rotationTest(heldValues, heldActive, { iterations, seed: seed + 1 });
        const inSample = partition(values.slice(0, splitIndex), active.slice(0, splitIndex));
        const inSampleDifference =
          summarise(inSample.inSignal).mean - summarise(inSample.outOfSignal).mean;
        outOfSampleResult = {
          activeBars: heldActiveCount,
          difference: held.observed,
          rotationPValue: held.pValue,
          signAgrees: Math.sign(held.observed) === Math.sign(inSampleDifference),
        };
      }
    }

    studies.push({
      signalId: spec.id,
      spec,
      activeBars: evaluated.activeDays,
      inactiveBars: active.length - evaluated.activeDays,
      activeShare,
      inSignal: summarise(inSignal),
      outOfSignal: summarise(outOfSignal),
      difference: summarise(inSignal).mean - summarise(outOfSignal).mean,
      welch,
      ...(rotation ? { rotation } : {}),
      rotationFloor,
      ...(outOfSampleResult ? { outOfSample: outOfSampleResult } : {}),
      warnings,
    });
  }

  /*
   * Correction across the whole family. The rotation p-value is used because
   * it is the one that will be read; correcting the parametric value would
   * adjust a number nobody should be acting on.
   *
   * Signals with no usable test still contribute a p-value of 1 rather than
   * being dropped, so the test count stays honest.
   */
  const pValues = studies.map((study) => study.rotation?.pValue ?? 1);
  const fdr = benjaminiHochberg(pValues);
  const holm = holmBonferroni(pValues);

  const withCorrections = studies.map((study, index) => ({
    ...study,
    falseDiscoveryRate: fdr[index]!.adjusted,
    familyWiseAdjusted: holm[index]!.adjusted,
  }));

  const warnings: StudyWarning[] = [];
  if (specs.length > 1) {
    warnings.push({
      code: 'MULTIPLE_TESTS',
      params: { tests: specs.length, expected: specs.length * alpha },
    });
  }
  if (holdout <= 0) warnings.push({ code: 'IN_SAMPLE_ONLY' });
  if (profile.bars < MINIMUM_BARS) {
    warnings.push({ code: 'SHORT_SERIES', params: { bars: profile.bars, minimum: MINIMUM_BARS } });
  }
  if (profile.gapsOverFourDays > 0) {
    warnings.push({
      code: 'SERIES_HAS_GAPS',
      params: { gaps: profile.gapsOverFourDays, largest: profile.largestGapDays },
    });
  }
  const overlap = maximumOverlap(masks);
  if (specs.length > 1 && overlap > OVERLAP_WARNING_THRESHOLD) {
    warnings.push({
      code: 'SIGNALS_OVERLAP',
      params: { overlap },
    });
  }

  return {
    symbol: series.symbol,
    firstDate: profile.firstDate,
    lastDate: profile.lastDate,
    bars: profile.bars,
    barsPerYear: periodsPerYear,
    frequency: label,
    alpha,
    seed,
    signals: withCorrections,
    correction: survivorCounts(pValues, alpha),
    warnings,
  };
}

/**
 * Largest Jaccard overlap between any two signals in the family.
 *
 * Measured from the masks themselves rather than inferred from how often each
 * signal is active — two signals can each be active a fifth of the time and
 * share no days at all, so comparing shares would report heavy overlap where
 * there is none.
 *
 * Used to raise a warning, because "Mercury retrograde" and "Mercury retrograde
 * in Gemini" overlap almost entirely, and a family built from such pairs is not
 * the family the corrections nominally assume.
 */
export function maximumOverlap(masks: readonly (readonly boolean[])[]): number {
  let maximum = 0;
  for (let i = 0; i < masks.length; i++) {
    for (let j = i + 1; j < masks.length; j++) {
      const a = masks[i]!;
      const b = masks[j]!;
      if (a.length !== b.length) continue;
      let intersection = 0;
      let union = 0;
      for (let k = 0; k < a.length; k++) {
        if (a[k] && b[k]) intersection += 1;
        if (a[k] || b[k]) union += 1;
      }
      const jaccard = union === 0 ? 0 : intersection / union;
      if (jaccard > maximum) maximum = jaccard;
    }
  }
  return maximum;
}
