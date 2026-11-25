/**
 * Event studies: what prices did after an event, measured as forward returns.
 *
 * ## The reference close
 *
 * Every observation is an instant. Its reference close is the close of the
 * FIRST session whose close is at or after that instant, on the instrument's
 * own exchange calendar:
 *
 * - an event before or at the close of a session day → that day's close;
 * - an event after the close → the next session's close (the past close was
 *   not available to act on when the event happened);
 * - an event on a weekend or holiday → the next session's close.
 *
 * The rule applied is recorded on every row, so the mapping can be checked.
 *
 * An observation is left out, and counted, when there is no honest
 * reference (0.45):
 *
 * - it falls before the series' first bar. Before 0.45 it was measured from
 *   the first bar instead, so every SILVERBEES episode from 2011 to 2021 (the
 *   ETF listed in February 2022) got the same return from February 2022;
 * - the next bar lies across a gap in the data: a session the calendar lists
 *   as open has no bar (status `missing`), or more than
 *   {@link MAX_UNKNOWN_WEEKDAYS} weekdays the calendar cannot vouch for
 *   (`unknown`, a year with no holiday list) would be bridged;
 * - the data ends first.
 *
 * ## Forward returns
 *
 *     r(h) = 100 × (close[ref + h] / close[ref] − 1)
 *
 * at h trading sessions after the reference, counted in the series' own
 * sessions. A horizon that runs past the end of the data is INCOMPLETE: left
 * out of that horizon's statistics and counted, never replaced by zero.
 *
 * ## What this is not
 *
 * A description of the past, observation by observation. Research scores and
 * rule labels travel with the rows as grouping keys; they are not used to
 * compute anything here.
 */
import type { Series } from '../market/series.js';
import { addDays, dayStatus, localDateTime, minutesOf, weekdayOf, type ExchangeCalendar } from '../market/calendar.js';

export const DEFAULT_HORIZONS: readonly number[] = [1, 3, 5, 10, 20];

/** One thing that happened, at one instant, in one episode. */
export interface StudyObservation {
  /** Unique within a study. */
  readonly id: string;
  /** Observations of the same episode share this. */
  readonly episodeId: string;
  /** UTC instant, ms since the epoch. */
  readonly instantMs: number;
  /** Grouping keys (phase, band, event kind…), as plain strings. */
  readonly keys: Readonly<Record<string, string>>;
}

export type ReferenceRule = 'same-session-close' | 'after-close-next-session' | 'non-session-next-session';

export interface ReferenceSession {
  readonly index: number;
  readonly date: string;
  readonly rule: ReferenceRule;
  /** Exchange-local date and time of the observation, for display. */
  readonly localDate: string;
  readonly localMinutes: number;
}

/** First index in a sorted array of dates whose date is ≥ `date`. */
function lowerBound(dates: readonly string[], date: string): number {
  let lo = 0; let hi = dates.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid]! < date) lo = mid + 1; else hi = mid; }
  return lo;
}

/**
 * Weekdays of unknown status (no holiday list for the year, or a disputed
 * date) that a reference may be carried across. No exchange here closes for
 * more than two weekdays in a row outside its listed holidays, so a longer
 * run is a gap in the data, not a closure.
 */
export const MAX_UNKNOWN_WEEKDAYS = 2;

const sessionSets = new WeakMap<readonly string[], ReadonlySet<string>>();
function sessionsOf(dates: readonly string[]): ReadonlySet<string> {
  let set = sessionSets.get(dates);
  if (!set) { set = new Set(dates); sessionSets.set(dates, set); }
  return set;
}

/**
 * The session whose close an observation is measured from, or null when there
 * is none to measure from honestly: before the first bar, across a gap in the
 * data, or after the data ends.
 */
export function referenceSession(calendar: ExchangeCalendar, dates: readonly string[], instantMs: number): ReferenceSession | null {
  if (dates.length === 0) return null;
  const local = localDateTime(instantMs, calendar.timeZone);
  // No price existed yet: snapping forward would measure from a later listing.
  if (local.date < dates[0]!) return null;
  let index = lowerBound(dates, local.date);
  let rule: ReferenceRule;
  if (index < dates.length && dates[index] === local.date) {
    if (local.minutes <= minutesOf(calendar.closeLocal)) rule = 'same-session-close';
    else { rule = 'after-close-next-session'; index += 1; }
  } else {
    rule = 'non-session-next-session';
  }
  if (index >= dates.length) return null;
  // Every day carried across must be one the exchange was shut, never a missing session.
  const sessions = sessionsOf(dates);
  let unknownWeekdays = 0;
  for (let d = rule === 'after-close-next-session' ? addDays(local.date, 1) : local.date; d < dates[index]!; d = addDays(d, 1)) {
    const status = dayStatus(calendar, d, sessions);
    if (status === 'missing') return null;
    if (status === 'unknown' && !calendar.weekend.includes(weekdayOf(d)) && ++unknownWeekdays > MAX_UNKNOWN_WEEKDAYS) return null;
  }
  return { index, date: dates[index]!, rule, localDate: local.date, localMinutes: local.minutes };
}

/** Forward returns in percent at each horizon; null where the data ends first. */
export function forwardReturns(closes: readonly number[], index: number, horizons: readonly number[]): (number | null)[] {
  const base = closes[index]!;
  return horizons.map((h) => (index + h < closes.length ? 100 * (closes[index + h]! / base - 1) : null));
}

export interface StudyRow {
  readonly observation: StudyObservation;
  readonly reference: ReferenceSession;
  readonly referenceClose: number;
  /** One per horizon, in the study's horizon order; null = incomplete. */
  readonly returns: readonly (number | null)[];
}

/** Summary of one set of returns at one horizon. */
export interface ReturnStats {
  readonly n: number;
  readonly positive: number;
  readonly negative: number;
  readonly flat: number;
  /** Share of observations with a positive return, 0–1; null with no observations. */
  readonly positiveRate: number | null;
  /** Share with a NEGATIVE return: the hit rate of a bearish hypothesis. */
  readonly bearishHitRate: number | null;
  readonly mean: number | null;
  readonly median: number | null;
  readonly min: number | null;
  readonly max: number | null;
  /** Sample standard deviation (n − 1); null below two observations. */
  readonly sd: number | null;
}

const FLAT = 1e-12;

export function returnStats(values: readonly number[]): ReturnStats {
  const n = values.length;
  if (n === 0) return { n: 0, positive: 0, negative: 0, flat: 0, positiveRate: null, bearishHitRate: null, mean: null, median: null, min: null, max: null, sd: null };
  const sorted = [...values].sort((a, b) => a - b);
  const positive = values.filter((v) => v > FLAT).length;
  const negative = values.filter((v) => v < -FLAT).length;
  const mean = values.reduce((a, v) => a + v, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : null;
  return {
    n, positive, negative, flat: n - positive - negative,
    positiveRate: positive / n, bearishHitRate: negative / n,
    mean, median, min: sorted[0]!, max: sorted[n - 1]!, sd,
  };
}

export interface GroupResult {
  /** The grouping keys this group shares. */
  readonly keys: Readonly<Record<string, string>>;
  readonly horizon: number;
  readonly stats: ReturnStats;
  /** Distinct episodes among the observations counted. */
  readonly episodes: number;
  /** Observations whose horizon ran past the data, left out of `stats`. */
  readonly incomplete: number;
}

export interface EventStudyOptions {
  readonly horizons?: readonly number[];
  /** Keys of `StudyObservation.keys` to group by, in order. Empty = one group of everything. */
  readonly groupBy?: readonly string[];
  /**
   * Collapse observations of the same episode that land on the same reference
   * session into one (the first). On by default: two events of one episode
   * on one day are one exposure to that day's prices, not two.
   */
  readonly collapseSameEpisodeDay?: boolean;
}

export interface EventStudyResult {
  readonly horizons: readonly number[];
  readonly rows: readonly StudyRow[];
  readonly groups: readonly GroupResult[];
  /** Every session of the study period as its own observation: the unconditional comparison. */
  readonly baseline: readonly GroupResult[];
  /** The period the baseline covers (first and last reference session). */
  readonly period: { readonly from: string; readonly to: string } | null;
  /** Observations after the last session of the data. */
  readonly unmapped: readonly StudyObservation[];
  /** Observations folded into an earlier one of the same episode and day. */
  readonly collapsed: number;
}

function groupKey(keys: Readonly<Record<string, string>>, by: readonly string[]): string {
  return by.map((k) => `${k}=${keys[k] ?? ''}`).join('|');
}

export function runEventStudy(
  series: Series,
  calendar: ExchangeCalendar,
  observations: readonly StudyObservation[],
  options: EventStudyOptions = {},
): EventStudyResult {
  const horizons = options.horizons ?? DEFAULT_HORIZONS;
  const by = options.groupBy ?? [];
  const dates = series.bars.map((b) => b.date);
  const closes = series.bars.map((b) => b.close);

  const rows: StudyRow[] = [];
  const unmapped: StudyObservation[] = [];
  const seen = new Set<string>();
  let collapsed = 0;
  for (const observation of [...observations].sort((a, b) => a.instantMs - b.instantMs)) {
    const reference = referenceSession(calendar, dates, observation.instantMs);
    if (!reference) { unmapped.push(observation); continue; }
    const dayKey = `${observation.episodeId}@${reference.date}@${groupKey(observation.keys, by)}`;
    if ((options.collapseSameEpisodeDay ?? true) && seen.has(dayKey)) { collapsed += 1; continue; }
    seen.add(dayKey);
    rows.push({ observation, reference, referenceClose: closes[reference.index]!, returns: forwardReturns(closes, reference.index, horizons) });
  }

  const buckets = new Map<string, StudyRow[]>();
  for (const row of rows) {
    const k = groupKey(row.observation.keys, by);
    buckets.set(k, [...(buckets.get(k) ?? []), row]);
  }
  const groups: GroupResult[] = [];
  for (const [, members] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const keys = Object.fromEntries(by.map((k) => [k, members[0]!.observation.keys[k] ?? '']));
    horizons.forEach((horizon, h) => {
      const complete = members.filter((m) => m.returns[h] !== null);
      groups.push({
        keys, horizon,
        stats: returnStats(complete.map((m) => m.returns[h]!)),
        episodes: new Set(complete.map((m) => m.observation.episodeId)).size,
        incomplete: members.length - complete.length,
      });
    });
  }

  let period: EventStudyResult['period'] = null;
  const baseline: GroupResult[] = [];
  if (rows.length > 0) {
    const first = Math.min(...rows.map((r) => r.reference.index));
    const last = Math.max(...rows.map((r) => r.reference.index));
    period = { from: dates[first]!, to: dates[last]! };
    horizons.forEach((horizon) => {
      const values: number[] = []; let incomplete = 0;
      for (let i = first; i <= last; i += 1) {
        const r = forwardReturns(closes, i, [horizon])[0]!;
        if (r === null) incomplete += 1; else values.push(r);
      }
      baseline.push({ keys: {}, horizon, stats: returnStats(values), episodes: 0, incomplete });
    });
  }

  return { horizons, rows, groups, baseline, period, unmapped, collapsed };
}

// ------------------------------------------------------------------ parameter sweep

export interface SweepCandidate {
  /** The parameter value, for display (an orb in degrees, say). */
  readonly value: number;
  readonly observations: readonly StudyObservation[];
}

export type SweepObjective = 'lowest-mean' | 'highest-mean' | 'highest-bearish-hit-rate' | 'highest-positive-rate';

export interface SweepOptions {
  readonly horizon: number;
  /** First date of the holdout; everything before it is training. */
  readonly splitDate: string;
  readonly objective: SweepObjective;
  /** A candidate needs at least this many training observations to be chosen. */
  readonly minimumTrainingSample: number;
}

export interface SweepRow {
  readonly value: number;
  readonly training: ReturnStats;
  readonly trainingEpisodes: number;
  /** Training observations dropped because their horizon ended on or after the split. */
  readonly droppedAtSplit: number;
  readonly eligible: boolean;
}

export interface SweepResult {
  readonly options: SweepOptions;
  readonly rows: readonly SweepRow[];
  /** The value chosen on the training period, frozen before the holdout is read; null if none was eligible. */
  readonly chosen: number | null;
  /** The chosen value measured on the holdout period only. */
  readonly holdout: { readonly stats: ReturnStats; readonly episodes: number; readonly incomplete: number } | null;
}

function score(stats: ReturnStats, objective: SweepObjective): number {
  switch (objective) {
    case 'lowest-mean': return -(stats.mean ?? Number.POSITIVE_INFINITY);
    case 'highest-mean': return stats.mean ?? Number.NEGATIVE_INFINITY;
    case 'highest-bearish-hit-rate': return stats.bearishHitRate ?? Number.NEGATIVE_INFINITY;
    case 'highest-positive-rate': return stats.positiveRate ?? Number.NEGATIVE_INFINITY;
  }
}

/**
 * Choose a parameter on a training period, freeze it, then measure it once on
 * a later holdout.
 *
 * Chronological, not random: the holdout comes after everything the choice
 * saw. A training observation whose forward horizon reaches the split or
 * beyond is DROPPED — its outcome is a holdout price — and the count is
 * reported. Only the chosen value is measured on the holdout; measuring every
 * candidate there and reading the best would be choosing on the holdout.
 */
export function sweepParameter(
  series: Series,
  calendar: ExchangeCalendar,
  candidates: readonly SweepCandidate[],
  options: SweepOptions,
): SweepResult {
  const dates = series.bars.map((b) => b.date);
  const closes = series.bars.map((b) => b.close);
  const splitIndex = lowerBound(dates, options.splitDate);
  const rows: SweepRow[] = candidates.map((candidate) => {
    const values: number[] = []; const episodes = new Set<string>(); let dropped = 0; const seen = new Set<string>();
    for (const o of candidate.observations) {
      const ref = referenceSession(calendar, dates, o.instantMs);
      if (!ref || ref.index >= splitIndex) continue;
      const key = `${o.episodeId}@${ref.date}`; if (seen.has(key)) continue; seen.add(key);
      if (ref.index + options.horizon >= splitIndex) { dropped += 1; continue; }
      values.push(forwardReturns(closes, ref.index, [options.horizon])[0]!);
      episodes.add(o.episodeId);
    }
    const training = returnStats(values);
    return { value: candidate.value, training, trainingEpisodes: episodes.size, droppedAtSplit: dropped, eligible: training.n >= options.minimumTrainingSample };
  });

  const eligible = rows.filter((r) => r.eligible);
  if (eligible.length === 0) return { options, rows, chosen: null, holdout: null };
  // Ties go to the smaller parameter, so the choice does not depend on input order.
  const best = eligible.reduce((a, b) => (score(b.training, options.objective) > score(a.training, options.objective) || (score(b.training, options.objective) === score(a.training, options.objective) && b.value < a.value) ? b : a));
  const chosen = best.value;

  const candidate = candidates.find((c) => c.value === chosen)!;
  const values: number[] = []; const episodes = new Set<string>(); let incomplete = 0; const seen = new Set<string>();
  for (const o of candidate.observations) {
    const ref = referenceSession(calendar, dates, o.instantMs);
    if (!ref || ref.index < splitIndex) continue;
    const key = `${o.episodeId}@${ref.date}`; if (seen.has(key)) continue; seen.add(key);
    const r = forwardReturns(closes, ref.index, [options.horizon])[0]!;
    if (r === null) { incomplete += 1; continue; }
    values.push(r); episodes.add(o.episodeId);
  }
  return { options, rows, chosen, holdout: { stats: returnStats(values), episodes: episodes.size, incomplete } };
}
