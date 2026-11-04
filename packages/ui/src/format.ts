/**
 * Display formatting.
 *
 * Formatting is strictly one-way: values are formatted for the screen and never
 * fed back into calculation. The engine keeps full double precision; only these
 * functions round.
 *
 * ## Why degrees are TRUNCATED, not rounded
 *
 * A sign spans [0, 30). Rounding 29.9992 degrees to the nearest arcminute gives
 * 30 degrees 00 minutes — a position that cannot exist, and which reads as the
 * NEXT sign. A planet at 29 degrees 59.5 minutes of Aries would be displayed as
 * "0 Taurus", changing its sign, its element, its ruler and its house on the
 * page while the underlying number never moved.
 *
 * Truncating cannot produce that error: 29.9992 shows as 29 degrees 59 minutes
 * of Aries, which is where the body actually is. This matches professional
 * practice, and the discarded fraction is always under one display unit.
 */
import { splitSign, toDms, type Degrees } from '@astro/engine';
import { SIGN_GLYPHS } from './chart-wheel/glyphs.js';
import type { SignName } from '@astro/engine';

export type DegreePrecision = 'degree' | 'minute' | 'second';

export interface FormattedPosition {
  readonly degrees: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly sign: SignName;
  readonly signGlyph: string;
  readonly signAbbreviation: string;
}

/**
 * Absorbs double-precision representation noise before truncating.
 *
 * 24.9525 degrees is stored as 24.952499999..., so a bare floor at arcsecond
 * resolution yields 08" where the true value is 09". One microarcsecond of
 * slack removes that artefact and is far too small to cross a real boundary.
 */
const TRUNCATION_EPSILON = 1e-9;

/**
 * Split a longitude for display, truncating at `precision`.
 *
 * The sign always comes from the true longitude, so it can never be shifted by
 * a display rounding decision.
 */
export function splitForDisplay(
  longitude: Degrees,
  precision: DegreePrecision = 'minute',
): FormattedPosition {
  const { sign: signIndex, degreesInSign } = splitSign(longitude);

  const unitsPerDegree = precision === 'degree' ? 1 : precision === 'minute' ? 60 : 3600;

  // Work in whole display units, then decompose. Clamping the total below
  // 30 degrees makes an out-of-range reading (30 degrees, 60 minutes) structurally
  // impossible rather than merely unlikely.
  const maxUnits = 30 * unitsPerDegree - 1;
  const units = Math.min(
    Math.floor((degreesInSign + TRUNCATION_EPSILON) * unitsPerDegree),
    maxUnits,
  );

  let degrees: number;
  let minutes = 0;
  let seconds = 0;

  if (precision === 'degree') {
    degrees = units;
  } else if (precision === 'minute') {
    degrees = Math.floor(units / 60);
    minutes = units % 60;
  } else {
    degrees = Math.floor(units / 3600);
    const remainder = units % 3600;
    minutes = Math.floor(remainder / 60);
    seconds = remainder % 60;
  }

  const signName = SIGN_NAMES[signIndex]!;
  const glyph = SIGN_GLYPHS[signName];

  return {
    degrees,
    minutes,
    seconds,
    sign: signName,
    signGlyph: glyph.symbol,
    signAbbreviation: glyph.abbreviation,
  };
}

const SIGN_NAMES: readonly SignName[] = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

const pad2 = (n: number) => String(Math.trunc(n)).padStart(2, '0');

/**
 * Zodiacal position, e.g. `24°57' Cap` or `24°57'12" ♑`.
 */
export function formatLongitude(
  longitude: Degrees,
  options: {
    readonly precision?: DegreePrecision;
    readonly style?: 'glyph' | 'abbreviation';
    /**
     * Translated sign name. Supplied by the caller because this module has no
     * access to the message catalogue, and hard-coding "Cap" here would make
     * every position string in the product English regardless of locale.
     */
    readonly signLabel?: string;
  } = {},
): string {
  const precision = options.precision ?? 'minute';
  const p = splitForDisplay(longitude, precision);
  const label =
    options.signLabel ?? (options.style === 'glyph' ? p.signGlyph : p.signAbbreviation);

  if (precision === 'degree') return `${pad2(p.degrees)}° ${label}`;
  if (precision === 'minute') return `${pad2(p.degrees)}°${pad2(p.minutes)}' ${label}`;
  return `${pad2(p.degrees)}°${pad2(p.minutes)}'${pad2(p.seconds)}" ${label}`;
}

/** A bare angle with no sign, e.g. an orb: `2°14'`. */
export function formatAngle(
  angle: Degrees,
  precision: DegreePrecision = 'minute',
): string {
  const { d, m, s, negative } = toDms(angle);
  const sign = negative ? '-' : '';
  if (precision === 'degree') return `${sign}${d}°`;
  if (precision === 'minute') return `${sign}${d}°${pad2(m)}'`;
  return `${sign}${d}°${pad2(m)}'${pad2(Math.floor(s))}"`;
}

/**
 * Signed value with an explicit sign, for latitude and declination, where the
 * hemisphere is the point and a missing `+` is ambiguous.
 */
export function formatSignedDegrees(value: number, decimals = 2): string {
  const magnitude = Math.abs(value).toFixed(decimals);
  // A value too small to show at this precision has no meaningful direction.
  // Printing "-0.00" for the Sun's ecliptic latitude (about -1e-4 degrees) reads
  // as a defect rather than as the near-zero it is.
  if (Number(magnitude) === 0) return `${magnitude}°`;
  return `${value < 0 ? '-' : '+'}${magnitude}°`;
}

/**
 * Daily motion, e.g. `+1.0182°/day`.
 *
 * Always numeric. An earlier version returned the word "stationary", which
 * baked an English string into a formatting utility with no access to the
 * catalogue; deciding whether a body counts as stationary is the caller's job,
 * and `BodyPosition.stationary` already carries that flag.
 */
export function formatSpeed(speed: number): string {
  return `${speed >= 0 ? '+' : '-'}${Math.abs(speed).toFixed(4)}°/day`;
}

/** UTC offset in minutes as `+05:30`. */
export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = Math.round(abs - hours * 60);
  return `${sign}${pad2(hours)}:${pad2(minutes)}`;
}

/** Ordinal house label, e.g. `1st`, `2nd`, `11th`. */
export function formatHouse(house: number): string {
  const suffix =
    house % 100 >= 11 && house % 100 <= 13
      ? 'th'
      : house % 10 === 1
        ? 'st'
        : house % 10 === 2
          ? 'nd'
          : house % 10 === 3
            ? 'rd'
            : 'th';
  return `${house}${suffix}`;
}
