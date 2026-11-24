/**
 * One row per calendar day: SYNTHETIC closes on the NSE 2026 calendar.
 */
import { describe, it, expect } from 'vitest';
import { makeSeries } from '../src/market/series.js';
import { NSE_CALENDAR, COMEX_CALENDAR } from '../src/market/calendar.js';
import { dailyRows } from '../src/market/daily.js';

// 19–23 October 2026: Mon 19 session, Tue 20 Dussehra, Wed 21 session, Thu 22 missing, Fri 23 session.
const series = makeSeries('TEST', [
  { date: '2026-10-16', close: 100 }, { date: '2026-10-19', close: 101 },
  { date: '2026-10-21', close: 101 }, { date: '2026-10-23', close: 99.99 },
]);

describe('dailyRows', () => {
  const rows = dailyRows(series, NSE_CALENDAR, '2026-10-17', '2026-10-23');
  it('gives every calendar day a row and tells the kinds of day apart', () => {
    expect(rows.map((r) => [r.date, r.status])).toEqual([
      ['2026-10-17', 'weekend'], ['2026-10-18', 'weekend'], ['2026-10-19', 'session'],
      ['2026-10-20', 'holiday'], ['2026-10-21', 'session'], ['2026-10-22', 'missing'], ['2026-10-23', 'session'],
    ]);
    expect(rows[3]!.holiday).toBe('Dussehra');
  });
  it('prices only sessions, against the previous bar, never across a gap silently', () => {
    expect(rows.filter((r) => r.close !== null).map((r) => r.date)).toEqual(['2026-10-19', '2026-10-21', '2026-10-23']);
    expect(rows[2]).toMatchObject({ previousDate: '2026-10-16', direction: 'up' });
    expect(rows[4]).toMatchObject({ previousDate: '2026-10-19', direction: 'flat', changePct: 0 });
    expect(rows[6]!.direction).toBe('down');
    expect(rows[6]!.previousDate).toBe('2026-10-21'); // the missing 22nd is not invented
  });
  it('flags a bar on a day the calendar says is shut', () => {
    const special = makeSeries('TEST', [{ date: '2026-11-06', close: 100 }, { date: '2026-11-08', close: 101 }]);
    const r = dailyRows(special, NSE_CALENDAR, '2026-11-08', '2026-11-08')[0]!;
    expect([r.status, r.irregular, r.holiday]).toEqual(['session', true, 'Diwali Laxmi Pujan']);
  });
  it('calls weekdays unknown when there is no series or no holiday list', () => {
    expect(dailyRows(null, NSE_CALENDAR, '2026-10-22', '2026-10-22')[0]!.status).toBe('unknown');
    expect(dailyRows(null, COMEX_CALENDAR, '2026-11-26', '2026-11-26')[0]!.status).toBe('unknown');
  });
});
