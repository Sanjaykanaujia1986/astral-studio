/**
 * What can honestly be derived from an instrument's chart record, under the
 * chosen calculation settings.
 *
 * - With a recorded or provisional time: the Moon (longitude, nakṣatra and
 *   pāda) and the ascendant at that instant. Provisional stays provisional.
 * - With a date only: the Moon is reported at local noon AS A CONVENTION, and
 *   its nakṣatra is called certain only if the Moon stays in the same
 *   nakṣatra from the start of the local day to its end; the ascendant is
 *   unavailable, because it turns through every sign in a day.
 *
 * These are derived astronomical facts. A target entered by the user (a
 * name-based nakṣatra, say) is a different thing and is kept apart from them.
 */
import {
  resolveCivilTime, norm360,
  type EphemerisProvider, type NodeType, type ZodiacMode, type HouseSystem,
} from '@astro/engine';
import type { ChartRecord } from './instruments.js';

const SPAN = 40 / 3;

export interface ChartSettings {
  readonly zodiac: ZodiacMode;
  readonly nodeType: NodeType;
  readonly houseSystem: HouseSystem;
}

export type FactStatus = 'recorded' | 'provisional' | 'noon-convention' | 'unavailable';

export interface MoonFact {
  readonly longitude: number;
  /** 0 = Aśvinī … 26 = Revatī. */
  readonly nakshatra: number;
  readonly pada: number;
  readonly status: FactStatus;
  /** For a date-only record: does the Moon keep this nakṣatra all day? */
  readonly certainForDay: boolean;
}

export interface ChartFacts {
  readonly record: ChartRecord;
  readonly settings: ChartSettings;
  /** The instant used, UT Julian Day; null for a date-only record (noon is a convention, see `moon.status`). */
  readonly jd: number | null;
  readonly moon: MoonFact;
  /** Null when unavailable (no time). */
  readonly ascendant: { readonly longitude: number; readonly status: FactStatus } | null;
}

function jdAt(record: ChartRecord, hh: number, mm: number): number {
  const [y, m, d] = record.date.split('-').map(Number);
  return resolveCivilTime({ year: y!, month: m!, day: d! }, { hour: hh, minute: mm, second: 0 }, record.timeZone, { onNonexistent: 'shift-forward' }).jdUT;
}

const nakOf = (lon: number): { nakshatra: number; pada: number } => {
  const l = norm360(lon);
  return { nakshatra: Math.floor(l / SPAN), pada: Math.floor((l % SPAN) / (SPAN / 4)) + 1 };
};

export function deriveChartFacts(provider: EphemerisProvider, record: ChartRecord, settings: ChartSettings): ChartFacts {
  const zodiacOption = { zodiac: settings.zodiac };
  if (record.time !== undefined && record.timeCertainty !== 'date-only') {
    const [hh, mm] = record.time.split(':').map(Number);
    const jd = jdAt(record, hh!, mm!);
    const moonLon = provider.calc(jd, 'moon', zodiacOption).longitude;
    const status: FactStatus = record.timeCertainty === 'recorded' ? 'recorded' : 'provisional';
    const houses = provider.houses(jd, record.place.latitude, record.place.longitude, settings.houseSystem, zodiacOption);
    return {
      record, settings, jd,
      moon: { longitude: moonLon, ...nakOf(moonLon), status, certainForDay: true },
      ascendant: { longitude: houses.ascendant, status },
    };
  }
  const start = jdAt(record, 0, 0);
  const noon = jdAt(record, 12, 0);
  const end = start + 1;
  const moonLon = provider.calc(noon, 'moon', zodiacOption).longitude;
  const first = nakOf(provider.calc(start, 'moon', zodiacOption).longitude).nakshatra;
  const last = nakOf(provider.calc(end - 1e-6, 'moon', zodiacOption).longitude).nakshatra;
  return {
    record, settings, jd: null,
    moon: { longitude: moonLon, ...nakOf(moonLon), status: 'noon-convention', certainForDay: first === last },
    ascendant: null,
  };
}
