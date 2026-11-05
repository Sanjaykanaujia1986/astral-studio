/**
 * Gann constructions.
 *
 * The published Square of Nine is the oracle for the grid: the 5×5 layout
 * below is the one printed in the standard references, and the walk is
 * asserted against it cell by cell rather than against a formula, because a
 * formula is what is being checked.
 *
 * The angle tests exist mainly to pin down that the grid and the spiral angle
 * are DIFFERENT functions. Conflating them is the usual defect in this kind of
 * software and it is invisible on screen — both produce plausible numbers.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSquare, cellForValue, cellAt, ringOf, DEFAULT_SQUARE,
  spiralAngle, totalRotation, valueAtAngle, cellAngle, CROSS_ANGLES, NegativeRootError,
  buildFan, priceAt, barAtPrice, measure, unitSlope, STANDARD_FAN, InvalidScaleError,
  projectLongitude, projectAll, nearestTurn,
  buildCircle, circleAngle, circleTurn, sameDegree, InvalidLayoutError,
  buildPolygon, polygonCellCount, polygonPoint, polygonCorners,
  buildGrid, diagonalPriceAt, cellOf,
  timeCounts, seasonalCounts, addDays, daysBetween, COMMON_COUNTS, InvalidAnchorError,
} from '../src/index.js';

/**
 * The published 5×5 Square of Nine, top row first. Centre 1, clockwise from
 * the right, odd squares running up and to the right.
 */
const PUBLISHED = [
  [21, 22, 23, 24, 25],
  [20, 7, 8, 9, 10],
  [19, 6, 1, 2, 11],
  [18, 5, 4, 3, 12],
  [17, 16, 15, 14, 13],
];

describe('the Square of Nine grid', () => {
  const square = buildSquare({ rings: 2 });

  it('reproduces the published 5×5 layout cell for cell', () => {
    expect(square.side).toBe(5);
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const x = col - 2;
        const y = 2 - row;
        expect(cellAt(square, x, y)?.value, `(${x}, ${y})`).toBe(PUBLISHED[row]![col]);
      }
    }
  });

  it('fills every cell exactly once', () => {
    expect(square.cells).toHaveLength(25);
    expect(new Set(square.cells.map((c) => `${c.x},${c.y}`)).size).toBe(25);
    expect(new Set(square.cells.map((c) => c.value)).size).toBe(25);
  });

  it('puts 8r cells in ring r', () => {
    const big = buildSquare({ rings: 6 });
    for (let r = 1; r <= 6; r += 1) {
      expect(big.cells.filter((c) => c.ring === r), `ring ${r}`).toHaveLength(8 * r);
    }
  });

  it('puts the odd squares on the up-right diagonal', () => {
    const big = buildSquare({ rings: 5 });
    for (const odd of [9, 25, 49, 81, 121]) {
      const cell = cellForValue(big, odd)!;
      expect(cell.x, `${odd}`).toBe(cell.y);
      expect(cell.x).toBeGreaterThan(0);
      expect(cell.onDiagonalCross).toBe(true);
    }
  });

  it('does NOT put the even squares on the opposite diagonal', () => {
    /*
     * The familiar claim "the even squares are opposite the odd squares" is
     * true of the SPIRAL ANGLE and false of the grid. The down-left arm
     * carries (2r)² + 1 — 5, 17, 37 — and each even square sits one cell
     * short of it. 4 is due south of centre, on the cardinal cross.
     *
     * Written as an assertion rather than a comment because the first draft
     * of the conventions document claimed the opposite, and this test is
     * what found it.
     */
    const big = buildSquare({ rings: 5 });
    for (let r = 1; r <= 5; r += 1) {
      expect(cellAt(big, -r, -r)!.value, `down-left arm, ring ${r}`).toBe(4 * r * r + 1);
      const even = cellForValue(big, 4 * r * r)!;
      expect(even.x, `(2·${r})²`).toBe(-r + 1);
      expect(even.y).toBe(-r);
      expect(even.onDiagonalCross).toBe(false);
    }
    expect(cellAt(big, 0, -1)!.value).toBe(4);
    expect(cellAt(big, 0, -1)!.onCardinalCross).toBe(true);
    // Yet by spiral angle 4 is exactly 180° from 1, as the method intends.
    expect(spiralAngle(4)).toBeCloseTo(180, 9);
  });

  it('counts the two crosses geometrically, so the centre is on neither', () => {
    const centre = cellAt(square, 0, 0)!;
    expect(centre.onCardinalCross).toBe(false);
    expect(centre.onDiagonalCross).toBe(false);
    expect(cellAt(square, 2, 0)!.onCardinalCross).toBe(true);
    expect(cellAt(square, 2, 0)!.onDiagonalCross).toBe(false);
    expect(cellAt(square, -2, -2)!.onDiagonalCross).toBe(true);
  });

  it('keeps the crosses correct under a different origin and increment', () => {
    /*
     * REGRESSION GUARD. A tempting shortcut is "the diagonal is the odd
     * squares", which is true only for origin 1, increment 1. With an origin
     * of 100 and an increment of 5 that test would pass vacuously while the
     * drawing was wrong.
     */
    const scaled = buildSquare({ rings: 2, originValue: 100, increment: 5 });
    expect(cellAt(scaled, 0, 0)!.value).toBe(100);
    expect(cellAt(scaled, 1, 1)!.value).toBe(100 + 8 * 5);   // where 9 sits
    expect(cellAt(scaled, 1, 1)!.onDiagonalCross).toBe(true);
    expect(cellAt(scaled, 2, 0)!.onCardinalCross).toBe(true);
    expect(cellForValue(scaled, 140)).toBe(cellAt(scaled, 1, 1));
    // A value that is not on a cell is absent, not rounded to a neighbour.
    expect(cellForValue(scaled, 142)).toBeUndefined();
    expect(cellForValue(scaled, 95)).toBeUndefined();
  });

  it('mirrors exactly when wound the other way', () => {
    const anti = buildSquare({ rings: 2, direction: 'anticlockwise' });
    for (const cell of square.cells) {
      expect(cellAt(anti, cell.x, -cell.y)?.value, `${cell.value}`).toBe(cell.value);
    }
  });

  it('rejects settings that cannot produce a square', () => {
    expect(() => buildSquare({ rings: -1 })).toThrow(RangeError);
    expect(() => buildSquare({ rings: 1.5 })).toThrow(RangeError);
    expect(() => buildSquare({ increment: 0 })).toThrow(RangeError);
  });

  it('defaults to five rings, which is the printed size', () => {
    expect(DEFAULT_SQUARE.rings).toBe(5);
    expect(buildSquare().side).toBe(11);
    expect(ringOf(-3, 1)).toBe(3);
  });
});

describe('the spiral angle', () => {
  it('puts every odd square at 0° and every even square at 180°', () => {
    for (const odd of [1, 9, 25, 49, 81, 121, 169]) {
      expect(spiralAngle(odd), `${odd}`).toBeCloseTo(0, 9);
    }
    for (const even of [4, 16, 36, 64, 100, 144]) {
      expect(spiralAngle(even), `${even}`).toBeCloseTo(180, 9);
    }
  });

  it('adds 2 to the square root per revolution', () => {
    expect(totalRotation(9)).toBeCloseTo(360, 9);
    expect(totalRotation(25)).toBeCloseTo(720, 9);
    expect(totalRotation(49)).toBeCloseTo(1080, 9);
    // And the wrapped form hides those turns, which is why both exist.
    expect(spiralAngle(49)).toBeCloseTo(0, 9);
  });

  it('inverts exactly', () => {
    for (const value of [2, 3.75, 17, 101.5, 6400]) {
      const turns = Math.floor(totalRotation(value) / 360);
      expect(valueAtAngle(spiralAngle(value), turns), `${value}`).toBeCloseTo(value, 9);
    }
  });

  it('gives a different value on every turn, which is why the turn is required', () => {
    const prices = [0, 1, 2, 3].map((turns) => valueAtAngle(90, turns));
    expect(new Set(prices).size).toBe(4);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('respects a shifted origin', () => {
    expect(spiralAngle(100, 100)).toBeCloseTo(0, 9);
    // One full turn from an origin of 100: √100 + 2 = 12, so 144.
    expect(valueAtAngle(0, 1, 100)).toBeCloseTo(144, 9);
  });

  it('refuses a value below the origin instead of returning NaN', () => {
    expect(() => spiralAngle(-1)).toThrow(NegativeRootError);
    expect(() => totalRotation(-0.5)).toThrow(NegativeRootError);
  });
});

describe('the spiral angle is not the grid angle', () => {
  const square = buildSquare({ rings: 60 });

  it('disagrees sharply on the inner rings', () => {
    // Value 3 sits down-right of centre: grid 315°, spiral 131.8°.
    const three = cellForValue(square, 3)!;
    expect(cellAngle(three.x, three.y)).toBeCloseTo(90, 9);
    expect(spiralAngle(3)).toBeCloseTo(131.769, 3);
    expect(Math.abs(spiralAngle(3) - cellAngle(three.x, three.y)!)).toBeGreaterThan(40);
  });

  it('converges by the outer rings', () => {
    // East cardinal of ring 50: the walk reaches (50, 0) at (2·50−1)² + 50.
    const value = 99 * 99 + 50;
    const cell = cellForValue(square, value)!;
    expect(cell.x).toBe(50);
    expect(cell.y).toBe(0);
    expect(cellAngle(cell.x, cell.y)).toBeCloseTo(CROSS_ANGLES.cardinalEast!, 9);
    expect(spiralAngle(value)).toBeCloseTo(45, 0);
  });

  it('gives the centre no direction rather than calling it north-east', () => {
    expect(cellAngle(0, 0)).toBeUndefined();
  });

  it('measures the eight cross arms clockwise from the odd-square diagonal', () => {
    expect(cellAngle(1, 1)).toBeCloseTo(CROSS_ANGLES.diagonalNorthEast!, 9);
    expect(cellAngle(1, 0)).toBeCloseTo(CROSS_ANGLES.cardinalEast!, 9);
    expect(cellAngle(1, -1)).toBeCloseTo(CROSS_ANGLES.diagonalSouthEast!, 9);
    expect(cellAngle(0, -1)).toBeCloseTo(CROSS_ANGLES.cardinalSouth!, 9);
    expect(cellAngle(-1, -1)).toBeCloseTo(CROSS_ANGLES.diagonalSouthWest!, 9);
    expect(cellAngle(0, 1)).toBeCloseTo(CROSS_ANGLES.cardinalNorth!, 9);
  });
});

describe('fans', () => {
  const anchor = { barIndex: 10, date: '2024-03-01', price: 100 };
  const scale = { priceUnits: 2, timeUnits: 1 };

  it('refuses to build without a usable scale', () => {
    // The assertion this file exists for: "1×1" names no line without units.
    expect(() => unitSlope({ priceUnits: 0, timeUnits: 1 })).toThrow(InvalidScaleError);
    expect(() => unitSlope({ priceUnits: 1, timeUnits: 0 })).toThrow(InvalidScaleError);
    expect(() => unitSlope({ priceUnits: -1, timeUnits: 1 })).toThrow(InvalidScaleError);
    expect(() => unitSlope({ priceUnits: NaN, timeUnits: 1 })).toThrow(InvalidScaleError);
  });

  it('scales every ratio by the stated price per time', () => {
    const fan = buildFan(anchor, scale, 'up');
    expect(fan.lines).toHaveLength(STANDARD_FAN.length);
    const primary = fan.lines.find((l) => l.isPrimary)!;
    expect(primary.label).toBe('1×1');
    expect(primary.slopePerBar).toBe(2);
    expect(fan.lines.find((l) => l.label === '4×1')!.slopePerBar).toBe(8);
    expect(fan.lines.find((l) => l.label === '1×4')!.slopePerBar).toBe(0.5);
  });

  it('doubling the scale doubles every line', () => {
    const slow = buildFan(anchor, { priceUnits: 1, timeUnits: 1 }, 'up');
    const fast = buildFan(anchor, { priceUnits: 2, timeUnits: 1 }, 'up');
    for (let i = 0; i < slow.lines.length; i += 1) {
      expect(fast.lines[i]!.slopePerBar).toBeCloseTo(2 * slow.lines[i]!.slopePerBar, 12);
    }
  });

  it('falls from a high and rises from a low', () => {
    const up = buildFan(anchor, scale, 'up');
    const down = buildFan(anchor, scale, 'down');
    expect(priceAt(up, up.lines.find((l) => l.isPrimary)!, 20)).toBe(120);
    expect(priceAt(down, down.lines.find((l) => l.isPrimary)!, 20)).toBe(80);
  });

  it('passes through its anchor exactly, on every line', () => {
    const fan = buildFan(anchor, scale, 'up');
    for (const line of fan.lines) {
      expect(priceAt(fan, line, anchor.barIndex), line.label).toBe(anchor.price);
    }
  });

  it('counts bars, not calendar days', () => {
    /*
     * The anchor is bar 10 on a Friday; bar 11 is the following Monday. A
     * day-counting implementation would place the 1×1 three units higher
     * after the weekend. Bars make the line independent of the gap.
     */
    const fan = buildFan({ barIndex: 10, date: '2024-03-01', price: 100 }, scale, 'up');
    expect(priceAt(fan, fan.lines.find((l) => l.isPrimary)!, 11)).toBe(102);
  });

  it('solves for the bar at a price, and says when there is none', () => {
    const fan = buildFan(anchor, scale, 'up');
    const primary = fan.lines.find((l) => l.isPrimary)!;
    expect(barAtPrice(fan, primary, 120)).toBe(20);
    expect(barAtPrice(fan, primary, 90)).toBe(5);   // extrapolated behind the anchor
    const flat = { ...primary, slopePerBar: 0 };
    expect(barAtPrice(fan, flat, 120)).toBeUndefined();
  });
});

describe('measuring a move', () => {
  const scale = { priceUnits: 1, timeUnits: 1 };

  it('reports a move that ran exactly at the balance line as 1', () => {
    const m = measure({ barIndex: 0, price: 50 }, { barIndex: 20, price: 70 }, scale);
    expect(m.bars).toBe(20);
    expect(m.priceChange).toBe(20);
    expect(m.inUnitSlopes).toBe(1);
    expect(m.nearestRatio).toEqual({ price: 1, time: 1 });
    expect(m.errorToNearest).toBe(0);
    expect(m.degrees).toBeCloseTo(45, 9);
  });

  it('finds the nearest standard ratio and states the error', () => {
    const m = measure({ barIndex: 0, price: 0 }, { barIndex: 10, price: 21 }, scale);
    expect(m.inUnitSlopes).toBe(2.1);
    expect(m.nearestRatio).toEqual({ price: 2, time: 1 });
    expect(m.errorToNearest).toBeCloseTo(0.05, 12);
  });

  it('measures a fall as a negative slope but matches it to a positive ratio', () => {
    const m = measure({ barIndex: 0, price: 70 }, { barIndex: 20, price: 50 }, scale);
    expect(m.slopePerBar).toBe(-1);
    expect(m.nearestRatio).toEqual({ price: 1, time: 1 });
    expect(m.degrees).toBeCloseTo(-45, 9);
  });

  it('shows that the degree figure is an artefact of the scale', () => {
    /*
     * The point of §4. The SAME two points, measured against two scales, give
     * 45° and 26.6°. Reporting a bare angle without the scale would be
     * reporting an accident of the axes as a fact about the market.
     */
    const points = [{ barIndex: 0, price: 0 }, { barIndex: 10, price: 10 }] as const;
    expect(measure(points[0], points[1], { priceUnits: 1, timeUnits: 1 }).degrees)
      .toBeCloseTo(45, 9);
    expect(measure(points[0], points[1], { priceUnits: 2, timeUnits: 1 }).degrees)
      .toBeCloseTo(26.565, 3);
  });

  it('refuses two points on the same bar', () => {
    expect(() => measure({ barIndex: 4, price: 1 }, { barIndex: 4, price: 2 }, scale))
      .toThrow(RangeError);
  });
});

describe('planetary projections', () => {
  const tropical = { kind: 'tropical' } as const;

  it('maps longitude linearly from a stated anchor', () => {
    const p = projectLongitude('sun', 100, {
      method: 'linear', basePrice: 500, baseLongitude: 0, unitsPerDegree: 2,
    }, tropical);
    expect(p.price).toBe(700);
    expect(p.method).toBe('linear');
    expect(p.derivation).toContain('500');
  });

  it('maps longitude onto the square at the requested turn', () => {
    // 0° on turn 1 from origin 1 is the second odd square: (1 + 2)² = 9.
    const p = projectLongitude('sun', 0, {
      method: 'square', originValue: 1, turns: 1,
    }, tropical);
    expect(p.price).toBeCloseTo(9, 9);
  });

  it('carries the zodiac, because tropical and sidereal differ by ~24°', () => {
    const sidereal = { kind: 'sidereal', ayanamsha: 'lahiri' } as const;
    const settings = {
      method: 'linear', basePrice: 0, baseLongitude: 0, unitsPerDegree: 1,
    } as const;
    const t = projectLongitude('sun', 300, settings, tropical);
    const s = projectLongitude('sun', 276.1, settings, sidereal);
    expect(t.zodiac.kind).toBe('tropical');
    expect(s.zodiac.ayanamsha).toBe('lahiri');
    // The same body, the same instant, ~24 price units apart.
    expect(t.price - s.price).toBeCloseTo(23.9, 9);
  });

  it('projects a whole chart at once', () => {
    const prices = projectAll(
      [{ body: 'sun', longitude: 10 }, { body: 'moon', longitude: 20 }],
      { method: 'linear', basePrice: 0, baseLongitude: 0, unitsPerDegree: 10 },
      tropical,
    );
    expect(prices.map((p) => p.price)).toEqual([100, 200]);
  });

  it('normalises longitude so 370° and 10° project alike', () => {
    const settings = {
      method: 'linear', basePrice: 0, baseLongitude: 0, unitsPerDegree: 1,
    } as const;
    expect(projectLongitude('sun', 370, settings, tropical).price)
      .toBeCloseTo(projectLongitude('sun', 10, settings, tropical).price, 9);
  });

  it('offers the nearest turn as navigation, and it stays only navigation', () => {
    // 90° near 400: turn 3 gives (1 + 0.5 + 6)² = 56.25; turn 9 gives 380.25.
    const turn = nearestTurn(90, 400, 1);
    expect(turn).toBe(9);
    // The projection still demands the turn be passed, so choosing it remains
    // a visible decision rather than a silent fit.
    const p = projectLongitude('sun', 90, { method: 'square', originValue: 1, turns: turn }, tropical);
    expect(p.price).toBeCloseTo(380.25, 9);
  });
});

/**
 * The circle and the polygon spiral.
 *
 * The property worth protecting is that these are NOT the Square of Nine.
 * The circle's angle is linear in the value; the square's is linear in its
 * square root. Two constructions that both produce plausible degrees are
 * easy to conflate, and a reader cannot tell from the output which was used.
 */
describe('the circle', () => {
  it('divides a turn evenly and puts the origin at the top', () => {
    const chart = buildCircle({ divisions: 24, turns: 1 });
    expect(chart.cells).toHaveLength(24);
    expect(chart.cells[0]!.value).toBe(1);
    expect(chart.cells[0]!.angle).toBe(0);
    expect(chart.cells[6]!.angle).toBeCloseTo(90, 9);
    expect(chart.cells[12]!.angle).toBeCloseTo(180, 9);
  });

  it('puts values a whole turn apart in the same degree, forever', () => {
    // This is what the wheel is FOR, and it is the clearest difference from
    // the square, where a turn adds a growing amount.
    const settings = { divisions: 24, originValue: 1, increment: 1 };
    for (const value of [1, 25, 49, 1009]) {
      expect(circleAngle(value, settings), `${value}`).toBeCloseTo(0, 9);
    }
    const chart = buildCircle({ divisions: 24, turns: 3 });
    expect(sameDegree(chart, 1)).toEqual([1, 25, 49]);
  });

  it('is linear in the value, where the square is linear in its root', () => {
    /*
     * REGRESSION GUARD against the two constructions being conflated. Doubling
     * the distance from the origin doubles the wheel's rotation; on the square
     * it does not, because √ is not linear.
     */
    const settings = { divisions: 24, originValue: 1, increment: 1 };
    const oneStep = circleAngle(2, settings);
    const twoSteps = circleAngle(3, settings);
    expect(twoSteps).toBeCloseTo(2 * oneStep, 9);

    expect(spiralAngle(3) / spiralAngle(2)).not.toBeCloseTo(2, 1);
  });

  it('counts turns, so a value is placed and not just angled', () => {
    const settings = { divisions: 24, originValue: 1, increment: 1 };
    expect(circleTurn(1, settings)).toBe(0);
    expect(circleTurn(24, settings)).toBe(0);
    expect(circleTurn(25, settings)).toBe(1);
  });

  it('respects origin and increment', () => {
    const chart = buildCircle({ divisions: 12, turns: 1, originValue: 100, increment: 5 });
    expect(chart.cells[0]!.value).toBe(100);
    expect(chart.cells[1]!.value).toBe(105);
    expect(chart.cells[1]!.angle).toBeCloseTo(30, 9);
  });

  it('refuses a wheel that cannot exist', () => {
    expect(() => buildCircle({ divisions: 0 })).toThrow(InvalidLayoutError);
    expect(() => buildCircle({ turns: 0 })).toThrow(InvalidLayoutError);
    expect(() => buildCircle({ increment: 0 })).toThrow(InvalidLayoutError);
  });
});

describe('the polygon spiral', () => {
  it('gives the centred hexagonal numbers for six sides', () => {
    // 1, 7, 19, 37, 61 — the hexagon chart's defining property, and an
    // independent check that the ring sizes are right.
    for (const [rings, total] of [[0, 1], [1, 7], [2, 19], [3, 37], [4, 61]] as const) {
      expect(polygonCellCount(6, rings), `rings ${rings}`).toBe(total);
      expect(buildPolygon({ sides: 6, rings }).cells).toHaveLength(total);
    }
  });

  it('puts S×r cells in ring r, for any number of sides', () => {
    for (const sides of [3, 4, 5, 6, 8, 12]) {
      const chart = buildPolygon({ sides, rings: 3 });
      for (let ring = 1; ring <= 3; ring += 1) {
        expect(chart.cells.filter((c) => c.ring === ring), `${sides}-gon ring ${ring}`)
          .toHaveLength(sides * ring);
      }
    }
  });

  it('finds exactly S corners in every ring', () => {
    const chart = buildPolygon({ sides: 6, rings: 4 });
    for (let ring = 1; ring <= 4; ring += 1) {
      const corners = chart.cells.filter((c) => c.ring === ring && c.corner);
      expect(corners, `ring ${ring}`).toHaveLength(6);
      // Evenly spaced, which is what makes them the polygon's vertices.
      for (const [i, corner] of corners.entries()) {
        expect(corner.angle).toBeCloseTo(i * 60, 9);
      }
    }
  });

  it('gives the centre no direction rather than calling it a corner', () => {
    const centre = buildPolygon({ sides: 6, rings: 2 }).cells[0]!;
    expect(centre.ring).toBe(0);
    expect(centre.angle).toBeUndefined();
    expect(centre.corner).toBe(false);
    expect(polygonPoint(centre)).toEqual([0, 0]);
  });

  it('places cells radially, clockwise from the top', () => {
    const chart = buildPolygon({ sides: 4, rings: 1 });
    const [top, right, bottom, left] = chart.cells.slice(1);
    expect(polygonPoint(top!)[1]).toBeCloseTo(1, 9);
    expect(polygonPoint(right!)[0]).toBeCloseTo(1, 9);
    expect(polygonPoint(bottom!)[1]).toBeCloseTo(-1, 9);
    expect(polygonPoint(left!)[0]).toBeCloseTo(-1, 9);
  });

  it('numbers the spiral continuously outward', () => {
    const chart = buildPolygon({ sides: 6, rings: 3, originValue: 1, increment: 1 });
    expect(chart.cells.map((c) => c.value)).toEqual(
      Array.from({ length: 37 }, (_, i) => i + 1),
    );
    expect(polygonCorners(chart).map((c) => c.value)).toEqual(
      [2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 23, 26, 29, 32, 35],
    );
  });

  it('refuses a polygon that cannot exist', () => {
    expect(() => buildPolygon({ sides: 2 })).toThrow(InvalidLayoutError);
    expect(() => buildPolygon({ rings: -1 })).toThrow(InvalidLayoutError);
    expect(() => buildPolygon({ increment: 0 })).toThrow(InvalidLayoutError);
  });
});

/**
 * The Square of 144.
 *
 * A price–time grid rather than a spiral, and the one construction here with
 * three required inputs and no defaults. The property worth protecting is
 * that its diagonal and the fan's 1×1 are the same line: they are two
 * statements of the same price-per-bar, and letting them drift would give a
 * reader two "correct" answers.
 */
describe('the Square of 144', () => {
  const base = {
    anchor: { barIndex: 10, price: 100 },
    pricePerCell: 0.5,
    barsPerCell: 1,
  };

  it('spans size cells in each direction from the anchor', () => {
    const grid = buildGrid(base);
    expect(grid.settings.size).toBe(144);
    expect(grid.farBar).toBe(10 + 144);
    expect(grid.farPrice).toBeCloseTo(100 + 144 * 0.5, 9);
  });

  it('emits the harmonic fractions as named levels, not bare cell lines', () => {
    const grid = buildGrid(base);
    const half = grid.levels.find((l) => l.label === '1/2')!;
    expect(half.price).toBeCloseTo(100 + 72 * 0.5, 9);
    const third = grid.columns.find((c) => c.label === '1/3')!;
    expect(third.barIndex).toBeCloseTo(10 + 48, 9);
    expect(grid.levels.map((l) => l.label))
      .toEqual(['1/8', '1/4', '1/3', '1/2', '2/3', '3/4', '1/1']);
  });

  it('makes its diagonal exactly the 1×1 of a fan on the same scale', () => {
    /*
     * The assertion this file exists for. Both are statements of price per
     * bar; deriving one from the other is what stops a chart offering two
     * different "correct" diagonals.
     */
    const grid = buildGrid(base);
    const fan = buildFan(
      { barIndex: 10, date: '2024-01-01', price: 100 },
      grid.diagonalScale,
      'up',
    );
    const primary = fan.lines.find((l) => l.isPrimary)!;
    expect(grid.diagonalSlopePerBar).toBeCloseTo(primary.slopePerBar, 12);
    for (const bar of [10, 50, 154]) {
      expect(diagonalPriceAt(grid, bar)).toBeCloseTo(priceAt(fan, primary, bar), 9);
    }
  });

  it('falls from the anchor when the grid is not rising', () => {
    const grid = buildGrid({ ...base, rising: false });
    expect(grid.farPrice).toBeCloseTo(100 - 72, 9);
    expect(grid.diagonalSlopePerBar).toBeLessThan(0);
  });

  it('locates a point in cell coordinates, and says when it is off the grid', () => {
    const grid = buildGrid({ ...base, size: 10 });
    expect(cellOf(grid, 10, 100)).toEqual({ column: 1, row: 1 });
    expect(cellOf(grid, 14, 101.2)).toEqual({ column: 5, row: 3 });
    // Off the square: a reason to move or widen it, not to clamp to an edge.
    expect(cellOf(grid, 9, 100)).toBeUndefined();
    expect(cellOf(grid, 10, 99)).toBeUndefined();
    expect(cellOf(grid, 999, 100)).toBeUndefined();
  });

  it('refuses the three inputs it cannot default', () => {
    expect(() => buildGrid({ ...base, pricePerCell: 0 })).toThrow(InvalidLayoutError);
    expect(() => buildGrid({ ...base, barsPerCell: -1 })).toThrow(InvalidLayoutError);
    expect(() => buildGrid({ ...base, size: 0 })).toThrow(InvalidLayoutError);
    expect(() => buildGrid({ ...base, pricePerCell: NaN })).toThrow(InvalidLayoutError);
  });
});

/**
 * Time counts.
 *
 * Arithmetic, and the point of testing it is the distinction the method
 * usually blurs: a count in BARS and a count in CALENDAR DAYS are different
 * questions and give different answers on any series with weekends in it.
 */
describe('time counts', () => {
  const anchor = { barIndex: 100, date: '2024-01-15' };

  it('counts calendar days as dates, crossing month and year ends', () => {
    const counts = timeCounts(anchor, [1, 17, 90, 366]);
    expect(counts.map((c) => c.date)).toEqual([
      '2024-01-16',   // next day
      '2024-02-01',   // over the month end
      '2024-04-14',   // 90 days, through a leap February
      '2025-01-15',   // 366 days: 2024 is a leap year, so back to the date
    ]);
    expect(counts.every((c) => c.barIndex === undefined)).toBe(true);
  });

  it('counts bars as bar indices, which is a different answer', () => {
    // The distinction that matters: 90 bars is not 90 days unless the series
    // has no gaps, and almost none do.
    const bars = timeCounts(anchor, [90], 'bars')[0]!;
    const days = timeCounts(anchor, [90], 'calendarDays')[0]!;
    expect(bars.barIndex).toBe(190);
    expect(bars.date).toBeUndefined();
    expect(days.date).toBe('2024-04-14');
    expect(days.barIndex).toBeUndefined();
    // And the unit travels with the result rather than being inferred.
    expect(bars.unit).toBe('bars');
    expect(days.unit).toBe('calendarDays');
  });

  it('offers the circle’s own divisions as a starting set', () => {
    expect(COMMON_COUNTS).toContain(90);
    expect(COMMON_COUNTS).toContain(180);
    expect(COMMON_COUNTS).toContain(360);
    expect(timeCounts(anchor)).toHaveLength(COMMON_COUNTS.length);
  });

  it('returns them in order, whatever order they were given', () => {
    expect(timeCounts(anchor, [360, 45, 180]).map((c) => c.count)).toEqual([45, 180, 360]);
  });

  it('is exact across a daylight-saving change, because it works in UTC', () => {
    // A local-time implementation drifts by an hour here and can land on the
    // wrong date; 31 March 2024 is the European clock change.
    expect(addDays('2024-03-30', 2)).toBe('2024-04-01');
    expect(daysBetween('2024-03-01', '2024-04-01')).toBe(31);
  });

  it('refuses a date it cannot parse rather than returning Invalid Date', () => {
    expect(() => addDays('not-a-date', 1)).toThrow(InvalidAnchorError);
    expect(() => daysBetween('2024-01-01', 'nope')).toThrow(InvalidAnchorError);
  });

  it('measures supplied seasonal dates against the anchor', () => {
    /*
     * The dates come from the engine's ingress search, not from here: a
     * solstice is the Sun entering Capricorn, and computing it twice in one
     * product is how the two copies end up disagreeing.
     */
    const seasonal = seasonalCounts(anchor, [
      { date: '2024-06-20', label: 'June solstice' },
      { date: '2024-03-20', label: 'March equinox' },
      { date: '2023-12-22', label: 'December solstice' },
    ]);
    expect(seasonal.map((s) => s.label)).toEqual([
      'December solstice', 'March equinox', 'June solstice',
    ]);
    expect(seasonal[0]!.daysFromAnchor).toBe(-24);   // before the anchor
    expect(seasonal[1]!.daysFromAnchor).toBe(65);
  });
});
