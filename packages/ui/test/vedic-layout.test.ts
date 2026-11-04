/**
 * The two Indian chart layouts, tested as arithmetic.
 *
 * A chart figure is easy to eyeball and hard to check by eye: a cell that
 * overlaps its neighbour by two percent, or a centroid that sits just outside
 * its own polygon, looks fine and misplaces a planet. These are the properties
 * that have to hold.
 */
import { describe, it, expect } from 'vitest';
import {
  northIndianCells, southIndianCells, polygonArea, polygonCentroid,
  signForCell, houseForCell, bodySlots,
} from '../src/vedic/layout.js';

/** Even-odd point-in-polygon, for the containment check. */
function contains(points: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

describe.each([
  // Expected covered area differs by design, and that is the point:
  // the North Indian diamond fills the square, while the South Indian ring
  // leaves its middle 2x2 (0.25 of the area) empty for the chart's title.
  ['north', northIndianCells(), 1],
  ['south', southIndianCells(), 0.75],
] as const)('%s Indian layout', (_name, cells, expectedArea) => {
  it('has exactly twelve cells', () => {
    expect(cells).toHaveLength(12);
  });

  it('covers exactly the area its layout is meant to', () => {
    /*
     * Summing the areas proves the twelve regions neither leave a gap nor
     * double-count — combined with the overlap check below. A layout that
     * merely looks right can easily come to 0.97.
     *
     * The two totals differ because the layouts do: the North Indian diamond
     * tiles the whole square, the South Indian ring is twelve cells of 1/16
     * around an empty centre.
     */
    const total = cells.reduce((sum, cell) => sum + polygonArea(cell.points), 0);
    expect(total).toBeCloseTo(expectedArea, 10);
  });

  it('stays inside the square', () => {
    for (const cell of cells) {
      for (const [x, y] of cell.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('puts every label and content anchor inside its own cell', () => {
    // A centroid that falls outside its polygon writes a planet into the
    // neighbouring house, which is indistinguishable from a calculation bug.
    cells.forEach((cell, index) => {
      const [cx, cy] = polygonCentroid(cell.points);
      expect(contains(cell.points, cx, cy), `cell ${index} centroid`).toBe(true);
    });
  });

  it('does not overlap: no cell centroid lies in another cell', () => {
    cells.forEach((cell, i) => {
      const [cx, cy] = polygonCentroid(cell.points);
      cells.forEach((other, j) => {
        if (i === j) return;
        expect(contains(other.points, cx, cy), `cell ${i} centroid inside cell ${j}`).toBe(false);
      });
    });
  });
});

describe('polygonCentroid', () => {
  it('is area-weighted, not the mean of the vertices', () => {
    /*
     * For a right triangle the two differ. Using the vertex mean would be
     * correct for the four diamonds and wrong for the eight triangles — an
     * error visible in two thirds of a North Indian chart and easily mistaken
     * for a rendering glitch.
     */
    const triangle = [[0, 0], [1, 0], [0, 1]] as const;
    const [cx, cy] = polygonCentroid(triangle);
    expect(cx).toBeCloseTo(1 / 3, 12);
    expect(cy).toBeCloseTo(1 / 3, 12);
  });

  it('gives the centre of a square', () => {
    const [cx, cy] = polygonCentroid([[0, 0], [1, 0], [1, 1], [0, 1]]);
    expect(cx).toBeCloseTo(0.5, 12);
    expect(cy).toBeCloseTo(0.5, 12);
  });

  it('falls back to the vertex mean on a degenerate polygon', () => {
    const [cx] = polygonCentroid([[0, 0], [1, 0], [0, 0], [1, 0]]);
    expect(Number.isFinite(cx)).toBe(true);
  });
});

describe('the South Indian ring', () => {
  const cells = southIndianCells();

  it('places Aries in the second cell of the top row', () => {
    // Every South Indian chart does; a reader navigates by that muscle memory.
    const aries = cells[0]!;
    expect(aries.points[0]).toEqual([0.25, 0]);
  });

  it('runs clockwise, with Pisces in the top-left corner', () => {
    expect(cells[11]!.points[0]).toEqual([0, 0]);
    expect(cells[2]!.points[0]).toEqual([0.75, 0]);   // Gemini, top-right
    expect(cells[5]!.points[0]).toEqual([0.75, 0.75]); // Virgo, bottom-right
    expect(cells[8]!.points[0]).toEqual([0, 0.75]);   // Sagittarius, bottom-left
  });

  it('leaves the middle four cells empty', () => {
    // The centre of a South Indian chart carries no sign; it is where the
    // chart's title goes.
    for (const cell of cells) {
      const [cx, cy] = polygonCentroid(cell.points);
      const inMiddle = cx > 0.25 && cx < 0.75 && cy > 0.25 && cy < 0.75;
      expect(inMiddle).toBe(false);
    }
  });
});

describe('what each layout holds fixed', () => {
  it('South Indian fixes the SIGNS — the lagna does not move them', () => {
    for (let lagna = 0; lagna < 12; lagna++) {
      for (let cell = 0; cell < 12; cell++) {
        expect(signForCell('south', cell, lagna)).toBe(cell);
      }
    }
  });

  it('South Indian moves the HOUSES with the lagna', () => {
    expect(houseForCell('south', 0, 0)).toBe(1);   // lagna in Aries
    expect(houseForCell('south', 0, 3)).toBe(10);  // lagna in Cancer
  });

  it('North Indian fixes the HOUSES — house 1 is always the top cell', () => {
    for (let lagna = 0; lagna < 12; lagna++) {
      expect(houseForCell('north', 0, lagna)).toBe(1);
      expect(houseForCell('north', 6, lagna)).toBe(7);
    }
  });

  it('North Indian rotates the SIGNS with the lagna', () => {
    expect(signForCell('north', 0, 5)).toBe(5);    // house 1 shows the lagna sign
    expect(signForCell('north', 1, 5)).toBe(6);    // then zodiacal order
    expect(signForCell('north', 11, 5)).toBe(4);   // wrapping at Pisces
  });

  it('agrees with itself: the lagna is in house 1 in both layouts', () => {
    // The single invariant both must satisfy, whatever they hold fixed.
    for (let lagna = 0; lagna < 12; lagna++) {
      const southCell = [...Array(12).keys()].find((c) => signForCell('south', c, lagna) === lagna)!;
      expect(houseForCell('south', southCell, lagna)).toBe(1);

      const northCell = [...Array(12).keys()].find((c) => signForCell('north', c, lagna) === lagna)!;
      expect(houseForCell('north', northCell, lagna)).toBe(1);
    }
  });
});

/**
 * Glyph placement inside a cell.
 *
 * This exists because of a real defect seen on screen: five bodies in one
 * rāśi were stacked straight down from the cell's anchor, and because the
 * North Indian cells are triangles, the last two left the cell through its
 * sloping edge and drew across the chart's own lines. A stellium of five is
 * ordinary, so this is the normal case, not an edge case.
 */
describe('graha slots', () => {
  /** Ray casting. Points exactly on an edge are not interesting here. */
  function inside(point: readonly [number, number], polygon: readonly (readonly [number, number])[]) {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const [xi, yi] = polygon[i]!;
      const [xj, yj] = polygon[j]!;
      if ((yi > point[1]) !== (yj > point[1])
        && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
        hit = !hit;
      }
    }
    return hit;
  }

  /** The polygon pulled in towards its centroid, as a crude glyph margin. */
  function shrink(polygon: readonly (readonly [number, number])[], factor: number) {
    const c = polygonCentroid(polygon);
    return polygon.map(([x, y]) => [
      c[0] + (x - c[0]) * factor,
      c[1] + (y - c[1]) * factor,
    ] as const);
  }

  it('keeps every glyph inside its own cell, in both layouts', () => {
    for (const [style, cells] of [
      ['north', northIndianCells()],
      ['south', southIndianCells()],
    ] as const) {
      for (const [index, cell] of cells.entries()) {
        // Seven is more than any single rāśi holds in the default body set,
        // so passing here covers every chart the product can draw.
        for (let count = 1; count <= 7; count += 1) {
          for (const slot of bodySlots(cell, count, style)) {
            expect(
              inside([slot.x, slot.y], cell.points),
              `${style} cell ${index}, ${count} bodies, slot (${slot.x.toFixed(3)}, ${slot.y.toFixed(3)})`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('leaves a margin, so a glyph does not touch the cell boundary', () => {
    // The anchor being inside is not enough: a glyph has width and height.
    for (const cell of northIndianCells()) {
      for (let count = 1; count <= 5; count += 1) {
        for (const slot of bodySlots(cell, count, 'north')) {
          expect(inside([slot.x, slot.y], shrink(cell.points, 0.75))).toBe(true);
        }
      }
    }
  });

  it('wraps into columns and shrinks rather than growing a longer stack', () => {
    const cell = northIndianCells()[0]!;
    const three = bodySlots(cell, 3, 'north');
    const five = bodySlots(cell, 5, 'north');

    expect(new Set(three.map((s) => s.x)).size).toBe(1);   // one column
    expect(new Set(five.map((s) => s.x)).size).toBe(2);    // two
    expect(five[0]!.scale).toBeLessThan(three[0]!.scale);
    expect(five[0]!.scale).toBeGreaterThan(0.6);           // still legible
  });

  it('centres the block on the anchor instead of hanging it below', () => {
    // Hanging the stack below the anchor is what pushed the fifth glyph out.
    const cell = northIndianCells()[0]!;
    const slots = bodySlots(cell, 3, 'north');
    const mean = slots.reduce((sum, s) => sum + s.y, 0) / slots.length;
    expect(mean).toBeCloseTo(cell.content[1], 9);
  });

  it('returns nothing for an empty cell', () => {
    expect(bodySlots(northIndianCells()[0]!, 0, 'north')).toEqual([]);
  });
});
