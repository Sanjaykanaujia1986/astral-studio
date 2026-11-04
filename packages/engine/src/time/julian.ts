/**
 * Julian Day conversion.
 *
 * Implemented independently (Meeus, *Astronomical Algorithms*, ch. 7) rather
 * than delegating to Swiss Ephemeris, so that the test suite can cross-check
 * two independent implementations against each other. A bug that exists in
 * both is far less likely than a bug in one.
 */

/**
 * Which calendar the supplied Y/M/D is expressed in.
 *
 * Dates before the 1582 reform are conventionally quoted in the Julian
 * calendar. Passing 'gregorian' for such a date yields the *proleptic*
 * Gregorian interpretation, which is a different instant — up to ~10 days
 * apart. The caller must be explicit; there is no safe default guess.
 */
export type Calendar = 'gregorian' | 'julian';

/** Last day of the Julian calendar before the Gregorian reform. */
export const GREGORIAN_REFORM_JD = 2299160.5; // 1582-10-15 00:00 UT

export interface CivilDate {
  readonly year: number;
  /** 1-12 */
  readonly month: number;
  /** 1-31 */
  readonly day: number;
}

export interface CivilTime {
  /** 0-23 */
  readonly hour: number;
  /** 0-59 */
  readonly minute: number;
  /** 0-59.999... */
  readonly second: number;
}

/** Combine h/m/s into decimal hours. */
export function toDecimalHours(time: CivilTime): number {
  const { hour, minute, second } = time;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) {
    throw new RangeError('time components must be finite numbers');
  }
  if (hour < 0 || hour > 23) throw new RangeError(`hour out of range: ${hour}`);
  if (minute < 0 || minute > 59) throw new RangeError(`minute out of range: ${minute}`);
  if (second < 0 || second >= 60) throw new RangeError(`second out of range: ${second}`);
  return hour + minute / 60 + second / 3600;
}

/**
 * Julian Day from a calendar date and decimal hours, treated as **UT**.
 *
 * The returned value is a Julian Day Number including fraction, where .0 is
 * noon UT. Accepts fractional/decimal hours directly so callers keep full
 * precision instead of rounding to seconds.
 */
export function julianDay(
  date: CivilDate,
  decimalHours: number,
  calendar: Calendar = 'gregorian',
): number {
  const { day } = date;
  let { year, month } = date;

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month out of range: ${month}`);
  }
  if (!Number.isFinite(day) || day < 1 || day >= 32) {
    throw new RangeError(`day out of range: ${day}`);
  }
  if (!Number.isFinite(decimalHours) || decimalHours < 0 || decimalHours >= 24) {
    throw new RangeError(`decimalHours out of range: ${decimalHours}`);
  }

  if (month <= 2) {
    year -= 1;
    month += 12;
  }

  let b = 0;
  if (calendar === 'gregorian') {
    const a = Math.floor(year / 100);
    b = 2 - a + Math.floor(a / 4);
  }

  const dayWithFraction = day + decimalHours / 24;

  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    dayWithFraction +
    b -
    1524.5
  );
}

/** Inverse of {@link julianDay}: Julian Day → calendar date and decimal hours (UT). */
export function fromJulianDay(
  jd: number,
  calendar: Calendar = 'gregorian',
): CivilDate & { decimalHours: number } {
  if (!Number.isFinite(jd)) throw new RangeError(`jd must be finite, received ${jd}`);

  const shifted = jd + 0.5;
  const z = Math.floor(shifted);
  const f = shifted - z;

  let a = z;
  if (calendar === 'gregorian') {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }

  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const day = b - d - Math.floor(30.6001 * e);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  return { year, month, day, decimalHours: f * 24 };
}

/**
 * Choose the calendar a historical date is conventionally expressed in.
 *
 * Advisory only — the caller decides. Provided so UI can default sensibly
 * rather than every call site re-deriving the 1582 rule.
 */
export function conventionalCalendarFor(date: CivilDate): Calendar {
  const { year, month, day } = date;
  if (year > 1582) return 'gregorian';
  if (year < 1582) return 'julian';
  if (month > 10) return 'gregorian';
  if (month < 10) return 'julian';
  return day >= 15 ? 'gregorian' : 'julian';
}

/**
 * Julian Day (UT) to an ISO-8601 UTC string.
 *
 * Rounded to the nearest second: sub-second precision on an astronomical event
 * would imply a birth time known to that resolution, which it never is.
 */
export function julianDayToIsoUtc(jd: number): string {
  const { year, month, day, decimalHours } = fromJulianDay(jd);

  let totalSeconds = Math.round(decimalHours * 3600);
  let dayOffset = 0;
  // Rounding up from 23:59:59.5 rolls into the next day.
  if (totalSeconds >= 86_400) {
    totalSeconds -= 86_400;
    dayOffset = 1;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Re-derive the calendar date through UTC so a rolled-over day also rolls the
  // month and year correctly.
  const base = Date.UTC(year, month - 1, day + dayOffset, hours, minutes, seconds);
  return new Date(base).toISOString().replace('.000', '');
}
