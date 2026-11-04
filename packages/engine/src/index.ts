/**
 * @astro/engine — astrology calculation engine.
 *
 * Pure TypeScript with no React, DOM or storage dependencies, so it runs
 * identically in the browser, inside the Capacitor WebView on Android, in Node
 * and under test.
 *
 * Typical use:
 *
 * ```ts
 * const provider = new SwissEphWasmProvider();
 * await provider.init();
 * const chart = calculateNatalChart(provider, birthData);
 * ```
 */

// Maths
export {
  norm360, norm180, signedDelta, separation, midpoint, unwrap, splitSign, toDms,
  type Degrees,
} from './math/angles.js';
export {
  brentRoot, findBrackets, findRoots,
  type Bracket, type RootOptions,
} from './math/roots.js';

// Time
export {
  julianDay, fromJulianDay, toDecimalHours, conventionalCalendarFor,
  julianDayToIsoUtc, GREGORIAN_REFORM_JD,
  type Calendar, type CivilDate, type CivilTime,
} from './time/julian.js';
export {
  resolveCivilTime, resolveWithFixedOffset, TimeResolutionError,
  type ResolvedTime, type ResolveOptions, type TimeAmbiguity,
} from './time/timezone.js';

// Ephemeris
export {
  ALL_BODIES, DEFAULT_BODIES, NODE_BODIES, HOUSE_SYSTEMS, POLAR_UNSAFE_SYSTEMS, AYANAMSHAS, TROPICAL,
  type Ayanamsha, type Body, type BodyPosition, type EphemerisSource, type NodeType,
  type EquatorialPosition, type HouseCusps, type HouseSystem, type ZodiacMode,
} from './ephemeris/types.js';
export {
  sourceForJd, assertSupportedDate,
  EphemerisError, FrameError, DateOutOfRangeError, HouseCalculationError,
  SWISS_RANGE_START_JD, SWISS_RANGE_END_JD,
  MOSHIER_RANGE_START_JD, MOSHIER_RANGE_END_JD,
  type CalcOptions, type EphemerisProvider, type HouseOptions,
  type ReferenceFrame, type Observer,
  type RiseEvent, type RisePlace,
} from './ephemeris/provider.js';
export { SwissEphWasmProvider } from './ephemeris/swisseph-wasm-provider.js';

// Zodiac
export {
  SIGNS, signPosition, elementOf, modalityOf, polarityOf,
  type Element, type Modality, type Polarity, type SignName, type SignPosition,
} from './zodiac/signs.js';

// Aspects
export {
  ASPECT_DEFINITIONS, ALL_ASPECTS, MAJOR_ASPECTS, ORB_PROFILES,
  STANDARD_ORBS, TIGHT_ORBS, WIDE_ORBS, maxOrbFor,
  type AspectDefinition, type AspectName, type OrbProfile,
} from './aspects/definitions.js';
export {
  aspectError, classifyMotion, testAspect, findAspects, findCrossAspects,
  type AspectHit, type AspectMotion, type AspectOptions,
} from './aspects/engine.js';

export type { ChartWarning, ChartWarningCode, EngineErrorCode } from './chart/warnings.js';

// Charts
export {
  calculateNatalChart, calculateChartForInstant, houseOf, resolveNodeBodies, DEFAULT_SETTINGS,
  type BirthData, type BirthPlace, type CalculateOptions, type ChartPrecision,
  type ChartSettings, type Distribution, type InstantChart, type NatalChart,
  type PlacedBody, type ZoneSpec,
} from './chart/natal.js';

export {
  chartShape, hemispheres, quadrants,
  SHAPE_BODIES, SHAPE_GAP_THRESHOLD, BUNDLE_ARC, BOWL_ARC, LOCOMOTIVE_ARC,
  type ChartShape, type ChartShapeName, type HemisphereEmphasis, type QuadrantEmphasis,
} from './chart/shape.js';

// Self-test (build fingerprint, used to prove web/Android parity)
export {
  runSelfTest, fnv1a, SELF_TEST_CASES,
  type SelfTestCase, type SelfTestCaseResult, type SelfTestResult,
} from './selftest.js';

// Transits & aspectarian
export {
  findTransitHits, buildAspectarian, targetsFromChart,
  type AspectarianOptions, type TransitOptions,
} from './transits/engine.js';
export {
  DEFAULT_STEP_DAYS,
  type AspectEvent, type CrossingDirection, type TransitHit,
  type TransitSearchOptions, type TransitTarget,
} from './transits/types.js';

// Returns
export {
  findNextReturn, findReturns, natalLongitudeOf, ReturnNotFoundError,
  APPROXIMATE_RETURN_DAYS,
  type ReturnChart, type ReturnOptions,
} from './returns/engine.js';

// Progressions & directions
export {
  secondaryProgression, solarArcDirections,
  TROPICAL_YEAR_DAYS, JULIAN_YEAR_DAYS,
  type DirectedAngles, type DirectedPosition, type ProgressedChart,
  type ProgressionOptions, type SolarArcChart, type SolarArcInput,
} from './progressions/engine.js';

// Aspect crossings (shared by transits, aspectarian and returns)
export { findCrossings, isWrap, isGenuineRoot, type CrossingOptions } from './aspects/crossing.js';

// Sky events: things the sky does on its own, not aspects to a fixed target.
export { findIngresses, signIndexOf, type IngressOptions } from './events/ingress.js';
export { findStations, NoStationsError, type StationOptions } from './events/station.js';
export {
  findDeclinationEvents, NoDeclinationError, type DeclinationOptions,
} from './events/declination.js';
export type {
  DeclinationEvent, DeclinationEventType, EventKind, EventSearchOptions,
  IngressEvent, SkyEvent, StationDirection, StationEvent,
} from './events/types.js';

// Synastry
export {
  analyseSynastry, chartPoints, midpointOf,
  type ChartPointRef, type HouseOverlay, type SynastryAspect,
  type SynastryOptions, type SynastryResult,
} from './synastry/engine.js';

// Composite & Davison
export {
  compositeChart, davisonChart,
  type CompositeAngles, type CompositeChart, type CompositeInput,
  type CompositePosition, type DavisonChart, type DavisonInput,
} from './composite/engine.js';

// Cycles
export {
  analyseCycle, currentPhase, expectedSynodicPeriod, orderBySpeed,
  phaseAngle, phaseError, labelForPhase,
  type ConjunctionGroup, type CurrentPhase, type CycleAnalysis,
  type CycleEvent, type CycleSearchOptions,
} from './cycles/engine.js';
