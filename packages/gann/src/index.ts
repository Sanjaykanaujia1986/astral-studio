/**
 * @astro/gann — Gann constructions, computed exactly and labelled honestly.
 *
 * ## What this package is
 *
 * Geometry. It builds a Square of Nine, converts between values and spiral
 * angles, anchors fans with an explicit price-per-time scale, measures a move
 * against the standard ratios, and projects a planetary longitude onto a price
 * axis by a mapping the caller chose.
 *
 * ## What it is not
 *
 * It is not a forecasting tool. Nothing here is called a signal, a target, a
 * level, support or resistance. No function searches for the parameter that
 * best fits a price series: that search is what turns a drawing into a claim,
 * and it belongs in `packages/research`, which answers with a p-value, a
 * multiple-comparison correction and a rotation-test floor.
 *
 * ## Why the conventions are a document and not a comment
 *
 * "Gann" names a family of constructions whose published versions disagree on
 * handedness, starting direction, origin and the meaning of an angle. Every
 * choice this package makes is written down in `docs/GANN_CONVENTIONS.md`,
 * written before the code, and every construction carries its settings so a
 * drawing can be reproduced rather than admired.
 *
 * It computes no astronomy of its own: longitudes come from `@astro/engine`.
 */
export {
  DEFAULT_SQUARE, buildSquare, cellForValue, cellAt, ringOf,
  type SpiralDirection, type SquareCell, type SquareOfNine, type SquareSettings,
} from './square.js';

export {
  ROOT_PER_TURN, DEGREES_PER_ROOT, CROSS_ANGLES, NegativeRootError,
  spiralAngle, totalRotation, valueAtAngle, cellAngle,
} from './angle.js';

export {
  STANDARD_FAN, InvalidScaleError,
  buildFan, priceAt, barAtPrice, measure, unitSlope, ratioLabel,
  type Fan, type FanAnchor, type FanDirection, type FanLine, type FanRatio,
  type GannScale, type MeasuredMove,
} from './fan.js';

export {
  DEFAULT_CIRCLE, DEFAULT_POLYGON, InvalidLayoutError,
  buildCircle, circleAngle, circleTurn, sameDegree,
  buildPolygon, polygonCellCount, polygonPoint, polygonCorners,
  type CircleCell, type CircleChart, type CircleSettings,
  type PolygonCell, type PolygonChart, type PolygonSettings,
} from './layouts.js';

export {
  projectLongitude, projectAll, nearestTurn,
  type BodyLongitude, type LinearProjectionSettings, type ProjectedPrice,
  type ProjectionMethod, type ProjectionSettings, type SquareProjectionSettings,
  type ZodiacContext,
} from './projection.js';
