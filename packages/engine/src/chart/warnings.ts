/**
 * Structured chart warnings.
 *
 * The engine emits CODES with parameters, never prose. Two reasons:
 *
 *  - The engine is the calculation layer. Baking English sentences into it
 *    would make the whole product monolingual from the inside out, and no
 *    amount of UI translation could reach them.
 *  - Tests that assert on a code survive rewording; tests that match on a
 *    sentence break every time the copy is polished.
 *
 * Rendering lives in @astro/i18n, which has a catalogue entry per code.
 */

export type ChartWarningCode =
  /** No birth time supplied: houses, angles and house placements are omitted. */
  | 'birthTimeUnknown'
  /** The stated wall-clock time occurred twice (clocks went back). */
  | 'timeAmbiguous'
  /** The stated wall-clock time never occurred (clocks went forward). */
  | 'timeNonexistent'
  /** Date is outside the high-precision ephemeris range; Moshier was used. */
  | 'lowPrecisionEphemeris'
  /** Requested house system is undefined at this latitude; a fallback was used. */
  | 'houseSystemFallback';

export interface ChartWarning {
  readonly code: ChartWarningCode;
  /** Values to interpolate into the rendered message. */
  readonly params?: Readonly<Record<string, string | number>>;
}

/** Error codes on engine exceptions that can reach a user. */
export type EngineErrorCode =
  | 'timeDoesNotExist'
  | 'unknownTimeZone'
  | 'implausibleOffset'
  | 'dateOutOfRange'
  | 'houseSystemUndefined'
  | 'invalidCoordinates'
  | 'frameUnsupported';
