/**
 * Geometry for the price plot a fan is drawn on.
 *
 * Pure arithmetic, no React, so the mapping can be tested as numbers rather
 * than by looking at a picture — the same split as the Vedic layouts.
 *
 * ## Why the scale is not chosen here
 *
 * A Gann fan's slope is price units per bar; the plot's own pixels-per-bar and
 * pixels-per-price are a separate, purely visual choice. Keeping them apart is
 * what stops a resize from changing the construction: zooming the chart moves
 * the pixels and leaves the 1×1 line passing through exactly the same prices.
 */

export interface PlotBox {
  readonly width: number;
  readonly height: number;
  readonly padLeft: number;
  readonly padRight: number;
  readonly padTop: number;
  readonly padBottom: number;
}

export const DEFAULT_PLOT: PlotBox = {
  width: 760,
  height: 380,
  padLeft: 56,
  padRight: 16,
  padTop: 12,
  padBottom: 28,
};

export interface PlotDomain {
  readonly firstBar: number;
  readonly lastBar: number;
  readonly minPrice: number;
  readonly maxPrice: number;
}

export interface PlotScale {
  readonly box: PlotBox;
  readonly domain: PlotDomain;
  /** Bar index to pixels. */
  readonly xOf: (barIndex: number) => number;
  /** Price to pixels, y down. */
  readonly yOf: (price: number) => number;
  readonly innerWidth: number;
  readonly innerHeight: number;
}

/**
 * Price domain with a margin, never zero-height.
 *
 * A flat series would otherwise divide by zero and put every point at NaN,
 * which renders as an empty chart rather than as an error.
 */
export function priceDomain(
  prices: readonly number[],
  marginFraction = 0.05,
): { readonly minPrice: number; readonly maxPrice: number } {
  if (prices.length === 0) return { minPrice: 0, maxPrice: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const price of prices) {
    if (price < min) min = price;
    if (price > max) max = price;
  }
  const span = max - min;
  if (span === 0) {
    const pad = Math.abs(max) * marginFraction || 1;
    return { minPrice: min - pad, maxPrice: max + pad };
  }
  return { minPrice: min - span * marginFraction, maxPrice: max + span * marginFraction };
}

export function makeScale(domain: PlotDomain, box: PlotBox = DEFAULT_PLOT): PlotScale {
  const innerWidth = box.width - box.padLeft - box.padRight;
  const innerHeight = box.height - box.padTop - box.padBottom;
  const bars = Math.max(1, domain.lastBar - domain.firstBar);
  const priceSpan = domain.maxPrice - domain.minPrice || 1;

  return {
    box,
    domain,
    innerWidth,
    innerHeight,
    xOf: (barIndex) => box.padLeft + ((barIndex - domain.firstBar) / bars) * innerWidth,
    yOf: (price) => box.padTop + ((domain.maxPrice - price) / priceSpan) * innerHeight,
  };
}

/**
 * Clip a straight line to the plot's price band, in bar coordinates.
 *
 * Returned as bar indices rather than pixels so the caller can label the line
 * where it actually leaves the chart. A line entirely outside the band returns
 * undefined instead of coordinates off the canvas, which would otherwise
 * stretch the SVG's bounding box and shrink everything else.
 */
export function clipLine(
  anchorBar: number,
  anchorPrice: number,
  slopePerBar: number,
  domain: PlotDomain,
): { readonly fromBar: number; readonly toBar: number } | undefined {
  const priceAt = (bar: number) => anchorPrice + slopePerBar * (bar - anchorBar);

  let from = domain.firstBar;
  let to = domain.lastBar;

  if (slopePerBar !== 0) {
    const barAt = (price: number) => anchorBar + (price - anchorPrice) / slopePerBar;
    const a = barAt(domain.minPrice);
    const b = barAt(domain.maxPrice);
    from = Math.max(from, Math.min(a, b));
    to = Math.min(to, Math.max(a, b));
  } else if (anchorPrice < domain.minPrice || anchorPrice > domain.maxPrice) {
    return undefined;
  }

  if (!(to > from)) return undefined;
  // Guard against a line that grazes the band at a single point.
  if (to - from < 1e-9) return undefined;
  void priceAt;
  return { fromBar: from, toBar: to };
}

/** Evenly spaced price ticks, rounded to something a reader would choose. */
export function priceTicks(domain: PlotDomain, count = 5): readonly number[] {
  const span = domain.maxPrice - domain.minPrice;
  if (span <= 0) return [domain.minPrice];
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const niceStep = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;

  const ticks: number[] = [];
  const first = Math.ceil(domain.minPrice / niceStep) * niceStep;
  for (let tick = first; tick <= domain.maxPrice + 1e-9; tick += niceStep) {
    // Re-round: repeated addition of a non-binary step accumulates error that
    // shows up as "41.300000000000004" on an axis label.
    ticks.push(Number(tick.toFixed(10)));
  }
  return ticks;
}
