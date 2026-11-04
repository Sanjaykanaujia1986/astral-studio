/**
 * Nakṣatras and pādas.
 *
 * 27 nakṣatras of 13°20' (800'), each of 4 pādas of 3°20' (200').
 *
 * The arithmetic is done in **minutes of arc as integers** wherever a boundary
 * decides something. 13°20' is 13.333… in degrees and never exact in binary, so
 * a planet sitting precisely on a boundary — which happens constantly in
 * synthetic data and occasionally in real charts — lands on whichever side the
 * floating-point error falls. 800 and 200 are exact.
 *
 * Conventions in docs/VEDIC_CONVENTIONS.md §4. Abhijit is deliberately absent.
 */
import { norm360, type Degrees } from '@astro/engine';

/** The 27 nakṣatras in zodiacal order from sidereal 0° Aries. */
export const NAKSHATRAS = [
  'ashwini', 'bharani', 'krittika', 'rohini', 'mrigashira', 'ardra',
  'punarvasu', 'pushya', 'ashlesha', 'magha', 'purvaPhalguni', 'uttaraPhalguni',
  'hasta', 'chitra', 'swati', 'vishakha', 'anuradha', 'jyeshtha',
  'mula', 'purvaAshadha', 'uttaraAshadha', 'shravana', 'dhanishta', 'shatabhisha',
  'purvaBhadrapada', 'uttaraBhadrapada', 'revati',
] as const;

export type Nakshatra = (typeof NAKSHATRAS)[number];

/** Minutes of arc spanned by one nakṣatra: 13°20'. Exact as an integer. */
export const NAKSHATRA_ARCMINUTES = 800;
/** Minutes of arc spanned by one pāda: 3°20'. */
export const PADA_ARCMINUTES = 200;

export interface NakshatraPosition {
  readonly nakshatra: Nakshatra;
  /** 0-26, Aśvinī = 0. */
  readonly index: number;
  /** 1-4. */
  readonly pada: number;
  /** How far into the nakṣatra, in degrees. */
  readonly degreesInNakshatra: Degrees;
  /**
   * Fraction of the nakṣatra already elapsed, 0 at its start and approaching 1
   * at its end. This is what the Viṁśottarī balance is computed from, so it is
   * returned rather than recomputed there from the same longitude twice.
   */
  readonly elapsed: number;
  /** Lord of the nakṣatra, which starts the Viṁśottarī sequence. */
  readonly lord: VimshottariLord;
}

/**
 * The nine Viṁśottarī lords, in the order the nakṣatras cycle through them.
 *
 * Defined here rather than in the daśā module because the nakṣatra owns the
 * mapping — the daśā merely starts from whichever lord the Moon's nakṣatra
 * gives it.
 */
export const VIMSHOTTARI_LORDS = [
  'ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury',
] as const;

export type VimshottariLord = (typeof VIMSHOTTARI_LORDS)[number];

/** Nakṣatra of a sidereal longitude, with its pāda and lord. */
export function nakshatraOf(siderealLongitude: Degrees): NakshatraPosition {
  const longitude = norm360(siderealLongitude);

  /*
   * Work in arcminutes. The index must come from integer division of an exact
   * span, not from `longitude / 13.3333`, or a planet exactly on a boundary
   * lands on the wrong side of it.
   */
  const totalMinutes = longitude * 60;
  const index = Math.min(26, Math.floor(totalMinutes / NAKSHATRA_ARCMINUTES));
  const minutesIn = totalMinutes - index * NAKSHATRA_ARCMINUTES;

  return {
    nakshatra: NAKSHATRAS[index]!,
    index,
    pada: Math.min(4, Math.floor(minutesIn / PADA_ARCMINUTES) + 1),
    degreesInNakshatra: minutesIn / 60,
    elapsed: minutesIn / NAKSHATRA_ARCMINUTES,
    lord: VIMSHOTTARI_LORDS[index % 9]!,
  };
}

/**
 * Absolute pāda number from sidereal 0° Aries, 0-107.
 *
 * There are 108 pādas in the zodiac and 108 navāṁśas, and they are the same
 * division — so `absolutePada(x) % 12` IS the navāṁśa sign. The varga module
 * uses this rather than a second formula, because two formulae for one
 * quantity eventually disagree.
 */
export function absolutePada(siderealLongitude: Degrees): number {
  return Math.min(107, Math.floor((norm360(siderealLongitude) * 60) / PADA_ARCMINUTES));
}
