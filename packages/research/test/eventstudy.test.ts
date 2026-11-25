/**
 * Event studies, exchange calendars and the train/holdout sweep.
 *
 * Fixtures are SYNTHETIC: closes chosen so every forward return can be worked
 * out by hand. The calendar is NSE's 2026 list (Dussehra on 20 October and
 * Diwali Balipratipada on 10 November are holidays).
 */
import { describe, it, expect } from 'vitest';
import { makeSeries } from '../src/market/series.js';
import { NSE_CALENDAR, BSE_CALENDAR, COMEX_CALENDAR, dayStatus, missingSessions, isShut, comexHolidays, easterSunday } from '../src/market/calendar.js';
import {
  runEventStudy, referenceSession, forwardReturns, returnStats, sweepParameter,
  type StudyObservation,
} from '../src/eventstudy/engine.js';

/** Weekday sessions from `from`, skipping NSE's 2026 holidays, closes 100, 101, 102, … */
function sessions(from: string, count: number, skip: readonly string[] = []): { date: string; close: number }[] {
  const out: { date: string; close: number }[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); out.length < count; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const dow = new Date(t).getUTCDay();
    if (dow === 0 || dow === 6 || NSE_CALENDAR.holidays[date] || skip.includes(date)) continue;
    out.push({ date, close: 100 + out.length });
  }
  return out;
}

/** UTC ms of an IST wall time. */
const ist = (date: string, hhmm: string): number => Date.parse(`${date}T${hhmm}:00+05:30`);

const obs = (id: string, episodeId: string, instantMs: number, keys: Record<string, string> = {}): StudyObservation => ({ id, episodeId, instantMs, keys });

describe('exchange calendar', () => {
  const bars = sessions('2026-10-05', 40);
  const have = new Set(bars.map((b) => b.date));
  it('tells a weekend, a holiday and a session apart', () => {
    expect(dayStatus(NSE_CALENDAR, '2026-10-17', have)).toBe('weekend');
    expect(dayStatus(NSE_CALENDAR, '2026-10-20', have)).toBe('holiday');
    expect(dayStatus(NSE_CALENDAR, '2026-10-21', have)).toBe('session');
  });
  it('calls a weekday with no bar a missing session, not a holiday', () => {
    const gappy = new Set([...have].filter((d) => d !== '2026-10-22'));
    expect(dayStatus(NSE_CALENDAR, '2026-10-22', gappy)).toBe('missing');
    expect(missingSessions(NSE_CALENDAR, '2026-10-05', '2026-11-30', gappy)).toEqual(['2026-10-22']);
  });
  it('says unknown where no holiday list is loaded, rather than guessing', () => {
    expect(dayStatus(NSE_CALENDAR, '2010-10-22', new Set())).toBe('unknown');
    expect(dayStatus(COMEX_CALENDAR, '2010-11-24', new Set())).toBe('unknown');
  });
  it('holds the NSE and BSE lists for 2011-2025 and keeps disputed dates unknown', () => {
    for (const y of [2011, 2018, 2025]) expect(NSE_CALENDAR.holidayYears).toContain(y);
    expect(dayStatus(NSE_CALENDAR, '2025-10-22', new Set())).toBe('holiday');
    expect(dayStatus(BSE_CALENDAR, '2020-04-10', new Set())).toBe('holiday');
    expect(dayStatus(NSE_CALENDAR, '2018-06-14', new Set())).toBe('missing');
    // The list and all Yahoo series disagree and nothing settles it: said, not settled.
    expect(dayStatus(NSE_CALENDAR, '2012-10-26', new Set())).toBe('unknown');
    expect(Object.keys(NSE_CALENDAR.disputed ?? {}).sort()).toEqual(['2011-10-26', '2012-10-26', '2012-11-13']);
  });
  it('settles the dates a second source decides (0.44)', () => {
    // Muharram 2013 moved from Thursday the 14th to Friday the 15th.
    expect(isShut(NSE_CALENDAR, '2013-11-14')).toBe(false);
    expect(dayStatus(NSE_CALENDAR, '2013-11-14', new Set(['2013-11-14']))).toBe('session');
    expect(dayStatus(NSE_CALENDAR, '2013-11-15', new Set())).toBe('holiday');
    expect(NSE_CALENDAR.holidays['2013-11-15']).toMatch(/Muharram/);
    expect(BSE_CALENDAR.holidays['2013-11-15']).toMatch(/Muharram/);
    // INDstocks has full bars where Yahoo has none: a gap in the series, not a holiday.
    expect(dayStatus(NSE_CALENDAR, '2019-02-13', new Set())).toBe('missing');
    expect(dayStatus(NSE_CALENDAR, '2019-03-29', new Set())).toBe('missing');
    // Budget weekends were full sessions; a Muhurat Sunday is not.
    for (const d of ['2015-02-28', '2020-02-01', '2026-02-01']) expect(isShut(NSE_CALENDAR, d)).toBe(false);
    expect(isShut(NSE_CALENDAR, '2023-11-12')).toBe(true);
  });
  it('treats a special Saturday session as a session, and a Muhurat bar on a holiday as irregular', () => {
    expect(isShut(NSE_CALENDAR, '2025-02-01')).toBe(false);
    expect(dayStatus(NSE_CALENDAR, '2025-02-01', new Set())).toBe('missing');
    expect(isShut(NSE_CALENDAR, '2024-11-01')).toBe(true);
  });
  it('derives COMEX trade-date holidays from CME rules', () => {
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(Object.keys(comexHolidays(2026)).sort()).toEqual([
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    ]);
    // Juneteenth only from 2022; a Saturday New Year's Day is not moved; a Sunday Christmas moves to Monday.
    expect(Object.values(comexHolidays(2021)).some((n) => n.startsWith('Juneteenth'))).toBe(false);
    expect(comexHolidays(2022)['2021-12-31']).toBeUndefined();
    expect(comexHolidays(2022)['2022-12-26']).toBe('Christmas (closed)');
    expect(dayStatus(COMEX_CALENDAR, '2012-10-29', new Set())).toBe('unknown');
  });
});

describe('reference close', () => {
  const bars = sessions('2026-10-05', 40);
  const dates = bars.map((b) => b.date);
  it('uses the same session’s close for an event before the close', () => {
    const r = referenceSession(NSE_CALENDAR, dates, ist('2026-10-21', '10:00'))!;
    expect([r.date, r.rule]).toEqual(['2026-10-21', 'same-session-close']);
  });
  it('moves an event after the close to the next session', () => {
    const r = referenceSession(NSE_CALENDAR, dates, ist('2026-10-21', '15:31'))!;
    expect([r.date, r.rule]).toEqual(['2026-10-22', 'after-close-next-session']);
    // At the close itself the close is still the reference.
    expect(referenceSession(NSE_CALENDAR, dates, ist('2026-10-21', '15:30'))!.date).toBe('2026-10-21');
  });
  it('moves an event on a holiday or weekend to the next session', () => {
    expect(referenceSession(NSE_CALENDAR, dates, ist('2026-10-20', '09:00'))!.date).toBe('2026-10-21');
    expect(referenceSession(NSE_CALENDAR, dates, ist('2026-10-18', '09:00'))!).toMatchObject({ date: '2026-10-19', rule: 'non-session-next-session' });
  });
  it('reads the instant in the exchange’s zone, not UTC', () => {
    // 2026-10-21 23:00 UTC is already 22 October 04:30 in India.
    expect(referenceSession(NSE_CALENDAR, dates, Date.parse('2026-10-21T23:00:00Z'))!.date).toBe('2026-10-22');
  });
});

describe('forward returns and statistics', () => {
  it('measures 100 × (future / reference − 1) in trading sessions, null past the data', () => {
    const closes = [100, 110, 99, 121];
    const r = forwardReturns(closes, 0, [1, 2, 3, 4]);
    expect(r[0]).toBeCloseTo(10, 12);
    expect(r[1]).toBeCloseTo(-1, 12);
    expect(r[2]).toBeCloseTo(21, 12);
    expect(r[3]).toBeNull();
  });
  it('summarises without inventing values', () => {
    const s = returnStats([2, -1, 0, 3]);
    expect(s).toMatchObject({ n: 4, positive: 2, negative: 1, flat: 1, positiveRate: 0.5, bearishHitRate: 0.25, mean: 1, median: 1, min: -1, max: 3 });
    expect(s.sd).toBeCloseTo(Math.sqrt(((1) + 4 + 1 + 4) / 3), 12);
    expect(returnStats([])).toMatchObject({ n: 0, mean: null, positiveRate: null });
  });
});

describe('runEventStudy', () => {
  const bars = sessions('2026-10-05', 30);
  const series = makeSeries('TEST', bars.map((b) => ({ date: b.date, close: b.close })));

  it('counts incomplete horizons apart and never fills them with zero', () => {
    // The last-but-one session: +1 exists, +3 does not.
    const late = bars[bars.length - 2]!.date;
    const result = runEventStudy(series, NSE_CALENDAR, [obs('a', 'e1', ist(late, '10:00'))], { horizons: [1, 3] });
    const [h1, h3] = result.groups;
    expect(h1!.stats.n).toBe(1);
    expect(h1!.incomplete).toBe(0);
    expect(h3!.stats.n).toBe(0);
    expect(h3!.incomplete).toBe(1);
    expect(h3!.stats.mean).toBeNull();
  });

  it('collapses two observations of one episode on one reference day, and keeps different episodes', () => {
    const d = bars[3]!.date;
    const result = runEventStudy(series, NSE_CALENDAR, [
      obs('a', 'e1', ist(d, '09:30')), obs('b', 'e1', ist(d, '11:00')), obs('c', 'e2', ist(d, '12:00')),
    ], { horizons: [1] });
    expect(result.rows).toHaveLength(2);
    expect(result.collapsed).toBe(1);
    expect(result.groups[0]!.episodes).toBe(2);
  });

  it('groups by keys and compares with every session of the same period', () => {
    const result = runEventStudy(series, NSE_CALENDAR, [
      obs('a', 'e1', ist(bars[0]!.date, '10:00'), { phase: 'applying' }),
      obs('b', 'e2', ist(bars[10]!.date, '10:00'), { phase: 'separating' }),
    ], { horizons: [1], groupBy: ['phase'] });
    expect(result.groups.map((g) => g.keys.phase)).toEqual(['applying', 'separating']);
    expect(result.period).toEqual({ from: bars[0]!.date, to: bars[10]!.date });
    expect(result.baseline[0]!.stats.n).toBe(11);
  });

  it('leaves observations after the data unmapped', () => {
    const result = runEventStudy(series, NSE_CALENDAR, [obs('a', 'e1', ist('2027-01-04', '10:00'))]);
    expect(result.unmapped).toHaveLength(1);
    expect(result.rows).toHaveLength(0);
  });
});

describe('sweepParameter', () => {
  // 60 sessions; the split at session 40.
  const bars = sessions('2026-08-03', 60);
  const series = makeSeries('TEST', bars.map((b) => ({ date: b.date, close: b.close })));
  const split = bars[40]!.date;
  const at = (i: number, episode: string): StudyObservation => obs(`${i}`, episode, ist(bars[i]!.date, '10:00'));

  it('drops training observations whose horizon reaches into the holdout', () => {
    const r = sweepParameter(series, NSE_CALENDAR, [{ value: 1, observations: [at(10, 'a'), at(37, 'b'), at(39, 'c')] }], {
      horizon: 3, splitDate: split, objective: 'highest-mean', minimumTrainingSample: 1,
    });
    // Sessions 37 and 39 would read a close at 40 or later.
    expect(r.rows[0]!.training.n).toBe(1);
    expect(r.rows[0]!.droppedAtSplit).toBe(2);
  });

  it('chooses on training only, then measures the frozen choice once on the holdout', () => {
    // Rising closes make every return positive; "lowest mean" favours the candidate
    // whose observations sit at higher closes (a smaller percentage step).
    const r = sweepParameter(series, NSE_CALENDAR, [
      { value: 0.5, observations: [at(2, 'a'), at(45, 'h1')] },
      { value: 1, observations: [at(30, 'b'), at(50, 'h2')] },
    ], { horizon: 1, splitDate: split, objective: 'lowest-mean', minimumTrainingSample: 1 });
    expect(r.chosen).toBe(1);
    expect(r.holdout!.stats.n).toBe(1);
    expect(r.holdout!.stats.mean).toBeCloseTo(100 * (151 / 150 - 1), 10);
  });

  it('chooses nothing when no candidate has enough training observations', () => {
    const r = sweepParameter(series, NSE_CALENDAR, [{ value: 1, observations: [at(5, 'a')] }], {
      horizon: 1, splitDate: split, objective: 'highest-mean', minimumTrainingSample: 5,
    });
    expect(r.chosen).toBeNull();
    expect(r.holdout).toBeNull();
  });
});
