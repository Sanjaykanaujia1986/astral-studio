/**
 * @astro/research — financial astrology as an analytical, experimental tool.
 *
 * ## What this package is for
 *
 * Measuring whether a chart configuration and a price series happen to line up
 * historically, and — more importantly — saying honestly how much that is
 * worth. It is exploratory instrumentation, not a forecasting product.
 *
 * ## What it will not do
 *
 * It will not predict a price, recommend a trade, or claim a mechanism. Every
 * result is a description of the past with its uncertainty attached, and the
 * warnings are the part worth reading first.
 *
 * ## Three layers, kept apart
 *
 * ```
 * market/    prices. Knows nothing about astrology.
 * signals/   the sky. Knows nothing about markets.
 * stats/     arithmetic. Knows nothing about either.
 * study/     joins two finished results and measures the overlap.
 * ```
 *
 * The separation is what prevents the most tempting error in this field:
 * adjusting a signal definition until it fits a particular price series. By the
 * time a study sees them, both sides are already immutable.
 *
 * No market data ships with this package. Everything operates on files the user
 * supplies.
 */

// Market data
export {
  parseMarketCsv, splitCsvLine, detectDelimiter, parseDateCell, parseNumberCell,
  CsvImportError,
  type Bar, type CsvErrorCode, type ParsedCsv, type ParseOptions, type RejectedRow,
} from './market/csv.js';
export {
  ProviderError, PROVIDER_ERROR_CODES, isProviderErrorCode,
  type FetchedBars, type FetchedSeries, type MarketDataProvider,
  type ProviderDescription,
  type ProviderErrorCode,
} from './market/provider.js';
export {
  makeSeries, logReturns, toSimpleReturn, profileSeries, inferPeriodsPerYear, daysBetween,
  type ReturnPoint, type Series, type SeriesProfile,
} from './market/series.js';

// Signals
export {
  evaluateSignal, describeSignal, dateRange, jdForDate, scanStepFor, SAMPLE_HOUR_UT,
} from './signals/evaluate.js';
export type {
  AspectWindowSignal, DeclinationSignal, EvaluatedSignal, PhaseRangeSignal,
  RetrogradeSignal, SignOccupancySignal, SignalBase, SignalSpec,
} from './signals/types.js';

// Statistics
export {
  logGamma, incompleteBeta, studentTTwoTailed, normalCdf, erf, regularisedGammaP,
} from './stats/distributions.js';
export {
  describe as summarise, welchTTest, rotationTest, rotationPValueFloor,
  countActiveBlocks, partition, mulberry32,
  type GroupStats, type RotationResult, type WelchResult,
} from './stats/tests.js';
export {
  holmBonferroni, benjaminiHochberg, survivorCounts,
  type AdjustedPValue,
} from './stats/multiple.js';

// Studies
export {
  runStudy, maximumOverlap,
  MINIMUM_ACTIVE_BARS, MINIMUM_ACTIVE_SHARE, MINIMUM_BARS, OVERLAP_WARNING_THRESHOLD,
  type SignalStudy, type StudyOptions, type StudyResult,
  type StudyWarning, type StudyWarningCode,
} from './study/engine.js';

// Backtesting
export {
  runBacktest, maxDrawdown,
  type BacktestOptions, type BacktestResult,
} from './backtest/engine.js';
