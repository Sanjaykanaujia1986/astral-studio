/**
 * Evaluating signals over a range of dates.
 *
 * One loop serves every signal kind. The alternative — a bespoke evaluator per
 * signal — would drift: two of them would end up disagreeing about what "on
 * this day" means, and the disagreement would show up as a difference in
 * results rather than as an error.
 *
 * ## What "on this day" means
 *
 * A day is sampled at **00:00 UT**, and that convention is applied to every
 * signal identically. It is a choice, not a truth: the Moon moves roughly 13°
 * in a day, so a lunar signal evaluated at midnight and at noon will disagree
 * about the boundaries. Since a daily price bar is itself an aggregate over a
 * session in some other time zone, no sampling instant is correct, and the one
 * that matters is that it is CONSISTENT and stated.
 */
import {
  findCrossings,
  julianDay,
  norm180,
  norm360,
  signPosition,
  ASPECT_DEFINITIONS,
  type AspectName,
  type Body,
  type EphemerisProvider,
} from '@astro/engine';
import type { EvaluatedSignal, SignalSpec } from './types.js';

/** Sampling instant within each UTC day. Documented above; do not vary it. */
export const SAMPLE_HOUR_UT = 0;

/** Julian Day for the sampling instant of an ISO date. */
export function jdForDate(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return julianDay({ year, month, day }, SAMPLE_HOUR_UT);
}

const MS_PER_DAY = 86_400_000;

/** Every UTC day from `from` to `to` inclusive, as ISO dates. */
export function dateRange(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new RangeError(`dateRange requires ISO dates, received ${from} and ${to}`);
  }
  const out: string[] = [];
  for (let t = start; t <= end; t += MS_PER_DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Bodies a signal needs, so each day is fetched in one ephemeris call. */
function bodiesFor(spec: SignalSpec): Body[] {
  switch (spec.kind) {
    case 'retrograde':
    case 'sign-occupancy':
    case 'declination':
      return [spec.body];
    case 'aspect-window':
      return [spec.bodyA, spec.bodyB];
    case 'phase-range':
      return [spec.fast, spec.slow];
  }
}

/**
 * Exact instants of an aspect across a span, by root-finding.
 *
 * The same machinery the transit engine uses, for the same reason: scanning
 * days and keeping the ones with a small orb finds a day near the event, not
 * the event. For a Moon aspect that is the difference between a window centred
 * on the exact moment and one offset by most of its own width.
 */
function exactAspectJds(
  provider: EphemerisProvider,
  bodyA: Body,
  bodyB: Body,
  aspect: AspectName,
  fromJd: number,
  toJd: number,
  stepDays: number,
): number[] {
  const angle = ASPECT_DEFINITIONS[aspect].angle;

  const error = (jd: number): number => {
    const a = provider.calc(jd, bodyA).longitude;
    const b = provider.calc(jd, bodyB).longitude;
    const delta = norm180(a - b);
    // Both signed offsets of the aspect are roots; take whichever is nearer so
    // the function stays continuous between brackets.
    const plus = norm180(delta - angle);
    const minus = norm180(delta + angle);
    return Math.abs(plus) <= Math.abs(minus) ? plus : minus;
  };

  const jds: number[] = [];
  const values: number[] = [];
  for (let jd = fromJd; jd <= toJd; jd += stepDays) {
    jds.push(jd);
    values.push(error(jd));
  }

  return findCrossings(jds, values, error);
}

/**
 * Step size for the aspect scan.
 *
 * Small enough that a pair cannot pass through exactness and out again between
 * samples. The Moon moves ~13°/day, so a half-day step is the coarsest that is
 * safe for lunar aspects; slower pairs are given a longer step because
 * scanning two centuries of Jupiter–Saturn at half-day resolution costs a great
 * deal and finds nothing extra.
 */
export function scanStepFor(bodyA: Body, bodyB: Body): number {
  const fast = new Set<Body>(['moon']);
  if (fast.has(bodyA) || fast.has(bodyB)) return 0.25;
  const medium = new Set<Body>(['sun', 'mercury', 'venus', 'mars']);
  if (medium.has(bodyA) || medium.has(bodyB)) return 1;
  return 3;
}

/**
 * Evaluate one signal across a list of dates.
 *
 * Dates are supplied by the caller rather than generated here, because a study
 * must evaluate the signal on exactly the days the market series has bars for.
 * Evaluating on every calendar day and then intersecting would count weekends
 * into the signal's active share and misstate the balance of the sample.
 */
export function evaluateSignal(
  provider: EphemerisProvider,
  spec: SignalSpec,
  dates: readonly string[],
): EvaluatedSignal {
  if (dates.length === 0) {
    return { spec, dates, active: [], activeDays: 0, totalDays: 0 };
  }

  const active: boolean[] = [];

  if (spec.kind === 'aspect-window') {
    // Extend the scan past both ends so a window centred just outside the
    // range still covers the days inside it.
    const pad = spec.windowDays + 2;
    const fromJd = jdForDate(dates[0]!) - pad;
    const toJd = jdForDate(dates[dates.length - 1]!) + pad;
    const exact = exactAspectJds(
      provider,
      spec.bodyA,
      spec.bodyB,
      spec.aspect,
      fromJd,
      toJd,
      scanStepFor(spec.bodyA, spec.bodyB),
    );

    for (const date of dates) {
      const jd = jdForDate(date);
      active.push(exact.some((e) => Math.abs(jd - e) <= spec.windowDays));
    }

    return finish(spec, dates, active);
  }

  const bodies = bodiesFor(spec);
  for (const date of dates) {
    const jd = jdForDate(date);
    const positions = provider.calcMany(jd, bodies, {
      includeEquatorial: spec.kind === 'declination',
    });

    switch (spec.kind) {
      case 'retrograde': {
        const position = positions[0]!;
        // Stationary days are excluded: the sign of the speed is not
        // trustworthy there, and counting them either way would put the least
        // reliable observations at the boundary of the comparison.
        active.push(position.retrograde && !position.stationary);
        break;
      }
      case 'sign-occupancy': {
        active.push(signPosition(positions[0]!.longitude).sign === spec.sign);
        break;
      }
      case 'declination': {
        const equatorial = positions[0]!.equatorial;
        if (!equatorial) {
          throw new Error('declination signal requires equatorial coordinates from the provider');
        }
        const declination = equatorial.declination;
        const magnitude = Math.abs(declination) >= spec.minimumAbsolute;
        active.push(
          spec.hemisphere === 'either'
            ? magnitude
            : spec.hemisphere === 'north'
              ? magnitude && declination > 0
              : magnitude && declination < 0,
        );
        break;
      }
      case 'phase-range': {
        const phase = norm360(positions[0]!.longitude - positions[1]!.longitude);
        const from = norm360(spec.fromDegrees);
        const to = norm360(spec.toDegrees);
        // A range that wraps past 0° is a normal request — "the last eighth of
        // the cycle" is 315° to 0° — so it is handled rather than rejected.
        active.push(from <= to ? phase >= from && phase < to : phase >= from || phase < to);
        break;
      }
    }
  }

  return finish(spec, dates, active);
}

function finish(
  spec: SignalSpec,
  dates: readonly string[],
  active: readonly boolean[],
): EvaluatedSignal {
  return {
    spec,
    dates,
    active,
    activeDays: active.reduce<number>((n, on) => n + (on ? 1 : 0), 0),
    totalDays: active.length,
  };
}

/** A short, stable, human-readable description of a signal, for logs and ids. */
export function describeSignal(spec: SignalSpec): string {
  switch (spec.kind) {
    case 'retrograde':
      return `${spec.body} retrograde`;
    case 'sign-occupancy':
      return `${spec.body} in ${spec.sign}`;
    case 'aspect-window':
      return `${spec.bodyA} ${spec.aspect} ${spec.bodyB} ±${spec.windowDays}d`;
    case 'phase-range':
      return `${spec.fast}/${spec.slow} phase ${spec.fromDegrees}–${spec.toDegrees}°`;
    case 'declination':
      return `${spec.body} |dec| ≥ ${spec.minimumAbsolute}° ${spec.hemisphere}`;
  }
}
