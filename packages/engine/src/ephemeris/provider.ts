/**
 * The ephemeris provider contract.
 *
 * Everything above this interface is pure astrology; everything below is a
 * specific Swiss Ephemeris binding. Keeping the seam narrow is what allows the
 * underlying build to be replaced — for instance swapping the GPL wrapper for
 * an in-house Emscripten build, should the closed-source licensing route be
 * taken (see docs/LICENSING.md) — without touching chart logic.
 */
import type { Degrees } from '../math/angles.js';
import { julianDay } from '../time/julian.js';
import type { EngineErrorCode } from '../chart/warnings.js';
import type {
  Body,
  BodyPosition,
  HouseCusps,
  HouseSystem,
  ZodiacMode,
} from './types.js';

/**
 * Julian Day bounds of full Swiss Ephemeris precision with the bundled data.
 *
 * Determined empirically, not assumed: outside this window both the WASM build
 * and the native oracle fall back to the Moshier analytical theory and agree
 * with each other exactly, which is the signature of a shared fallback rather
 * than shared data. See docs/ASTRONOMY_NOTES.md.
 *
 * Deliberately conservative — a date marked 'moshier' that was in fact covered
 * is a harmless over-warning, whereas the reverse would be a silent accuracy
 * claim we cannot support.
 */
export const SWISS_RANGE_START_JD = julianDay({ year: 1800, month: 1, day: 1 }, 0);
export const SWISS_RANGE_END_JD = julianDay({ year: 2399, month: 12, day: 31 }, 0);

/** Moshier's own validity window, used to reject genuinely unsupported dates. */
export const MOSHIER_RANGE_START_JD = julianDay({ year: -2999, month: 1, day: 1 }, 0);
export const MOSHIER_RANGE_END_JD = julianDay({ year: 2999, month: 12, day: 31 }, 0);

/** Default speed below which a body is reported stationary, degrees/day. */
export const DEFAULT_STATIONARY_THRESHOLD = 1e-4;

export class EphemerisError extends Error {
  readonly detail?: unknown;
  /** Set where the failure is one a user can act on; see ../chart/warnings.ts. */
  readonly code?: EngineErrorCode;

  constructor(message: string, detail?: unknown, code?: EngineErrorCode) {
    super(message);
    this.name = 'EphemerisError';
    this.detail = detail;
    if (code) this.code = code;
  }
}

export class DateOutOfRangeError extends EphemerisError {
  constructor(jdUT: number) {
    super(
      `Julian Day ${jdUT.toFixed(4)} lies outside the supported range ` +
        `(3000 BCE - 3000 CE). No ephemeris can produce a result for it.`,
      { jdUT },
      'dateOutOfRange',
    );
    this.name = 'DateOutOfRangeError';
  }
}

export class HouseCalculationError extends EphemerisError {
  constructor(system: HouseSystem, latitude: Degrees, cause?: string) {
    super(
      `House system "${system}" cannot be computed at latitude ${latitude.toFixed(4)}` +
        (cause ? `: ${cause}` : '. It is undefined inside the polar circles.'),
      { system, latitude },
      'houseSystemUndefined',
    );
    this.name = 'HouseCalculationError';
  }
}

/**
 * Where the observer stands.
 *
 * `geocentric` is the centre of the Earth and the default everywhere in
 * astrology. `topocentric` is a point on its surface, which moves the Moon by
 * up to about a degree and everything else by far less. `heliocentric` is the
 * centre of the Sun, where the Earth is a planet and the Sun and Moon are not
 * bodies at all.
 */
export type ReferenceFrame = 'geocentric' | 'topocentric' | 'heliocentric';

export interface Observer {
  readonly latitude: Degrees;
  readonly longitude: Degrees;
  readonly altitudeMetres?: number;
}

export class FrameError extends EphemerisError {
  override readonly code = 'frameUnsupported';
  constructor(message: string) {
    super(message);
    this.name = 'FrameError';
  }
}

export interface CalcOptions {
  readonly zodiac?: ZodiacMode;
  /** Also compute right ascension and declination (costs a second call). */
  readonly includeEquatorial?: boolean;
  readonly stationaryThreshold?: number;
  /** Defaults to geocentric. */
  readonly frame?: ReferenceFrame;
  /** Required for `topocentric`; ignored otherwise. */
  readonly observer?: Observer;
}

export type RiseEvent = 'rise' | 'set';

export interface RisePlace {
  readonly latitude: Degrees;
  readonly longitude: Degrees;
  readonly altitudeMetres?: number;
}

export interface HouseOptions {
  readonly zodiac?: ZodiacMode;
  /**
   * System to fall back to when the requested one is undefined at this
   * latitude. Set to 'none' to raise instead. Defaults to 'porphyry'.
   */
  readonly polarFallback?: HouseSystem | 'none';
}

export interface EphemerisProvider {
  init(): Promise<void>;
  /** Position of one body at a Julian Day in UT. */
  calc(jdUT: number, body: Body, options?: CalcOptions): BodyPosition;
  /** Positions of several bodies at one instant. */
  calcMany(jdUT: number, bodies: readonly Body[], options?: CalcOptions): BodyPosition[];
  houses(
    jdUT: number,
    latitude: Degrees,
    longitude: Degrees,
    system: HouseSystem,
    options?: HouseOptions,
  ): HouseCusps;
  /** Ayanamsha value at an instant, for the configured sidereal mode. */
  ayanamsha(jdUT: number, zodiac: ZodiacMode): Degrees;
  /**
   * Rise or set of a body at a place, searching forward from `jdUT`.
   *
   * Returns undefined when the event does not occur — inside the polar circles
   * the Sun may neither rise nor set for weeks, and a caller must be able to
   * tell "no sunrise today" from "sunrise at midnight". Never substitute one
   * for the other.
   */
  riseTransit(
    jdUT: number,
    body: Body,
    place: RisePlace,
    event?: RiseEvent,
  ): number | undefined;
  close(): void;
}

/**
 * Which ephemeris will actually serve a given instant.
 *
 * Callers use this to label results, and the chart layer uses it to attach a
 * precision warning rather than presenting degraded data as full precision.
 */
export function sourceForJd(jdUT: number): 'swiss' | 'moshier' {
  return jdUT >= SWISS_RANGE_START_JD && jdUT <= SWISS_RANGE_END_JD ? 'swiss' : 'moshier';
}

export function assertSupportedDate(jdUT: number): void {
  if (!Number.isFinite(jdUT)) {
    throw new EphemerisError(`Julian Day must be a finite number, received ${jdUT}`);
  }
  if (jdUT < MOSHIER_RANGE_START_JD || jdUT > MOSHIER_RANGE_END_JD) {
    throw new DateOutOfRangeError(jdUT);
  }
}
