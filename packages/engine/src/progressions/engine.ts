/**
 * Progressions and directions.
 *
 * ## Secondary progressions
 *
 * The classical "day for a year": the sky one day after birth stands for the
 * first year of life, two days for the second, and so on. The progressed chart
 * for a given date is therefore the real sky at
 *
 *     natalJd + elapsed / yearLength
 *
 * cast for the natal place. Nothing is invented — it is an ordinary chart for
 * an ordinary moment, reached by a different route.
 *
 * `yearLength` defaults to the tropical year (365.2422 days). The Julian year
 * (365.25) is an alternative some traditions prefer. Measured, the two differ by
 * about 0.002 days of progressed time over a century of age — roughly three
 * minutes, which moves the progressed Moon by under two arcminutes and
 * everything else by less. Small, but the choice is recorded on the result
 * rather than left implicit, because a reader comparing output against another
 * program needs to know which key was used.
 *
 * ## Solar arc directions
 *
 * A different kind of object. Every natal position is advanced by a single arc —
 * the distance the secondary-progressed Sun has travelled — so the result is a
 * DIRECTED chart, not a picture of the sky at any moment. It is typed
 * separately for that reason: calling it a chart would invite treating its
 * positions as real planetary positions, which they are not.
 *
 * Primary directions are not implemented. They need a different time key
 * entirely (diurnal rotation rather than orbital motion) and would slot in
 * alongside these as a third method.
 */
import { norm360, type Degrees } from '../math/angles.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import type { Body } from '../ephemeris/types.js';
import { julianDayToIsoUtc } from '../time/julian.js';
import {
  calculateChartForInstant,
  type BirthPlace,
  type ChartSettings,
  type InstantChart,
} from '../chart/instant.js';

/** Mean tropical year, days. The default time key for secondary progressions. */
export const TROPICAL_YEAR_DAYS = 365.242190;
/** Julian year, days. An alternative key some traditions prefer. */
export const JULIAN_YEAR_DAYS = 365.25;

export interface ProgressionOptions {
  /** Julian Day of birth, in UT. */
  readonly natalJd: number;
  /** The date the chart is progressed TO. */
  readonly targetJd: number;
  readonly place: BirthPlace;
  /** Days per year. Defaults to {@link TROPICAL_YEAR_DAYS}. */
  readonly yearLengthDays?: number;
  readonly settings?: Partial<ChartSettings>;
}

export interface ProgressedChart {
  readonly method: 'secondary';
  readonly natalJd: number;
  readonly targetJd: number;
  /** The actual moment whose sky this chart shows. */
  readonly progressedJd: number;
  readonly progressedUtcIso: string;
  readonly elapsedYears: number;
  readonly yearLengthDays: number;
  readonly chart: InstantChart;
}

/**
 * Secondary progressed chart for a target date.
 *
 * Progressing backwards is allowed — a negative elapsed time gives the
 * pre-natal sky, which some techniques use — so the only rejected input is a
 * non-finite one.
 */
export function secondaryProgression(
  provider: EphemerisProvider,
  options: ProgressionOptions,
): ProgressedChart {
  const { natalJd, targetJd, place } = options;
  if (!Number.isFinite(natalJd) || !Number.isFinite(targetJd)) {
    throw new RangeError('natalJd and targetJd must be finite Julian Days');
  }

  const yearLengthDays = options.yearLengthDays ?? TROPICAL_YEAR_DAYS;
  if (!(yearLengthDays > 0)) {
    throw new RangeError(`yearLengthDays must be positive, received ${yearLengthDays}`);
  }

  const elapsedYears = (targetJd - natalJd) / yearLengthDays;
  const progressedJd = natalJd + elapsedYears;

  return {
    method: 'secondary',
    natalJd,
    targetJd,
    progressedJd,
    progressedUtcIso: julianDayToIsoUtc(progressedJd),
    elapsedYears,
    yearLengthDays,
    chart: calculateChartForInstant(provider, progressedJd, place, {
      ...(options.settings ? { settings: options.settings } : {}),
      withHouses: true,
    }),
  };
}

export interface DirectedPosition {
  readonly body: Body;
  /** Natal longitude advanced by the arc. */
  readonly longitude: Degrees;
  readonly natalLongitude: Degrees;
}

export interface DirectedAngles {
  readonly ascendant: Degrees;
  readonly midheaven: Degrees;
  readonly descendant: Degrees;
  readonly imumCoeli: Degrees;
}

/**
 * A solar arc directed chart.
 *
 * Deliberately NOT an {@link InstantChart}: these longitudes are natal
 * positions displaced by an arc, not bodies observed anywhere. They have no
 * speed, no latitude and no retrograde state, and typing them as real positions
 * would invite code to ask for those.
 */
export interface SolarArcChart {
  readonly method: 'solarArc';
  /** The arc every position was advanced by. */
  readonly arc: Degrees;
  readonly natalJd: number;
  readonly targetJd: number;
  readonly elapsedYears: number;
  readonly positions: readonly DirectedPosition[];
  readonly angles?: DirectedAngles;
}

export interface SolarArcInput {
  readonly natalJd: number;
  readonly targetJd: number;
  readonly place: BirthPlace;
  readonly yearLengthDays?: number;
  readonly settings?: Partial<ChartSettings>;
  /** The natal chart whose positions are directed. */
  readonly natalChart: {
    readonly bodies: readonly {
      readonly position: { readonly body: Body; readonly longitude: number };
    }[];
    readonly houses?: {
      readonly ascendant: number;
      readonly midheaven: number;
    };
  };
}

/**
 * Solar arc directions for a target date.
 *
 * The arc is taken from the secondary-progressed Sun, which is the standard
 * key. Because the Sun never retrogrades the arc always increases, so a
 * directed position is unambiguous.
 */
export function solarArcDirections(
  provider: EphemerisProvider,
  input: SolarArcInput,
): SolarArcChart {
  const progressed = secondaryProgression(provider, {
    natalJd: input.natalJd,
    targetJd: input.targetJd,
    place: input.place,
    ...(input.yearLengthDays !== undefined ? { yearLengthDays: input.yearLengthDays } : {}),
    ...(input.settings ? { settings: input.settings } : {}),
  });

  const natalSun = input.natalChart.bodies.find((b) => b.position.body === 'sun');
  const progressedSun = progressed.chart.bodies.find((b) => b.position.body === 'sun');
  if (!natalSun || !progressedSun) {
    throw new RangeError('Solar arc requires the Sun in both the natal and progressed charts');
  }

  const arc = norm360(progressedSun.position.longitude - natalSun.position.longitude);

  const positions: DirectedPosition[] = input.natalChart.bodies.map((placed) => ({
    body: placed.position.body,
    natalLongitude: placed.position.longitude,
    longitude: norm360(placed.position.longitude + arc),
  }));

  const houses = input.natalChart.houses;
  const angles: DirectedAngles | undefined = houses
    ? {
        ascendant: norm360(houses.ascendant + arc),
        midheaven: norm360(houses.midheaven + arc),
        descendant: norm360(houses.ascendant + 180 + arc),
        imumCoeli: norm360(houses.midheaven + 180 + arc),
      }
    : undefined;

  return {
    method: 'solarArc',
    arc,
    natalJd: input.natalJd,
    targetJd: input.targetJd,
    elapsedYears: progressed.elapsedYears,
    positions,
    ...(angles ? { angles } : {}),
  };
}
