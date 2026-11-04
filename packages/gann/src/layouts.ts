/**
 * The circle and the polygon spiral.
 *
 * Two constructions that are NOT the Square of Nine with different edges.
 *
 * The circle's angle is linear in the value; the square's is linear in its
 * square root (`angle.ts`). On a wheel of 24, values 24 apart share a degree
 * forever. On the square, values a full turn apart grow further apart as you
 * go out. Offering both and leaving the reader to assume they agree is the
 * defect this file is arranged to prevent, which is why neither function here
 * imports the other's.
 *
 * docs/GANN_CONVENTIONS.md §6.
 */
import { norm360, type Degrees } from '@astro/engine';

// ------------------------------------------------------------------ circle

export interface CircleSettings {
  /** Cells in one full turn. 24 is the "wheel of 24". */
  readonly divisions: number;
  readonly originValue: number;
  readonly increment: number;
  /** How many complete turns to lay out. */
  readonly turns: number;
}

export const DEFAULT_CIRCLE: CircleSettings = {
  divisions: 24,
  originValue: 1,
  increment: 1,
  turns: 3,
};

export interface CircleCell {
  readonly value: number;
  /** Degrees clockwise from the top. */
  readonly angle: Degrees;
  /** 0 for the innermost turn. */
  readonly turn: number;
  /** Position within the turn, 0 at the top. */
  readonly division: number;
}

export interface CircleChart {
  readonly settings: CircleSettings;
  readonly cells: readonly CircleCell[];
}

export class InvalidLayoutError extends RangeError {
  readonly code = 'invalidGannLayout';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLayoutError';
  }
}

/** Angle of a value on the wheel: linear in the value, not in its root. */
export function circleAngle(
  value: number,
  settings: Pick<CircleSettings, 'divisions' | 'originValue' | 'increment'>,
): Degrees {
  const { divisions, originValue, increment } = settings;
  if (divisions < 1) throw new InvalidLayoutError('a wheel needs at least one division');
  if (increment === 0) throw new InvalidLayoutError('increment must not be zero');
  return norm360(((value - originValue) / increment) * (360 / divisions));
}

/** Which turn a value falls on. Negative for values below the origin. */
export function circleTurn(
  value: number,
  settings: Pick<CircleSettings, 'divisions' | 'originValue' | 'increment'>,
): number {
  const steps = (value - settings.originValue) / settings.increment;
  return Math.floor(steps / settings.divisions);
}

export function buildCircle(settings: Partial<CircleSettings> = {}): CircleChart {
  const resolved: CircleSettings = { ...DEFAULT_CIRCLE, ...settings };
  if (!Number.isInteger(resolved.divisions) || resolved.divisions < 1) {
    throw new InvalidLayoutError('divisions must be a positive integer');
  }
  if (!Number.isInteger(resolved.turns) || resolved.turns < 1) {
    throw new InvalidLayoutError('turns must be a positive integer');
  }
  if (resolved.increment === 0) throw new InvalidLayoutError('increment must not be zero');

  const cells: CircleCell[] = [];
  for (let turn = 0; turn < resolved.turns; turn += 1) {
    for (let division = 0; division < resolved.divisions; division += 1) {
      const step = turn * resolved.divisions + division;
      cells.push({
        value: resolved.originValue + step * resolved.increment,
        angle: norm360(division * (360 / resolved.divisions)),
        turn,
        division,
      });
    }
  }
  return { settings: resolved, cells };
}

/** Values that share a degree of the wheel with this one, within the chart. */
export function sameDegree(chart: CircleChart, value: number): readonly number[] {
  const angle = circleAngle(value, chart.settings);
  return chart.cells
    .filter((cell) => Math.abs(cell.angle - angle) < 1e-9)
    .map((cell) => cell.value);
}

// ---------------------------------------------------------- polygon spiral

export interface PolygonSettings {
  /** Sides. 6 is the hexagon chart; 3 and up are allowed. */
  readonly sides: number;
  readonly rings: number;
  readonly originValue: number;
  readonly increment: number;
}

export const DEFAULT_POLYGON: PolygonSettings = {
  sides: 6,
  rings: 4,
  originValue: 1,
  increment: 1,
};

export interface PolygonCell {
  readonly value: number;
  /** 0 for the centre. */
  readonly ring: number;
  /** Position within the ring, 0 at the top, clockwise. */
  readonly index: number;
  /** Degrees clockwise from the top. Undefined for the centre, which has none. */
  readonly angle?: Degrees;
  /** Radius in ring units. */
  readonly radius: number;
  /** True at a vertex of the polygon — the cells the method is about. */
  readonly corner: boolean;
}

export interface PolygonChart {
  readonly settings: PolygonSettings;
  readonly cells: readonly PolygonCell[];
}

/** Cells through ring r inclusive: 1 + S·r(r+1)/2. */
export function polygonCellCount(sides: number, rings: number): number {
  return 1 + (sides * rings * (rings + 1)) / 2;
}

export function buildPolygon(settings: Partial<PolygonSettings> = {}): PolygonChart {
  const resolved: PolygonSettings = { ...DEFAULT_POLYGON, ...settings };
  if (!Number.isInteger(resolved.sides) || resolved.sides < 3) {
    throw new InvalidLayoutError('a polygon needs at least three sides');
  }
  if (!Number.isInteger(resolved.rings) || resolved.rings < 0) {
    throw new InvalidLayoutError('rings must be a non-negative integer');
  }
  if (resolved.increment === 0) throw new InvalidLayoutError('increment must not be zero');

  const cells: PolygonCell[] = [{
    value: resolved.originValue,
    ring: 0,
    index: 0,
    radius: 0,
    // The centre is not a vertex: it has no direction, so calling it a corner
    // would put it in every corner list.
    corner: false,
  }];

  let step = 1;
  for (let ring = 1; ring <= resolved.rings; ring += 1) {
    const inRing = resolved.sides * ring;
    for (let index = 0; index < inRing; index += 1) {
      cells.push({
        value: resolved.originValue + step * resolved.increment,
        ring,
        index,
        angle: norm360((360 * index) / inRing),
        radius: ring,
        // Vertices fall every `ring` cells: ring 2 of a hexagon has 12 cells
        // and 6 corners, at 0, 2, 4, 6, 8, 10.
        corner: index % ring === 0,
      });
      step += 1;
    }
  }

  return { settings: resolved, cells };
}

/** Lattice position of a cell, in ring units, y up. */
export function polygonPoint(cell: PolygonCell): readonly [number, number] {
  if (cell.angle === undefined) return [0, 0];
  const radians = (cell.angle * Math.PI) / 180;
  // Clockwise from straight up.
  return [cell.radius * Math.sin(radians), cell.radius * Math.cos(radians)];
}

export function polygonCorners(chart: PolygonChart): readonly PolygonCell[] {
  return chart.cells.filter((cell) => cell.corner);
}
