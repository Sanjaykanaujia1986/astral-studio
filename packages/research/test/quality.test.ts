import { describe, expect, it } from 'vitest';
import { screenBars, type Bar } from '../src/index.js';

const bars = (closes: number[]): Bar[] => closes.map((close, i) => ({ date: `2019-12-${String(10 + i).padStart(2, '0')}`, close }));

describe('screenBars (synthetic prices)', () => {
  it('sets aside a split applied to two days only, and lists both prices', () => {
    const r = screenBars(bars([33.5, 33.6, 0.3355, 0.3365, 33.65, 33.7]));
    expect(r.suspect.map((s) => s.date)).toEqual(['2019-12-12', '2019-12-13']);
    expect(r.suspect[0]).toMatchObject({ close: 0.3355, previousClose: 33.6, backTo: 33.65 });
    expect(r.bars.map((b) => b.close)).toEqual([33.5, 33.6, 33.65, 33.7]);
  });
  it('sets aside a one-day spike that is back the next day', () => {
    const r = screenBars(bars([50, 49.9, 218.3, 50.2, 50.5]));
    expect(r.suspect.map((s) => s.date)).toEqual(['2019-12-12']);
  });
  it('keeps a real crash that stays down, and a large real day', () => {
    const crash = bars([114, 78.3, 80, 79, 81]);
    expect(screenBars(crash).suspect).toEqual([]);
    expect(screenBars(crash).bars).toBe(crash);
    // An election-day +17.7% is under the 40% threshold.
    expect(screenBars(bars([3671.6, 4323.1, 4300])).suspect).toEqual([]);
  });
  it('does not set aside a jump that only comes back after the window', () => {
    expect(screenBars(bars([10, 20, 20, 20, 20, 10]), { within: 3 }).suspect).toEqual([]);
  });
});
