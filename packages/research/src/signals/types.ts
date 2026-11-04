/**
 * Astrological signals: a chart configuration expressed as a boolean over time.
 *
 * This layer knows nothing about markets. It answers one question — "was this
 * configuration in force on this day?" — and the answer is the same whether it
 * is later compared against equity prices, rainfall, or nothing at all. Keeping
 * it market-blind is what stops the tempting shortcut of tuning a signal
 * definition until it fits a particular price series.
 *
 * Signals are DESCRIPTIONS OF THE SKY. They carry no claim, implicit or
 * otherwise, that the sky moves markets.
 */
import type { AspectName, Body, SignName } from '@astro/engine';

/**
 * A signal specification.
 *
 * A discriminated union rather than a callback, so a signal is data: it can be
 * serialised into a saved study, listed in a UI, enumerated for a batch run,
 * and — critically — COUNTED, which is what makes honest multiple-comparison
 * correction possible.
 */
export type SignalSpec =
  | RetrogradeSignal
  | SignOccupancySignal
  | AspectWindowSignal
  | PhaseRangeSignal
  | DeclinationSignal;

export interface SignalBase {
  /** Stable identifier, unique within a study. */
  readonly id: string;
}

/** Body is retrograde. */
export interface RetrogradeSignal extends SignalBase {
  readonly kind: 'retrograde';
  readonly body: Body;
}

/** Body is in a given sign. */
export interface SignOccupancySignal extends SignalBase {
  readonly kind: 'sign-occupancy';
  readonly body: Body;
  readonly sign: SignName;
}

/**
 * Within ±`windowDays` of an exact aspect between two bodies.
 *
 * The window is measured from the EXACT instant found by root-finding, not
 * from a day on which the orb happened to be small. Those differ by up to a
 * day for fast pairs, which is most of the window for a tight one.
 */
export interface AspectWindowSignal extends SignalBase {
  readonly kind: 'aspect-window';
  readonly bodyA: Body;
  readonly bodyB: Body;
  readonly aspect: AspectName;
  readonly windowDays: number;
}

/**
 * Synodic phase of a pair within [`fromDegrees`, `toDegrees`).
 *
 * Signed elongation over the full circle, so the waxing square (90°) and the
 * waning square (270°) are distinguishable — which an aspect, being an
 * unsigned separation, cannot do. Wraps correctly when from > to.
 */
export interface PhaseRangeSignal extends SignalBase {
  readonly kind: 'phase-range';
  readonly fast: Body;
  readonly slow: Body;
  readonly fromDegrees: number;
  readonly toDegrees: number;
}

/** Declination beyond a threshold, north or south. */
export interface DeclinationSignal extends SignalBase {
  readonly kind: 'declination';
  readonly body: Body;
  readonly minimumAbsolute: number;
  readonly hemisphere: 'north' | 'south' | 'either';
}

/**
 * An evaluated signal: one boolean per date, in the order the dates were given.
 *
 * `activeDays` and `totalDays` travel with it because the balance between them
 * governs how much a comparison can possibly show. A signal active on 2% of
 * days is being asked to prove itself on a fiftieth of the sample, and the
 * caller has to be able to see that before reading a p-value.
 */
export interface EvaluatedSignal {
  readonly spec: SignalSpec;
  readonly dates: readonly string[];
  readonly active: readonly boolean[];
  readonly activeDays: number;
  readonly totalDays: number;
}
