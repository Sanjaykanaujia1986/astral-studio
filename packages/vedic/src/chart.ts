/**
 * The Vedic chart: a rāśi chart plus the things that make it Vedic.
 *
 * Built on top of an `InstantChart`, not instead of one — the astronomy is the
 * engine's, already verified and fingerprinted. What this adds is the sidereal
 * framework: whole-sign houses from the lagna, nakṣatras and pādas, vargas,
 * the daśā and the pañcāṅga.
 *
 * It **requires** a sidereal chart and says so loudly if given a tropical one.
 * Quietly treating tropical longitudes as sidereal would produce a chart
 * roughly 24° out — every planet in the wrong sign, every nakṣatra wrong, the
 * daśā starting from the wrong lord — and nothing on screen would look amiss.
 */
import {
  norm360,
  type Degrees,
  type EphemerisProvider,
  type InstantChart,
  type SignName,
} from '@astro/engine';
import { SIGNS } from '@astro/engine';
import { nakshatraOf, type NakshatraPosition } from './nakshatra.js';
import { buildVargaChart, VARGAS, type Varga, type VargaChart } from './varga.js';
import { vimshottari, type VimshottariOptions, type VimshottariResult } from './vimshottari.js';
import { panchang, type Panchang, type PanchangPlace } from './panchang.js';

export class NotSiderealError extends Error {
  readonly code = 'chartIsNotSidereal';
  constructor() {
    super(
      'A Vedic chart requires sidereal longitudes. This chart is tropical; '
      + 'using it would place every planet about 24 degrees from where it belongs.',
    );
    this.name = 'NotSiderealError';
  }
}

export interface VedicPlacement {
  readonly body: string;
  readonly longitude: Degrees;
  readonly sign: SignName;
  readonly signIndex: number;
  /** Whole-sign house from the lagna, 1-12. */
  readonly house: number;
  readonly nakshatra: NakshatraPosition;
  readonly retrograde: boolean;
  /** Degrees into the sign. */
  readonly degreesInSign: Degrees;
}

export interface VedicChart {
  readonly jdUT: number;
  readonly ayanamsha: Degrees;
  readonly ayanamshaName: string;
  /** Lagna (ascendant) in sidereal longitude. Undefined without a birth time. */
  readonly lagna?: { readonly longitude: Degrees; readonly sign: SignName; readonly signIndex: number; readonly nakshatra: NakshatraPosition };
  readonly placements: readonly VedicPlacement[];
  readonly vargas: Readonly<Partial<Record<Varga, VargaChart>>>;
  readonly dasha?: VimshottariResult;
  readonly panchang?: Panchang;
  /** True when the node variety is mean, which Vedic practice expects. */
  readonly usesMeanNodes: boolean;
}

export interface VedicChartOptions {
  readonly vargas?: readonly Varga[];
  readonly vimshottari?: VimshottariOptions | false;
  /** Needed for the pañcāṅga's vāra, which changes at sunrise. */
  readonly place?: PanchangPlace;
  readonly provider?: EphemerisProvider;
}

/** Whole-sign house of a longitude, counted from the lagna's sign. */
export function wholeSignHouse(longitude: Degrees, lagnaLongitude: Degrees): number {
  const sign = Math.floor(norm360(longitude) / 30);
  const lagnaSign = Math.floor(norm360(lagnaLongitude) / 30);
  return ((sign - lagnaSign + 12) % 12) + 1;
}

/**
 * Build a Vedic chart from an already-calculated sidereal `InstantChart`.
 *
 * The provider is only needed for the pañcāṅga's sunrise; everything else is a
 * function of longitudes the chart already carries.
 */
export function vedicChart(chart: InstantChart, options: VedicChartOptions = {}): VedicChart {
  if (chart.settings.zodiac.kind !== 'sidereal') throw new NotSiderealError();

  const lagnaLongitude = chart.houses?.ascendant;

  const placements: VedicPlacement[] = chart.bodies.map((placed) => {
    const longitude = norm360(placed.position.longitude);
    const signIndex = Math.floor(longitude / 30);
    return {
      body: placed.position.body,
      longitude,
      sign: SIGNS[signIndex]!,
      signIndex,
      // Without a lagna there are no houses. 0 would read as a house number.
      house: lagnaLongitude === undefined ? 0 : wholeSignHouse(longitude, lagnaLongitude),
      nakshatra: nakshatraOf(longitude),
      retrograde: placed.position.retrograde,
      degreesInSign: longitude - signIndex * 30,
    };
  });

  // Vargas need a lagna to assign houses, so they are built only when there is
  // one. A varga chart with no lagna would show signs but meaningless houses.
  const vargas: Partial<Record<Varga, VargaChart>> = {};
  if (lagnaLongitude !== undefined) {
    for (const varga of options.vargas ?? VARGAS) {
      vargas[varga] = buildVargaChart(
        varga,
        lagnaLongitude,
        placements.map((p) => ({ body: p.body, longitude: p.longitude })),
      );
    }
  }

  const moon = placements.find((p) => p.body === 'moon');
  const sun = placements.find((p) => p.body === 'sun');

  const dasha = options.vimshottari === false || !moon
    ? undefined
    : vimshottari(moon.longitude, chart.jdUT, options.vimshottari ?? {});

  let panchangResult: Panchang | undefined;
  if (sun && moon) {
    let sunriseJd: number | undefined;
    let noSunrise = false;
    if (options.provider && options.place) {
      // Search from the start of the UT day so "today's sunrise" is found
      // rather than tomorrow's when the chart instant is already past dawn.
      const dayStart = Math.floor(chart.jdUT - 0.5) + 0.5;
      sunriseJd = options.provider.riseTransit(dayStart, 'sun', options.place, 'rise');
      noSunrise = sunriseJd === undefined;
    }
    panchangResult = panchang(chart.jdUT, sun.longitude, moon.longitude, {
      ...(sunriseJd === undefined ? {} : { sunriseJd }),
      ...(noSunrise ? { noSunrise: true } : {}),
    });
  }

  return {
    jdUT: chart.jdUT,
    ayanamsha: chart.ayanamsha,
    ayanamshaName: chart.settings.zodiac.kind === 'sidereal'
      ? chart.settings.zodiac.ayanamsha
      : 'tropical',
    ...(lagnaLongitude === undefined
      ? {}
      : {
          lagna: {
            longitude: lagnaLongitude,
            sign: SIGNS[Math.floor(norm360(lagnaLongitude) / 30)]!,
            signIndex: Math.floor(norm360(lagnaLongitude) / 30),
            nakshatra: nakshatraOf(lagnaLongitude),
          },
        }),
    placements,
    vargas,
    ...(dasha ? { dasha } : {}),
    ...(panchangResult ? { panchang: panchangResult } : {}),
    usesMeanNodes: chart.settings.nodeType === 'mean',
  };
}
