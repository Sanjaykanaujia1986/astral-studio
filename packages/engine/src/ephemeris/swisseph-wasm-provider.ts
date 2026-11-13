/**
 * Swiss Ephemeris provider backed by `swisseph-wasm`.
 *
 * This is the single calculation engine for every environment — browser,
 * Capacitor/Android, Node and the test suite — so that all four produce
 * identical numbers. See docs/ASTRONOMY_NOTES.md for the measurements behind
 * that decision.
 *
 * This file is the ONLY place Swiss Ephemeris integer constants appear.
 */
import SwissEph from 'swisseph-wasm';
import { norm360, type Degrees } from '../math/angles.js';
import {
  assertSupportedDate,
  DEFAULT_STATIONARY_THRESHOLD,
  EphemerisError,
  HouseCalculationError,
  sourceForJd,
  type CalcOptions,
  FrameError,
  type EphemerisProvider,
  type HouseOptions,
  type RiseEvent,
  type RisePlace,
} from './provider.js';
import {
  AYANAMSHAS,
  HOUSE_SYSTEMS,
  POLAR_UNSAFE_SYSTEMS,
  type Body,
  type BodyPosition,
  type HouseCusps,
  type HouseSystem,
  type ZodiacMode,
} from './types.js';

/** Swiss Ephemeris calculation flags. */
const SEFLG_SWIEPH = 2;
const SEFLG_SPEED = 256;
const SEFLG_EQUATORIAL = 2048;
const SEFLG_SIDEREAL = 65536;
const SEFLG_HELCTR = 8;
/** No heliocentric position exists for these. See `#applyFrame`. */
const NO_HELIOCENTRIC: ReadonlySet<Body> = new Set([
  'sun', 'moon', 'trueNode', 'meanNode', 'southNode', 'meanSouthNode', 'lilith',
]);
const SEFLG_TOPOCTR = 32768;

/**
 * Body -> Swiss Ephemeris planet number.
 *
 * Both south nodes are derived rather than looked up: Swiss Ephemeris has no
 * constant for either, and inventing a planet number would be worse than
 * computing the opposition the definition already gives.
 */
const BODY_NUMBERS: Readonly<Record<Exclude<Body, 'southNode' | 'meanSouthNode'>, number>> = {
  sun: 0,
  moon: 1,
  mercury: 2,
  venus: 3,
  mars: 4,
  jupiter: 5,
  saturn: 6,
  uranus: 7,
  neptune: 8,
  pluto: 9,
  meanNode: 10,
  trueNode: 11,
  lilith: 12,
  chiron: 15,
};

/** `ascmc` indices returned by swe_houses. */
const ASCMC_ASCENDANT = 0;
const ASCMC_MC = 1;
const ASCMC_ARMC = 2;
const ASCMC_VERTEX = 3;

/** Minimal shape of the wrapper we rely on; the package ships loose types. */
interface WasmModule {
  initSwissEph(): Promise<void>;
  calc_ut(jd: number, body: number, flags: number): ArrayLike<number>;
  houses(jd: number, lat: number, lon: number, hsys: string): {
    cusps: ArrayLike<number>;
    ascmc: ArrayLike<number>;
  };
  /**
   * swe_houses_ex. Same as `houses` but takes flags — which is the only way
   * to get SIDEREAL cusps, because `swe_houses` has nowhere to put them and
   * always answers tropical however the sidereal mode is set.
   */
  houses_ex(jd: number, iflag: number, lat: number, lon: number, hsys: string): {
    cusps: ArrayLike<number>;
    ascmc: ArrayLike<number>;
  };
  get_ayanamsa_ex_ut(jd: number, flags: number): number;
  /** swe_set_topo. Observer position for topocentric calculations. */
  set_topo(longitude: number, latitude: number, altitude: number): void;
  set_sid_mode(mode: number, t0: number, ayanT0: number): void;
  /**
   * swe_rise_trans. Returns the tret array, or null when the underlying call
   * reports a negative flag — which includes "event not found" for a
   * circumpolar body, not only genuine errors.
   */
  rise_trans(
    jd: number,
    body: number,
    starName: string,
    epheFlag: number,
    rsmi: number,
    geopos: readonly number[],
    atpress: number,
    attemp: number,
  ): ArrayLike<number> | null;
  close(): void;
}

function readArray(source: ArrayLike<number>, length: number, context: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    const value = source[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new EphemerisError(`${context}: expected a finite number at index ${i}`, { source });
    }
    out.push(value);
  }
  return out;
}

export class SwissEphWasmProvider implements EphemerisProvider {
  #wasm: WasmModule | undefined;
  /** Sidereal mode is global state inside Swiss Ephemeris; track it to avoid redundant sets. */
  #currentSidMode: number | undefined;

  async init(): Promise<void> {
    if (this.#wasm) return;
    const instance = new SwissEph() as unknown as WasmModule;
    await instance.initSwissEph();
    this.#wasm = instance;
  }

  #module(): WasmModule {
    if (!this.#wasm) {
      throw new EphemerisError('Ephemeris provider used before init(). Call await init() first.');
    }
    return this.#wasm;
  }

  /**
   * Apply a zodiac mode, returning the extra calculation flags it implies.
   *
   * Swiss Ephemeris keeps the sidereal mode as global state, so this must run
   * before every calculation whose mode differs from the last one.
   */
  #applyZodiac(zodiac: ZodiacMode | undefined): number {
    if (!zodiac || zodiac.kind === 'tropical') return 0;

    const mode = AYANAMSHAS[zodiac.ayanamsha];
    if (mode === undefined) {
      throw new EphemerisError(`Unknown ayanamsha: ${String(zodiac.ayanamsha)}`);
    }
    if (zodiac.ayanamsha === 'custom' && zodiac.customOffset === undefined) {
      throw new EphemerisError('Custom ayanamsha requires an explicit customOffset.');
    }
    if (this.#currentSidMode !== mode) {
      this.#module().set_sid_mode(mode, 0, zodiac.customOffset ?? 0);
      this.#currentSidMode = mode;
    }
    return SEFLG_SIDEREAL;
  }

  /**
   * Flags for the requested frame, and the guard that makes a wrong one loud.
   *
   * Heliocentric is not "the same chart from the Sun": from there the Sun is
   * the origin and the Moon orbits a planet, so neither has a heliocentric
   * longitude, and nor do the lunar nodes, which are defined by the Moon's
   * orbit around the Earth. Swiss Ephemeris returns a number for some of
   * these anyway. Returning it would be the worst kind of wrong — plausible.
   */
  #applyFrame(options: CalcOptions, body: Body): number {
    const frame = options.frame ?? 'geocentric';
    if (frame === 'geocentric') return 0;

    if (frame === 'heliocentric') {
      if (NO_HELIOCENTRIC.has(body)) {
        throw new FrameError(
          `${body} has no heliocentric position: from the Sun it is either the origin `
          + 'or defined by an orbit around the Earth.',
        );
      }
      return SEFLG_HELCTR;
    }

    if (!options.observer) {
      throw new FrameError(
        'A topocentric position needs an observer. Without one the result would '
        + 'silently be geocentric, which differs by up to about a degree for the Moon.',
      );
    }
    this.#module().set_topo(
      options.observer.longitude,
      options.observer.latitude,
      options.observer.altitudeMetres ?? 0,
    );
    return SEFLG_TOPOCTR;
  }

  calc(jdUT: number, body: Body, options: CalcOptions = {}): BodyPosition {
    assertSupportedDate(jdUT);

    /*
     * A south node is exactly opposite its OWN north node, and which one that
     * is matters. Deriving mean Ketu from the true Rahu — which an earlier
     * version did, because only one south node existed — puts it up to 1.5
     * degrees from where every mean-node table says it is, and silently: the
     * number looks entirely plausible.
     *
     * So the pairing is explicit, and each south node is its own Body.
     */
    if (body === 'southNode' || body === 'meanSouthNode') {
      const north = this.calc(jdUT, body === 'southNode' ? 'trueNode' : 'meanNode', options);
      return {
        ...north,
        body,
        longitude: norm360(north.longitude + 180),
        latitude: -north.latitude,
        ...(north.equatorial
          ? {
              equatorial: {
                rightAscension: norm360(north.equatorial.rightAscension + 180),
                declination: -north.equatorial.declination,
              },
            }
          : {}),
      };
    }

    const wasm = this.#module();
    const planet = BODY_NUMBERS[body];
    if (planet === undefined) throw new EphemerisError(`Unsupported body: ${String(body)}`);

    const siderealFlag = this.#applyZodiac(options.zodiac);
    const frameFlag = this.#applyFrame(options, body);
    const flags = SEFLG_SWIEPH | SEFLG_SPEED | siderealFlag | frameFlag;

    const raw = readArray(wasm.calc_ut(jdUT, planet, flags), 6, `calc(${body})`);
    const [longitude, latitude, distanceAu, longitudeSpeed, latitudeSpeed, distanceSpeed] =
      raw as [number, number, number, number, number, number];

    const threshold = options.stationaryThreshold ?? DEFAULT_STATIONARY_THRESHOLD;

    let equatorial: { rightAscension: Degrees; declination: Degrees } | undefined;
    if (options.includeEquatorial) {
      const eq = readArray(
        wasm.calc_ut(jdUT, planet, flags | SEFLG_EQUATORIAL),
        2,
        `calc(${body}, equatorial)`,
      );
      equatorial = { rightAscension: norm360(eq[0]!), declination: eq[1]! };
    }

    return {
      body,
      longitude: norm360(longitude),
      latitude,
      distanceAu,
      longitudeSpeed,
      latitudeSpeed,
      distanceSpeed,
      retrograde: longitudeSpeed < 0,
      stationary: Math.abs(longitudeSpeed) < threshold,
      // Provenance, not decoration: the wrapper hides the returned flags, so
      // the range check is how degraded results are identified.
      source: sourceForJd(jdUT),
      ...(equatorial ? { equatorial } : {}),
    };
  }

  calcMany(jdUT: number, bodies: readonly Body[], options: CalcOptions = {}): BodyPosition[] {
    return bodies.map((body) => this.calc(jdUT, body, options));
  }

  houses(
    jdUT: number,
    latitude: Degrees,
    longitude: Degrees,
    system: HouseSystem,
    options: HouseOptions = {},
  ): HouseCusps {
    assertSupportedDate(jdUT);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
      throw new EphemerisError(`Latitude out of range: ${latitude}`);
    }
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      throw new EphemerisError(`Longitude out of range: ${longitude}`);
    }

    const code = HOUSE_SYSTEMS[system];
    if (!code) throw new EphemerisError(`Unknown house system: ${String(system)}`);

    const fallback = options.polarFallback ?? 'porphyry';
    const unsafeHere =
      POLAR_UNSAFE_SYSTEMS.includes(system) && Math.abs(latitude) > 66.0;

    if (unsafeHere) {
      if (fallback === 'none') throw new HouseCalculationError(system, latitude);
      const substituted = this.houses(jdUT, latitude, longitude, fallback, {
        ...options,
        polarFallback: 'none',
      });
      return { ...substituted, fallbackFrom: system };
    }

    /*
     * The flag matters here, and it was being thrown away.
     *
     * `#applyZodiac` sets the sidereal mode and returns SEFLG_SIDEREAL, but
     * this used to call `swe_houses`, which takes no flags and therefore
     * always returns TROPICAL cusps. Setting the sidereal mode does nothing
     * for it. The bodies were converted and the houses were not, so a
     * sidereal chart carried an ascendant about 24° too high — most of a
     * sign, and in the wrong one roughly four times out of five.
     *
     * Found by checking a printed Gujarati jātaka against this engine: every
     * planet agreed to within 13 arcseconds and the lagna was out by exactly
     * one ayanāṁśa. `swe_houses_ex` is the same call with somewhere to put
     * the flag.
     */
    const siderealFlag = this.#applyZodiac(options.zodiac);
    const result = this.#module().houses_ex(
      jdUT, SEFLG_SWIEPH | siderealFlag, latitude, longitude, code,
    );

    // The wrapper returns cusps 1-based, with index 0 unused. Reading it as a
    // 0-based array silently shifts every house by one.
    const cusps: Degrees[] = [];
    for (let house = 1; house <= 12; house++) {
      const value = result.cusps[house];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new HouseCalculationError(system, latitude, `cusp ${house} was not computed`);
      }
      cusps.push(norm360(value));
    }

    const ascmc = readArray(result.ascmc, 4, `houses(${system})`);
    const ascendant = norm360(ascmc[ASCMC_ASCENDANT]!);
    const midheaven = norm360(ascmc[ASCMC_MC]!);

    return {
      cusps,
      ascendant,
      midheaven,
      descendant: norm360(ascendant + 180),
      imumCoeli: norm360(midheaven + 180),
      /*
       * Right ascension of the MC, measured along the EQUATOR. It is not an
       * ecliptic longitude, so the ayanamsha does not apply to it and Swiss
       * Ephemeris leaves it alone under SEFLG_SIDEREAL. A test asserts it is
       * identical in both zodiacs, because "subtract the ayanamsha from
       * everything in ascmc" is the obvious wrong fix.
       */
      armc: norm360(ascmc[ASCMC_ARMC]!),
      vertex: norm360(ascmc[ASCMC_VERTEX]!),
      system,
    };
  }

  /**
   * Ayanamsha for the configured sidereal mode.
   *
   * Uses `swe_get_ayanamsa_ex_ut` with the SAME flags as the position
   * calculations, not the plain `swe_get_ayanamsa_ut`. The plain form measures
   * from the MEAN equinox of date while sidereal positions are referred to the
   * TRUE equinox, so mixing them leaves a nutation-sized inconsistency — 13.93
   * arcsec at J2000, verified. A displayed ayanamsha that does not reconcile
   * with the positions printed beside it is exactly the kind of error a careful
   * astrologer notices and an automated check would not.
   */
  ayanamsha(jdUT: number, zodiac: ZodiacMode): Degrees {
    assertSupportedDate(jdUT);
    if (zodiac.kind === 'tropical') return 0;
    const siderealFlag = this.#applyZodiac(zodiac);
    return this.#module().get_ayanamsa_ex_ut(jdUT, SEFLG_SWIEPH | SEFLG_SPEED | siderealFlag);
  }

  /**
   * Rise or set, by Swiss Ephemeris `swe_rise_trans`.
   *
   * ## The disc convention, which decides minutes
   *
   * No bit flags are passed, which selects Swiss Ephemeris's default: the
   * **upper limb with atmospheric refraction**. That is the ordinary civil
   * definition of sunrise and the one pañcāṅga makers use. Passing
   * SE_BIT_DISC_CENTER would move sunrise 2-4 minutes later at mid latitudes —
   * enough to change the weekday for a birth in that window, and therefore
   * enough to change a vāra and everything reckoned from it.
   *
   * Pressure 1013.25 mbar and temperature 15 °C are the standard atmosphere;
   * they affect refraction and so shift the result by seconds.
   *
   * Returns undefined when the event does not occur, which inside the polar
   * circles is a normal answer rather than an error.
   */
  riseTransit(
    jdUT: number,
    body: Body,
    place: RisePlace,
    event: RiseEvent = 'rise',
  ): number | undefined {
    assertSupportedDate(jdUT);
    const planet = BODY_NUMBERS[body as Exclude<Body, 'southNode' | 'meanSouthNode'>];
    if (planet === undefined) {
      throw new EphemerisError(`Rise and set are undefined for ${String(body)}`);
    }

    const SE_CALC_RISE = 1;
    const SE_CALC_SET = 2;
    const result = this.#module().rise_trans(
      jdUT,
      planet,
      '',
      SEFLG_SWIEPH,
      event === 'rise' ? SE_CALC_RISE : SE_CALC_SET,
      [place.longitude, place.latitude, place.altitudeMetres ?? 0],
      1013.25,
      15,
    );

    // The wrapper returns null when Swiss Ephemeris reports a negative flag,
    // which includes "event not found" for a circumpolar Sun.
    if (result === null || result === undefined) return undefined;
    const tret = result[0];
    return typeof tret === 'number' && Number.isFinite(tret) && tret > 0 ? tret : undefined;
  }

  close(): void {
    this.#wasm?.close();
    this.#wasm = undefined;
    this.#currentSidMode = undefined;
  }
}
