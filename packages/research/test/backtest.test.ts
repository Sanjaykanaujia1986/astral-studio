import { describe, it, expect } from 'vitest';
import { runBacktest, maxDrawdown } from '../src/backtest/engine.js';
import type { ReturnPoint } from '../src/market/series.js';

/** Synthetic return points at one-day spacing. */
function points(logReturns: readonly number[]): ReturnPoint[] {
  return logReturns.map((logReturn, i) => ({
    date: new Date(Date.UTC(2024, 0, 2 + i)).toISOString().slice(0, 10),
    logReturn,
    gapDays: 1,
  }));
}

const FREE = { periodsPerYear: 252, costBasisPoints: 0 } as const;

describe('backtest timing', () => {
  it('earns the NEXT bar return, not the current one', () => {
    /*
     * The single most common way a backtest comes out wonderful and is
     * worthless. Here the signal fires on the bar BEFORE each +10% move, so a
     * correctly lagged strategy captures both moves. If the engine used the
     * same bar's return it would capture nothing, because the signal bars
     * themselves are flat.
     */
    const returns = points([0, 0.1, 0, 0.1, 0]);
    const active = [true, false, true, false, false];
    const result = runBacktest(returns, active, FREE);
    expect(result.totalLogReturn).toBeCloseTo(0.2, 12);
  });

  it('cannot see the future: shifting the signal one bar later earns nothing', () => {
    // The mirror of the test above. Aligning the signal WITH the move rather
    // than before it must produce zero, which it only does if the lag is real.
    const returns = points([0, 0.1, 0, 0.1, 0]);
    const active = [false, true, false, true, false];
    expect(runBacktest(returns, active, FREE).totalLogReturn).toBeCloseTo(0, 12);
  });

  it('drops the final bar, because its signal has no return to earn', () => {
    const returns = points([0.01, 0.01, 0.01, 0.01]);
    expect(runBacktest(returns, [true, true, true, true], FREE).bars).toBe(3);
  });
});

describe('costs', () => {
  it('charges on every position change', () => {
    // Flat → long → flat → long → flat is four changes at 10bp each.
    const returns = points([0, 0, 0, 0, 0, 0]);
    const active = [true, false, true, false, false, false];
    const result = runBacktest(returns, active, { periodsPerYear: 252, costBasisPoints: 10 });
    expect(result.costPaidLogReturn).toBeCloseTo(4 * 0.001, 12);
    // With flat returns, the whole loss is cost.
    expect(result.totalLogReturn).toBeCloseTo(-4 * 0.001, 12);
  });

  it('charges double for a long-to-short reversal', () => {
    const returns = points([0, 0, 0]);
    const active = [true, false, false];
    const result = runBacktest(returns, active, {
      periodsPerYear: 252, costBasisPoints: 10, inactivePosition: -1,
    });
    // Flat→long is 1 unit, long→short is 2 units.
    expect(result.costPaidLogReturn).toBeCloseTo(3 * 0.001, 12);
  });

  it('applies a default cost rather than letting a caller forget', () => {
    const returns = points([0, 0, 0]);
    const result = runBacktest(returns, [true, false, false], { periodsPerYear: 252 });
    expect(result.costPaidLogReturn).toBeGreaterThan(0);
  });
});

describe('performance statistics', () => {
  it('annualises with the periods actually supplied', () => {
    /*
     * A weekly series annualised at 252 would overstate volatility by √(252/52)
     * ≈ 2.2×. Asserting both directions catches a hard-coded constant.
     */
    const returns = points(Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.01 : -0.005)));
    const active = new Array<boolean>(100).fill(true);
    const daily = runBacktest(returns, active, { periodsPerYear: 252, costBasisPoints: 0 });
    const weekly = runBacktest(returns, active, { periodsPerYear: 52, costBasisPoints: 0 });
    expect(daily.annualisedVolatility / weekly.annualisedVolatility)
      .toBeCloseTo(Math.sqrt(252 / 52), 10);
    // The Sharpe ratio scales the same way, so the two disagree markedly.
    expect(daily.sharpe / weekly.sharpe).toBeCloseTo(Math.sqrt(252 / 52), 10);
  });

  it('refuses to annualise without a measured period', () => {
    expect(() => runBacktest(points([0.1, 0.1]), [true, true], { periodsPerYear: 0 }))
      .toThrow(/periodsPerYear/);
  });

  it('reports buy-and-hold alongside, so a rising market is visible', () => {
    /*
     * A rule that is long 80% of the time in a market that rose throughout will
     * show a handsome return while having done nothing. Reporting the benchmark
     * next to it is what makes that legible.
     */
    const returns = points(new Array<number>(100).fill(0.002));
    const active = Array.from({ length: 100 }, (_, i) => i % 5 !== 0);
    const result = runBacktest(returns, active, FREE);
    expect(result.buyAndHold.totalLogReturn).toBeGreaterThan(result.totalLogReturn);
  });

  it('reports exposure and turnover', () => {
    const returns = points(new Array<number>(101).fill(0));
    // Active in blocks of 10, so 10 position changes over 100 usable bars.
    const active = Array.from({ length: 101 }, (_, i) => Math.floor(i / 10) % 2 === 0);
    const result = runBacktest(returns, active, FREE);
    expect(result.exposure).toBeCloseTo(0.5, 1);
    expect(result.turnover).toBeGreaterThan(0);
  });

  it('gives a flat strategy zero Sharpe rather than dividing by zero', () => {
    const result = runBacktest(points([0, 0, 0, 0]), [false, false, false, false], FREE);
    expect(result.sharpe).toBe(0);
    expect(Number.isFinite(result.sharpe)).toBe(true);
  });
});

describe('maxDrawdown', () => {
  it('measures peak to trough as a simple fraction', () => {
    // Log equity rising to log(2), falling to log(1), recovering.
    const curve = [0, Math.log(2), Math.log(1), Math.log(1.5)];
    // From 2 down to 1 is a 50% drawdown.
    expect(maxDrawdown(curve)).toBeCloseTo(0.5, 12);
  });

  it('is zero for a curve that never falls', () => {
    expect(maxDrawdown([0, 0.1, 0.2, 0.3])).toBeCloseTo(0, 12);
  });

  it('finds the worst fall, not the last one', () => {
    const curve = [0, Math.log(2), Math.log(1), Math.log(3), Math.log(2.5)];
    expect(maxDrawdown(curve)).toBeCloseTo(0.5, 12);
  });

  it('handles a curve that only falls', () => {
    expect(maxDrawdown([0, Math.log(0.5)])).toBeCloseTo(0.5, 12);
  });
});

describe('input validation', () => {
  it('rejects mismatched lengths', () => {
    expect(() => runBacktest(points([0.1, 0.2]), [true], FREE)).toThrow(/matching lengths/);
  });

  it('rejects a series too short to trade', () => {
    expect(() => runBacktest(points([0.1]), [true], FREE)).toThrow(/at least two bars/);
  });
});
