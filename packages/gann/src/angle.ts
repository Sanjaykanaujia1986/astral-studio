/**
 * The Square of Nine: the angle of a value.
 *
 * A DIFFERENT convention from the grid in `square.ts`, and deliberately kept
 * in its own file so that nothing imports one while meaning the other. The
 * spiral angle is a smooth function of √value; the grid is a square. They
 * converge only for large values — on the inner rings they disagree by tens of
 * degrees, which is the single most common error in Square of Nine software.
 *
 * docs/GANN_CONVENTIONS.md §2.
 */
import { norm360, type Degrees } from '@astro/engine';

/** One revolution adds this much to the square root. */
export const ROOT_PER_TURN = 2;
/** Degrees per unit of √value. */
export const DEGREES_PER_ROOT = 360 / ROOT_PER_TURN;

export class NegativeRootError extends RangeError {
  readonly code = 'valueBelowOrigin';
  constructor(value: number, originValue: number) {
    super(
      `The Square of Nine angle is defined on √v, so a value (${value}) below the `
      + `origin (${originValue}) has no angle. Lower the origin instead.`,
    );
    this.name = 'NegativeRootError';
  }
}

/**
 * Spiral angle of a value, clockwise from the origin, in [0, 360).
 *
 * With origin 1 every odd square lands on 0° and every even square on 180°,
 * which is the property the construction exists for.
 */
export function spiralAngle(value: number, originValue = 1): Degrees {
  if (value < 0 || originValue < 0) throw new NegativeRootError(value, originValue);
  return norm360(DEGREES_PER_ROOT * (Math.sqrt(value) - Math.sqrt(originValue)));
}

/** Total rotation including completed turns, so 25 reads 720° rather than 0°. */
export function totalRotation(value: number, originValue = 1): Degrees {
  if (value < 0 || originValue < 0) throw new NegativeRootError(value, originValue);
  return DEGREES_PER_ROOT * (Math.sqrt(value) - Math.sqrt(originValue));
}

/**
 * The value at an angle after `turns` complete revolutions.
 *
 * `turns` is required rather than inferred: every turn gives a different value
 * for the same angle, and picking the one nearest the current price after the
 * fact is curve-fitting, not a method.
 */
export function valueAtAngle(angle: Degrees, turns: number, originValue = 1): number {
  if (originValue < 0) throw new NegativeRootError(originValue, originValue);
  const root = Math.sqrt(originValue) + (norm360(angle) / DEGREES_PER_ROOT) + ROOT_PER_TURN * turns;
  if (root < 0) {
    throw new RangeError('that angle and turn count fall below the centre of the square');
  }
  return root * root;
}

/**
 * The geometric angle of a lattice cell, clockwise from the up-right diagonal
 * — the frame `spiralAngle` uses, so the two are directly comparable.
 *
 * The centre cell has no direction and returns undefined rather than 0, which
 * would read as "due north-east".
 */
export function cellAngle(x: number, y: number): Degrees | undefined {
  if (x === 0 && y === 0) return undefined;
  // atan2 is anticlockwise from east; the spiral is clockwise from the
  // up-right diagonal, which sits at +45° in that frame.
  const anticlockwiseFromEast = (Math.atan2(y, x) * 180) / Math.PI;
  return norm360(45 - anticlockwiseFromEast);
}

/** The eight directions of the two crosses, clockwise from the odd-square arm. */
export const CROSS_ANGLES: Readonly<Record<string, Degrees>> = {
  diagonalNorthEast: 0,
  cardinalEast: 45,
  diagonalSouthEast: 90,
  cardinalSouth: 135,
  diagonalSouthWest: 180,
  cardinalWest: 225,
  diagonalNorthWest: 270,
  cardinalNorth: 315,
};
