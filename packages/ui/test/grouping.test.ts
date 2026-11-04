import { describe, it, expect } from 'vitest';
import {
  firstDayOfWeek,
  groupByUtcDay,
  isoWeekday,
  monthGrid,
  periodRange,
  shiftPeriod,
  startOfUtcDay,
  utcDayKey,
  weekdayLabels,
} from '../src/aspectarian/grouping.js';

const utc = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min));

describe('isoWeekday', () => {
  it('numbers Monday to Sunday as 1 to 7', () => {
    expect(isoWeekday(utc(2024, 1, 1))).toBe(1); // Monday
    expect(isoWeekday(utc(2024, 1, 6))).toBe(6); // Saturday
    expect(isoWeekday(utc(2024, 1, 7))).toBe(7); // Sunday, not 0
  });
});

describe('week start comes from the locale, not an assumption', () => {
  it('is Sunday in the US and India, Monday in Europe', () => {
    // A hard-coded start silently mislabels the calendar for half the world.
    expect(firstDayOfWeek('en-US')).toBe(7);
    expect(firstDayOfWeek('hi-IN')).toBe(7);
    expect(firstDayOfWeek('gu-IN')).toBe(7);
    expect(firstDayOfWeek('en-GB')).toBe(1);
    expect(firstDayOfWeek('de-DE')).toBe(1);
  });

  it('falls back to Monday (ISO-8601) for an unusable tag', () => {
    expect(firstDayOfWeek('not-a-locale-!!')).toBe(1);
  });
});

describe('periodRange', () => {
  it('covers exactly one day', () => {
    const { fromMs, toMs } = periodRange(utc(2024, 3, 15, 17, 30), 'day', 1);
    expect(new Date(fromMs).toISOString()).toBe('2024-03-15T00:00:00.000Z');
    expect(toMs - fromMs).toBe(86_400_000);
  });

  it('starts the week on the locale’s first day', () => {
    // 2024-03-15 is a Friday.
    const mondayStart = periodRange(utc(2024, 3, 15), 'week', 1);
    const sundayStart = periodRange(utc(2024, 3, 15), 'week', 7);
    expect(new Date(mondayStart.fromMs).toISOString().slice(0, 10)).toBe('2024-03-11'); // Mon
    expect(new Date(sundayStart.fromMs).toISOString().slice(0, 10)).toBe('2024-03-10'); // Sun
    expect(mondayStart.toMs - mondayStart.fromMs).toBe(7 * 86_400_000);
  });

  it('covers a whole month, including February in a leap year', () => {
    const feb = periodRange(utc(2024, 2, 10), 'month', 1);
    expect(new Date(feb.fromMs).toISOString().slice(0, 10)).toBe('2024-02-01');
    expect(new Date(feb.toMs).toISOString().slice(0, 10)).toBe('2024-03-01');
    expect((feb.toMs - feb.fromMs) / 86_400_000).toBe(29);
  });

  it('covers a whole year', () => {
    const year = periodRange(utc(2024, 7, 4), 'year', 1);
    expect(new Date(year.fromMs).toISOString().slice(0, 10)).toBe('2024-01-01');
    expect(new Date(year.toMs).toISOString().slice(0, 10)).toBe('2025-01-01');
  });

  it('tiles without overlap — the end is exclusive', () => {
    const a = periodRange(utc(2024, 3, 15), 'day', 1);
    const b = periodRange(utc(2024, 3, 16), 'day', 1);
    expect(a.toMs).toBe(b.fromMs);
  });
});

describe('shiftPeriod', () => {
  it('steps days and weeks', () => {
    expect(utcDayKey(shiftPeriod(utc(2024, 3, 15), 'day', 1))).toBe('2024-03-16');
    expect(utcDayKey(shiftPeriod(utc(2024, 3, 15), 'week', -1))).toBe('2024-03-08');
  });

  it('steps months WITHOUT skipping short ones', () => {
    // Naively adding a month to 31 March lands in May, because April has no
    // 31st and the date overflows. Anchoring on the 1st avoids it.
    expect(utcDayKey(shiftPeriod(utc(2024, 3, 31), 'month', 1))).toBe('2024-04-01');
    expect(utcDayKey(shiftPeriod(utc(2024, 1, 31), 'month', 1))).toBe('2024-02-01');
  });

  it('rolls over year boundaries in both directions', () => {
    expect(utcDayKey(shiftPeriod(utc(2024, 12, 15), 'month', 1))).toBe('2025-01-01');
    expect(utcDayKey(shiftPeriod(utc(2024, 1, 15), 'month', -1))).toBe('2023-12-01');
    expect(utcDayKey(shiftPeriod(utc(2024, 6, 1), 'year', 1))).toBe('2025-06-01');
  });
});

describe('groupByUtcDay', () => {
  const events = [
    { at: utc(2024, 3, 16, 9, 0) },
    { at: utc(2024, 3, 15, 23, 59) },
    { at: utc(2024, 3, 15, 0, 1) },
    { at: utc(2024, 3, 17, 12, 0) },
  ];

  it('buckets by UTC day', () => {
    const groups = groupByUtcDay(events, (e) => e.at);
    expect(groups.get('2024-03-15')).toHaveLength(2);
    expect(groups.get('2024-03-16')).toHaveLength(1);
    expect(groups.get('2024-03-17')).toHaveLength(1);
  });

  it('iterates chronologically regardless of input order', () => {
    const keys = [...groupByUtcDay(events, (e) => e.at).keys()];
    expect(keys).toEqual(['2024-03-15', '2024-03-16', '2024-03-17']);
  });

  it('returns an empty map for no events', () => {
    expect(groupByUtcDay([], (e: { at: Date }) => e.at).size).toBe(0);
  });

  it('places an event at exactly midnight on the day it starts', () => {
    const groups = groupByUtcDay([{ at: utc(2024, 3, 16, 0, 0) }], (e) => e.at);
    expect([...groups.keys()]).toEqual(['2024-03-16']);
  });
});

describe('monthGrid', () => {
  it('produces whole weeks of seven days', () => {
    for (const [year, month] of [[2024, 0], [2024, 1], [2024, 8], [2025, 11]] as const) {
      for (const weekStart of [1, 7]) {
        const weeks = monthGrid(year, month, weekStart);
        for (const week of weeks) expect(week).toHaveLength(7);
      }
    }
  });

  it('starts each row on the locale’s first weekday', () => {
    const mondayGrid = monthGrid(2024, 2, 1); // March 2024
    const sundayGrid = monthGrid(2024, 2, 7);
    expect(isoWeekday(mondayGrid[0]![0]!.date)).toBe(1);
    expect(isoWeekday(sundayGrid[0]![0]!.date)).toBe(7);
  });

  it('marks padding days as outside the month', () => {
    // March 2024 starts on a Friday, so a Monday-start grid pads four days.
    const weeks = monthGrid(2024, 2, 1);
    const flat = weeks.flat();
    expect(flat.filter((c) => c.inMonth)).toHaveLength(31);
    expect(flat[0]!.inMonth).toBe(false);
    expect(flat[0]!.dayKey).toBe('2024-02-26');
  });

  it('contains every day of the month exactly once', () => {
    const flat = monthGrid(2024, 1, 7).flat().filter((c) => c.inMonth); // Feb 2024
    expect(flat).toHaveLength(29); // leap year
    expect(new Set(flat.map((c) => c.dayKey)).size).toBe(29);
  });

  it('handles a month that begins exactly on the week start', () => {
    // 1 April 2024 was a Monday, so a Monday-start grid needs no leading pad.
    const weeks = monthGrid(2024, 3, 1);
    expect(weeks[0]![0]!.inMonth).toBe(true);
    expect(weeks[0]![0]!.dayKey).toBe('2024-04-01');
  });
});

describe('weekdayLabels', () => {
  it('lists seven labels starting at the locale’s first day', () => {
    const us = weekdayLabels('en-US', 7);
    const gb = weekdayLabels('en-GB', 1);
    expect(us).toHaveLength(7);
    expect(us[0]).toMatch(/sun/i);
    expect(gb[0]).toMatch(/mon/i);
  });

  it('localises the names', () => {
    const hi = weekdayLabels('hi-IN', 7);
    expect(hi).toHaveLength(7);
    // Devanagari, not Latin.
    expect(/[ऀ-ॿ]/.test(hi.join(''))).toBe(true);
  });
});

describe('startOfUtcDay', () => {
  it('zeroes the time without shifting the date', () => {
    expect(startOfUtcDay(utc(2024, 3, 15, 23, 59)).toISOString()).toBe('2024-03-15T00:00:00.000Z');
    expect(startOfUtcDay(utc(2024, 3, 15, 0, 0)).toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });
});
