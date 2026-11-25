/**
 * Bad-bar screen for vendor price series.
 *
 * Free daily series carry the odd bar that is plainly a vendor fault: a unit
 * split applied to two days only (GOLDBEES on 2019-12-19 and 2019-12-20 reads
 * 1/100 of the price), or a single print far off the market that is back
 * the next day (RELIANCE.NS 2005-07-28). Returns computed through such a bar
 * are -99% and +9,900%, and one of them outweighs every real day in a study.
 *
 * The rule is narrow on purpose, so a real crash is never touched: a bar is
 * set aside only when it moves more than `jump` from the previous close AND
 * the price is back within `back` of that previous close within `within`
 * bars (10 by default). A genuine fall that stays down (the 2020 crash, January 2026 in
 * silver) never returns that fast, so it stays.
 *
 * Set-aside bars are never replaced or filled. They are listed, with both
 * prices, so the reader can see what was left out and why; the day then
 * reads as a missing session.
 */
import type { Bar } from './csv.js';

export interface SuspectBar {
  readonly date: string;
  readonly close: number;
  /** The last good close before it. */
  readonly previousClose: number;
  /** The close the price came back to. */
  readonly backTo: number;
}

export interface ScreenOptions {
  /** Proportional move that makes a bar a candidate. 0.4 is 40%. */
  readonly jump?: number;
  /** How close to the previous close the price must come back. 0.1 is 10%. */
  readonly back?: number;
  /** Within how many bars it must come back. */
  readonly within?: number;
}

export interface ScreenedBars {
  readonly bars: readonly Bar[];
  readonly suspect: readonly SuspectBar[];
}

export function screenBars(input: readonly Bar[], options: ScreenOptions = {}): ScreenedBars {
  const jump = Math.log(1 + (options.jump ?? 0.4));
  const back = Math.log(1 + (options.back ?? 0.1));
  const within = options.within ?? 10;
  const kept: Bar[] = [];
  const suspect: SuspectBar[] = [];
  let i = 0;
  while (i < input.length) {
    const prev = kept[kept.length - 1];
    const bar = input[i]!;
    if (prev && Math.abs(Math.log(bar.close / prev.close)) > jump) {
      let returned = -1;
      for (let j = i + 1; j <= i + within && j < input.length; j++) {
        if (Math.abs(Math.log(input[j]!.close / prev.close)) < back) { returned = j; break; }
      }
      if (returned > 0) {
        for (let k = i; k < returned; k++) {
          suspect.push({ date: input[k]!.date, close: input[k]!.close, previousClose: prev.close, backTo: input[returned]!.close });
        }
        i = returned;
        continue;
      }
    }
    kept.push(bar);
    i++;
  }
  return { bars: suspect.length === 0 ? input : kept, suspect };
}
