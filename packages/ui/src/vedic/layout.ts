/**
 * Geometry for the two traditional Indian chart layouts.
 *
 * Pure coordinates, no React — so the tiling can be tested as arithmetic
 * rather than by looking at a picture.
 *
 * ## The two are not styles of one chart
 *
 * **South Indian**: the twelve SIGNS sit in fixed cells of a 4x4 ring, always
 * in the same place; the houses move, and the lagna is marked.
 *
 * **North Indian**: the twelve HOUSES sit in fixed positions of a diamond,
 * always with the first house at the top; the signs move.
 *
 * Confusing them produces a chart that is readable and wrong, which is why the
 * data each needs is different and the two functions below take different
 * arguments.
 */

export type VedicLayoutStyle = 'north' | 'south';

export interface LayoutCell {
  /** Polygon in a unit square, (0,0) top-left. */
  readonly points: readonly (readonly [x: number, y: number])[];
  /** Where a label sits inside the cell. */
  readonly label: readonly [x: number, y: number];
  /** Where the list of bodies starts. */
  readonly content: readonly [x: number, y: number];
}

/**
 * South Indian: signs fixed, clockwise from Pisces at the top-left.
 *
 * The ring order is a convention, not a choice — every South Indian chart
 * places Aries at the second cell of the top row, and a reader navigates by
 * that muscle memory. The index of this array IS the sign index.
 */
const SOUTH_CELLS: readonly (readonly [row: number, col: number])[] = [
  [0, 1], // Aries
  [0, 2], // Taurus
  [0, 3], // Gemini
  [1, 3], // Cancer
  [2, 3], // Leo
  [3, 3], // Virgo
  [3, 2], // Libra
  [3, 1], // Scorpio
  [3, 0], // Sagittarius
  [2, 0], // Capricorn
  [1, 0], // Aquarius
  [0, 0], // Pisces
];

/** Cells of the South Indian grid, indexed by SIGN (0 = Aries). */
export function southIndianCells(): readonly LayoutCell[] {
  const q = 0.25;
  return SOUTH_CELLS.map(([row, col]) => {
    const x = col * q;
    const y = row * q;
    return {
      points: [[x, y], [x + q, y], [x + q, y + q], [x, y + q]],
      label: [x + 0.018, y + 0.045],
      content: [x + 0.018, y + 0.1],
    };
  });
}

/**
 * North Indian: houses fixed, indexed by HOUSE (0 = first house).
 *
 * The square is cut by both diagonals and by the four lines joining the
 * midpoints of the sides. That yields four diamonds (houses 1, 4, 7, 10 — the
 * kendras, at top, left, bottom and right) and eight triangles. Twelve regions
 * that tile the square exactly, which `northIndianCells` is tested for.
 */
export function northIndianCells(): readonly LayoutCell[] {
  const cells: readonly (readonly (readonly [number, number])[])[] = [
    [[0.5, 0], [0.25, 0.25], [0.5, 0.5], [0.75, 0.25]],   // 1  top diamond
    [[0, 0], [0.5, 0], [0.25, 0.25]],                      // 2  top-left
    [[0, 0], [0.25, 0.25], [0, 0.5]],                      // 3  left-top
    [[0, 0.5], [0.25, 0.25], [0.5, 0.5], [0.25, 0.75]],    // 4  left diamond
    [[0, 0.5], [0.25, 0.75], [0, 1]],                      // 5  left-bottom
    [[0, 1], [0.25, 0.75], [0.5, 1]],                      // 6  bottom-left
    [[0.5, 1], [0.25, 0.75], [0.5, 0.5], [0.75, 0.75]],    // 7  bottom diamond
    [[0.5, 1], [0.75, 0.75], [1, 1]],                      // 8  bottom-right
    [[1, 1], [0.75, 0.75], [1, 0.5]],                      // 9  right-bottom
    [[1, 0.5], [0.75, 0.75], [0.5, 0.5], [0.75, 0.25]],    // 10 right diamond
    [[1, 0.5], [0.75, 0.25], [1, 0]],                      // 11 right-top
    [[1, 0], [0.75, 0.25], [0.5, 0]],                      // 12 top-right
  ];

  return cells.map((points) => {
    const centroid = polygonCentroid(points);
    return {
      points,
      // The sign number sits slightly above centre and the bodies below it, so
      // a crowded house does not overprint its own label.
      label: [centroid[0], centroid[1] - 0.055],
      content: [centroid[0], centroid[1] + 0.02],
    };
  });
}

/**
 * Area-weighted centroid.
 *
 * Not the mean of the vertices: for the triangles that would sit visibly off
 * centre, and for the diamonds it happens to agree, so the error would show in
 * only two thirds of the chart and look like a rendering glitch.
 */
export function polygonCentroid(
  points: readonly (readonly [number, number])[],
): readonly [number, number] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (area === 0) {
    // Degenerate: fall back to the vertex mean rather than dividing by zero.
    const n = points.length;
    return [
      points.reduce((s, p) => s + p[0], 0) / n,
      points.reduce((s, p) => s + p[1], 0) / n,
    ];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

/** Signed area of a polygon, for the tiling test. */
export function polygonArea(points: readonly (readonly [number, number])[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    area += x0 * y1 - x1 * y0;
  }
  return Math.abs(area / 2);
}

/**
 * Which sign each cell shows.
 *
 * South Indian: cell index IS the sign, so the lagna does not move anything.
 * North Indian: house 1 carries the lagna's sign and the rest follow in
 * zodiacal order, so the whole set rotates with the lagna.
 */
export function signForCell(
  style: VedicLayoutStyle,
  cellIndex: number,
  lagnaSignIndex: number,
): number {
  return style === 'south' ? cellIndex : (lagnaSignIndex + cellIndex) % 12;
}

/** Which house each cell is, given the layout. */
export function houseForCell(
  style: VedicLayoutStyle,
  cellIndex: number,
  lagnaSignIndex: number,
): number {
  return style === 'north'
    ? cellIndex + 1
    : ((cellIndex - lagnaSignIndex + 12) % 12) + 1;
}

/** Where one graha's glyph sits, in unit coordinates, with its size multiplier. */
export interface BodySlot {
  readonly x: number;
  readonly y: number;
  /** Multiplier on the base glyph size. Below 1 when the cell is crowded. */
  readonly scale: number;
}

/** Base glyph height and line spacing, as fractions of the figure's side. */
const GLYPH_SIZE = 0.038;
const LINE_HEIGHT = 0.042;
const COLUMN_WIDTH = 0.072;

/**
 * Positions for the grahas inside one cell.
 *
 * A single downward stack is correct up to three bodies and wrong beyond it:
 * the North Indian cells are triangles and diamonds, so a column that keeps
 * growing leaves the cell through its sloping edge. A stellium of five in one
 * rāśi is ordinary, and it was drawing straight across the chart's own lines.
 *
 * So the block wraps into columns and shrinks, and — because the cells narrow
 * towards their points — it is centred on the cell's content anchor rather
 * than hung below it.
 *
 * Pure geometry, kept out of the figure so that "every glyph lands inside its
 * own cell" is a test rather than a thing someone notices in a screenshot.
 */
export function bodySlots(
  cell: LayoutCell,
  count: number,
  style: VedicLayoutStyle,
): readonly BodySlot[] {
  if (count <= 0) return [];

  // South cells are full squares and take a taller column than the north's
  // triangles, which taper exactly where a fourth glyph would land.
  const maxRows = style === 'south' ? 4 : 3;
  const columns = Math.ceil(count / maxRows);
  const perColumn = Math.ceil(count / columns);

  // One step down per extra column, floored so a crowded cell stays legible
  // rather than becoming a smudge.
  const scale = Math.max(0.62, 1 - (columns - 1) * 0.22);

  const [anchorX, anchorY] = cell.content;
  const lineHeight = LINE_HEIGHT * scale;
  const columnWidth = COLUMN_WIDTH * scale;

  return Array.from({ length: count }, (_, index) => {
    const column = Math.floor(index / perColumn);
    const row = index % perColumn;
    const rowsHere = Math.min(perColumn, count - column * perColumn);

    return {
      // The south layout anchors text at its start, so its columns run right
      // from the anchor; the north centres them on it.
      x: style === 'south'
        ? anchorX + column * columnWidth
        : anchorX + (column - (columns - 1) / 2) * columnWidth,
      y: anchorY + (row - (rowsHere - 1) / 2) * lineHeight,
      scale,
    };
  });
}

export { GLYPH_SIZE, LINE_HEIGHT };
