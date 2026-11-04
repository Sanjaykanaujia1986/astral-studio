/**
 * The Square of Nine: the grid.
 *
 * A spiral of values on a square lattice, built from coordinates outward
 * rather than from a closed-form formula on the value. The two crosses that
 * make the square useful — cardinal and diagonal — are then geometric facts
 * about a cell, which keeps them correct under any origin value, any increment
 * and either handedness. A formula like "odd squares are on the diagonal" is
 * true only for origin 1, increment 1, clockwise, and fails silently for every
 * other setting.
 *
 * Conventions, including why clockwise-from-the-right is the default:
 * docs/GANN_CONVENTIONS.md §1.
 */

export type SpiralDirection = 'clockwise' | 'anticlockwise';

export interface SquareSettings {
  /** Value in the centre cell. */
  readonly originValue: number;
  /** Added from one cell to the next along the spiral. */
  readonly increment: number;
  readonly direction: SpiralDirection;
  /** How many rings around the centre. Ring 0 is the centre cell alone. */
  readonly rings: number;
}

export const DEFAULT_SQUARE: SquareSettings = {
  originValue: 1,
  increment: 1,
  direction: 'clockwise',
  rings: 5,
};

export interface SquareCell {
  readonly value: number;
  /** Lattice coordinates; x right, y up, centre at (0, 0). */
  readonly x: number;
  readonly y: number;
  /** 0 for the centre cell. */
  readonly ring: number;
  /** Index along the spiral, 0 at the centre. */
  readonly step: number;
  /** Due north, south, east or west of centre. Never true for the centre. */
  readonly onCardinalCross: boolean;
  /** On either full diagonal. Never true for the centre. */
  readonly onDiagonalCross: boolean;
}

export interface SquareOfNine {
  readonly settings: SquareSettings;
  readonly cells: readonly SquareCell[];
  /** Side length in cells: 2 × rings + 1. */
  readonly side: number;
}

/** Ring of a lattice cell: the Chebyshev distance from the centre. */
export function ringOf(x: number, y: number): number {
  return Math.max(Math.abs(x), Math.abs(y));
}

/**
 * The lattice path, centre outward.
 *
 * Clockwise from the centre: right, then down the right side, left along the
 * bottom, up the left side, right along the top, and one step right to begin
 * the next ring. Anticlockwise is the mirror image in y, which is why it is
 * produced by negating y rather than by a second hand-written walk — two walks
 * would be two chances to get a corner wrong.
 */
function* spiralPath(rings: number, direction: SpiralDirection): Generator<[number, number]> {
  const flip = direction === 'clockwise' ? 1 : -1;
  yield [0, 0];
  for (let r = 1; r <= rings; r += 1) {
    // Enter the ring one step to the right of the previous ring's last corner.
    let x = r;
    let y = flip * (r - 1);
    yield [x, y];
    // Down the right side to the bottom-right corner.
    for (let i = 0; i < 2 * r - 1; i += 1) { y -= flip; yield [x, y]; }
    // Left along the bottom.
    for (let i = 0; i < 2 * r; i += 1) { x -= 1; yield [x, y]; }
    // Up the left side.
    for (let i = 0; i < 2 * r; i += 1) { y += flip; yield [x, y]; }
    // Right along the top, ending on this ring's top-right corner.
    for (let i = 0; i < 2 * r; i += 1) { x += 1; yield [x, y]; }
  }
}

export function buildSquare(settings: Partial<SquareSettings> = {}): SquareOfNine {
  const resolved: SquareSettings = { ...DEFAULT_SQUARE, ...settings };
  if (!Number.isInteger(resolved.rings) || resolved.rings < 0) {
    throw new RangeError('rings must be a non-negative integer');
  }
  if (resolved.increment === 0) throw new RangeError('increment must not be zero');

  const cells: SquareCell[] = [];
  let step = 0;
  for (const [x, y] of spiralPath(resolved.rings, resolved.direction)) {
    cells.push({
      value: resolved.originValue + step * resolved.increment,
      x,
      y,
      ring: ringOf(x, y),
      step,
      onCardinalCross: (x === 0) !== (y === 0),
      onDiagonalCross: Math.abs(x) === Math.abs(y) && x !== 0,
    });
    step += 1;
  }

  return { settings: resolved, cells, side: 2 * resolved.rings + 1 };
}

/** The cell holding a value, or undefined if it is not on the built square. */
export function cellForValue(square: SquareOfNine, value: number): SquareCell | undefined {
  const { originValue, increment } = square.settings;
  const steps = (value - originValue) / increment;
  if (!Number.isInteger(steps) || steps < 0) return undefined;
  return square.cells[steps];
}

export function cellAt(square: SquareOfNine, x: number, y: number): SquareCell | undefined {
  return square.cells.find((cell) => cell.x === x && cell.y === y);
}
