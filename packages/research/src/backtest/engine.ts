/**
 * Backtesting a signal as a trading rule.
 *
 * ## Read this before reading any number this module produces
 *
 * A backtest is a description of what a rule would have done on data that has
 * already happened, chosen after seeing it. It is the most persuasive and least
 * reliable artefact in quantitative finance, and it becomes more persuasive as
 * it becomes less reliable: the more variants you try, the better the best one
 * looks and the less it means.
 *
 * This module therefore makes the unflattering facts hard to avoid. Costs are
 * charged on every position change and are not optional. The equity curve is
 * reported alongside buy-and-hold, because a rule that made money in a rising
 * market has not necessarily done anything. Turnover is reported, because a
 * strategy trading daily is making a far stronger claim than one trading twice
 * a year. And the out-of-sample segment is computed separately whenever a split
 * is given.
 *
 * ## Timing
 *
 * A position is taken at the close of the bar on which the signal is observed
 * and earns the NEXT bar's return. Using the same bar's return would be
 * look-ahead — trading on information not yet available — and it is the single
 * most common way a backtest comes out looking wonderful and is worthless. The
 * offset is applied here, once, so no caller can forget it.
 */
import type { ReturnPoint } from '../market/series.js';

export interface BacktestOptions {
  /**
   * Round-trip cost per unit of position change, in basis points.
   *
   * Charged on |Δposition|, so a flat-to-long switch costs the full amount and
   * a long-to-short switch costs twice. Defaults to 10bp, which is generous for
   * a liquid index and optimistic for anything else.
   */
  readonly costBasisPoints?: number;
  /** Bars per year, for annualising. Measure it; do not assume 252. */
  readonly periodsPerYear: number;
  /** Position when the signal is inactive. 0 = flat, −1 = short. */
  readonly inactivePosition?: 0 | -1;
}

export interface BacktestResult {
  readonly bars: number;
  /** Cumulative log return of the strategy, after costs. */
  readonly totalLogReturn: number;
  readonly totalReturn: number;
  readonly annualisedReturn: number;
  readonly annualisedVolatility: number;
  /** Excess return over volatility. Risk-free rate assumed zero — see notes. */
  readonly sharpe: number;
  readonly maxDrawdown: number;
  /** Share of bars spent in a non-zero position. */
  readonly exposure: number;
  /** Position changes per year. */
  readonly turnover: number;
  readonly costPaidLogReturn: number;
  /** The same series bought and held, for comparison. */
  readonly buyAndHold: {
    readonly totalLogReturn: number;
    readonly totalReturn: number;
    readonly annualisedReturn: number;
    readonly annualisedVolatility: number;
    readonly sharpe: number;
    readonly maxDrawdown: number;
  };
  /** Cumulative log equity, one point per bar, for plotting. */
  readonly equityCurve: readonly number[];
}

const BASIS_POINT = 1e-4;

/**
 * Run a backtest.
 *
 * `active[i]` is the signal state observed on bar `i`; the position it implies
 * earns `returns[i + 1]`. The final bar's signal earns nothing, because there
 * is no next bar — dropping it silently would overstate the sample by one and,
 * more importantly, hide that the offset exists.
 */
export function runBacktest(
  returns: readonly ReturnPoint[],
  active: readonly boolean[],
  options: BacktestOptions,
): BacktestResult {
  if (returns.length !== active.length) {
    throw new RangeError(
      `backtest needs matching lengths, received ${returns.length} and ${active.length}`,
    );
  }
  if (returns.length < 2) throw new RangeError('backtest needs at least two bars');

  const cost = (options.costBasisPoints ?? 10) * BASIS_POINT;
  const inactive = options.inactivePosition ?? 0;
  const periodsPerYear = options.periodsPerYear;
  if (!(periodsPerYear > 0)) {
    throw new RangeError('periodsPerYear must be positive; measure it from the series');
  }

  const strategyReturns: number[] = [];
  const holdReturns: number[] = [];
  const equityCurve: number[] = [];

  let equity = 0;
  let previousPosition = 0;
  let positionChanges = 0;
  let costPaid = 0;
  let barsInPosition = 0;

  for (let i = 0; i < returns.length - 1; i++) {
    const position = active[i] ? 1 : inactive;
    const change = Math.abs(position - previousPosition);
    if (change > 0) positionChanges += 1;

    // Cost is charged as a log return, consistent with everything else here.
    const barCost = change * cost;
    // The NEXT bar's return — see the timing note above.
    const barReturn = position * returns[i + 1]!.logReturn - barCost;

    costPaid += barCost;
    if (position !== 0) barsInPosition += 1;

    strategyReturns.push(barReturn);
    holdReturns.push(returns[i + 1]!.logReturn);
    equity += barReturn;
    equityCurve.push(equity);

    previousPosition = position;
  }

  const bars = strategyReturns.length;
  const years = bars / periodsPerYear;

  return {
    bars,
    ...summarisePerformance(strategyReturns, periodsPerYear),
    maxDrawdown: maxDrawdown(equityCurve),
    exposure: barsInPosition / bars,
    turnover: years > 0 ? positionChanges / years : 0,
    costPaidLogReturn: costPaid,
    buyAndHold: {
      ...summarisePerformance(holdReturns, periodsPerYear),
      maxDrawdown: maxDrawdown(cumulative(holdReturns)),
    },
    equityCurve,
  };
}

function cumulative(values: readonly number[]): number[] {
  const out: number[] = [];
  let running = 0;
  for (const value of values) {
    running += value;
    out.push(running);
  }
  return out;
}

function summarisePerformance(
  values: readonly number[],
  periodsPerYear: number,
): {
  totalLogReturn: number;
  totalReturn: number;
  annualisedReturn: number;
  annualisedVolatility: number;
  sharpe: number;
} {
  const n = values.length;
  const total = values.reduce((sum, v) => sum + v, 0);
  const mean = total / n;
  const variance = n < 2
    ? 0
    : values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);

  const annualisedVolatility = sd * Math.sqrt(periodsPerYear);
  const annualisedLog = mean * periodsPerYear;

  return {
    totalLogReturn: total,
    totalReturn: Math.expm1(total),
    // Reported as the simple equivalent, which is what a reader compares
    // against a quoted return.
    annualisedReturn: Math.expm1(annualisedLog),
    annualisedVolatility,
    /*
     * Risk-free rate is taken as ZERO and this is not configurable, because a
     * configurable one invites quoting a Sharpe against whichever rate makes it
     * look best. Over a period when cash paid 4%, a "Sharpe" computed this way
     * flatters any long-biased strategy, and a reader comparing it with a
     * published figure is not comparing like with like.
     */
    sharpe: annualisedVolatility === 0 ? 0 : annualisedLog / annualisedVolatility,
  };
}

/**
 * Largest peak-to-trough fall in the log equity curve, as a simple fraction.
 *
 * Computed on log equity and converted at the end, so a 50% drawdown reads as
 * 0.5 rather than as a log quantity nobody has intuition for.
 */
export function maxDrawdown(logEquity: readonly number[]): number {
  let peak = Number.NEGATIVE_INFINITY;
  let worst = 0;
  for (const point of logEquity) {
    if (point > peak) peak = point;
    const drawdown = -Math.expm1(point - peak);
    if (drawdown > worst) worst = drawdown;
  }
  return worst;
}
