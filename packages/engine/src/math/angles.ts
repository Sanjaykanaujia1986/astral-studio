/**
 * Angle utilities.
 *
 * Every angular value in the engine passes through these functions. Inline
 * `% 360` is banned project-wide: it returns negative results for negative
 * inputs, which silently corrupts aspect and house arithmetic.
 *
 * All values are in degrees unless a name says otherwise.
 */

/** Longitude in degrees. Branded to stop formatted display strings re-entering maths. */
export type Degrees = number;

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, received ${value}`);
  }
}

/**
 * Normalise any angle into `[0, 360)`.
 *
 * Negative inputs wrap correctly: `norm360(-1) === 359`.
 * Negative zero is collapsed to `0` so downstream equality checks behave.
 */
export function norm360(deg: number): Degrees {
  assertFinite(deg, 'angle');
  const r = deg % 360;
  if (r === 0) return 0; // also collapses -0
  return r < 0 ? r + 360 : r;
}

/**
 * Normalise any angle into `(-180, 180]`.
 *
 * Used for signed separations, where the sign carries the direction of the
 * shorter arc from `b` to `a`.
 */
export function norm180(deg: number): Degrees {
  const r = norm360(deg);
  return r > 180 ? r - 360 : r;
}

/**
 * Signed shortest angular difference `a - b`, in `(-180, 180]`.
 *
 * Positive means `a` lies counter-clockwise (in increasing longitude) of `b`
 * by the shorter arc.
 */
export function signedDelta(a: Degrees, b: Degrees): Degrees {
  return norm180(a - b);
}

/**
 * Unsigned shortest angular separation between two longitudes, in `[0, 180]`.
 */
export function separation(a: Degrees, b: Degrees): Degrees {
  return Math.abs(norm180(a - b));
}

/**
 * Midpoint of the shorter arc between two longitudes, in `[0, 360)`.
 *
 * For exactly opposite points the arc is ambiguous; the midpoint advancing
 * counter-clockwise from `a` is returned so the result stays deterministic.
 */
export function midpoint(a: Degrees, b: Degrees): Degrees {
  return norm360(a + norm180(b - a) / 2);
}

/**
 * Make a sequence of longitudes continuous by removing 360° wraps, so that a
 * root finder sees a smooth function rather than a saw-tooth.
 *
 * The first element is returned unchanged; each subsequent element is shifted
 * by whole turns to sit within 180° of its predecessor.
 */
export function unwrap(series: readonly number[]): number[] {
  const out: number[] = [];
  let offset = 0;
  let previous: number | undefined;
  for (const raw of series) {
    assertFinite(raw, 'angle');
    if (previous === undefined) {
      out.push(raw);
      previous = raw;
      continue;
    }
    const step = norm180(raw - previous);
    offset += step;
    const value = out[0]! + offset;
    out.push(value);
    previous = raw;
  }
  return out;
}

/** Split a longitude into zodiac sign index (0-11) and degrees within the sign. */
export function splitSign(longitude: Degrees): { sign: number; degreesInSign: Degrees } {
  const lon = norm360(longitude);
  const sign = Math.floor(lon / 30);
  return { sign, degreesInSign: lon - sign * 30 };
}

/** Convert decimal degrees to degrees / arcminutes / arcseconds for DISPLAY ONLY. */
export function toDms(deg: Degrees): { d: number; m: number; s: number; negative: boolean } {
  assertFinite(deg, 'angle');
  const negative = deg < 0;
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const remainderMinutes = (abs - d) * 60;
  const m = Math.floor(remainderMinutes);
  const s = (remainderMinutes - m) * 60;
  return { d, m, s, negative };
}
