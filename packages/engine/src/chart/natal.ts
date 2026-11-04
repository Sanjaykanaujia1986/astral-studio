/**
 * Natal chart assembly.
 *
 * A thin layer over {@link calculateChartForInstant}: this module's job is
 * turning birth data into a moment — resolving the time zone, deciding whether
 * houses can be computed — after which casting the chart is the same work a
 * return or a progressed chart does.
 *
 * ## Unknown birth time
 *
 * When the birth time is not known, houses, the angles (ASC/MC/DSC/IC) and all
 * house placements are OMITTED rather than computed from an assumed noon. They
 * would be pure fiction: the ascendant moves a full circle in 24 hours, so a
 * guessed time yields a guessed rising sign. The chart is still returned, with
 * planetary positions, and `timeKnown: false` says why the rest is missing.
 */
import type { CivilDate, CivilTime } from '../time/julian.js';
import {
  resolveCivilTime,
  resolveWithFixedOffset,
  type ResolveOptions,
  type TimeAmbiguity,
} from '../time/timezone.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import { calculateChartForInstant, type ChartSettings, type InstantChart } from './instant.js';
import type { ChartWarning } from './warnings.js';

export type {
  BirthPlace,
  ChartPrecision,
  ChartSettings,
  Distribution,
  InstantChart,
  PlacedBody,
} from './instant.js';
export { DEFAULT_SETTINGS, houseOf, resolveNodeBodies, calculateChartForInstant } from './instant.js';

import type { BirthPlace } from './instant.js';

export type ZoneSpec =
  | { readonly kind: 'iana'; readonly zone: string }
  | { readonly kind: 'fixedOffset'; readonly offsetMinutes: number };

export interface BirthData {
  readonly date: CivilDate;
  /** Omit when the birth time is unknown. */
  readonly time?: CivilTime;
  readonly zone: ZoneSpec;
  readonly place: BirthPlace;
  readonly name?: string;
}

export interface NatalChart extends InstantChart {
  readonly input: BirthData;
  readonly timeKnown: boolean;
  readonly offsetMinutes: number;
  readonly timeAmbiguity: TimeAmbiguity;
  readonly alternativeUtcIso?: string;
}

export interface CalculateOptions {
  readonly settings?: Partial<ChartSettings>;
  readonly resolve?: ResolveOptions;
}

/**
 * Build a natal chart. The provider must already be initialised.
 */
export function calculateNatalChart(
  provider: EphemerisProvider,
  birth: BirthData,
  options: CalculateOptions = {},
): NatalChart {
  const timeKnown = birth.time !== undefined;
  // Midnight is a neutral placeholder for a date-only chart. It is never used
  // for houses or angles — see the module note.
  const time: CivilTime = birth.time ?? { hour: 0, minute: 0, second: 0 };

  const resolved =
    birth.zone.kind === 'iana'
      ? resolveCivilTime(birth.date, time, birth.zone.zone, options.resolve)
      : resolveWithFixedOffset(birth.date, time, birth.zone.offsetMinutes);

  const warnings: ChartWarning[] = [];
  if (!timeKnown) warnings.push({ code: 'birthTimeUnknown' });
  if (resolved.ambiguity === 'ambiguous') warnings.push({ code: 'timeAmbiguous' });
  if (resolved.ambiguity === 'nonexistent') warnings.push({ code: 'timeNonexistent' });

  const core = calculateChartForInstant(provider, resolved.jdUT, birth.place, {
    ...(options.settings ? { settings: options.settings } : {}),
    withHouses: timeKnown,
    warnings,
  });

  return {
    ...core,
    // Keep the resolver's own UTC string: it carries the sub-second precision
    // the time zone conversion produced, rather than a re-derived one.
    utcIso: resolved.utcIso,
    input: birth,
    timeKnown,
    offsetMinutes: resolved.offsetMinutes,
    timeAmbiguity: resolved.ambiguity,
    ...(resolved.alternativeUtcIso ? { alternativeUtcIso: resolved.alternativeUtcIso } : {}),
  };
}
