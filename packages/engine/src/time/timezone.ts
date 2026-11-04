/**
 * Civil (wall-clock) time -> UTC, via the IANA time-zone database.
 *
 * Birth times are recorded in local civil time. Converting them correctly is
 * the single most common source of wrong charts, because:
 *
 *  - historical DST rules differ from today's (the current offset must NEVER
 *    be assumed to apply to a past date);
 *  - before standard time, zones used Local Mean Time with odd offsets;
 *  - one hour of wall-clock time is SKIPPED at a spring-forward transition, so
 *    some stated birth times never existed;
 *  - one hour is REPEATED at an autumn transition, so some stated birth times
 *    are genuinely ambiguous between two UTC instants.
 *
 * Rather than silently picking one, this module reports which case applies and
 * lets the caller surface it. Luxon reads the platform ICU copy of the IANA
 * TZDB, so historical transitions and LMT offsets come from real data.
 */
import { DateTime } from 'luxon';
import type { EngineErrorCode } from '../chart/warnings.js';
import {
  julianDay,
  toDecimalHours,
  type Calendar,
  type CivilDate,
  type CivilTime,
} from './julian.js';

export type TimeAmbiguity =
  /** Exactly one UTC instant corresponds to this wall time. */
  | 'unique'
  /** The wall time occurs twice (clocks went back). Both instants are valid. */
  | 'ambiguous'
  /** The wall time never occurred (clocks went forward). */
  | 'nonexistent';

export interface ResolvedTime {
  /** Julian Day in UT — what the ephemeris consumes. */
  readonly jdUT: number;
  /** ISO-8601 UTC instant, for display and storage. */
  readonly utcIso: string;
  /** Offset actually applied, in minutes east of UTC. */
  readonly offsetMinutes: number;
  readonly zone: string;
  readonly ambiguity: TimeAmbiguity;
  /**
   * For 'ambiguous', the alternative instant that was NOT chosen, so a UI can
   * offer it. Undefined otherwise.
   */
  readonly alternativeUtcIso?: string;
}

export class TimeResolutionError extends Error {
  readonly detail?: unknown;
  /**
   * Stable identifier for the failure, so the UI can render a translated
   * message instead of surfacing the English one built for developers.
   */
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'TimeResolutionError';
    this.code = code;
    this.detail = detail;
  }
}

function assertValidZone(zone: string): void {
  if (!DateTime.local().setZone(zone).isValid) {
    throw new TimeResolutionError('unknownTimeZone', `Unknown or unsupported time zone: "${zone}"`, { zone });
  }
}

/**
 * Find every UTC instant that presents as the given wall time in `zone`.
 *
 * Works by probing the zone's offset a day either side of the target, then
 * testing each candidate offset for self-consistency: an offset is valid only
 * if applying it produces an instant that reads back as the requested wall
 * time. Yields 0 instants for a skipped hour, 2 for a repeated hour.
 */
function candidateInstants(date: CivilDate, time: CivilTime, zone: string): DateTime[] {
  const { year, month, day } = date;
  const { hour, minute, second } = time;

  // The wall-clock reading interpreted as if it were UTC — a fixed reference
  // point from which to apply trial offsets.
  const wallAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, Math.floor(second), 0);
  const dayMs = 86_400_000;

  const offsets = new Set<number>([
    DateTime.fromMillis(wallAsUtcMs - dayMs, { zone }).offset,
    DateTime.fromMillis(wallAsUtcMs + dayMs, { zone }).offset,
  ]);

  const found: DateTime[] = [];
  for (const offsetMinutes of offsets) {
    const instant = DateTime.fromMillis(wallAsUtcMs - offsetMinutes * 60_000, { zone });
    if (
      instant.year === year &&
      instant.month === month &&
      instant.day === day &&
      instant.hour === hour &&
      instant.minute === minute
    ) {
      found.push(instant);
    }
  }

  found.sort((a, b) => a.toMillis() - b.toMillis());
  return found;
}

export interface ResolveOptions {
  /**
   * How to handle a wall time that never existed (skipped hour).
   * 'throw' (default) surfaces it; 'shift-forward' moves past the gap.
   */
  readonly onNonexistent?: 'throw' | 'shift-forward';
  /**
   * Which instant to take when the wall time occurred twice.
   * Defaults to 'first' (the pre-transition reading).
   */
  readonly preferOnAmbiguous?: 'first' | 'second';
  readonly calendar?: Calendar;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Resolve a civil date/time in an IANA zone to a Julian Day in UT.
 */
export function resolveCivilTime(
  date: CivilDate,
  time: CivilTime,
  zone: string,
  options: ResolveOptions = {},
): ResolvedTime {
  assertValidZone(zone);
  toDecimalHours(time); // validates ranges, throws on nonsense

  const candidates = candidateInstants(date, time, zone);
  const calendar = options.calendar ?? 'gregorian';

  let chosen: DateTime;
  let ambiguity: TimeAmbiguity;
  let alternative: DateTime | undefined;

  if (candidates.length === 1) {
    chosen = candidates[0]!;
    ambiguity = 'unique';
  } else if (candidates.length >= 2) {
    ambiguity = 'ambiguous';
    const first = candidates[0]!;
    const second = candidates[1]!;
    if ((options.preferOnAmbiguous ?? 'first') === 'first') {
      chosen = first;
      alternative = second;
    } else {
      chosen = second;
      alternative = first;
    }
  } else {
    ambiguity = 'nonexistent';
    if ((options.onNonexistent ?? 'throw') === 'throw') {
      throw new TimeResolutionError(
        'timeDoesNotExist',
        `The local time ${date.year}-${pad2(date.month)}-${pad2(date.day)} ` +
          `${pad2(time.hour)}:${pad2(time.minute)} does not exist in ${zone} — ` +
          `clocks moved forward over it. Check the recorded time.`,
        { date, time, zone },
      );
    }
    // Shift forward past the gap: Luxon already does this when constructing.
    chosen = DateTime.fromObject(
      {
        year: date.year,
        month: date.month,
        day: date.day,
        hour: time.hour,
        minute: time.minute,
      },
      { zone },
    );
  }

  const utc = chosen.toUTC();
  const jdUT = julianDay(
    { year: utc.year, month: utc.month, day: utc.day },
    utc.hour + utc.minute / 60 + (utc.second + utc.millisecond / 1000) / 3600,
    calendar,
  );

  const base = {
    jdUT,
    utcIso: utc.toISO() ?? '',
    offsetMinutes: chosen.offset,
    zone,
    ambiguity,
  };

  if (alternative) {
    return { ...base, alternativeUtcIso: alternative.toUTC().toISO() ?? '' };
  }
  return base;
}

/**
 * Resolve using an explicit UTC offset instead of a zone name.
 *
 * Birth certificates often state the offset directly. Trusting a stated offset
 * sidesteps the historical-rules problem entirely, so this path has no
 * ambiguity by construction.
 */
export function resolveWithFixedOffset(
  date: CivilDate,
  time: CivilTime,
  offsetMinutes: number,
  calendar: Calendar = 'gregorian',
): ResolvedTime {
  if (!Number.isFinite(offsetMinutes) || Math.abs(offsetMinutes) > 16 * 60) {
    throw new TimeResolutionError('implausibleOffset', `Implausible UTC offset: ${offsetMinutes} minutes`, { offsetMinutes });
  }
  toDecimalHours(time);

  const wallAsUtcMs = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
    Math.floor(time.second),
  );
  const utc = DateTime.fromMillis(wallAsUtcMs - offsetMinutes * 60_000, { zone: 'utc' });

  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);

  return {
    jdUT: julianDay(
      { year: utc.year, month: utc.month, day: utc.day },
      utc.hour + utc.minute / 60 + utc.second / 3600,
      calendar,
    ),
    utcIso: utc.toISO() ?? '',
    offsetMinutes,
    zone: `UTC${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`,
    ambiguity: 'unique',
  };
}
