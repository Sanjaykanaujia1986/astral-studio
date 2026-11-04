/**
 * @astro/vedic — Jyotiṣa on top of the verified sidereal engine.
 *
 * A sidereal Western chart is not a Vedic chart. This package adds what makes
 * it one: whole-sign houses, nakṣatras and pādas, vargas with their individual
 * mapping rules, Viṁśottarī daśā, and the pañcāṅga reckoned from real sunrise.
 *
 * Every convention it applies — ayanamsha, node variety, varga rules, daśā year
 * length, sunrise definition — is documented in `docs/VEDIC_CONVENTIONS.md`,
 * written before the code, because Jyotiṣa is several systems and software that
 * hides which one it chose cannot be checked.
 *
 * It computes no astronomy of its own: longitudes come from `@astro/engine`.
 */
export {
  NAKSHATRAS, VIMSHOTTARI_LORDS, NAKSHATRA_ARCMINUTES, PADA_ARCMINUTES,
  nakshatraOf, absolutePada,
  type Nakshatra, type NakshatraPosition, type VimshottariLord,
} from './nakshatra.js';

export {
  VARGAS, VARGA_DEFINITIONS, vargaSign, vargaSignIndex, buildVargaChart,
  type Varga, type VargaChart, type VargaDefinition, type VargaPlacement,
} from './varga.js';

export {
  LORD_YEARS, TOTAL_YEARS, YEAR_LENGTHS, vimshottari, dashaAt, lordSequence,
  type DashaPeriod, type VimshottariOptions, type VimshottariResult, type YearLengthName,
} from './vimshottari.js';

export {
  TITHI_NAMES, YOGA_NAMES, WEEKDAYS,
  panchang, tithiFrom, yogaFrom, karanaFrom, weekdayFrom,
  type Karana, type Panchang, type PanchangPlace, type Paksha,
  type Tithi, type Weekday, type Yoga,
} from './panchang.js';

export {
  vedicChart, wholeSignHouse, NotSiderealError,
  type VedicChart, type VedicChartOptions, type VedicPlacement,
} from './chart.js';
