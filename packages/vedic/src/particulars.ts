/**
 * The particulars a printed kuṇḍalī opens with, beyond the chart itself:
 *
 * - The day: sunrise and sunset, the day's length, the birth time in ghaṭīs
 *   from sunrise, local mean time and its correction, local sidereal time.
 * - The calendar: ayana and gola from the tropical Sun, the amānta and
 *   pūrṇimānta lunar month (adhika when no saṅkrānti falls in it), ṛtu, Śaka
 *   and Vikrama saṁvat (Caitrādi and Kārttikādi), and the saṁvatsara.
 * - The pañcāṅga's spans: when the Moon's rāśi, the tithi, nakṣatra, yoga and
 *   karaṇa in force at birth began and ended, with the one before and after.
 * - Per graha: bālādi avasthā; the seven chara kārakas.
 * - Three points: Fortuna (lagna + Moon − Sun), Gulika (the lagna rising when
 *   Saturn's eighth of the day or night begins) and Māndi (the lagna rising a
 *   set number of ghaṭīs into it).
 *
 * Conventions: docs/VEDIC_CONVENTIONS.md §13.
 */
import { norm360, type Degrees, type EphemerisProvider, type ZodiacMode } from '@astro/engine';
import { SEVEN, signOf, type GrahaLongitudes, type Planet } from './grahas.js';

const NAK = 360 / 27;

// ------------------------------------------------------------------ the day

export interface Place {
  readonly latitude: Degrees;
  readonly longitude: Degrees;
}

export interface BirthDay {
  /** Sunrise and sunset of the civil birth date (undefined where the Sun does not rise or set). */
  readonly sunriseJd?: number;
  readonly sunsetJd?: number;
  /** Sunset − sunrise, hours. */
  readonly dayHours?: number;
  /** Sunrise that began the Hindu day the birth falls in (the previous one for a birth before dawn). */
  readonly daySunriseJd?: number;
  /** Ghaṭīs (24 minutes) from that sunrise to the birth. */
  readonly ghatis?: number;
  /** Weekday of the Hindu day, Sunday = 0. */
  readonly weekday: number;
  /** Local mean time of the birth, hours 0-24. */
  readonly localMeanTime: number;
  /** Local mean time − zone time, minutes (negative west of the zone meridian). */
  readonly localCorrectionMinutes: number;
  /** Local sidereal time, hours 0-24. */
  readonly siderealTime: number;
}

/** UT JD of local midnight starting the civil date that contains `jdUT`. */
function civilMidnight(jdUT: number, offsetMinutes: number): number {
  const local = jdUT + offsetMinutes / 1440;
  return Math.floor(local - 0.5) + 0.5 - offsetMinutes / 1440;
}

export function birthDay(provider: EphemerisProvider, jdUT: number, place: Place, offsetMinutes: number): BirthDay {
  const midnight = civilMidnight(jdUT, offsetMinutes);
  const sunriseJd = provider.riseTransit(midnight, 'sun', place, 'rise');
  const sunsetJd = sunriseJd === undefined ? undefined : provider.riseTransit(sunriseJd, 'sun', place, 'set');
  const before = sunriseJd !== undefined && jdUT < sunriseJd;
  const daySunriseJd = before ? provider.riseTransit(midnight - 1, 'sun', place, 'rise') : sunriseJd;
  const civilWeekday = Math.floor(midnight + offsetMinutes / 1440 + 2) % 7;
  const weekday = before ? (civilWeekday + 6) % 7 : civilWeekday;
  const ut = (jdUT - 0.5 - Math.floor(jdUT - 0.5)) * 24;
  const lmt = ((ut + place.longitude / 15) % 24 + 24) % 24;
  const armc = provider.houses(jdUT, place.latitude, place.longitude, 'placidus').armc;
  return {
    ...(sunriseJd === undefined ? {} : { sunriseJd }),
    ...(sunsetJd === undefined ? {} : { sunsetJd, dayHours: (sunsetJd - sunriseJd!) * 24 }),
    ...(daySunriseJd === undefined ? {} : { daySunriseJd, ghatis: (jdUT - daySunriseJd) * 60 }),
    weekday,
    localMeanTime: lmt,
    localCorrectionMinutes: place.longitude * 4 - offsetMinutes,
    siderealTime: norm360(armc) / 15,
  };
}

// ------------------------------------------------------------------ the pañcāṅga's spans

export type Limb = 'rasi' | 'tithi' | 'nakshatra' | 'yoga' | 'karana';
export const LIMBS: readonly Limb[] = ['rasi', 'tithi', 'nakshatra', 'yoga', 'karana'];

export interface LimbSpan {
  /** 0-based index: sign 0-11, tithi 0-29, nakṣatra 0-26, yoga 0-26, karaṇa 0-59. */
  readonly index: number;
  readonly startJd: number;
  readonly endJd: number;
}

type SunMoon = (jd: number) => { sun: Degrees; moon: Degrees };

const LIMB_INDEX: Readonly<Record<Limb, (s: Degrees, m: Degrees) => number>> = {
  rasi: (_s, m) => Math.floor(norm360(m) / 30),
  tithi: (s, m) => Math.floor(norm360(m - s) / 12),
  nakshatra: (_s, m) => Math.floor(norm360(m) / NAK),
  yoga: (s, m) => Math.floor(norm360(s + m) / NAK),
  karana: (s, m) => Math.floor(norm360(m - s) / 6),
};

/** The instant (to about a second) inside (a, b] where `idx` changes from its value at `a`. */
function edge(idx: (jd: number) => number, a: number, b: number): number {
  const at = idx(a);
  let lo = a; let hi = b;
  while (hi - lo > 1 / 86_400) {
    const mid = (lo + hi) / 2;
    if (idx(mid) === at) lo = mid; else hi = mid;
  }
  return hi;
}

/** Start and end of the span in force at `jd`, scanning in hour steps (no limb is shorter than ~8 h). */
function spanAt(idx: (jd: number) => number, jd: number): LimbSpan {
  const here = idx(jd); const step = 1 / 24;
  let a = jd; while (idx(a - step) === here) a -= step;
  let b = jd; while (idx(b + step) === here) b += step;
  return { index: here, startJd: edge(idx, a - step, a), endJd: edge(idx, b, b + step) };
}

/** Each limb at `jdUT` with the span before and after it. Sidereal longitudes, as the pañcāṅga's. */
export function limbSpans(provider: EphemerisProvider, jdUT: number, zodiac: ZodiacMode): Record<Limb, readonly [LimbSpan, LimbSpan, LimbSpan]> {
  const cache = new Map<number, { sun: Degrees; moon: Degrees }>();
  const sm: SunMoon = (jd) => {
    let v = cache.get(jd);
    if (!v) {
      v = { sun: provider.calc(jd, 'sun', { zodiac }).longitude, moon: provider.calc(jd, 'moon', { zodiac }).longitude };
      cache.set(jd, v);
    }
    return v;
  };
  const out = {} as Record<Limb, readonly [LimbSpan, LimbSpan, LimbSpan]>;
  for (const limb of LIMBS) {
    const idx = (jd: number): number => { const p = sm(jd); return LIMB_INDEX[limb](p.sun, p.moon); };
    const cur = spanAt(idx, jdUT);
    out[limb] = [spanAt(idx, cur.startJd - 1 / 1440), cur, spanAt(idx, cur.endJd + 1 / 1440)];
  }
  return out;
}

// ------------------------------------------------------------------ the calendar

export const MASA = [
  'Caitra', 'Vaiśākha', 'Jyeṣṭha', 'Āṣāḍha', 'Śrāvaṇa', 'Bhādrapada',
  'Āśvina', 'Kārttika', 'Mārgaśīrṣa', 'Pauṣa', 'Māgha', 'Phālguna',
] as const;
export const RITU = ['Vasanta', 'Grīṣma', 'Varṣā', 'Śarad', 'Hemanta', 'Śiśira'] as const;
/** The sixty-year cycle, counted from Śaka year 1915 = Śrīmukha (index 6). */
export const SAMVATSARA = [
  'Prabhava', 'Vibhava', 'Śukla', 'Pramoda', 'Prajāpati', 'Āṅgirasa', 'Śrīmukha', 'Bhāva', 'Yuvan', 'Dhātṛ',
  'Īśvara', 'Bahudhānya', 'Pramāthin', 'Vikrama', 'Vṛṣa', 'Citrabhānu', 'Svabhānu', 'Tāraṇa', 'Pārthiva', 'Vyaya',
  'Sarvajit', 'Sarvadhārin', 'Virodhin', 'Vikṛti', 'Khara', 'Nandana', 'Vijaya', 'Jaya', 'Manmatha', 'Durmukha',
  'Hemalamba', 'Vilamba', 'Vikārin', 'Śārvarī', 'Plava', 'Śubhakṛt', 'Śobhakṛt', 'Krodhin', 'Viśvāvasu', 'Parābhava',
  'Plavaṅga', 'Kīlaka', 'Saumya', 'Sādhāraṇa', 'Virodhakṛt', 'Paridhāvin', 'Pramādin', 'Ānanda', 'Rākṣasa', 'Nala',
  'Piṅgala', 'Kālayukta', 'Siddhārthin', 'Raudra', 'Durmati', 'Dundubhi', 'Rudhirodgārin', 'Raktākṣa', 'Krodhana', 'Akṣaya',
] as const;

export interface HinduCalendar {
  /** Uttarāyaṇa while the tropical Sun runs from Capricorn to Cancer. */
  readonly ayana: 'north' | 'south';
  /** Uttara gola while the Sun is north of the equator (tropical Aries to Virgo). */
  readonly gola: 'north' | 'south';
  /** Amānta month, 0 = Caitra; adhika when no saṅkrānti falls between its new moons. */
  readonly amanta: number;
  readonly adhika: boolean;
  /** Pūrṇimānta month: the next one during the dark half. */
  readonly purnimanta: number;
  readonly ritu: number;
  readonly shaka: number;
  readonly vikramaChaitradi: number;
  readonly vikramaKarttikadi: number;
  readonly samvatsara: number;
  readonly newMoonJd: number;
}

/** The new moon (elongation 0) before `jd`, or after it with `forward`. */
function newMoon(provider: EphemerisProvider, jd: number, forward: boolean): number {
  const elong = (x: number): number => norm360(provider.calc(x, 'moon').longitude - provider.calc(x, 'sun').longitude);
  const lunation = (x: number): number => (elong(x) < 180 ? 0 : 1);
  // Step a quarter-day at a time to the jump from ~360° back to ~0°.
  const step = 0.25 * (forward ? 1 : -1);
  let a = jd; let prev = elong(a);
  for (let k = 0; k < 130; k += 1) {
    const b = a + step; const e = elong(b);
    const crossed = forward ? e < prev && prev - e > 180 : e > prev && e - prev > 180;
    if (crossed) {
      const [lo, hi] = forward ? [a, b] : [b, a];
      // lunation() is 1 before the new moon (elongation near 360°) and 0 after.
      return edge(lunation, lo, hi);
    }
    a = b; prev = e;
  }
  throw new Error('no new moon within 32 days');
}

export function hinduCalendar(
  provider: EphemerisProvider, jdUT: number, zodiac: ZodiacMode, civil: { readonly year: number; readonly month: number },
): HinduCalendar {
  const tropicalSun = provider.calc(jdUT, 'sun').longitude;
  const before = newMoon(provider, jdUT, false);
  const after = newMoon(provider, jdUT, true);
  const sunSign = (jd: number): number => Math.floor(norm360(provider.calc(jd, 'sun', { zodiac }).longitude) / 30);
  const s1 = sunSign(before); const s2 = sunSign(after);
  const adhika = s1 === s2;
  // The month is named for the saṅkrānti inside it; an adhika month takes the name of the one that follows.
  const amanta = (s1 + 1) % 12;
  const elong = norm360(provider.calc(jdUT, 'moon').longitude - tropicalSun);
  const krishna = elong >= 180;
  const purnimanta = krishna ? (amanta + 1) % 12 : amanta;
  // The Śaka year turns at Caitra: a January-April date still in Pauṣa-Phālguna belongs to the year before.
  const shaka = civil.month <= 4 && amanta >= 9 ? civil.year - 79 : civil.year - 78;
  const vikramaChaitradi = shaka + 135;
  return {
    ayana: tropicalSun >= 270 || tropicalSun < 90 ? 'north' : 'south',
    gola: tropicalSun < 180 ? 'north' : 'south',
    amanta, adhika, purnimanta,
    ritu: Math.floor(amanta / 2),
    shaka,
    vikramaChaitradi,
    vikramaKarttikadi: amanta <= 6 ? vikramaChaitradi - 1 : vikramaChaitradi,
    samvatsara: (shaka + 11) % 60,
    newMoonJd: before,
  };
}

// ------------------------------------------------------------------ avasthā and kārakas

export const AVASTHA = ['bala', 'kumara', 'yuva', 'vriddha', 'mrita'] as const;
export type Avastha = (typeof AVASTHA)[number];

/** Bālādi avasthā: six-degree fifths of the sign, bāla first in odd signs and mṛta first in even ones. */
export function baladi(lon: Degrees): Avastha {
  const s = signOf(lon); const k = Math.min(4, Math.floor((norm360(lon) % 30) / 6));
  return AVASTHA[s % 2 === 0 ? k : 4 - k]!;
}

export const CHARA_KARAKAS = ['atma', 'amatya', 'bhratri', 'matri', 'putra', 'jnati', 'dara'] as const;
export type CharaKaraka = (typeof CHARA_KARAKAS)[number];

/** The seven chara kārakas: the seven grahas by degrees travelled in their signs, highest first. */
export function charaKarakas(g: GrahaLongitudes): { karaka: CharaKaraka; body: Planet; degrees: Degrees }[] {
  return [...SEVEN]
    .map((body) => ({ body, degrees: norm360(g.lon[body]) % 30 }))
    .sort((a, b) => b.degrees - a.degrees)
    .map((x, k) => ({ karaka: CHARA_KARAKAS[k]!, ...x }));
}

// ------------------------------------------------------------------ Fortuna and Gulika

/** Pars Fortunae as the Indian prints give it: lagna + Moon − Sun, by day and by night alike. */
export function fortuna(g: GrahaLongitudes): Degrees | undefined {
  return g.lagna === undefined ? undefined : norm360(g.lagna + g.lon.moon - g.lon.sun);
}

/** Ghaṭīs (of thirty to the day or night) after which Māndi rises, Sunday first: Praśna Mārga. */
const MANDI_DAY = [26, 22, 18, 14, 10, 6, 2] as const;
const MANDI_NIGHT = [10, 6, 2, 26, 22, 18, 14] as const;

export interface Upagraha { readonly longitude: Degrees; readonly risesJd: number }

/**
 * Gulika and Māndi, the two readings of Saturn's son, as sidereal lagnas.
 *
 * - Gulika: the lagna rising when Saturn's eighth of the birth's day or night
 *   begins. A day's eighths are ruled from the weekday's lord in weekday
 *   order; a night's from the lord of the fifth weekday on.
 * - Māndi: the lagna rising a fixed number of ghaṭīs into the day or night
 *   (26 on a Sunday by day, 10 by night, …), the ghaṭīs scaled to the actual
 *   length of that day or night.
 *
 * Undefined where the Sun does not rise or set.
 */
export function gulikaMandi(
  provider: EphemerisProvider, jdUT: number, place: Place, zodiac: ZodiacMode, offsetMinutes: number,
): { gulika: Upagraha; mandi: Upagraha } | undefined {
  const midnight = civilMidnight(jdUT, offsetMinutes);
  const civilWeekday = Math.floor(midnight + offsetMinutes / 1440 + 2) % 7;
  const riseOn = (m: number): number | undefined => provider.riseTransit(m, 'sun', place, 'rise');
  const setAfter = (jd: number): number | undefined => provider.riseTransit(jd, 'sun', place, 'set');
  const today = riseOn(midnight);
  if (today === undefined) return undefined;
  let start: number; let end: number; let weekday: number; let night: boolean;
  if (jdUT < today) {
    // Before dawn: the night of the previous weekday.
    const yRise = riseOn(midnight - 1); const ySet = yRise === undefined ? undefined : setAfter(yRise);
    if (ySet === undefined) return undefined;
    start = ySet; end = today; weekday = (civilWeekday + 6) % 7; night = true;
  } else {
    const set = setAfter(today);
    if (set === undefined) return undefined;
    if (jdUT < set) { start = today; end = set; weekday = civilWeekday; night = false; } else {
      const next = riseOn(midnight + 1);
      if (next === undefined) return undefined;
      start = set; end = next; weekday = civilWeekday; night = true;
    }
  }
  const at = (jd: number): Upagraha => ({
    longitude: norm360(provider.houses(jd, place.latitude, place.longitude, 'placidus', { zodiac }).ascendant),
    risesJd: jd,
  });
  const first = night ? (weekday + 4) % 7 : weekday;
  const part = (6 - first + 7) % 7;
  const ghatis = (night ? MANDI_NIGHT : MANDI_DAY)[weekday]!;
  return {
    gulika: at(start + ((end - start) * part) / 8),
    mandi: at(start + ((end - start) * ghatis) / 30),
  };
}
