/**
 * Pañcāṅga — the five limbs.
 *
 * Four of them (tithi, nakṣatra, yoga, karaṇa) are functions of the Sun's and
 * Moon's longitudes and need no location. The fifth, vāra, changes at
 * **sunrise**, so it needs one — and above the polar circles there may be no
 * sunrise at all, in which case this module says so rather than quietly using
 * midnight.
 *
 * Conventions, including the sunrise definition: docs/VEDIC_CONVENTIONS.md §7.
 */
import {
  norm360,
  julianDayToIsoUtc,
  type Degrees,
  type EphemerisProvider,
} from '@astro/engine';
import { nakshatraOf, type NakshatraPosition } from './nakshatra.js';

export const TITHI_NAMES = [
  'pratipada', 'dvitiya', 'tritiya', 'chaturthi', 'panchami', 'shashthi',
  'saptami', 'ashtami', 'navami', 'dashami', 'ekadashi', 'dvadashi',
  'trayodashi', 'chaturdashi', 'purnima',
] as const;

export const YOGA_NAMES = [
  'vishkambha', 'priti', 'ayushman', 'saubhagya', 'shobhana', 'atiganda',
  'sukarma', 'dhriti', 'shula', 'ganda', 'vriddhi', 'dhruva',
  'vyaghata', 'harshana', 'vajra', 'siddhi', 'vyatipata', 'variyana',
  'parigha', 'shiva', 'siddha', 'sadhya', 'shubha', 'shukla',
  'brahma', 'indra', 'vaidhriti',
] as const;

/** The seven repeating karaṇas. */
const MOVABLE_KARANAS = [
  'bava', 'balava', 'kaulava', 'taitila', 'gara', 'vanija', 'vishti',
] as const;

/** The four fixed karaṇas, which occur once each per lunar month. */
const FIXED_KARANAS = ['shakuni', 'chatushpada', 'naga', 'kimstughna'] as const;

export const WEEKDAYS = [
  'ravivara', 'somavara', 'mangalavara', 'budhavara',
  'guruvara', 'shukravara', 'shanivara',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];
export type Paksha = 'shukla' | 'krishna';

export interface Tithi {
  /** 1-30 across the whole lunar month. */
  readonly number: number;
  /** 1-15 within the pakṣa. */
  readonly inPaksha: number;
  readonly paksha: Paksha;
  readonly nameKey: string;
  /** Fraction of this tithi already elapsed, 0-1. */
  readonly elapsed: number;
}

export interface Karana {
  readonly index: number;
  readonly nameKey: string;
  readonly fixed: boolean;
}

export interface Yoga {
  /** 1-27. */
  readonly number: number;
  readonly nameKey: string;
  readonly elapsed: number;
}

export interface Panchang {
  /** The instant these were computed for. */
  readonly jdUT: number;
  readonly utcIso: string;
  readonly tithi: Tithi;
  readonly nakshatra: NakshatraPosition;
  readonly yoga: Yoga;
  readonly karana: Karana;
  /**
   * Undefined when the Sun does not rise on this date at this latitude. The
   * other four limbs are still valid — they do not depend on sunrise.
   */
  readonly vara?: Weekday;
  readonly sunriseJd?: number;
  readonly sunriseIso?: string;
  /** Set when sunrise could not be found, so the UI can explain the gap. */
  readonly varaUnavailableReason?: 'noSunriseAtThisLatitude';
  /**
   * The tithi in force at sunrise — what "today's tithi" conventionally means.
   * Undefined when there is no sunrise.
   */
  readonly tithiAtSunrise?: Tithi;
}

/** Tithi from the Sun-Moon elongation. */
export function tithiFrom(sunLongitude: Degrees, moonLongitude: Degrees): Tithi {
  const elongation = norm360(moonLongitude - sunLongitude);
  const exact = elongation / 12;
  // 1-30: a tithi is the 12° step the elongation is currently inside.
  const number = Math.min(30, Math.floor(exact) + 1);
  const paksha: Paksha = number <= 15 ? 'shukla' : 'krishna';
  const inPaksha = number <= 15 ? number : number - 15;

  return {
    number,
    inPaksha,
    paksha,
    // Tithi 15 is Pūrṇimā and tithi 30 is Amāvāsyā; both are the 15th of their
    // pakṣa, so the name table ends at the 15th entry and amāvāsyā is named
    // separately.
    nameKey: number === 30 ? 'tithi.amavasya' : `tithi.${TITHI_NAMES[inPaksha - 1]!}`,
    elapsed: exact - Math.floor(exact),
  };
}

/** Yoga from the sum of the longitudes. */
export function yogaFrom(sunLongitude: Degrees, moonLongitude: Degrees): Yoga {
  const sum = norm360(sunLongitude + moonLongitude);
  const exact = sum / (800 / 60); // 13°20' in degrees
  const number = Math.min(27, Math.floor(exact) + 1);
  return {
    number,
    nameKey: `yoga.${YOGA_NAMES[number - 1]!}`,
    elapsed: exact - Math.floor(exact),
  };
}

/**
 * Karaṇa — half a tithi, 60 per lunar month.
 *
 * The sequence is not a simple repeat. Karaṇa 1 is the fixed Kiṁstughna; then
 * the seven movable ones repeat eight times (karaṇas 2-57); then the last
 * three are the fixed Śakuni, Catuṣpada and Nāga. Treating all sixty as
 * `index % 7` is the usual shortcut and gets the end of every month wrong.
 */
export function karanaFrom(sunLongitude: Degrees, moonLongitude: Degrees): Karana {
  const elongation = norm360(moonLongitude - sunLongitude);
  const index = Math.min(59, Math.floor(elongation / 6)); // 0-59

  if (index === 0) {
    return { index, nameKey: 'karana.kimstughna', fixed: true };
  }
  if (index >= 57) {
    // 57, 58, 59 -> Śakuni, Catuṣpada, Nāga
    return { index, nameKey: `karana.${FIXED_KARANAS[index - 57]!}`, fixed: true };
  }
  return {
    index,
    nameKey: `karana.${MOVABLE_KARANAS[(index - 1) % 7]!}`,
    fixed: false,
  };
}

/** Weekday from a Julian Day. JD 0.0 is a Monday noon, so JD+1.5 mod 7 gives Sunday=0. */
export function weekdayFrom(jdUT: number): Weekday {
  return WEEKDAYS[Math.floor(jdUT + 1.5) % 7]!;
}

export interface PanchangPlace {
  readonly latitude: Degrees;
  readonly longitude: Degrees;
  readonly altitudeMetres?: number;
}

/**
 * Sunrise on or after `jdUT` at a place, or undefined where the Sun does not
 * rise.
 *
 * Upper limb with refraction — the ordinary civil definition, and the one
 * pañcāṅga makers use. Disc-centre sunrise differs by 2-4 minutes at mid
 * latitudes, which is enough to change the vāra for a birth in that window.
 */
export function sunrise(
  provider: EphemerisProvider,
  jdUT: number,
  place: PanchangPlace,
): number | undefined {
  return provider.riseTransit(jdUT, 'sun', place, 'rise');
}

export interface PanchangOptions {
  readonly place?: PanchangPlace;
  /** Supplies sunrise. Injected so this module stays free of ephemeris flags. */
  readonly sunriseJd?: number | undefined;
  /** True when sunrise was attempted and genuinely does not occur. */
  readonly noSunrise?: boolean;
}

/**
 * Assemble the pañcāṅga for an instant.
 *
 * Longitudes must be **sidereal** — the nakṣatra is a sidereal division.
 * Tithi, yoga and karaṇa depend only on the Sun-Moon *difference* or *sum*, so
 * the ayanamsha cancels for the first and shifts the second; the module takes
 * sidereal values throughout so one convention governs the whole result.
 */
export function panchang(
  jdUT: number,
  sunSidereal: Degrees,
  moonSidereal: Degrees,
  options: PanchangOptions = {},
): Panchang {
  const base = {
    jdUT,
    utcIso: julianDayToIsoUtc(jdUT),
    tithi: tithiFrom(sunSidereal, moonSidereal),
    nakshatra: nakshatraOf(moonSidereal),
    yoga: yogaFrom(sunSidereal, moonSidereal),
    karana: karanaFrom(sunSidereal, moonSidereal),
  };

  if (options.sunriseJd === undefined) {
    return options.noSunrise
      ? { ...base, varaUnavailableReason: 'noSunriseAtThisLatitude' }
      : base;
  }

  return {
    ...base,
    vara: weekdayFrom(options.sunriseJd),
    sunriseJd: options.sunriseJd,
    sunriseIso: julianDayToIsoUtc(options.sunriseJd),
  };
}
