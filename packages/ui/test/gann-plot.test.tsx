/**
 * Price-plot geometry.
 *
 * Arithmetic, not pictures. The property that matters most is that the plot
 * is purely presentational: resizing the box must move pixels and leave the
 * construction alone, because a Gann line that shifts when a window is
 * resized is not a construction at all.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PLOT, makeScale, priceDomain, priceTicks, clipLine,
  type PlotDomain,
} from '../src/gann/plot.js';

const DOMAIN: PlotDomain = { firstBar: 0, lastBar: 100, minPrice: 0, maxPrice: 200 };

describe('the price domain', () => {
  it('pads the extremes so the series does not touch the frame', () => {
    const { minPrice, maxPrice } = priceDomain([10, 20], 0.1);
    expect(minPrice).toBeCloseTo(9, 12);
    expect(maxPrice).toBeCloseTo(21, 12);
  });

  it('never returns a zero-height band for a flat series', () => {
    // REGRESSION GUARD: a zero span divides by zero, every point becomes NaN,
    // and the chart renders empty rather than erroring.
    const flat = priceDomain([50, 50, 50]);
    expect(flat.maxPrice).toBeGreaterThan(flat.minPrice);
    const zero = priceDomain([0, 0]);
    expect(zero.maxPrice).toBeGreaterThan(zero.minPrice);
  });

  it('handles an empty series without NaN', () => {
    const empty = priceDomain([]);
    expect(Number.isFinite(empty.minPrice)).toBe(true);
    expect(Number.isFinite(empty.maxPrice)).toBe(true);
  });
});

describe('the pixel mapping', () => {
  const scale = makeScale(DOMAIN);

  it('puts the domain edges on the padding boundaries', () => {
    expect(scale.xOf(0)).toBeCloseTo(DEFAULT_PLOT.padLeft, 9);
    expect(scale.xOf(100)).toBeCloseTo(DEFAULT_PLOT.width - DEFAULT_PLOT.padRight, 9);
    expect(scale.yOf(200)).toBeCloseTo(DEFAULT_PLOT.padTop, 9);
    expect(scale.yOf(0)).toBeCloseTo(DEFAULT_PLOT.height - DEFAULT_PLOT.padBottom, 9);
  });

  it('runs y downward, as SVG does', () => {
    expect(scale.yOf(150)).toBeLessThan(scale.yOf(50));
  });

  it('is linear in both axes', () => {
    const midX = (scale.xOf(0) + scale.xOf(100)) / 2;
    expect(scale.xOf(50)).toBeCloseTo(midX, 9);
    const midY = (scale.yOf(0) + scale.yOf(200)) / 2;
    expect(scale.yOf(100)).toBeCloseTo(midY, 9);
  });

  it('survives a single-bar domain without dividing by zero', () => {
    const one = makeScale({ firstBar: 7, lastBar: 7, minPrice: 1, maxPrice: 2 });
    expect(Number.isFinite(one.xOf(7))).toBe(true);
  });

  it('changes pixels, not prices, when the box is resized', () => {
    /*
     * The assertion this file exists for. A fan line is defined by price per
     * BAR; the plot only decides where that lands on screen. Doubling the box
     * must move every pixel and leave the price at a bar untouched.
     */
    const wide = makeScale(DOMAIN, { ...DEFAULT_PLOT, width: 1520 });
    expect(wide.xOf(50)).not.toBeCloseTo(scale.xOf(50), 1);
    // Same fraction of the inner width, in both boxes.
    const fraction = (s: typeof scale) => (s.xOf(50) - s.box.padLeft) / s.innerWidth;
    expect(fraction(wide)).toBeCloseTo(fraction(scale), 12);
  });
});

describe('clipping a line to the visible band', () => {
  it('keeps a line that crosses the whole chart', () => {
    const clip = clipLine(0, 0, 2, DOMAIN)!;
    expect(clip.fromBar).toBeCloseTo(0, 9);
    expect(clip.toBar).toBeCloseTo(100, 9);
  });

  it('cuts a steep line where it leaves the price band', () => {
    // 10 per bar from 0 reaches the top of the band (200) at bar 20.
    const clip = clipLine(0, 0, 10, DOMAIN)!;
    expect(clip.toBar).toBeCloseTo(20, 9);
  });

  it('clips a falling line the same way', () => {
    // Anchored at the top-left, 10 down per bar reaches the floor at bar 20.
    const clip = clipLine(0, 200, -10, DOMAIN)!;
    expect(clip.fromBar).toBeCloseTo(0, 9);
    expect(clip.toBar).toBeCloseTo(20, 9);
  });

  it('drops a falling line anchored at the right edge, which only rises leftward', () => {
    /*
     * Not a defect, and worth pinning: extended BACKWARD from a high at the
     * last bar, a descending line climbs above the band immediately and
     * touches it at exactly one point. Drawing that point as a line would
     * put a stray mark on the right edge of every down-fan.
     */
    expect(clipLine(100, 200, -10, DOMAIN)).toBeUndefined();
  });

  it('drops a line that never enters the band', () => {
    // REGRESSION GUARD: returning coordinates far outside the viewBox stretches
    // the SVG's bounding box and shrinks everything else on the page.
    expect(clipLine(0, 10_000, 0, DOMAIN)).toBeUndefined();
    expect(clipLine(-500, 0, -10, DOMAIN)).toBeUndefined();
  });

  it('keeps a flat line that sits inside the band', () => {
    const clip = clipLine(0, 100, 0, DOMAIN)!;
    expect(clip.fromBar).toBe(0);
    expect(clip.toBar).toBe(100);
  });
});

describe('axis ticks', () => {
  it('chooses round numbers a reader would have picked', () => {
    expect(priceTicks({ ...DOMAIN, minPrice: 0, maxPrice: 100 })).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('stays inside the domain', () => {
    const ticks = priceTicks({ ...DOMAIN, minPrice: 13.7, maxPrice: 48.2 });
    expect(ticks[0]).toBeGreaterThanOrEqual(13.7);
    expect(ticks[ticks.length - 1]!).toBeLessThanOrEqual(48.2);
  });

  it('does not emit floating-point noise as a label', () => {
    // REGRESSION GUARD: repeated addition of 0.1 produces 41.300000000000004,
    // which is what the axis would have displayed.
    for (const tick of priceTicks({ ...DOMAIN, minPrice: 41, maxPrice: 41.5 })) {
      expect(String(tick).length).toBeLessThan(10);
    }
  });

  it('returns something for a degenerate band rather than looping forever', () => {
    expect(priceTicks({ ...DOMAIN, minPrice: 5, maxPrice: 5 })).toEqual([5]);
  });
});

/*
 * Marking the square. Not plot geometry, but the same class of defect: a
 * value that is not on the square must not be drawn as though it were.
 */
describe('marks on the Square of Nine', () => {
  it('drops a value outside the square instead of clamping it to the edge', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { buildSquare } = await import('@astro/gann');
    const { SquareOfNineFigure } = await import('../src/gann/SquareOfNineFigure.js');

    const square = buildSquare({ rings: 2 });   // values 1..25
    const svg = renderToStaticMarkup(
      <SquareOfNineFigure
        square={square}
        marks={[
          { value: 13, label: 'IN' },
          { value: 400, label: 'OUT' },
          { value: -5, label: 'UNDER' },
        ]}
      />,
    );

    expect(svg).toContain('IN');
    // REGRESSION GUARD: clamping put every projected planet on one edge cell,
    // which reads as a cluster of bodies at a single price.
    expect(svg).not.toContain('OUT');
    expect(svg).not.toContain('UNDER');
    // And it says how many it dropped rather than hiding them.
    expect(svg).toContain('2 values fall outside this square');
  });

  it('caps the labels in one cell and counts the rest', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { buildSquare } = await import('@astro/gann');
    const { SquareOfNineFigure } = await import('../src/gann/SquareOfNineFigure.js');

    const svg = renderToStaticMarkup(
      <SquareOfNineFigure
        square={buildSquare({ rings: 2 })}
        marks={['a', 'b', 'c', 'd', 'e'].map((label) => ({ value: 13, label }))}
      />,
    );
    expect(svg).toContain('a b c +2');
  });
});
