/**
 * Date grouping for the aspectarian and calendar views.
 *
 * Pure and framework-free, so the calendar arithmetic — which is where
 * off-by-one and month-boundary errors live — can be tested directly.
 *
 * ## Time zone
 *
 * Everything groups by **UTC day**, matching the "Exact (UTC)" column in the
 * tables. Grouping by the viewer's local day would put the same event on
 * different dates for different readers; that is astronomically defensible but
 * it makes two people comparing notes disagree about when something happened.
 * One zone, stated plainly, is easier to reason about.
 *
 * ## Week start
 *
 * Taken from the locale, not assumed. The week begins on Sunday in the United
 * States and India and on Monday across most of Europe, so a hard-coded start
 * silently mislabels the calendar for half the world.
 */

export type PeriodKind = 'day' | 'week' | 'month' | 'year';

export interface DateRange {
  /** Inclusive start, as a UTC timestamp in ms. */
  readonly fromMs: number;
  /** Exclusive end, as a UTC timestamp in ms. */
  readonly toMs: number;
}

const DAY_MS = 86_400_000;

/** ISO weekday: 1 = Monday … 7 = Sunday, matching `Intl.Locale.getWeekInfo`. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * First day of the week for a locale, as an ISO weekday.
 *
 * Falls back to Monday where `getWeekInfo` is unavailable, which is the ISO-8601
 * default rather than a guess.
 */
export function firstDayOfWeek(intlTag: string): number {
  try {
    const locale = new Intl.Locale(intlTag) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
    };
    return locale.getWeekInfo?.().firstDay ?? 1;
  } catch {
    return 1;
  }
}

/** Midnight UTC on the day containing `date`. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** `YYYY-MM-DD` in UTC — the grouping key. */
export function utcDayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

/**
 * The span covered by a period containing `anchor`.
 *
 * End is exclusive, so consecutive periods tile without overlapping and an
 * event at exactly midnight belongs to one day only.
 */
export function periodRange(anchor: Date, period: PeriodKind, weekStart: number): DateRange {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();

  switch (period) {
    case 'day': {
      const from = Date.UTC(year, month, day);
      return { fromMs: from, toMs: from + DAY_MS };
    }
    case 'week': {
      const start = startOfUtcDay(anchor);
      // How many days back to the most recent `weekStart`.
      const back = (isoWeekday(start) - weekStart + 7) % 7;
      const from = start.getTime() - back * DAY_MS;
      return { fromMs: from, toMs: from + 7 * DAY_MS };
    }
    case 'month':
      return { fromMs: Date.UTC(year, month, 1), toMs: Date.UTC(year, month + 1, 1) };
    case 'year':
      return { fromMs: Date.UTC(year, 0, 1), toMs: Date.UTC(year + 1, 0, 1) };
  }
}

/** Move an anchor date forward or back by whole periods. */
export function shiftPeriod(anchor: Date, period: PeriodKind, delta: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();

  switch (period) {
    case 'day':
      return new Date(Date.UTC(year, month, day + delta));
    case 'week':
      return new Date(Date.UTC(year, month, day + delta * 7));
    case 'month':
      // Anchor on the 1st before shifting: stepping from the 31st would skip
      // any month with fewer days, so March + 1 would land in May.
      return new Date(Date.UTC(year, month + delta, 1));
    case 'year':
      return new Date(Date.UTC(year + delta, month, 1));
  }
}

/**
 * Group items into UTC days, keyed `YYYY-MM-DD`.
 * Insertion order follows the sorted key order, so iteration is chronological.
 */
export function groupByUtcDay<T>(items: readonly T[], getDate: (item: T) => Date): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = utcDayKey(getDate(item));
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export interface CalendarCell {
  readonly date: Date;
  readonly dayKey: string;
  /** False for the leading/trailing days that pad the grid to whole weeks. */
  readonly inMonth: boolean;
}

/**
 * A month laid out as whole weeks.
 *
 * Padded at both ends so every row has seven cells; padding days carry
 * `inMonth: false` so the view can dim them rather than pretend they belong.
 */
export function monthGrid(year: number, month: number, weekStart: number): CalendarCell[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const leading = (isoWeekday(first) - weekStart + 7) % 7;
  const start = new Date(first.getTime() - leading * DAY_MS);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const weeks: CalendarCell[][] = [];
  for (let index = 0; index < totalCells; index++) {
    const date = new Date(start.getTime() + index * DAY_MS);
    const cell: CalendarCell = {
      date,
      dayKey: utcDayKey(date),
      inMonth: date.getUTCMonth() === month && date.getUTCFullYear() === year,
    };
    if (index % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1]!.push(cell);
  }
  return weeks;
}

/** Weekday labels in locale order, starting at that locale's first day. */
export function weekdayLabels(intlTag: string, weekStart: number, width: 'short' | 'narrow' = 'short'): string[] {
  const formatter = new Intl.DateTimeFormat(intlTag, { weekday: width, timeZone: 'UTC' });
  // 2024-01-01 was a Monday, giving a known anchor for ISO weekday 1.
  const MONDAY = Date.UTC(2024, 0, 1);
  return Array.from({ length: 7 }, (_, offset) =>
    formatter.format(new Date(MONDAY + ((weekStart - 1 + offset) % 7) * DAY_MS)),
  );
}
