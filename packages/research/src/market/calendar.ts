/**
 * Exchange calendars: which days an exchange trades, when it closes, and how
 * a day without a bar is to be read.
 *
 * A day with no bar is one of three different things, and a study must not
 * mix them up:
 *
 * - a **weekend** or a published **holiday**: the exchange was shut;
 * - a **missing session**: the exchange traded but the series has no bar —
 *   a gap in the data, to be reported, never filled;
 * - **unknown**: the calendar holds no holiday list for that year, so the
 *   absence cannot be classified. Said, rather than guessed.
 *
 * Holiday lists are data with a source, transcribed from the exchange's own
 * publication and dated. A year that is not listed is not assumed to have had
 * no holidays. Where two sources disagree about a date, the date is listed as
 * **disputed** and read as unknown, with the disagreement stated, rather than
 * settled by guessing.
 */

export interface ExchangeCalendar {
  readonly id: string;
  readonly name: string;
  /** IANA zone the exchange keeps its hours in. */
  readonly timeZone: string;
  /** Regular close, exchange-local `HH:MM`. A bar's close is taken to be struck then. */
  readonly closeLocal: string;
  /** Days of the week the exchange is shut, 0 = Sunday. */
  readonly weekend: readonly number[];
  /** Published full-day holidays, `YYYY-MM-DD` → name. */
  readonly holidays: Readonly<Record<string, string>>;
  /** Years the holiday list covers completely. */
  readonly holidayYears: readonly number[];
  /** Where the holiday list was read, and when. */
  readonly source: string;
  /** Dates whose status the sources disagree on, `YYYY-MM-DD` → what disagrees. Read as unknown. */
  readonly disputed?: Readonly<Record<string, string>>;
  /** Weekend dates the exchange opened for a full special session, `YYYY-MM-DD` → occasion. */
  readonly specialSessions?: Readonly<Record<string, string>>;
}

/**
 * `outside` is set by the day table only: an expected session before the
 * loaded series begins or after its last bar (a day not yet traded, or one
 * the file does not reach). It is not a gap in the data.
 */
export type DayStatus = 'session' | 'weekend' | 'holiday' | 'missing' | 'unknown' | 'outside';

/**
 * NSE capital-market trading holidays for 2026, as published on nseindia.com
 * (read 13 November 2026). 8 November (Diwali Laxmi Pujan) falls on a Sunday;
 * the evening Muhurat session is not a regular daily bar.
 */
const NSE_2026: Readonly<Record<string, string>> = {
  '2026-01-15': 'Municipal Corporation Election, Maharashtra',
  '2026-01-26': 'Republic Day',
  '2026-02-15': 'Mahashivratri',
  '2026-03-03': 'Holi',
  '2026-03-21': 'Id-Ul-Fitr (Ramadan Eid)',
  '2026-03-26': 'Shri Ram Navami',
  '2026-03-31': 'Shri Mahavir Jayanti',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2026-05-01': 'Maharashtra Day',
  '2026-05-28': 'Bakri Id',
  '2026-06-26': 'Muharram',
  '2026-08-15': 'Independence Day',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-10-02': 'Mahatma Gandhi Jayanti',
  '2026-10-20': 'Dussehra',
  '2026-11-08': 'Diwali Laxmi Pujan',
  '2026-11-10': 'Diwali-Balipratipada',
  '2026-11-24': 'Prakash Gurpurb Sri Guru Nanak Dev',
  '2026-12-25': 'Christmas',
};

/**
 * NSE and BSE weekday trading holidays 2011-2025, from the open-source
 * `exchange_calendars` library (Apache-2.0), `precomputed_bse_holidays` in
 * exchange_calendar_xbom.py, which cites the NSE and BSE holiday pages and
 * Zerodha's yearly lists (read 2026-11-24). The names are not in that list,
 * so each is labelled "Trading holiday". Weekend dates in the list are left
 * out (a weekend is already shut).
 *
 * Cross-checked against Yahoo daily bars for NIFTY 50, SENSEX and RELIANCE.NS
 * (2011-01-03 to 2025-12-31): 212 of the 219 dates have no bar in any of the
 * three; the other 7 are Diwali Lakshmi Pujan days with an evening Muhurat
 * session, whose short bar is read as irregular. Disagreements are in
 * `INDIA_DISPUTED`, not settled here.
 */
const XBOM_2011_2025: readonly string[] = [
  // 2011: 13 weekdays
  '2011-01-26', '2011-03-02', '2011-04-12', '2011-04-14', '2011-04-22', '2011-08-15', '2011-08-31', '2011-09-01', '2011-10-06', '2011-10-27', '2011-11-07', '2011-11-10', '2011-12-06',
  // 2012: 14 weekdays
  '2012-01-26', '2012-02-20', '2012-03-08', '2012-04-05', '2012-04-06', '2012-05-01', '2012-08-15', '2012-08-20', '2012-09-19', '2012-10-02', '2012-10-24', '2012-11-14', '2012-11-28', '2012-12-25',
  // 2013: 12 weekdays
  '2013-03-27', '2013-03-29', '2013-04-19', '2013-04-24', '2013-05-01', '2013-08-09', '2013-08-15', '2013-09-09', '2013-10-02', '2013-10-16', '2013-11-04', '2013-12-25',
  // 2014: 19 weekdays
  '2014-02-27', '2014-03-17', '2014-04-08', '2014-04-14', '2014-04-18', '2014-04-24', '2014-05-01', '2014-07-29', '2014-08-15', '2014-08-29', '2014-10-02', '2014-10-03', '2014-10-06', '2014-10-15', '2014-10-23', '2014-10-24', '2014-11-04', '2014-11-06', '2014-12-25',
  // 2015: 15 weekdays
  '2015-01-26', '2015-02-17', '2015-03-06', '2015-04-02', '2015-04-03', '2015-04-14', '2015-05-01', '2015-09-17', '2015-09-25', '2015-10-02', '2015-10-22', '2015-11-11', '2015-11-12', '2015-11-25', '2015-12-25',
  // 2016: 15 weekdays
  '2016-01-26', '2016-03-07', '2016-03-24', '2016-03-25', '2016-04-14', '2016-04-15', '2016-04-19', '2016-07-06', '2016-08-15', '2016-09-05', '2016-09-13', '2016-10-11', '2016-10-12', '2016-10-31', '2016-11-14',
  // 2017: 13 weekdays
  '2017-01-26', '2017-02-24', '2017-03-13', '2017-04-04', '2017-04-14', '2017-05-01', '2017-06-26', '2017-08-15', '2017-08-25', '2017-10-02', '2017-10-19', '2017-10-20', '2017-12-25',
  // 2018: 16 weekdays
  '2018-01-26', '2018-02-13', '2018-03-02', '2018-03-29', '2018-03-30', '2018-05-01', '2018-08-15', '2018-08-22', '2018-09-13', '2018-09-20', '2018-10-02', '2018-10-18', '2018-11-07', '2018-11-08', '2018-11-23', '2018-12-25',
  // 2019: 17 weekdays
  '2019-03-04', '2019-03-21', '2019-04-17', '2019-04-19', '2019-04-29', '2019-05-01', '2019-06-05', '2019-08-12', '2019-08-15', '2019-09-02', '2019-09-10', '2019-10-02', '2019-10-08', '2019-10-21', '2019-10-28', '2019-11-12', '2019-12-25',
  // 2020: 12 weekdays
  '2020-02-21', '2020-03-10', '2020-04-02', '2020-04-06', '2020-04-10', '2020-04-14', '2020-05-01', '2020-05-25', '2020-10-02', '2020-11-16', '2020-11-30', '2020-12-25',
  // 2021: 14 weekdays
  '2021-01-26', '2021-03-11', '2021-03-29', '2021-04-02', '2021-04-14', '2021-04-21', '2021-05-13', '2021-07-21', '2021-08-19', '2021-09-10', '2021-10-15', '2021-11-04', '2021-11-05', '2021-11-19',
  // 2022: 13 weekdays
  '2022-01-26', '2022-03-01', '2022-03-18', '2022-04-14', '2022-04-15', '2022-05-03', '2022-08-09', '2022-08-15', '2022-08-31', '2022-10-05', '2022-10-24', '2022-10-26', '2022-11-08',
  // 2023: 15 weekdays
  '2023-01-26', '2023-03-07', '2023-03-30', '2023-04-04', '2023-04-07', '2023-04-14', '2023-05-01', '2023-06-29', '2023-08-15', '2023-09-19', '2023-10-02', '2023-10-24', '2023-11-14', '2023-11-27', '2023-12-25',
  // 2024: 17 weekdays
  '2024-01-22', '2024-01-26', '2024-03-08', '2024-03-25', '2024-03-29', '2024-04-11', '2024-04-17', '2024-05-01', '2024-05-20', '2024-06-17', '2024-07-17', '2024-08-15', '2024-10-02', '2024-11-01', '2024-11-15', '2024-11-20', '2024-12-25',
  // 2025: 14 weekdays
  '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10', '2025-04-14', '2025-04-18', '2025-05-01', '2025-08-15', '2025-08-27', '2025-10-02', '2025-10-21', '2025-10-22', '2025-11-05', '2025-12-25',
];

/**
 * Corrections to the XBOM list, each from an exchange notice reported at the
 * time and matched by a second, exchange-sourced price feed (INDstocks daily
 * bars, read 2026-11-24).
 * - 2013-11-14 is left out of the list above: the exchanges revoked that
 *   holiday on 13 Nov 2013 and traded normally (full bars everywhere).
 * - 2013-11-15 replaces it: "Market alert: trading holiday now on Friday for
 *   Moharram", Business Standard, 13 Nov 2013. No bar in Yahoo or INDstocks.
 */
const INDIA_CORRECTIONS: Readonly<Record<string, string>> = {
  '2013-11-15': 'Muharram (moved from 14 Nov by exchange notice)',
};

const INDIA_HOLIDAYS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(XBOM_2011_2025.map((d) => [d, 'Trading holiday'])),
  ...INDIA_CORRECTIONS,
  ...NSE_2026,
};

/**
 * Dates where the holiday list and the Yahoo series (NIFTY 50, SENSEX,
 * RELIANCE.NS) disagree and no second source settles it. INDstocks' history
 * begins 2013-03-28, so it cannot speak for these.
 *
 * Settled in 0.44 and removed from here: 2013-11-14 (session), 2013-11-15
 * (holiday, above), and 2019-02-13 and 2019-03-29. Those two were normal
 * sessions: INDstocks has full-volume bars for NIFTY, SENSEX and five stocks,
 * so the Yahoo series simply lack them (a "missing session", not a holiday).
 */
const INDIA_DISPUTED: Readonly<Record<string, string>> = {
  '2011-10-26': 'Diwali Lakshmi Pujan: a Muhurat session was held (press reports); no exchange notice found on whether the regular session also ran, and no bar in any series',
  '2012-10-26': 'not in the holiday list; no bar in any series; no closure notice found',
  '2012-11-13': 'Diwali Lakshmi Pujan: a Muhurat session was held (press reports); no exchange notice found on whether the regular session also ran, and no bar in any series',
};

/**
 * Weekend days traded as full sessions. 2024-01-20 and 2025-02-01 are in the
 * XBOM special weekmasks. The Budget days 2015-02-28, 2020-02-01 and
 * 2026-02-01 come from INDstocks: NIFTY bars at 0.9-2.1 times median volume,
 * and for 2026-02-01, 376 one-minute bars from 09:15 to 15:30. Short weekend
 * sessions (Muhurat, the exchanges' disaster-recovery drills) are not listed:
 * their bars stay irregular.
 */
const INDIA_SPECIAL: Readonly<Record<string, string>> = {
  '2015-02-28': 'Union Budget, Saturday session',
  '2020-02-01': 'Union Budget, Saturday session',
  '2024-01-20': 'Special Saturday session',
  '2025-02-01': 'Union Budget, Saturday session',
  '2026-02-01': 'Union Budget, Sunday session',
};

const INDIA_YEARS: readonly number[] = [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

export const NSE_CALENDAR: ExchangeCalendar = {
  id: 'xnse',
  name: 'National Stock Exchange of India',
  timeZone: 'Asia/Kolkata',
  closeLocal: '15:30',
  weekend: [0, 6],
  holidays: INDIA_HOLIDAYS,
  holidayYears: INDIA_YEARS,
  source:
    '2026: NSE trading holidays, nseindia.com (read 2026-11-13). 2011-2025: exchange_calendars XBOM list (read 2026-11-24), ' +
    'cross-checked with Yahoo NIFTY 50, SENSEX and RELIANCE.NS bars and, from 2013-03-28, INDstocks daily bars; ' +
    'Muharram 2013 moved to 15 Nov (exchange notice, 13 Nov 2013); unsettled disagreements kept as disputed.',
  disputed: INDIA_DISPUTED,
  specialSessions: INDIA_SPECIAL,
};

/**
 * BSE equity segment. NSE and BSE close on the same days; the 2011-2025 list
 * is BSE's own (XBOM), and the 2026 lists name the same days. Listed
 * separately so a difference has somewhere to go.
 */
export const BSE_CALENDAR: ExchangeCalendar = {
  ...NSE_CALENDAR,
  id: 'xbom',
  name: 'BSE',
  source: '2011-2025: exchange_calendars XBOM list (read 2026-11-24); 2026: NSE’s list, which names the same days as BSE’s',
};

// ------------------------------------------------------------------ COMEX

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** The n-th weekday (0 = Sunday) of a month; n = -1 for the last. */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return ymd(y, m, 1 + ((weekday - first + 7) % 7) + 7 * (n - 1));
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return ymd(y, m, lastDay - ((last - weekday + 7) % 7));
}
/** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}
/** A fixed-date holiday moved off the weekend: Saturday to Friday, Sunday to Monday. */
function nearestWeekday(y: number, m: number, d: number, saturdayToFriday = true): string | null {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (wd === 6) return saturdayToFriday ? addDays(ymd(y, m, d), -1) : null;
  if (wd === 0) return addDays(ymd(y, m, d), 1);
  return ymd(y, m, d);
}

/**
 * Days with no COMEX trade date, by CME's rules as encoded in the open-source
 * pandas_market_calendars `CMEGlobexEnergyAndMetalsExchangeCalendar` (MIT,
 * read 2026-11-24): closed on New Year's Day, Good Friday and Christmas; on
 * Martin Luther King Jr. Day, Presidents Day, Memorial Day, Juneteenth (from
 * 2022), Independence Day, Labor Day and Thanksgiving Globex halts early and
 * "reopens at 17:00 for the next trade date", so the day has no settlement of
 * its own. A New Year's Day on a Saturday is not moved.
 */
export function comexHolidays(year: number): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (d: string | null, name: string): void => { if (d) out[d] = name; };
  put(nearestWeekday(year, 1, 1, false), 'New Year’s Day (closed)');
  put(nthWeekday(year, 1, 1, 3), 'Martin Luther King Jr. Day (early halt, no trade date)');
  put(nthWeekday(year, 2, 1, 3), 'Presidents Day (early halt, no trade date)');
  put(addDays(easterSunday(year), -2), 'Good Friday (closed)');
  put(nthWeekday(year, 5, 1, -1), 'Memorial Day (early halt, no trade date)');
  if (year >= 2022) put(nearestWeekday(year, 6, 19), 'Juneteenth (early halt, no trade date)');
  put(nearestWeekday(year, 7, 4), 'Independence Day (early halt, no trade date)');
  put(nthWeekday(year, 9, 1, 1), 'Labor Day (early halt, no trade date)');
  put(nthWeekday(year, 11, 4, 4), 'Thanksgiving (early halt, no trade date)');
  put(nearestWeekday(year, 12, 25), 'Christmas (closed)');
  return out;
}

const COMEX_YEARS: readonly number[] = Array.from({ length: 2027 - 2011 + 1 }, (_, i) => 2011 + i);

/**
 * COMEX metals futures on CME Globex. The rules were checked against Yahoo's
 * GC=F and SI=F daily bars, 2011-01-03 to 2026-11-24, dated in New York time:
 * no bar on 158 of the 160 rule days (2023-11-23 and 2025-07-04 have one each,
 * read as irregular), and only six other weekdays without a bar, below.
 */
export const COMEX_CALENDAR: ExchangeCalendar = {
  id: 'xcec',
  name: 'COMEX (CME Globex)',
  timeZone: 'America/New_York',
  // The end of the Globex trading day. A series of daily settlement prices
  // (struck at 13:30 New York time for gold and silver) should say so in its
  // instrument's price basis; the bar is still not actionable before 17:00.
  closeLocal: '17:00',
  weekend: [0, 6],
  holidays: Object.assign({}, ...COMEX_YEARS.map(comexHolidays)) as Record<string, string>,
  holidayYears: COMEX_YEARS,
  source:
    'CME holiday rules as encoded in pandas_market_calendars CMEGlobexEnergyAndMetals (read 2026-11-24), 2011-2027, ' +
    'cross-checked with Yahoo GC=F and SI=F daily bars.',
  disputed: {
    '2012-10-29': 'Hurricane Sandy: no bar in GC=F or SI=F; CME’s status that day not in the rule source',
    '2012-10-30': 'Hurricane Sandy: no bar in GC=F or SI=F; CME’s status that day not in the rule source',
    '2018-12-05': 'National day of mourning (President G. H. W. Bush): no bar in GC=F or SI=F; not in the rule source',
  },
};

export const CALENDARS: readonly ExchangeCalendar[] = [NSE_CALENDAR, BSE_CALENDAR, COMEX_CALENDAR];

/** Day of the week of an ISO date, 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** How to read a calendar day, given the dates the series has bars for. */
export function dayStatus(calendar: ExchangeCalendar, date: string, sessions: ReadonlySet<string>): DayStatus {
  if (sessions.has(date)) return 'session';
  const special = calendar.specialSessions?.[date] !== undefined;
  if (!special && calendar.weekend.includes(weekdayOf(date))) return 'weekend';
  if (calendar.holidays[date] !== undefined) return 'holiday';
  if (calendar.disputed?.[date] !== undefined) return 'unknown';
  return calendar.holidayYears.includes(Number(date.slice(0, 4))) ? 'missing' : 'unknown';
}

/** Whether the exchange was shut that day by its calendar (weekend or holiday), so a bar dated then is irregular. */
export function isShut(calendar: ExchangeCalendar, date: string): boolean {
  if (calendar.specialSessions?.[date] !== undefined) return false;
  return calendar.weekend.includes(weekdayOf(date)) || calendar.holidays[date] !== undefined;
}

/** Weekdays between two dates (inclusive) that should have traded but have no bar. */
export function missingSessions(calendar: ExchangeCalendar, from: string, to: string, sessions: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (dayStatus(calendar, d, sessions) === 'missing') out.push(d);
  return out;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Wall-clock date and minutes after midnight of a UTC instant in a zone. */
export function localDateTime(utcMs: number, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(utcMs));
  const get = (type: string): string => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')) + Number(get('second')) / 60,
  };
}

/** Minutes after midnight of a `HH:MM` string. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}
