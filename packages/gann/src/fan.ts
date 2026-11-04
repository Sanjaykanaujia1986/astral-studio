/**
 * Gann angles, anchored.
 *
 * A slope here is a ratio of PRICE units to TIME units, and the scale that
 * defines those units is a required input. Without it "1×1" names no line at
 * all: the same anchor and the same data produce a different fan for every
 * choice of units, which is why two charts of the same instrument so often
 * disagree.
 *
 * Time is counted in BARS, not calendar days. A series with weekends and
 * holidays would otherwise place the same line in two positions depending on
 * whether the gaps were counted.
 *
 * docs/GANN_CONVENTIONS.md §3 and §4.
 */

export interface GannScale {
  /** Price units advanced per `timeUnits` bars on a 1×1 line. */
  readonly priceUnits: number;
  /** Bars. */
  readonly timeUnits: number;
}

export interface FanAnchor {
  /** Index into the series the fan is drawn on. */
  readonly barIndex: number;
  /** The anchor bar's date, kept so the anchor survives a re-import. */
  readonly date: string;
  readonly price: number;
}

export type FanDirection = 'up' | 'down';

/** `price × time`, as the ratios are conventionally written. */
export interface FanRatio {
  readonly price: number;
  readonly time: number;
}

export const STANDARD_FAN: readonly FanRatio[] = [
  { price: 1, time: 8 },
  { price: 1, time: 4 },
  { price: 1, time: 3 },
  { price: 1, time: 2 },
  { price: 1, time: 1 },
  { price: 2, time: 1 },
  { price: 3, time: 1 },
  { price: 4, time: 1 },
  { price: 8, time: 1 },
];

export function ratioLabel(ratio: FanRatio): string {
  return `${ratio.price}×${ratio.time}`;
}

export interface FanLine {
  readonly ratio: FanRatio;
  readonly label: string;
  /** Price units per bar, signed by direction. */
  readonly slopePerBar: number;
  /** True for the 1×1, which the method treats as the balance line. */
  readonly isPrimary: boolean;
}

export interface Fan {
  readonly anchor: FanAnchor;
  readonly scale: GannScale;
  readonly direction: FanDirection;
  readonly lines: readonly FanLine[];
}

export class InvalidScaleError extends RangeError {
  readonly code = 'invalidGannScale';
  constructor() {
    super('a Gann scale needs a non-zero, finite price per time; "1×1" means nothing without it');
    this.name = 'InvalidScaleError';
  }
}

function assertScale(scale: GannScale): void {
  const ok = Number.isFinite(scale.priceUnits) && Number.isFinite(scale.timeUnits)
    && scale.priceUnits > 0 && scale.timeUnits > 0;
  if (!ok) throw new InvalidScaleError();
}

/** Price units per bar for the 1×1 line, before direction is applied. */
export function unitSlope(scale: GannScale): number {
  assertScale(scale);
  return scale.priceUnits / scale.timeUnits;
}

export function buildFan(
  anchor: FanAnchor,
  scale: GannScale,
  direction: FanDirection,
  ratios: readonly FanRatio[] = STANDARD_FAN,
): Fan {
  const unit = unitSlope(scale);
  const sign = direction === 'up' ? 1 : -1;
  return {
    anchor,
    scale,
    direction,
    lines: ratios.map((ratio) => ({
      ratio,
      label: ratioLabel(ratio),
      slopePerBar: sign * unit * (ratio.price / ratio.time),
      isPrimary: ratio.price === 1 && ratio.time === 1,
    })),
  };
}

/** Price of a fan line at a bar index. Before the anchor it is extrapolated back. */
export function priceAt(fan: Fan, line: FanLine, barIndex: number): number {
  return fan.anchor.price + line.slopePerBar * (barIndex - fan.anchor.barIndex);
}

/**
 * The bar index at which a line reaches a price, or undefined for a line that
 * never does — a flat line, or one travelling away from the target.
 */
export function barAtPrice(fan: Fan, line: FanLine, price: number): number | undefined {
  if (line.slopePerBar === 0) return undefined;
  const bars = (price - fan.anchor.price) / line.slopePerBar;
  return Number.isFinite(bars) ? fan.anchor.barIndex + bars : undefined;
}

export interface MeasuredMove {
  readonly fromBar: number;
  readonly toBar: number;
  readonly bars: number;
  readonly priceChange: number;
  /** Price units per bar. */
  readonly slopePerBar: number;
  /** The move expressed in 1×1 units: 1 means it ran exactly at the balance line. */
  readonly inUnitSlopes: number;
  readonly nearestRatio: FanRatio;
  /** How far `inUnitSlopes` is from the nearest standard ratio, as a fraction of it. */
  readonly errorToNearest: number;
  /**
   * The arctangent in degrees — reported ONLY with the scale that produced it.
   * Change the scale and the same two points subtend a different angle, so a
   * bare degree figure on a price chart is not a fact about the market.
   */
  readonly degrees: number;
}

export function measure(
  from: { readonly barIndex: number; readonly price: number },
  to: { readonly barIndex: number; readonly price: number },
  scale: GannScale,
  ratios: readonly FanRatio[] = STANDARD_FAN,
): MeasuredMove {
  const unit = unitSlope(scale);
  const bars = to.barIndex - from.barIndex;
  if (bars === 0) throw new RangeError('two points on the same bar have no slope');

  const priceChange = to.price - from.price;
  const slopePerBar = priceChange / bars;
  const inUnitSlopes = slopePerBar / unit;

  const magnitude = Math.abs(inUnitSlopes);
  let nearestRatio = ratios[0]!;
  let smallest = Infinity;
  for (const ratio of ratios) {
    const error = Math.abs(magnitude - ratio.price / ratio.time);
    if (error < smallest) { smallest = error; nearestRatio = ratio; }
  }

  return {
    fromBar: from.barIndex,
    toBar: to.barIndex,
    bars,
    priceChange,
    slopePerBar,
    inUnitSlopes,
    nearestRatio,
    errorToNearest: smallest / (nearestRatio.price / nearestRatio.time),
    degrees: (Math.atan(inUnitSlopes) * 180) / Math.PI,
  };
}
