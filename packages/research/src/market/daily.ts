/**
 * One row per calendar day for a date range: what kind of day it was on the
 * instrument's own calendar, and — only on a session with a bar — the close
 * and its direction from the previous session's close.
 *
 * A weekend, a holiday, a missing session (a weekday the calendar expects but
 * the data lacks) and an unknown day (no holiday list for that year) are
 * different things and are never given a price or a direction. A weekday
 * the calendar expects but that lies before the series' first bar or after
 * its last is `outside`, not missing: the data simply does not reach it
 * (today's session before the close, or any later day).
 */
import type { Series } from './series.js';
import { dayStatus, isShut, type DayStatus, type ExchangeCalendar } from './calendar.js';

export type Direction = 'up' | 'down' | 'flat';

export interface DailyRow {
  readonly date: string;
  readonly status: DayStatus;
  /** Holiday name, when it is one. */
  readonly holiday?: string;
  /** Why the day is unknown although its year is listed: the sources disagree. */
  readonly disputed?: string;
  /** A weekend day the exchange opened for a full special session. */
  readonly special?: string;
  readonly close: number | null;
  /** The session this close is compared with: the previous bar in the series. */
  readonly previousDate: string | null;
  readonly changePct: number | null;
  readonly direction: Direction | null;
  /** A bar on a day the calendar says is shut (a special session): shown, flagged, kept out of "valid session" counts. */
  readonly irregular?: true;
}

/** Below this, in percent, a change counts as flat. */
export const FLAT_PCT = 1e-9;

export function dailyRows(series: Series | null, calendar: ExchangeCalendar, from: string, to: string): DailyRow[] {
  const bars = series?.bars ?? [];
  const index = new Map(bars.map((b, i) => [b.date, i]));
  const have = new Set(index.keys());
  const out: DailyRow[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    // With no series at all, a weekday can only be called a session or not by the calendar.
    let status = dayStatus(calendar, date, have);
    if (!series && status === 'missing') status = 'unknown';
    if (series && status === 'missing' && (date < series.firstDate || date > series.lastDate)) status = 'outside';
    const holiday = calendar.holidays[date];
    const disputed = calendar.disputed?.[date];
    const special = calendar.specialSessions?.[date];
    const notes = { ...(holiday ? { holiday } : {}), ...(disputed ? { disputed } : {}), ...(special ? { special } : {}) };
    const i = index.get(date);
    if (status !== 'session' || i === undefined) {
      out.push({ date, status, ...notes, close: null, previousDate: null, changePct: null, direction: null });
      continue;
    }
    const shut = isShut(calendar, date);
    const prev = i > 0 ? bars[i - 1]! : null;
    const close = bars[i]!.close;
    const changePct = prev ? 100 * (close / prev.close - 1) : null;
    const direction: Direction | null = changePct === null ? null : Math.abs(changePct) <= FLAT_PCT ? 'flat' : changePct > 0 ? 'up' : 'down';
    out.push({ date, status, close, previousDate: prev?.date ?? null, changePct, direction, ...notes, ...(shut ? { irregular: true as const } : {}) });
  }
  return out;
}
