/**
 * Casting a chart for an instant.
 *
 * The natal chart, a solar return and a progressed chart are the same
 * calculation once the moment and place are known — only how that moment is
 * ARRIVED at differs. This module owns the shared part so the three cannot
 * drift: a fix to house assignment or aspect selection lands in all of them at
 * once.
 */
import { norm360, type Degrees } from '../math/angles.js';
import { findAspects, type AspectHit, type AspectOptions } from '../aspects/engine.js';
import {
  MAJOR_ASPECTS,
  STANDARD_ORBS,
  type AspectName,
  type OrbProfile,
} from '../aspects/definitions.js';
import { sourceForJd, type EphemerisProvider } from '../ephemeris/provider.js';
import {
  DEFAULT_BODIES,
  NODE_BODIES,
  type Body,
  type NodeType,
  type BodyPosition,
  type EphemerisSource,
  type HouseCusps,
  type HouseSystem,
  type ZodiacMode,
} from '../ephemeris/types.js';
import { julianDayToIsoUtc } from '../time/julian.js';
import {
  signPosition,
  type Element,
  type Modality,
  type SignName,
  type SignPosition,
} from '../zodiac/signs.js';
import type { ChartWarning } from './warnings.js';

export interface BirthPlace {
  readonly latitude: Degrees;
  readonly longitude: Degrees;
  readonly label?: string;
}

export interface ChartSettings {
  readonly zodiac: ZodiacMode;
  readonly houseSystem: HouseSystem;
  /**
   * Which lunar node to place, Rahu and Ketu together.
   *
   * Applied by substitution into `bodies`, so a caller asking for the default
   * body set gets the pair it chose without having to name both. An explicit
   * `bodies` list that already names a node pair is left exactly as given.
   */
  readonly nodeType: NodeType;
  readonly bodies: readonly Body[];
  readonly orbProfile: OrbProfile;
  readonly aspects: readonly AspectName[];
  readonly includeEquatorial: boolean;
}

export const DEFAULT_SETTINGS: ChartSettings = {
  zodiac: { kind: 'tropical' },
  houseSystem: 'placidus',
  // True node, matching Swiss Ephemeris and Western convention. Vedic users
  // switch this to 'mean'; the choice is snapshotted with the chart.
  nodeType: 'true',
  bodies: DEFAULT_BODIES,
  orbProfile: STANDARD_ORBS,
  aspects: MAJOR_ASPECTS,
  includeEquatorial: true,
};

/** A placed body: raw position plus its sign and (when known) its house. */
export interface PlacedBody {
  readonly position: BodyPosition;
  readonly sign: SignPosition;
  /** 1-12. Undefined when houses were not computed. */
  readonly house?: number;
}

export interface Distribution<K extends string> {
  readonly counts: Readonly<Record<K, number>>;
  readonly total: number;
}

export interface ChartPrecision {
  readonly source: EphemerisSource;
  /**
   * Notes the UI must surface, never swallow. Codes rather than prose, so the
   * calculation layer stays language-neutral — see ./warnings.ts.
   */
  readonly warnings: readonly ChartWarning[];
}

/** A chart cast for a moment and a place. */
export interface InstantChart {
  readonly jdUT: number;
  readonly utcIso: string;
  readonly place: BirthPlace;
  readonly settings: ChartSettings;
  readonly bodies: readonly PlacedBody[];
  /** Undefined when houses were suppressed (unknown birth time). */
  readonly houses?: HouseCusps;
  readonly aspects: readonly AspectHit[];
  readonly ayanamsha: Degrees;
  readonly elements: Distribution<Element>;
  readonly modalities: Distribution<Modality>;
  readonly signs: Distribution<SignName>;
  readonly houseDistribution?: Distribution<string>;
  readonly precision: ChartPrecision;
}

/**
 * Which house a longitude falls in, given the twelve cusps.
 *
 * Houses are unequal in most systems, so this cannot divide by 30. It walks
 * the cusps and measures how far the longitude sits past each one, comparing
 * against that house's own span. All arithmetic goes through norm360, so the
 * house containing 0 degrees Aries is handled like any other.
 */
/**
 * Apply the node choice to a body list.
 *
 * Substitution rather than appending, so the chart carries ONE node axis and
 * the table does not sprout a second Rahu. A list that already names the
 * chosen pair passes through untouched, and a list naming neither node is
 * unaffected.
 */
export function resolveNodeBodies(
  bodies: readonly Body[],
  nodeType: NodeType,
): readonly Body[] {
  const [north, south] = NODE_BODIES[nodeType];
  const [otherNorth, otherSouth] = NODE_BODIES[nodeType === 'true' ? 'mean' : 'true'];
  const swap = (body: Body): Body =>
    body === otherNorth ? north : body === otherSouth ? south : body;

  const out: Body[] = [];
  for (const body of bodies) {
    const resolved = swap(body);
    // A list that somehow names both axes collapses to one; without the guard
    // the substitution would duplicate a body and the wheel would draw two
    // glyphs on the same degree.
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out;
}

export function houseOf(longitude: Degrees, cusps: readonly Degrees[]): number {
  if (cusps.length !== 12) {
    throw new RangeError(`houseOf requires exactly 12 cusps, received ${cusps.length}`);
  }
  const lon = norm360(longitude);

  for (let i = 0; i < 12; i++) {
    const start = cusps[i]!;
    const end = cusps[(i + 1) % 12]!;
    const span = norm360(end - start);
    const offset = norm360(lon - start);
    // A zero span would mean degenerate cusps; treat as not matching so the
    // loop continues rather than claiming a house of zero width.
    if (span > 0 && offset < span) return i + 1;
  }

  throw new Error(`houseOf: longitude ${longitude} matched no house; cusps may be degenerate`);
}

function tally<K extends string>(keys: readonly K[], values: readonly K[]): Distribution<K> {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const value of values) counts[value] += 1;
  return { counts, total: values.length };
}

const ELEMENTS: readonly Element[] = ['fire', 'earth', 'air', 'water'];
const MODALITIES: readonly Modality[] = ['cardinal', 'fixed', 'mutable'];
const SIGN_KEYS: readonly SignName[] = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];
const HOUSE_KEYS: readonly string[] = Array.from({ length: 12 }, (_, i) => String(i + 1));

export interface InstantChartOptions {
  readonly settings?: Partial<ChartSettings>;
  /** Set false to suppress houses and angles (unknown birth time). */
  readonly withHouses?: boolean;
  /** Warnings accumulated by the caller before the chart was cast. */
  readonly warnings?: readonly ChartWarning[];
}

/**
 * Cast a chart for a Julian Day and a place.
 */
export function calculateChartForInstant(
  provider: EphemerisProvider,
  jdUT: number,
  place: BirthPlace,
  options: InstantChartOptions = {},
): InstantChart {
  const settings: ChartSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  const warnings: ChartWarning[] = [...(options.warnings ?? [])];
  const withHouses = options.withHouses ?? true;

  const source = sourceForJd(jdUT);
  if (source === 'moshier') {
    warnings.push({ code: 'lowPrecisionEphemeris', params: { from: 1800, to: 2399 } });
  }

  const positions = provider.calcMany(jdUT, resolveNodeBodies(settings.bodies, settings.nodeType), {
    zodiac: settings.zodiac,
    includeEquatorial: settings.includeEquatorial,
  });

  let houses: HouseCusps | undefined;
  if (withHouses) {
    houses = provider.houses(jdUT, place.latitude, place.longitude, settings.houseSystem, {
      zodiac: settings.zodiac,
    });
    if (houses.fallbackFrom) {
      warnings.push({
        code: 'houseSystemFallback',
        params: {
          requested: houses.fallbackFrom,
          used: houses.system,
          latitude: Number(place.latitude.toFixed(2)),
        },
      });
    }
  }

  const bodies: PlacedBody[] = positions.map((position) => {
    const sign = signPosition(position.longitude);
    return houses
      ? { position, sign, house: houseOf(position.longitude, houses.cusps) }
      : { position, sign };
  });

  const aspectOptions: AspectOptions = {
    orbProfile: settings.orbProfile,
    aspects: settings.aspects,
  };

  return {
    jdUT,
    utcIso: julianDayToIsoUtc(jdUT),
    place,
    settings,
    bodies,
    ...(houses ? { houses } : {}),
    aspects: findAspects(positions, aspectOptions),
    ayanamsha: provider.ayanamsha(jdUT, settings.zodiac),
    elements: tally(ELEMENTS, bodies.map((b) => b.sign.element)),
    modalities: tally(MODALITIES, bodies.map((b) => b.sign.modality)),
    signs: tally(SIGN_KEYS, bodies.map((b) => b.sign.sign)),
    ...(houses
      ? { houseDistribution: tally(HOUSE_KEYS, bodies.map((b) => String(b.house))) }
      : {}),
    precision: { source, warnings },
  };
}
