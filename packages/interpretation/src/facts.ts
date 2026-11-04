/**
 * The validated fact sheet.
 *
 * This is the ONLY thing an optional AI layer is ever handed. It is a plain,
 * serialisable snapshot of what the deterministic engine measured: positions,
 * signs, houses, aspects with their orbs, distributions, chart shape, and the
 * provenance of the ephemeris that produced them.
 *
 * Three properties matter, and they are the reason this module exists rather
 * than a chart object simply being passed along:
 *
 * 1. **It is derived, never authored.** Every field traces to a calculation.
 *    A language model consuming this cannot introduce a position, because it
 *    is not being asked for one.
 * 2. **It carries its own caveats.** Ephemeris source and any chart warnings
 *    travel with the data, so a downstream consumer cannot present a
 *    Moshier-derived chart as though it were sub-arcsecond.
 * 3. **It replaces nothing.** The deterministic delineations are produced
 *    whether or not anything downstream is enabled. An AI layer can only ever
 *    add commentary beside them.
 *
 * No network call is made from this package, and none should be added here:
 * an offline-first application must produce a complete report with no
 * connectivity at all.
 */
import {
  chartShape,
  hemispheres,
  quadrants,
  type Body,
  type ChartShapeName,
  type ChartWarningCode,
  type EphemerisSource,
  type InstantChart,
  type SignName,
} from '@astro/engine';

export interface FactPosition {
  readonly body: Body;
  /** Ecliptic longitude in degrees, rounded to a milliarcsecond. */
  readonly longitude: number;
  readonly sign: SignName;
  readonly degreesInSign: number;
  readonly house?: number;
  readonly retrograde: boolean;
  readonly speedPerDay: number;
}

export interface FactAspect {
  readonly bodyA: Body;
  readonly bodyB: Body;
  readonly aspect: string;
  readonly orb: number;
  readonly applying: boolean | null;
}

export interface FactAngles {
  readonly ascendant: number;
  readonly midheaven: number;
  readonly houseSystem: string;
  readonly cusps: readonly number[];
}

export interface ChartFacts {
  /** Bumped when the payload shape changes, so consumers can refuse old data. */
  readonly schema: 'astro.chart-facts/1';
  readonly utcIso: string;
  readonly julianDayUT: number;
  readonly place: { readonly latitude: number; readonly longitude: number; readonly label?: string };
  readonly zodiac: string;
  readonly ayanamshaDegrees: number;
  readonly positions: readonly FactPosition[];
  readonly angles?: FactAngles;
  readonly aspects: readonly FactAspect[];
  readonly elements: Readonly<Record<string, number>>;
  readonly modalities: Readonly<Record<string, number>>;
  readonly shape?: { readonly name: ChartShapeName; readonly occupiedArc: number; readonly handle?: Body };
  readonly hemispheres?: Readonly<Record<string, number>>;
  readonly quadrants?: readonly number[];
  /**
   * Travels with the data on purpose. A consumer that drops these is
   * presenting a chart as more certain than it is.
   */
  readonly provenance: {
    readonly ephemeris: EphemerisSource;
    readonly warnings: readonly ChartWarningCode[];
  };
}

/** Round to a milliarcsecond — far finer than any claim made from it. */
function round(value: number): number {
  return Math.round(value * 3_600_000) / 3_600_000;
}

/**
 * Build the fact sheet from a calculated chart.
 *
 * Pure and synchronous. It reads the chart and rearranges it; it computes no
 * astronomy of its own beyond the shape and emphasis helpers, which are
 * themselves engine code.
 */
export function chartFacts(chart: InstantChart): ChartFacts {
  const shape = chartShape(chart.bodies);
  const split = hemispheres(chart.bodies, chart.houses);
  const quads = quadrants(chart.bodies, chart.houses);

  return {
    schema: 'astro.chart-facts/1',
    utcIso: chart.utcIso,
    julianDayUT: chart.jdUT,
    place: {
      latitude: round(chart.place.latitude),
      longitude: round(chart.place.longitude),
      ...(chart.place.label === undefined ? {} : { label: chart.place.label }),
    },
    zodiac: chart.settings.zodiac.kind === 'tropical'
      ? 'tropical'
      : `sidereal:${chart.settings.zodiac.ayanamsha}`,
    ayanamshaDegrees: round(chart.ayanamsha),
    positions: chart.bodies.map((placed) => ({
      body: placed.position.body,
      longitude: round(placed.position.longitude),
      sign: placed.sign.sign,
      degreesInSign: round(placed.sign.degreesInSign),
      ...(placed.house === undefined ? {} : { house: placed.house }),
      retrograde: placed.position.retrograde,
      speedPerDay: round(placed.position.longitudeSpeed),
    })),
    ...(chart.houses
      ? {
          angles: {
            ascendant: round(chart.houses.ascendant),
            midheaven: round(chart.houses.midheaven),
            houseSystem: chart.houses.system,
            cusps: chart.houses.cusps.map(round),
          },
        }
      : {}),
    aspects: chart.aspects.map((hit) => ({
      bodyA: hit.bodyA,
      bodyB: hit.bodyB,
      aspect: hit.aspect,
      orb: round(hit.orb),
      // Null rather than false when stationary: "not applying" and "we cannot
      // tell which way it is moving" are different statements, and collapsing
      // them is exactly the kind of quiet loss this payload exists to prevent.
      applying: hit.motion === 'applying' ? true : hit.motion === 'separating' ? false : null,
    })),
    elements: { ...chart.elements.counts },
    modalities: { ...chart.modalities.counts },
    ...(shape
      ? {
          shape: {
            name: shape.name,
            occupiedArc: round(shape.occupiedArc),
            ...(shape.handle === undefined ? {} : { handle: shape.handle }),
          },
        }
      : {}),
    ...(split
      ? {
          hemispheres: {
            aboveHorizon: split.aboveHorizon,
            belowHorizon: split.belowHorizon,
            eastern: split.eastern,
            western: split.western,
          },
        }
      : {}),
    ...(quads ? { quadrants: [...quads.counts] } : {}),
    provenance: {
      ephemeris: chart.precision.source,
      warnings: chart.precision.warnings.map((warning) => warning.code),
    },
  };
}
