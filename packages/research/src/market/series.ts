/**
 * Price series and returns.
 *
 * Still no astrology here. This layer turns bars into the quantity every
 * statistic downstream actually operates on — the return from one observation
 * to the next — and records the facts about the series that a reader needs in
 * order to judge a result: how long it is, whether it has gaps, and how those
 * gaps were treated.
 */
import type { Bar } from './csv.js';

export interface Series {
  readonly symbol: string;
  readonly bars: readonly Bar[];
  readonly firstDate: string;
  readonly lastDate: string;
}

export interface ReturnPoint {
  /** The day the return is realised, i.e. the later of the two closes. */
  readonly date: string;
  /** log(close_t / close_{t−1}). */
  readonly logReturn: number;
  /** Calendar days since the previous bar. 1 on consecutive days. */
  readonly gapDays: number;
}

export function makeSeries(symbol: string, bars: readonly Bar[]): Series {
  if (bars.length === 0) throw new RangeError('a series needs at least one bar');
  return {
    symbol,
    bars,
    firstDate: bars[0]!.date,
    lastDate: bars[bars.length - 1]!.date,
  };
}

const MS_PER_DAY = 86_400_000;

/** Whole days between two ISO dates. Both are UTC midnights, so this is exact. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * Log returns between consecutive bars.
 *
 * Logarithmic rather than simple, because log returns add over time, which is
 * what makes aggregating a window meaningful; and because the distribution is
 * closer to symmetric, which is what the tests downstream assume.
 *
 * `gapDays` is carried through rather than discarded. A "daily" equity series
 * has a three-day gap over every weekend and longer over holidays, so a
 * one-day signal window is not one bar — and a study that assumed it was would
 * silently mis-align every event by up to four days.
 */
export function logReturns(series: Series): readonly ReturnPoint[] {
  const out: ReturnPoint[] = [];
  for (let i = 1; i < series.bars.length; i++) {
    const previous = series.bars[i - 1]!;
    const current = series.bars[i]!;
    out.push({
      date: current.date,
      logReturn: Math.log(current.close / previous.close),
      gapDays: daysBetween(previous.date, current.date),
    });
  }
  return out;
}

/** Convert a log return to the simple percentage a reader expects to see. */
export function toSimpleReturn(logReturn: number): number {
  return Math.expm1(logReturn);
}

export interface SeriesProfile {
  readonly bars: number;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly calendarDays: number;
  /** Bars per calendar year, which identifies the trading calendar in use. */
  readonly barsPerYear: number;
  /** Largest gap between consecutive bars, in calendar days. */
  readonly largestGapDays: number;
  /** Gaps longer than a long weekend — holidays, halts, or missing data. */
  readonly gapsOverFourDays: number;
}

/**
 * Describe a series, so a study can state what it was actually run on.
 *
 * `barsPerYear` is measured, not assumed. Annualising a Sharpe ratio with 252
 * when the file is weekly overstates it by more than a factor of two, and
 * nothing about the numbers themselves would reveal the error.
 */
export function profileSeries(series: Series): SeriesProfile {
  const calendarDays = daysBetween(series.firstDate, series.lastDate);
  let largestGapDays = 0;
  let gapsOverFourDays = 0;

  for (let i = 1; i < series.bars.length; i++) {
    const gap = daysBetween(series.bars[i - 1]!.date, series.bars[i]!.date);
    if (gap > largestGapDays) largestGapDays = gap;
    if (gap > 4) gapsOverFourDays += 1;
  }

  return {
    bars: series.bars.length,
    firstDate: series.firstDate,
    lastDate: series.lastDate,
    calendarDays,
    barsPerYear: calendarDays > 0 ? (series.bars.length * 365.25) / calendarDays : 0,
    largestGapDays,
    gapsOverFourDays,
  };
}

/**
 * Trading periods per year, inferred from the series itself.
 *
 * Snapped to the nearest conventional calendar so an annualised figure is not
 * quoted against a meaningless fractional period, and returned with the raw
 * measurement so a caller can see how good the fit was.
 */
export function inferPeriodsPerYear(profile: SeriesProfile): {
  readonly periodsPerYear: number;
  readonly label: 'daily' | 'weekly' | 'monthly' | 'irregular';
} {
  const measured = profile.barsPerYear;
  // Daily trading calendars run 250-260 bars; weekly 52; monthly 12.
  if (measured >= 200 && measured <= 300) return { periodsPerYear: 252, label: 'daily' };
  if (measured >= 40 && measured <= 60) return { periodsPerYear: 52, label: 'weekly' };
  if (measured >= 10 && measured <= 14) return { periodsPerYear: 12, label: 'monthly' };
  return { periodsPerYear: measured, label: 'irregular' };
}
