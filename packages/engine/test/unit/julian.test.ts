import { describe, it, expect } from 'vitest';
import native from 'sweph';
import {
  julianDay, fromJulianDay, toDecimalHours, conventionalCalendarFor,
} from '../../src/time/julian.js';

/**
 * Reference values from Meeus, *Astronomical Algorithms* (2nd ed.), ch. 7,
 * table 7.a / worked examples. Published reference data — not values produced
 * by this implementation.
 */
const MEEUS: ReadonlyArray<{
  label: string; y: number; m: number; d: number; hours: number;
  cal: 'gregorian' | 'julian'; jd: number;
}> = [
  { label: 'Sputnik 1957-10-04.81', y: 1957, m: 10, d: 4, hours: 0.81 * 24, cal: 'gregorian', jd: 2436116.31 },
  { label: 'J2000  2000-01-01.5',   y: 2000, m: 1,  d: 1, hours: 12,        cal: 'gregorian', jd: 2451545.0 },
  { label: '1999-01-01.0',          y: 1999, m: 1,  d: 1, hours: 0,         cal: 'gregorian', jd: 2451179.5 },
  { label: '1987-01-27.0',          y: 1987, m: 1,  d: 27, hours: 0,        cal: 'gregorian', jd: 2446822.5 },
  { label: '1987-06-19.5',          y: 1987, m: 6,  d: 19, hours: 12,       cal: 'gregorian', jd: 2446966.0 },
  { label: '1988-01-27.0',          y: 1988, m: 1,  d: 27, hours: 0,        cal: 'gregorian', jd: 2447187.5 },
  { label: '1988-06-19.5',          y: 1988, m: 6,  d: 19, hours: 12,       cal: 'gregorian', jd: 2447332.0 },
  { label: '1900-01-01.0',          y: 1900, m: 1,  d: 1, hours: 0,         cal: 'gregorian', jd: 2415020.5 },
  { label: '1600-01-01.0',          y: 1600, m: 1,  d: 1, hours: 0,         cal: 'gregorian', jd: 2305447.5 },
  { label: '1600-12-31.0',          y: 1600, m: 12, d: 31, hours: 0,        cal: 'gregorian', jd: 2305812.5 },
  { label: '837-04-10.3 (Julian)',  y: 837,  m: 4,  d: 10, hours: 0.3 * 24, cal: 'julian',    jd: 2026871.8 },
  { label: '-1000-07-12.5 (Julian)',y: -1000, m: 7, d: 12, hours: 12,       cal: 'julian',    jd: 1356001.0 },
  { label: '-4712-01-01.5 (Julian)',y: -4712, m: 1, d: 1, hours: 12,        cal: 'julian',    jd: 0.0 },
];

describe('julianDay against published Meeus reference values', () => {
  for (const ref of MEEUS) {
    it(`${ref.label} -> JD ${ref.jd}`, () => {
      const jd = julianDay({ year: ref.y, month: ref.m, day: ref.d }, ref.hours, ref.cal);
      // Meeus quotes to 2 decimal places; tolerance reflects the source, not us.
      expect(jd).toBeCloseTo(ref.jd, 5);
    });
  }
});

describe('julianDay cross-checked against Swiss Ephemeris (independent implementation)', () => {
  it('agrees with swe_julday across a wide date range', () => {
    const cases: ReadonlyArray<[number, number, number, number]> = [
      [1800, 1, 1, 0], [1899, 12, 31, 23.5], [1947, 8, 15, 10.5],
      [1969, 7, 20, 20.28], [2000, 1, 1, 12], [2026, 8, 24, 6.75],
      [2100, 3, 1, 18], [2399, 12, 31, 23.999],
    ];
    let maxDiff = 0;
    for (const [y, m, d, h] of cases) {
      const mine = julianDay({ year: y, month: m, day: d }, h, 'gregorian');
      const theirs = native.julday(y, m, d, h, native.constants.SE_GREG_CAL);
      maxDiff = Math.max(maxDiff, Math.abs(mine - theirs));
    }
    // Two independent implementations should agree to floating-point noise.
    expect(maxDiff).toBeLessThan(1e-9);
  });

  it('agrees on Julian-calendar dates too', () => {
    const mine = julianDay({ year: 1500, month: 3, day: 1 }, 12, 'julian');
    const theirs = native.julday(1500, 3, 1, 12, native.constants.SE_JUL_CAL);
    expect(Math.abs(mine - theirs)).toBeLessThan(1e-9);
  });
});

describe('fromJulianDay round-trips', () => {
  it('inverts julianDay across the supported range', () => {
    const cases: ReadonlyArray<[number, number, number, number]> = [
      [1800, 1, 1, 0], [1947, 8, 15, 10.5], [2000, 1, 1, 12],
      [2026, 8, 24, 6.75], [2399, 12, 31, 23.5],
    ];
    for (const [y, m, d, h] of cases) {
      const jd = julianDay({ year: y, month: m, day: d }, h);
      const back = fromJulianDay(jd);
      expect(back.year).toBe(y);
      expect(back.month).toBe(m);
      expect(back.day).toBe(d);
      expect(back.decimalHours).toBeCloseTo(h, 6);
    }
  });

  it('round-trips Julian-calendar dates', () => {
    const jd = julianDay({ year: 837, month: 4, day: 10 }, 7.2, 'julian');
    const back = fromJulianDay(jd, 'julian');
    expect(back).toMatchObject({ year: 837, month: 4, day: 10 });
    expect(back.decimalHours).toBeCloseTo(7.2, 6);
  });
});

describe('calendar ambiguity is the caller\'s decision, not a silent guess', () => {
  it('the same Y/M/D means different instants in each calendar', () => {
    const g = julianDay({ year: 1500, month: 3, day: 1 }, 0, 'gregorian');
    const j = julianDay({ year: 1500, month: 3, day: 1 }, 0, 'julian');
    // ~10 days apart in the 16th century — silently guessing would be a real error
    expect(Math.abs(g - j)).toBeGreaterThan(9);
  });

  it('advises the conventional calendar around the 1582 reform', () => {
    expect(conventionalCalendarFor({ year: 1581, month: 6, day: 1 })).toBe('julian');
    expect(conventionalCalendarFor({ year: 1582, month: 10, day: 4 })).toBe('julian');
    expect(conventionalCalendarFor({ year: 1582, month: 10, day: 15 })).toBe('gregorian');
    expect(conventionalCalendarFor({ year: 1583, month: 1, day: 1 })).toBe('gregorian');
  });
});

describe('input validation — never silently accept nonsense', () => {
  it('rejects out-of-range components', () => {
    expect(() => julianDay({ year: 2000, month: 13, day: 1 }, 0)).toThrow(RangeError);
    expect(() => julianDay({ year: 2000, month: 0, day: 1 }, 0)).toThrow(RangeError);
    expect(() => julianDay({ year: 2000, month: 1, day: 0 }, 0)).toThrow(RangeError);
    expect(() => julianDay({ year: 2000, month: 1, day: 1 }, 24)).toThrow(RangeError);
    expect(() => julianDay({ year: 2000, month: 1, day: 1 }, -1)).toThrow(RangeError);
    expect(() => julianDay({ year: 2000, month: 1, day: 1 }, NaN)).toThrow(RangeError);
  });

  it('validates time components', () => {
    expect(toDecimalHours({ hour: 10, minute: 30, second: 0 })).toBeCloseTo(10.5, 12);
    expect(toDecimalHours({ hour: 0, minute: 0, second: 0 })).toBe(0);
    expect(() => toDecimalHours({ hour: 24, minute: 0, second: 0 })).toThrow(RangeError);
    expect(() => toDecimalHours({ hour: 0, minute: 60, second: 0 })).toThrow(RangeError);
    expect(() => toDecimalHours({ hour: 0, minute: 0, second: 60 })).toThrow(RangeError);
  });
});
