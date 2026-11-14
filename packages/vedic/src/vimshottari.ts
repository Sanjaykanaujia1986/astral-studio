/**
 * Viṁśottarī daśā.
 *
 * The 120-year cycle, started from the lord of the Moon's natal nakṣatra, with
 * the first mahādaśā shortened to the unelapsed portion of that nakṣatra.
 *
 * ## The year length is the whole argument
 *
 * "Years" here are not calendar years, and the module does not pretend there
 * is one right answer. Over a 120-year cycle the common choices diverge by
 * about a day, and across a mahādaśā boundary two programs using different
 * lengths will print dates days apart — which is exactly the discrepancy that
 * makes people distrust software.
 *
 * So the length is explicit, defaulted, recorded on every result, and shown in
 * the UI. See docs/VEDIC_CONVENTIONS.md §6.
 */
import { julianDayToIsoUtc, type Degrees } from '@astro/engine';
import { nakshatraOf, VIMSHOTTARI_LORDS, type VimshottariLord } from './nakshatra.js';

/** Period of each lord, in Viṁśottarī years. Sums to 120. */
export const LORD_YEARS: Readonly<Record<VimshottariLord, number>> = {
  ketu: 7,
  venus: 20,
  sun: 6,
  moon: 10,
  mars: 7,
  rahu: 18,
  jupiter: 16,
  saturn: 19,
  mercury: 17,
};

export const TOTAL_YEARS = 120;

/** Named year-length conventions, in days. */
export const YEAR_LENGTHS = {
  /** Gregorian mean year. The default. */
  gregorian: 365.2425,
  /** Julian year — what several widely used programs apply. */
  julian: 365.25,
  /** Tropical year. */
  tropical: 365.2422,
  /** Sāvana: the classical 360-day reckoning. */
  savana: 360,
} as const;

export type YearLengthName = keyof typeof YEAR_LENGTHS;

export interface DashaPeriod {
  readonly lord: VimshottariLord;
  readonly startJd: number;
  readonly endJd: number;
  readonly startIso: string;
  readonly endIso: string;
  /** Length in Viṁśottarī years, before conversion to days. */
  readonly years: number;
  /** Nested antardaśās. Empty when only one level was requested. */
  readonly antardashas: readonly DashaPeriod[];
}

export interface VimshottariOptions {
  /** Defaults to `julian` (365.25 days) — the reference horoscope software's year. */
  readonly yearLength?: YearLengthName | number;
  /** How many mahādaśās to return. Defaults to 9 — one full cycle. */
  readonly count?: number;
  /** Compute antardaśās. Defaults to true. */
  readonly includeAntardashas?: boolean;
}

export interface VimshottariResult {
  /** The Moon's nakṣatra, which decides where the sequence starts. */
  readonly moonNakshatra: ReturnType<typeof nakshatraOf>;
  /** Unelapsed fraction of that nakṣatra at birth. */
  readonly balanceFraction: number;
  /** Years remaining in the first mahādaśā at birth. */
  readonly balanceYears: number;
  readonly yearLengthDays: number;
  readonly yearLengthName: YearLengthName | 'custom';
  readonly periods: readonly DashaPeriod[];
}

function resolveYearLength(
  option: VimshottariOptions['yearLength'],
): { days: number; name: YearLengthName | 'custom' } {
  if (option === undefined) return { days: YEAR_LENGTHS.julian, name: 'julian' };
  if (typeof option === 'number') {
    if (!(option > 0)) throw new RangeError(`year length must be positive, received ${option}`);
    const named = (Object.keys(YEAR_LENGTHS) as YearLengthName[])
      .find((key) => YEAR_LENGTHS[key] === option);
    return { days: option, name: named ?? 'custom' };
  }
  return { days: YEAR_LENGTHS[option], name: option };
}

/** The nine lords starting from `lord`, in Viṁśottarī order. */
export function lordSequence(lord: VimshottariLord): readonly VimshottariLord[] {
  const start = VIMSHOTTARI_LORDS.indexOf(lord);
  return Array.from({ length: 9 }, (_, i) => VIMSHOTTARI_LORDS[(start + i) % 9]!);
}

/**
 * Antardaśās within one mahādaśā.
 *
 * The sequence starts with the mahādaśā's own lord and proceeds in Viṁśottarī
 * order; each runs for `years(maha) × years(antar) / 120`. The nine of them sum
 * to the mahādaśā exactly, which a test asserts — a rounding scheme that did
 * not would leave a visible gap or overlap at every boundary.
 */
function buildAntardashas(
  lord: VimshottariLord,
  mahaStartJd: number,
  mahaYears: number,
  dayPerYear: number,
): DashaPeriod[] {
  const out: DashaPeriod[] = [];
  let cursor = mahaStartJd;

  for (const sub of lordSequence(lord)) {
    const years = (mahaYears * LORD_YEARS[sub]) / TOTAL_YEARS;
    const end = cursor + years * dayPerYear;
    out.push({
      lord: sub,
      startJd: cursor,
      endJd: end,
      startIso: julianDayToIsoUtc(cursor),
      endIso: julianDayToIsoUtc(end),
      years,
      antardashas: [],
    });
    cursor = end;
  }
  return out;
}

/**
 * Compute the Viṁśottarī sequence from a natal Moon.
 *
 * `birthJd` is the Julian Day (UT) of birth; the Moon's sidereal longitude
 * decides the starting lord and the balance.
 */
export function vimshottari(
  moonSiderealLongitude: Degrees,
  birthJd: number,
  options: VimshottariOptions = {},
): VimshottariResult {
  const { days: dayPerYear, name } = resolveYearLength(options.yearLength);
  const count = options.count ?? 9;
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`count must be a positive integer, received ${count}`);
  }
  const withAntar = options.includeAntardashas ?? true;

  const moonNakshatra = nakshatraOf(moonSiderealLongitude);

  /*
   * The balance is what REMAINS, not what has passed. A Moon at the very start
   * of its nakṣatra gets the lord's full period; one at the very end gets
   * almost none. Using `elapsed` directly here is the classic inversion, and
   * it produces a chart whose first daśā is backwards.
   */
  const balanceFraction = 1 - moonNakshatra.elapsed;
  const firstLordYears = LORD_YEARS[moonNakshatra.lord];
  const balanceYears = balanceFraction * firstLordYears;

  const periods: DashaPeriod[] = [];
  let cursor = birthJd;

  for (let i = 0; i < count; i++) {
    const lord = VIMSHOTTARI_LORDS[
      (VIMSHOTTARI_LORDS.indexOf(moonNakshatra.lord) + i) % 9
    ]!;
    // Only the first is shortened; every later one runs its full span.
    const years = i === 0 ? balanceYears : LORD_YEARS[lord];
    const end = cursor + years * dayPerYear;

    periods.push({
      lord,
      startJd: cursor,
      endJd: end,
      startIso: julianDayToIsoUtc(cursor),
      endIso: julianDayToIsoUtc(end),
      years,
      antardashas: withAntar ? buildAntardashas(lord, cursor, years, dayPerYear) : [],
    });
    cursor = end;
  }

  return {
    moonNakshatra,
    balanceFraction,
    balanceYears,
    yearLengthDays: dayPerYear,
    yearLengthName: name,
    periods,
  };
}

/** The mahādaśā and antardaśā in force at an instant, if any. */
export function dashaAt(
  result: VimshottariResult,
  jd: number,
): { readonly maha?: DashaPeriod; readonly antar?: DashaPeriod } {
  const maha = result.periods.find((p) => jd >= p.startJd && jd < p.endJd);
  if (!maha) return {};
  const antar = maha.antardashas.find((p) => jd >= p.startJd && jd < p.endJd);
  return antar ? { maha, antar } : { maha };
}
