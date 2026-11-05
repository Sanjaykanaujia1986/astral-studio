/**
 * The Square of 144: a price–time grid, not a spiral.
 *
 * Three inputs, none of them defaulted — where the grid's corner sits, what a
 * cell is worth in price, and what it is worth in bars. A grid drawn without
 * those can be placed anywhere and means nothing, which is the same objection
 * §3 makes to a fan without a scale.
 *
 * What the method actually reads are the harmonic fractions of the whole
 * square rather than the uniform cell lines, so those are emitted as named
 * levels. And the square's diagonal IS the 1×1 of `fan.ts` in the scale the
 * grid declares — derived from it here rather than recomputed, so the two
 * constructions cannot drift apart.
 *
 * docs/GANN_CONVENTIONS.md §6.
 */
import { InvalidLayoutError } from './layouts.js';
import { unitSlope, type GannScale } from './fan.js';

export interface GridAnchor {
  readonly barIndex: number;
  readonly price: number;
}

export interface GridSettings {
  readonly anchor: GridAnchor;
  /** Price units one cell spans. */
  readonly pricePerCell: number;
  /** Bars one cell spans. */
  readonly barsPerCell: number;
  /** Cells along each side. 144 by convention; any positive integer works. */
  readonly size: number;
  /** Price increases upward from the anchor when true. */
  readonly rising: boolean;
}

export const DEFAULT_GRID: Omit<GridSettings, 'anchor' | 'pricePerCell' | 'barsPerCell'> = {
  size: 144,
  rising: true,
};

/** The harmonic fractions the method reads. 1 is the full extent. */
export const HARMONICS: readonly { readonly label: string; readonly fraction: number }[] = [
  { label: '1/8', fraction: 1 / 8 },
  { label: '1/4', fraction: 1 / 4 },
  { label: '1/3', fraction: 1 / 3 },
  { label: '1/2', fraction: 1 / 2 },
  { label: '2/3', fraction: 2 / 3 },
  { label: '3/4', fraction: 3 / 4 },
  { label: '1/1', fraction: 1 },
];

export interface GridLevel {
  readonly label: string;
  readonly fraction: number;
  readonly price: number;
}

export interface GridColumn {
  readonly label: string;
  readonly fraction: number;
  readonly barIndex: number;
}

export interface PriceTimeGrid {
  readonly settings: GridSettings;
  /** Price at the far edge of the square. */
  readonly farPrice: number;
  /** Bar index at the far edge. */
  readonly farBar: number;
  readonly levels: readonly GridLevel[];
  readonly columns: readonly GridColumn[];
  /**
   * The square's diagonal, as a fan scale. Identical to a 1×1 built on this
   * scale, which is the point: the grid and the fan are the same statement
   * about price per bar seen two ways.
   */
  readonly diagonalScale: GannScale;
  /** Price units per bar along the diagonal. */
  readonly diagonalSlopePerBar: number;
}

export function buildGrid(
  settings: Pick<GridSettings, 'anchor' | 'pricePerCell' | 'barsPerCell'>
  & Partial<Pick<GridSettings, 'size' | 'rising'>>,
): PriceTimeGrid {
  const resolved: GridSettings = { ...DEFAULT_GRID, ...settings };
  const { anchor, pricePerCell, barsPerCell, size, rising } = resolved;

  if (!Number.isInteger(size) || size < 1) {
    throw new InvalidLayoutError('a grid needs a positive whole number of cells per side');
  }
  if (!(pricePerCell > 0) || !Number.isFinite(pricePerCell)) {
    throw new InvalidLayoutError('pricePerCell must be a positive, finite number');
  }
  if (!(barsPerCell > 0) || !Number.isFinite(barsPerCell)) {
    throw new InvalidLayoutError('barsPerCell must be a positive, finite number');
  }

  const priceSpan = size * pricePerCell;
  const barSpan = size * barsPerCell;
  const direction = rising ? 1 : -1;

  const diagonalScale: GannScale = { priceUnits: pricePerCell, timeUnits: barsPerCell };

  return {
    settings: resolved,
    farPrice: anchor.price + direction * priceSpan,
    farBar: anchor.barIndex + barSpan,
    levels: HARMONICS.map(({ label, fraction }) => ({
      label,
      fraction,
      price: anchor.price + direction * priceSpan * fraction,
    })),
    columns: HARMONICS.map(({ label, fraction }) => ({
      label,
      fraction,
      barIndex: anchor.barIndex + barSpan * fraction,
    })),
    diagonalScale,
    // Derived from the fan's own function, so the two cannot disagree.
    diagonalSlopePerBar: direction * unitSlope(diagonalScale),
  };
}

/** Price on the square's diagonal at a bar index. */
export function diagonalPriceAt(grid: PriceTimeGrid, barIndex: number): number {
  return grid.settings.anchor.price
    + grid.diagonalSlopePerBar * (barIndex - grid.settings.anchor.barIndex);
}

/**
 * Cell coordinates of a price and bar, 1-based as the method counts them.
 * Undefined outside the square: a point off the grid is a reason to move or
 * widen it, not to clamp it to an edge.
 */
export function cellOf(
  grid: PriceTimeGrid,
  barIndex: number,
  price: number,
): { readonly column: number; readonly row: number } | undefined {
  const { anchor, pricePerCell, barsPerCell, size, rising } = grid.settings;
  const column = Math.floor((barIndex - anchor.barIndex) / barsPerCell) + 1;
  const rawRow = (price - anchor.price) / pricePerCell * (rising ? 1 : -1);
  const row = Math.floor(rawRow) + 1;
  if (column < 1 || column > size || row < 1 || row > size) return undefined;
  return { column, row };
}
