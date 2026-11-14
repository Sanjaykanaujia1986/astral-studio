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
  panchang, tithiFrom, yogaFrom, karanaFrom, weekdayFrom, sunrise,
  type Karana, type Panchang, type PanchangPlace, type Paksha,
  type Tithi, type Weekday, type Yoga,
} from './panchang.js';

export {
  vedicChart, wholeSignHouse, NotSiderealError,
  type VedicChart, type VedicChartOptions, type VedicPlacement,
} from './chart.js';

export {
  DASHA_SYSTEMS, VIMSHOTTARI_SYSTEM, ASHTOTTARI_SYSTEM, YOGINI_SYSTEM, DASHA_LEVEL_NAMES,
  dashas, subPeriods, runningPath, yearsToYmd, localMidnightJd,
  type DashaSystem, type DashaSystemId, type DashaNode, type DashaOptions, type DashaResult, type DashaPlanet,
} from './dasha.js';

export {
  GRAHAS, SEVEN, SIGN_LORDS, EXALTATION, OWN_SIGNS, MOOLATRIKONA, NATURAL_RELATION,
  signOf, houseFrom, grahaLongitudes,
  type Graha, type Planet, type GrahaLongitudes,
} from './grahas.js';

export {
  sadeSati, signStays, saturnOverMoon, payaOf,
  type SaturnPhase, type Paya, type SignStay, type SaturnStay, type SadeSatiSpell,
} from './transits.js';

export {
  ashtakoota, compatibilityTable, mangalaDosha, vashyaGroup,
  YONI_OF, VARNA_NAME, VASHYA_NAME, GANA_NAME, NADI_NAME,
  type Koota, type AshtakootaResult, type MangalaDosha,
} from './matching.js';

export { yogas, type YogaResult, type YogaDetail } from './yogas.js';

export {
  kpChart, kpLords, fourStep, cuspsSubbedBy, arcHouse, KP_LORDS,
  type KpChart, type KpBody, type KpCusp, type KpLords, type KpOptions, type KpStep,
} from './kp.js';

export {
  ashtakavarga, trikonaReduce, ekadhipatyaReduce, AV_OWNERS, AV_CONTRIBUTORS,
  type Ashtakavarga, type Bhinna, type AvOwner,
} from './ashtakavarga.js';

export {
  shadbala, sripati, vargaOf, sputaDrishti, compoundRelation, SHADBALA_ROWS, SHADBALA_MIN, NAISARGIKA,
  type ShadbalaResult, type ShadbalaRow, type ShadbalaContext,
} from './shadbala.js';

export {
  varshaphal, muddaDasha, solarReturn, positionsAt, progression, MUDDA_DAYS,
  type Varsha, type MuddaPeriod, type AnnualOptions, type Positions,
} from './varshaphal.js';

export {
  permanentRelation, temporaryFriend, fiveFold, dignities, COMBUSTION,
  shodashavarga, vimshopaka, SHODASHA, sahams, specialLagnas, rasiDrishti, arudhas,
  avakahada, ghataka, GEM, WEEKDAY_OF, CORRESPONDENCE, favourablePoints,
  taraChakra, sudarshana, chalit, TARA_NAMES,
  type Relation, type FiveFold, type Dignity, type VimshopakaScheme, type Saham, type Avakahada,
  type Ghataka, type FavourablePoints, type TaraRow,
} from './tables.js';

export {
  western, aspectGrid, separationInt, aspectOf, WESTERN_BODIES, ASPECTS,
  type Western, type WesternPosition, type WesternBody,
} from './western.js';

export {
  dailyPower, moonTaraSchedule, gochar, vimshottariAt, localJd, TARA_CYCLE,
  type PowerDay, type MoonSegment, type GocharEvent, type TransitContext, type Tara,
} from './daily.js';

export {
  kpEvent, kpEvents, KP_EVENTS,
  type KpEventDef, type KpEvent, type KpEventRow, type KpLink,
} from './kpEvents.js';
