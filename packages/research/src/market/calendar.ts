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
 * no holidays.
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
}

export type DayStatus = 'session' | 'weekend' | 'holiday' | 'missing' | 'unknown';

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

export const NSE_CALENDAR: ExchangeCalendar = {
  id: 'xnse',
  name: 'National Stock Exchange of India',
  timeZone: 'Asia/Kolkata',
  closeLocal: '15:30',
  weekend: [0, 6],
  holidays: NSE_2026,
  holidayYears: [2026],
  source: 'NSE trading holidays 2026, nseindia.com (read 2026-11-13)',
};

/**
 * BSE equity segment. Its 2026 trading holidays are the same days as NSE's;
 * listed separately so a difference in a later year has somewhere to go.
 */
export const BSE_CALENDAR: ExchangeCalendar = {
  ...NSE_CALENDAR,
  id: 'xbom',
  name: 'BSE',
  source: 'BSE equity trading holidays 2026, taken as NSE’s list (the 2026 lists name the same days)',
};

/**
 * COMEX metals futures on CME Globex. No holiday list is loaded: CME
 * publishes holiday hours (often an early halt rather than a closed day), so a
 * weekday without a bar is reported as unknown rather than labelled.
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
  holidays: {},
  holidayYears: [],
  source: 'No holiday list loaded; CME holiday hours not transcribed',
};

export const CALENDARS: readonly ExchangeCalendar[] = [NSE_CALENDAR, BSE_CALENDAR, COMEX_CALENDAR];

/** Day of the week of an ISO date, 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** How to read a calendar day, given the dates the series has bars for. */
export function dayStatus(calendar: ExchangeCalendar, date: string, sessions: ReadonlySet<string>): DayStatus {
  if (sessions.has(date)) return 'session';
  if (calendar.weekend.includes(weekdayOf(date))) return 'weekend';
  if (calendar.holidays[date] !== undefined) return 'holiday';
  return calendar.holidayYears.includes(Number(date.slice(0, 4))) ? 'missing' : 'unknown';
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
