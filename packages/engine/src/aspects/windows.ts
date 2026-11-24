/**
 * Aspect windows: when an aspect comes into orb, when it is exact, and when it
 * leaves orb again — for two moving bodies (transit to transit) or a moving
 * body against a fixed longitude (transit to natal).
 *
 * The aspectarian (`buildAspectarian`) answers "when is it exact?". A research
 * study needs more: the whole stretch of time the aspect is in orb, which pass
 * of a retrograde loop each exact hit is, and the case an exact list cannot
 * show at all — a body that comes into orb, turns at a station and leaves
 * again without ever reaching exactitude. Those windows are found here.
 *
 * ## The functions solved
 *
 * - `e(t) = aspectError(lonA, lonB, angle)`: signed distance from the nearer
 *   exact branch (Δ = +angle or Δ = −angle). Its zeros are the exact hits; the
 *   same function the aspectarian roots on.
 * - `|e(t)| − allowedOrb`: its zeros are the orb boundaries. |e| is continuous
 *   even where `aspectError` switches branch (both branches are the same
 *   distance away there), so entry and exit need no wrap handling.
 *
 * Both are bracketed on a fixed grid sized from the faster body
 * (`DEFAULT_STEP_DAYS`) and refined with Brent's method, so times are good to
 * {@link WINDOW_TIME_TOLERANCE_DAYS}. A window whose closest approach falls
 * short of exact is refined by golden-section search on |e|.
 *
 * ## Phase
 *
 * Applying while |e| is shrinking, separating while it grows — the sign of
 * e × (speedA − speedB), the rule `classifyMotion` already uses. Decided from
 * the motion, never from the separation alone: the same 3° can be applying on
 * one day and separating on another.
 */
import type { Degrees } from '../math/angles.js';
import { separation, signedDelta, norm360 } from '../math/angles.js';
import { brentRoot } from '../math/roots.js';
import { julianDayToIsoUtc } from '../time/julian.js';
import type { EphemerisProvider } from '../ephemeris/provider.js';
import type { Body, ZodiacMode } from '../ephemeris/types.js';
import { DEFAULT_STEP_DAYS } from '../transits/types.js';
import { aspectError, classifyMotion, type AspectMotion } from './engine.js';
import { findCrossings } from './crossing.js';
import { ASPECT_DEFINITIONS, maxOrbFor, type AspectName, type OrbProfile } from './definitions.js';

/** Event times are refined to this many days (about 0.1 s). */
export const WINDOW_TIME_TOLERANCE_DAYS = 1e-6;
/** A pass counts as exact when its closest approach is within this many degrees (0.36″). */
export const EXACT_ANGLE_TOLERANCE = 1e-4;

/**
 * Orb strength, 0 to 100: how close the aspect is, as a share of its allowed orb.
 *
 *     100 × clamp(1 − actualOrb / allowedOrb, 0, 1)
 *
 * It measures angular closeness only — not importance, not effect. With a
 * zero allowed orb only exactness counts: 100 when the orb is within
 * {@link EXACT_ANGLE_TOLERANCE}, otherwise 0.
 */
export function orbStrength(actualOrb: Degrees, allowedOrb: Degrees): number {
  if (!(allowedOrb > 0)) return Math.abs(actualOrb) <= EXACT_ANGLE_TOLERANCE ? 100 : 0;
  return 100 * Math.min(1, Math.max(0, 1 - Math.abs(actualOrb) / allowedOrb));
}

/** Who each side of a comparison is. */
export type AspectRole = 'transit' | 'natal';

/** One side of a window: a moving body, or a fixed natal longitude. */
export type WindowSide =
  | { readonly role: 'transit'; readonly body: Body }
  | { readonly role: 'natal'; readonly id: string; readonly longitude: Degrees };

/** Which way round the circle the aspect stands: B ahead of A by the angle, or behind. */
export type AspectBranch = 'waxing' | 'waning' | 'conjunct' | 'opposite';

/** Everything about one aspect at one instant, for inspection. */
export interface AspectState {
  readonly jd: number;
  readonly utcIso: string;
  readonly longitudeA: Degrees;
  readonly longitudeB: Degrees;
  readonly speedA: number;
  readonly speedB: number;
  /** Shortest arc between the two longitudes, [0, 180]. */
  readonly separation: Degrees;
  readonly targetAngle: Degrees;
  /** |separation − targetAngle| on the nearer branch. */
  readonly actualOrb: Degrees;
  readonly allowedOrb: Degrees;
  readonly inOrb: boolean;
  readonly orbStrength: number;
  readonly phase: AspectMotion;
  readonly branch: AspectBranch;
}

/** One pass of exactness inside a window. */
export interface WindowExact {
  readonly jd: number;
  readonly utcIso: string;
  /** 1-based, within this window. */
  readonly passIndex: number;
  /** Relative speed at exactness, degrees/day. */
  readonly relativeSpeed: number;
  readonly retrogradeA: boolean;
  readonly retrogradeB: boolean;
}

/**
 * The stretch of time an aspect is in orb.
 *
 * `entryJd` is null when the aspect was already in orb at the start of the
 * searched range, `exitJd` when it is still in orb at the end: the window is
 * cut by the range, not by the sky, and says so.
 */
export interface AspectWindow {
  readonly id: string;
  readonly sideA: WindowSide;
  readonly sideB: WindowSide;
  readonly aspect: AspectName;
  readonly targetAngle: Degrees;
  readonly allowedOrb: Degrees;
  readonly entryJd: number | null;
  readonly exitJd: number | null;
  readonly exacts: readonly WindowExact[];
  /** Instant of the closest approach (an exact pass when there is one). */
  readonly closestJd: number;
  readonly closestOrb: Degrees;
  /** False for a window that came into orb and turned away before exactitude. */
  readonly perfected: boolean;
}

export interface WindowSearchOptions {
  readonly fromJd: number;
  readonly toJd: number;
  readonly sideA: WindowSide;
  readonly sideB: WindowSide;
  readonly aspects: readonly AspectName[];
  /** Orb per aspect and body; or a fixed orb for every aspect. */
  readonly orbs: OrbProfile | Degrees;
  readonly zodiac?: ZodiacMode;
  readonly stepDays?: number;
}

const bodyOf = (side: WindowSide): Body | undefined => (side.role === 'transit' ? side.body : undefined);
const sideKey = (side: WindowSide): string => (side.role === 'transit' ? side.body : `natal:${side.id}`);

/** Allowed orb for an aspect between two sides; a natal side takes the transiting body's allowance. */
export function allowedOrbFor(orbs: OrbProfile | Degrees, aspect: AspectName, a: WindowSide, b: WindowSide): Degrees {
  if (typeof orbs === 'number') return orbs;
  const ba = bodyOf(a) ?? bodyOf(b)!;
  const bb = bodyOf(b) ?? bodyOf(a)!;
  return maxOrbFor(orbs, aspect, ba, bb);
}

function positionOf(provider: EphemerisProvider, side: WindowSide, jd: number, zodiac: ZodiacMode | undefined): { lon: number; speed: number; retro: boolean } {
  if (side.role === 'natal') return { lon: norm360(side.longitude), speed: 0, retro: false };
  const p = provider.calc(jd, side.body, zodiac ? { zodiac } : {});
  return { lon: p.longitude, speed: p.longitudeSpeed, retro: p.retrograde };
}

function branchOf(lonA: Degrees, lonB: Degrees, angle: Degrees): AspectBranch {
  if (angle === 0) return 'conjunct';
  if (angle === 180) return 'opposite';
  // B − A on the circle: B ahead of A by the angle is the waxing branch.
  return signedDelta(lonB, lonA) >= 0 ? 'waxing' : 'waning';
}

/** The full state of one aspect at one instant. */
export function aspectStateAt(
  provider: EphemerisProvider,
  jd: number,
  sideA: WindowSide,
  sideB: WindowSide,
  aspect: AspectName,
  allowedOrb: Degrees,
  zodiac?: ZodiacMode,
): AspectState {
  const angle = ASPECT_DEFINITIONS[aspect].angle;
  const a = positionOf(provider, sideA, jd, zodiac);
  const b = positionOf(provider, sideB, jd, zodiac);
  const actualOrb = Math.abs(aspectError(a.lon, b.lon, angle));
  return {
    jd,
    utcIso: julianDayToIsoUtc(jd),
    longitudeA: a.lon,
    longitudeB: b.lon,
    speedA: a.speed,
    speedB: b.speed,
    separation: separation(a.lon, b.lon),
    targetAngle: angle,
    actualOrb,
    allowedOrb,
    inOrb: actualOrb <= allowedOrb,
    orbStrength: orbStrength(actualOrb, allowedOrb),
    phase: classifyMotion(a.lon, a.speed, b.lon, b.speed, angle, 1e-9),
    branch: branchOf(a.lon, b.lon, angle),
  };
}

/** Golden-section minimum of f on [lo, hi]. */
function goldenMin(f: (x: number) => number, lo: number, hi: number, tolerance: number): number {
  const r = (Math.sqrt(5) - 1) / 2;
  let a = lo; let b = hi;
  let c = b - r * (b - a); let d = a + r * (b - a);
  let fc = f(c); let fd = f(d);
  while (b - a > tolerance) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/**
 * Every window of each aspect between two sides over a date range.
 *
 * Natal sides stay fixed while the transiting side is advanced, so a
 * transit-to-natal window is the transiting body's own retrograde loop over
 * the natal point.
 */
export function findAspectWindows(provider: EphemerisProvider, options: WindowSearchOptions): AspectWindow[] {
  const { fromJd, toJd, sideA, sideB, zodiac } = options;
  if (!(toJd > fromJd)) throw new RangeError(`findAspectWindows requires toJd > fromJd (got ${fromJd}, ${toJd})`);
  if (sideA.role === 'natal' && sideB.role === 'natal') {
    throw new RangeError('findAspectWindows needs at least one moving side; compare two natal points with findAspects');
  }
  const bodies = [bodyOf(sideA), bodyOf(sideB)].filter((x): x is Body => x !== undefined);
  const step = options.stepDays ?? Math.min(...bodies.map((b) => DEFAULT_STEP_DAYS[b]));

  // One grid of positions, shared by every aspect.
  const jds: number[] = [];
  for (let jd = fromJd; ; jd += step) {
    const at = Math.min(jd, toJd);
    jds.push(at);
    if (at >= toJd) break;
  }
  const lonA = jds.map((jd) => positionOf(provider, sideA, jd, zodiac).lon);
  const lonB = jds.map((jd) => positionOf(provider, sideB, jd, zodiac).lon);

  const windows: AspectWindow[] = [];
  for (const aspect of options.aspects) {
    const angle = ASPECT_DEFINITIONS[aspect].angle;
    const allowed = allowedOrbFor(options.orbs, aspect, sideA, sideB);
    if (!(allowed >= 0)) continue;
    const e = (jd: number): number =>
      aspectError(positionOf(provider, sideA, jd, zodiac).lon, positionOf(provider, sideB, jd, zodiac).lon, angle);
    const g = (jd: number): number => Math.abs(e(jd)) - allowed;
    const eValues = jds.map((_, i) => aspectError(lonA[i]!, lonB[i]!, angle));
    const gValues = eValues.map((x) => Math.abs(x) - allowed);

    // Orb boundaries: sign changes of g, refined.
    const boundaries: { jd: number; entering: boolean }[] = [];
    for (let i = 1; i < jds.length; i += 1) {
      const p = gValues[i - 1]!; const q = gValues[i]!;
      if (p > 0 && q <= 0) boundaries.push({ jd: q === 0 ? jds[i]! : brentRoot(g, jds[i - 1]!, jds[i]!, { tolerance: WINDOW_TIME_TOLERANCE_DAYS }), entering: true });
      else if (p <= 0 && q > 0) boundaries.push({ jd: p === 0 ? jds[i - 1]! : brentRoot(g, jds[i - 1]!, jds[i]!, { tolerance: WINDOW_TIME_TOLERANCE_DAYS }), entering: false });
    }
    const exactRoots = findCrossings(jds, eValues, e, { tolerance: WINDOW_TIME_TOLERANCE_DAYS });

    // Pair the boundaries into windows; the range edges close any open one.
    const spans: { from: number; to: number; entry: number | null; exit: number | null }[] = [];
    let open: number | null = gValues[0]! <= 0 ? fromJd : null;
    let openEntry: number | null = null;
    for (const b of boundaries) {
      if (b.entering) { open = b.jd; openEntry = b.jd; }
      else if (open !== null) { spans.push({ from: open, to: b.jd, entry: openEntry, exit: b.jd }); open = null; openEntry = null; }
    }
    if (open !== null) spans.push({ from: open, to: toJd, entry: openEntry, exit: null });

    for (const span of spans) {
      const inside = exactRoots.filter((jd) => jd >= span.from - 1e-9 && jd <= span.to + 1e-9);
      let closestJd: number;
      if (inside.length > 0) {
        closestJd = inside[0]!;
      } else {
        closestJd = goldenMin((jd) => Math.abs(e(jd)), span.from, span.to, WINDOW_TIME_TOLERANCE_DAYS);
        // The window may be cut by the range; its edge can be the closest point.
        for (const edge of [span.from, span.to]) if (Math.abs(e(edge)) < Math.abs(e(closestJd))) closestJd = edge;
      }
      const closestOrb = Math.abs(e(closestJd));
      const exacts: WindowExact[] = inside.map((jd, k) => {
        const a = positionOf(provider, sideA, jd, zodiac); const b = positionOf(provider, sideB, jd, zodiac);
        return { jd, utcIso: julianDayToIsoUtc(jd), passIndex: k + 1, relativeSpeed: a.speed - b.speed, retrogradeA: a.retro, retrogradeB: b.retro };
      });
      const anchor = inside[0] ?? closestJd;
      windows.push({
        id: `${sideKey(sideA)}|${sideKey(sideB)}|${aspect}|${julianDayToIsoUtc(span.entry ?? anchor).slice(0, 16)}`,
        sideA, sideB, aspect, targetAngle: angle, allowedOrb: allowed,
        entryJd: span.entry, exitJd: span.exit, exacts, closestJd, closestOrb,
        perfected: inside.length > 0 || closestOrb <= EXACT_ANGLE_TOLERANCE,
      });
    }
  }
  return windows.sort((x, y) => (x.entryJd ?? x.closestJd) - (y.entryJd ?? y.closestJd));
}
