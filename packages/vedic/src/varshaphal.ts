/**
 * Varṣaphal (Tājika annual chart), the mudda daśā, and sāyana secondary
 * progressions, matching the reference horoscope software:
 *
 * - The year begins when the sidereal Sun returns to its natal longitude.
 * - Muntha advances one sign a year from the natal lagna.
 * - Mudda daśā is Viṁśottarī from the varṣa Moon. The reports give the first
 *   lord the Moon's balance of the solar year, then whole-day periods
 *   (Ketu 22, Venus 61, Sun 18, Moon 30, Mars 21, Rāhu 55, Jupiter 49,
 *   Saturn 58, Mercury 52) — a 366-day cycle that need not end exactly at the
 *   next return. The 'proportional' convention instead gives every lord
 *   years/120 of the solar year.
 * - Progressions: tropical positions one day after birth for each year of life,
 *   the ascendant cast for the birth place.
 */
import { norm360, type Degrees, type EphemerisProvider, type ZodiacMode } from '@astro/engine';
import { SEVEN, type Graha } from './grahas.js';

const SPAN = 360 / 27;
const LORDS: readonly Graha[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];
const YEARS = [7, 20, 6, 10, 7, 18, 16, 19, 17];
/** Whole-day mudda periods printed by the reference software. */
export const MUDDA_DAYS: Readonly<Record<string, number>> = { ketu: 22, venus: 61, sun: 18, moon: 30, mars: 21, rahu: 55, jupiter: 49, saturn: 58, mercury: 52 };
const SIDEREAL_YEAR = 365.256363;

export interface AnnualOptions {
  readonly birthJd: number;
  readonly latitude: Degrees;
  readonly longitude: Degrees;
  readonly zodiac: ZodiacMode;
  readonly node?: 'meanNode' | 'trueNode';
  /** Minutes east of UTC, for the civil dates the printed mudda convention counts from. */
  readonly utcOffsetMinutes?: number;
}

/** Moment the Sun returns to `natalSun` (in `zodiac`) nearest `guessJd`. */
export function solarReturn(provider: EphemerisProvider, natalSun: Degrees, guessJd: number, zodiac: ZodiacMode): number {
  let jd = guessJd;
  for (let k = 0; k < 10; k += 1) {
    const s = provider.calc(jd, 'sun', { zodiac });
    const d = norm360(s.longitude - natalSun + 180) - 180;
    jd -= d / s.longitudeSpeed;
    if (Math.abs(d) < 1e-9) break;
  }
  return jd;
}

export interface Positions {
  readonly lagna: Degrees;
  readonly lon: Readonly<Record<Graha, Degrees>>;
  readonly retrograde: Readonly<Record<Graha, boolean>>;
}

export function positionsAt(provider: EphemerisProvider, jd: number, o: Pick<AnnualOptions, 'latitude' | 'longitude' | 'zodiac' | 'node'>): Positions {
  const lon = {} as Record<Graha, Degrees>; const retro = {} as Record<Graha, boolean>;
  for (const b of SEVEN) { const p = provider.calc(jd, b, { zodiac: o.zodiac }); lon[b] = norm360(p.longitude); retro[b] = p.longitudeSpeed < 0; }
  const n = provider.calc(jd, o.node ?? 'meanNode', { zodiac: o.zodiac });
  lon.rahu = norm360(n.longitude); lon.ketu = norm360(n.longitude + 180); retro.rahu = true; retro.ketu = true;
  return { lagna: norm360(provider.houses(jd, o.latitude, o.longitude, 'placidus', { zodiac: o.zodiac }).ascendant), lon, retrograde: retro };
}

export interface MuddaPeriod { readonly lord: Graha; readonly startJd: number; readonly endJd: number }

/**
 * Mudda daśā for a varṣa running from `startJd` to `endJd`.
 *
 * 'printed' follows the reference software: from local midnight of the return
 * date, the first lord gets its balance of a 365.25-day share rounded to whole
 * days, the next eight lords their whole-day periods, and the first lord
 * returns for the rest of its whole-day period. 'proportional' gives every
 * lord years/120 of the actual solar year and ends at the next return.
 */
export function muddaDasha(
  moon: Degrees, startJd: number, endJd: number,
  convention: 'printed' | 'proportional' = 'printed', utcOffsetMinutes = 0,
): MuddaPeriod[] {
  const len = endJd - startJd;
  const l = norm360(moon);
  let k = Math.floor(l / SPAN) % 9;
  const first = k;
  const rem = 1 - (l % SPAN) / SPAN;
  const out: MuddaPeriod[] = [];
  let t: number; let tail: number;
  if (convention === 'printed') {
    const off = utcOffsetMinutes / 1440;
    const day0 = Math.floor(startJd + off + 0.5) - 0.5 - off;
    const a = Math.round(rem * (YEARS[k]! * 365.25) / 120);
    t = day0 + a; tail = MUDDA_DAYS[LORDS[k]!]! - a;
  } else {
    t = startJd + rem * (YEARS[k]! / 120) * len; tail = 0;
  }
  out.push({ lord: LORDS[k]!, startJd, endJd: t });
  for (let q = 1; q < 9; q += 1) {
    k = (k + 1) % 9;
    const d = convention === 'printed' ? MUDDA_DAYS[LORDS[k]!]! : (YEARS[k]! / 120) * len;
    out.push({ lord: LORDS[k]!, startJd: t, endJd: t + d }); t += d;
  }
  out.push({ lord: LORDS[first]!, startJd: t, endJd: convention === 'printed' ? t + tail : endJd });
  return out;
}

export interface Varsha {
  /** Completed years at the start of this varṣa. */
  readonly age: number;
  readonly startJd: number;
  readonly endJd: number;
  readonly positions: Positions;
  /** Muntha sign index (0 = Meṣa) and its house from the varṣa lagna. */
  readonly muntha: number;
  readonly munthaHouse: number;
  readonly mudda: readonly MuddaPeriod[];
}

/** Varṣaphal for the year of life beginning at `age` completed years. */
export function varshaphal(
  provider: EphemerisProvider, o: AnnualOptions, age: number, convention: 'printed' | 'proportional' = 'printed',
): Varsha {
  const natalSun = provider.calc(o.birthJd, 'sun', { zodiac: o.zodiac }).longitude;
  const natalLagna = provider.houses(o.birthJd, o.latitude, o.longitude, 'placidus', { zodiac: o.zodiac }).ascendant;
  const startJd = age === 0 ? o.birthJd : solarReturn(provider, natalSun, o.birthJd + age * SIDEREAL_YEAR, o.zodiac);
  const endJd = solarReturn(provider, natalSun, o.birthJd + (age + 1) * SIDEREAL_YEAR, o.zodiac);
  const positions = positionsAt(provider, startJd, o);
  const muntha = (Math.floor(norm360(natalLagna) / 30) + age) % 12;
  return {
    age, startJd, endJd, positions, muntha,
    munthaHouse: ((muntha - Math.floor(positions.lagna / 30) + 12) % 12) + 1,
    mudda: muddaDasha(positions.lon.moon, startJd, endJd, convention, o.utcOffsetMinutes ?? 0),
  };
}

/** Sāyana secondary progression for the year of life `age`: positions one day per year after birth. */
export function progression(provider: EphemerisProvider, o: Omit<AnnualOptions, 'zodiac'>, age: number): Positions & { readonly jd: number } {
  const jd = o.birthJd + age;
  return { jd, ...positionsAt(provider, jd, { ...o, zodiac: { kind: 'tropical' } }) };
}
