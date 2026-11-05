/**
 * Time counts from an anchor.
 *
 * ## Why this was deferred, and what changed
 *
 * An earlier version of the conventions listed these as deliberately absent:
 * they are trivial arithmetic, and they are also the Gann construction most
 * often presented as a prediction — "90 days from the low" said as though the
 * date were a forecast rather than a date.
 *
 * What they are is a **calendar**, and a calendar is useful. So they are here,
 * computed and labelled as dates, with the module's standing rule unchanged:
 * nothing is called a turn, a pivot, a target or a level, and no count is
 * selected by how well it fits the series. The counts are the caller's.
 *
 * Seasonal dates are NOT computed here. The equinoxes and solstices are
 * astronomy, and this package computes none: the caller gets them from
 * `@astro/engine`'s ingress search and passes them in, so there is one
 * definition of a solstice in the product rather than two.
 */

export type CountUnit = 'bars' | 'calendarDays';

export interface CountAnchor {
  readonly barIndex: number;
  /** ISO `YYYY-MM-DD`. */
  readonly date: string;
}

/**
 * The counts in common use, in degrees-as-days.
 *
 * They are the circle's own divisions — an eighth, a sixth, a quarter, a
 * third, a half, a full turn — which is the only sense in which a number of
 * days is "natural". Offered as a starting set, not a default truth.
 */
export const COMMON_COUNTS: readonly number[] = [45, 60, 90, 120, 144, 180, 270, 360];

export interface TimeCount {
  readonly count: number;
  readonly unit: CountUnit;
  /** Bar index, for a count in bars. Undefined for a calendar count. */
  readonly barIndex?: number;
  /** ISO date, for a calendar count. Undefined for a bar count. */
  readonly date?: string;
  readonly label: string;
}

const MS_PER_DAY = 86_400_000;

export class InvalidAnchorError extends RangeError {
  readonly code = 'invalidCountAnchor';
  constructor(date: string) {
    super(`"${date}" is not an ISO date (YYYY-MM-DD), so no calendar count can start from it.`);
    this.name = 'InvalidAnchorError';
  }
}

/** ISO date `count` days after an ISO date. UTC throughout, so no DST drift. */
export function addDays(iso: string, count: number): string {
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new InvalidAnchorError(iso);
  return new Date(parsed + count * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Counts forward from an anchor.
 *
 * A count in **bars** lands on a bar index, and one in **calendar days** on a
 * date. They are different questions and give different answers on any series
 * with weekends in it, so the unit travels with every result rather than
 * being assumed from context.
 */
export function timeCounts(
  anchor: CountAnchor,
  counts: readonly number[] = COMMON_COUNTS,
  unit: CountUnit = 'calendarDays',
): readonly TimeCount[] {
  return counts
    .filter((count) => Number.isFinite(count))
    .map((count) => (unit === 'bars'
      ? {
          count,
          unit,
          barIndex: anchor.barIndex + count,
          label: `${count} bars`,
        }
      : {
          count,
          unit,
          date: addDays(anchor.date, count),
          label: `${count} days`,
        }))
    .sort((a, b) => a.count - b.count);
}

/** Whole days between two ISO dates. Both are UTC midnights, so this is exact. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a)) throw new InvalidAnchorError(from);
  if (Number.isNaN(b)) throw new InvalidAnchorError(to);
  return Math.round((b - a) / MS_PER_DAY);
}

export interface SeasonalDate {
  /** ISO date of the ingress, supplied by the caller from the engine. */
  readonly date: string;
  readonly label: string;
}

export interface SeasonalCount extends SeasonalDate {
  /** Days from the anchor. Negative before it. */
  readonly daysFromAnchor: number;
}

/**
 * Seasonal dates measured against an anchor.
 *
 * Takes the dates rather than computing them: a solstice is the Sun's ingress
 * into Capricorn, which `@astro/engine` already solves, and recomputing it
 * here would give the product two definitions that could disagree.
 */
export function seasonalCounts(
  anchor: CountAnchor,
  seasonal: readonly SeasonalDate[],
): readonly SeasonalCount[] {
  return seasonal
    .map((entry) => ({ ...entry, daysFromAnchor: daysBetween(anchor.date, entry.date) }))
    .sort((a, b) => a.daysFromAnchor - b.daysFromAnchor);
}
