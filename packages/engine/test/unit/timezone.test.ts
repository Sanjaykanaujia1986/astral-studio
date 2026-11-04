import { describe, it, expect } from 'vitest';
import native from 'sweph';
import {
  resolveCivilTime,
  resolveWithFixedOffset,
  TimeResolutionError,
} from '../../src/time/timezone.js';

const MIDDAY = { hour: 12, minute: 0, second: 0 };

describe('historical offsets — the current offset must never be assumed', () => {
  it('Kolkata 1900 used LMT +05:21:10, not the modern +05:30', () => {
    // This is the headline case: assuming the modern offset for a 1900 Indian
    // birth shifts the chart by 8.83 minutes, which is roughly 2.2 degrees of
    // Ascendant — a different rising sign near a cusp.
    const old = resolveCivilTime({ year: 1900, month: 1, day: 1 }, MIDDAY, 'Asia/Kolkata');
    const modern = resolveCivilTime({ year: 2026, month: 8, day: 24 }, MIDDAY, 'Asia/Kolkata');

    expect(old.offsetMinutes).toBeCloseTo(321.1667, 3);
    expect(modern.offsetMinutes).toBe(330);
    expect(modern.offsetMinutes - old.offsetMinutes).toBeCloseTo(8.833, 2);
  });

  it('Kolkata 1947 independence-day chart uses +05:30', () => {
    const r = resolveCivilTime(
      { year: 1947, month: 8, day: 15 },
      { hour: 10, minute: 30, second: 0 },
      'Asia/Kolkata',
    );
    expect(r.offsetMinutes).toBe(330);
    expect(r.utcIso.startsWith('1947-08-15T05:00')).toBe(true);
    expect(r.ambiguity).toBe('unique');
  });

  it('London 1800 used Local Mean Time (-00:01:15), before standard time existed', () => {
    const r = resolveCivilTime({ year: 1800, month: 1, day: 1 }, MIDDAY, 'Europe/London');
    expect(r.offsetMinutes).toBeCloseTo(-1.25, 4);
  });

  it('London July 1945 was on British Double Summer Time (+02:00)', () => {
    const r = resolveCivilTime({ year: 1945, month: 7, day: 1 }, MIDDAY, 'Europe/London');
    expect(r.offsetMinutes).toBe(120);
  });

  it('New York switches between EST and EDT within the same year', () => {
    const winter = resolveCivilTime({ year: 2024, month: 1, day: 15 }, MIDDAY, 'America/New_York');
    const summer = resolveCivilTime({ year: 2024, month: 7, day: 15 }, MIDDAY, 'America/New_York');
    expect(winter.offsetMinutes).toBe(-300);
    expect(summer.offsetMinutes).toBe(-240);
  });
});

describe('nonexistent wall times (clocks moved forward)', () => {
  const GAP_DATE = { year: 2024, month: 3, day: 10 };
  const GAP_TIME = { hour: 2, minute: 30, second: 0 };

  it('throws rather than inventing an instant that never happened', () => {
    expect(() => resolveCivilTime(GAP_DATE, GAP_TIME, 'America/New_York')).toThrow(
      TimeResolutionError,
    );
    expect(() => resolveCivilTime(GAP_DATE, GAP_TIME, 'America/New_York')).toThrow(
      /does not exist/,
    );
  });

  it('carries the offending input on the error, for a useful UI message', () => {
    try {
      resolveCivilTime(GAP_DATE, GAP_TIME, 'America/New_York');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TimeResolutionError);
      expect((error as TimeResolutionError).detail).toMatchObject({ zone: 'America/New_York' });
    }
  });

  it('can shift forward past the gap when the caller opts in', () => {
    const r = resolveCivilTime(GAP_DATE, GAP_TIME, 'America/New_York', {
      onNonexistent: 'shift-forward',
    });
    expect(r.ambiguity).toBe('nonexistent');
    expect(r.offsetMinutes).toBe(-240); // now on EDT, past the transition
  });

  it('a time just outside the gap resolves normally', () => {
    const before = resolveCivilTime(GAP_DATE, { hour: 1, minute: 30, second: 0 }, 'America/New_York');
    const after = resolveCivilTime(GAP_DATE, { hour: 3, minute: 30, second: 0 }, 'America/New_York');
    expect(before.ambiguity).toBe('unique');
    expect(after.ambiguity).toBe('unique');
    expect(before.offsetMinutes).toBe(-300);
    expect(after.offsetMinutes).toBe(-240);
  });
});

describe('ambiguous wall times (clocks moved back)', () => {
  const FALLBACK_DATE = { year: 2024, month: 11, day: 3 };
  const FALLBACK_TIME = { hour: 1, minute: 30, second: 0 };

  it('detects that the hour occurred twice and reports both instants', () => {
    const r = resolveCivilTime(FALLBACK_DATE, FALLBACK_TIME, 'America/New_York');
    expect(r.ambiguity).toBe('ambiguous');
    expect(r.alternativeUtcIso).toBeDefined();
  });

  it('the two candidate instants are exactly one hour apart', () => {
    const r = resolveCivilTime(FALLBACK_DATE, FALLBACK_TIME, 'America/New_York');
    const chosen = Date.parse(r.utcIso);
    const alternative = Date.parse(r.alternativeUtcIso!);
    expect(Math.abs(alternative - chosen)).toBe(3_600_000);
  });

  it('defaults to the first (pre-transition) reading, and can take the second', () => {
    const first = resolveCivilTime(FALLBACK_DATE, FALLBACK_TIME, 'America/New_York');
    const second = resolveCivilTime(FALLBACK_DATE, FALLBACK_TIME, 'America/New_York', {
      preferOnAmbiguous: 'second',
    });
    expect(first.offsetMinutes).toBe(-240); // EDT, before the change
    expect(second.offsetMinutes).toBe(-300); // EST, after
    expect(second.jdUT).toBeGreaterThan(first.jdUT);
    expect(second.jdUT - first.jdUT).toBeCloseTo(1 / 24, 9);
  });
});

describe('Julian Day output cross-checked against Swiss Ephemeris', () => {
  it('matches swe_julday for the resolved UTC instant', () => {
    const r = resolveCivilTime(
      { year: 1947, month: 8, day: 15 },
      { hour: 10, minute: 30, second: 0 },
      'Asia/Kolkata',
    );
    // 10:30 IST (+05:30) == 05:00 UTC
    const expected = native.julday(1947, 8, 15, 5.0, native.constants.SE_GREG_CAL);
    expect(Math.abs(r.jdUT - expected)).toBeLessThan(1e-9);
  });

  it('matches for a fractional historical offset', () => {
    const r = resolveCivilTime({ year: 1900, month: 1, day: 1 }, MIDDAY, 'Asia/Kolkata');
    // 12:00 at +05:21:10 == 06:38:50 UTC
    const expected = native.julday(
      1900, 1, 1,
      6 + 38 / 60 + 50 / 3600,
      native.constants.SE_GREG_CAL,
    );
    expect(Math.abs(r.jdUT - expected)).toBeLessThan(1e-7);
  });
});

describe('fixed-offset path (offset stated on a birth certificate)', () => {
  it('applies the stated offset without consulting zone rules', () => {
    const r = resolveWithFixedOffset(
      { year: 1985, month: 6, day: 15 },
      { hour: 14, minute: 45, second: 0 },
      330,
    );
    expect(r.offsetMinutes).toBe(330);
    expect(r.zone).toBe('UTC+05:30');
    expect(r.ambiguity).toBe('unique');
    expect(r.utcIso.startsWith('1985-06-15T09:15')).toBe(true);
  });

  it('handles negative and half-hour offsets', () => {
    const west = resolveWithFixedOffset({ year: 2000, month: 1, day: 1 }, MIDDAY, -210);
    expect(west.zone).toBe('UTC-03:30');
    expect(west.utcIso.startsWith('2000-01-01T15:30')).toBe(true);
  });

  it('rejects an implausible offset instead of producing a silly chart', () => {
    expect(() =>
      resolveWithFixedOffset({ year: 2000, month: 1, day: 1 }, MIDDAY, 20 * 60),
    ).toThrow(TimeResolutionError);
  });
});

describe('input validation', () => {
  it('rejects an unknown time zone by name', () => {
    expect(() =>
      resolveCivilTime({ year: 2000, month: 1, day: 1 }, MIDDAY, 'Mars/Olympus_Mons'),
    ).toThrow(TimeResolutionError);
  });

  it('rejects out-of-range clock components', () => {
    expect(() =>
      resolveCivilTime({ year: 2000, month: 1, day: 1 }, { hour: 25, minute: 0, second: 0 }, 'UTC'),
    ).toThrow(RangeError);
  });
});
