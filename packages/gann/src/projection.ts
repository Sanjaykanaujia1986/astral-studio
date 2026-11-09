/**
 * Planetary longitude projected onto a price axis.
 *
 * Both mappings take every factor as an input. Neither has a default, and
 * neither searches for the factor that best fits a series — that search is
 * what turns a drawing into a claim, and it belongs in `packages/research`
 * where it would come back with a p-value and a correction attached.
 *
 * docs/GANN_CONVENTIONS.md §5.
 */
import { norm360, type Degrees } from '@astro/engine';
import { valueAtAngle } from './angle.js';

export type ProjectionMethod = 'linear' | 'square';

export interface ZodiacContext {
  readonly kind: 'tropical' | 'sidereal';
  /** Present only when sidereal; the two differ by roughly 24°. */
  readonly ayanamsha?: string;
}

export interface LinearProjectionSettings {
  readonly method: 'linear';
  /** Price at the anchor longitude. */
  readonly basePrice: number;
  readonly baseLongitude: Degrees;
  /** Price units per degree of longitude. */
  readonly unitsPerDegree: number;
}

export interface SquareProjectionSettings {
  readonly method: 'square';
  readonly originValue: number;
  /** Which revolution of the square to read. Required; see the conventions. */
  readonly turns: number;
}

export type ProjectionSettings = LinearProjectionSettings | SquareProjectionSettings;

export interface ProjectedPrice {
  readonly body: string;
  readonly longitude: Degrees;
  readonly price: number;
  readonly method: ProjectionMethod;
  readonly zodiac: ZodiacContext;
  /** Human-checkable restatement of the arithmetic, shown in the UI. */
  readonly derivation: string;
}

/**
 * A number as a reader would write it.
 *
 * The derivation exists to be checked by hand, and real price feeds carry
 * float32 artifacts — a close of 1226.40 arrives as 1226.4000244140625 and
 * printed seventeen digits of it into a line of arithmetic whose result was
 * shown to two. Four decimals keeps anything a price can genuinely carry,
 * including forex, and drops the binary tail. The CALCULATION is untouched;
 * only the restatement of it is trimmed.
 */
function readable(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return String(Number(value.toFixed(4)));
}

export function projectLongitude(
  body: string,
  longitude: Degrees,
  settings: ProjectionSettings,
  zodiac: ZodiacContext,
): ProjectedPrice {
  const lon = norm360(longitude);

  if (settings.method === 'linear') {
    const delta = lon - settings.baseLongitude;
    const price = settings.basePrice + delta * settings.unitsPerDegree;
    return {
      body,
      longitude: lon,
      price,
      method: 'linear',
      zodiac,
      derivation:
        `${readable(settings.basePrice)} + (${lon.toFixed(4)}° − ${readable(settings.baseLongitude)}°)`
        + ` × ${readable(settings.unitsPerDegree)}`,
    };
  }

  const price = valueAtAngle(lon, settings.turns, settings.originValue);
  return {
    body,
    longitude: lon,
    price,
    method: 'square',
    zodiac,
    derivation:
      `(√${readable(settings.originValue)} + ${lon.toFixed(4)}°/180°`
      + ` + 2×${settings.turns})²`,
  };
}

export interface BodyLongitude {
  readonly body: string;
  readonly longitude: Degrees;
}

export function projectAll(
  bodies: readonly BodyLongitude[],
  settings: ProjectionSettings,
  zodiac: ZodiacContext,
): readonly ProjectedPrice[] {
  return bodies.map((b) => projectLongitude(b.body, b.longitude, settings, zodiac));
}

/**
 * The turn whose price sits closest to a reference price.
 *
 * Offered as a NAVIGATION aid for the square method — without it a reader has
 * to guess which revolution is even on the chart — and returned separately
 * from `projectLongitude`, which still requires the turn to be chosen. Using
 * this to pick the turn and then presenting the result as a prediction is
 * fitting after the fact; the UI says so where it offers the button.
 */
export function nearestTurn(
  longitude: Degrees,
  referencePrice: number,
  originValue: number,
  maxTurns = 60,
): number {
  let best = 0;
  let smallest = Infinity;
  for (let turns = 0; turns <= maxTurns; turns += 1) {
    const distance = Math.abs(valueAtAngle(longitude, turns, originValue) - referencePrice);
    if (distance < smallest) { smallest = distance; best = turns; }
  }
  return best;
}
