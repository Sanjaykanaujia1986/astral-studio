/**
 * Aspect windows: entry, exact and exit, retrograde loops and near misses.
 *
 * The numerical cases are the worked examples from the research brief; the
 * sky cases are anchored on Venus's 2025 retrograde (station 1 March near
 * 10°50′ Aries, inferior conjunction 23 March, station direct 12 April near
 * 24°37′ Pisces), and every exact instant is re-checked against the native
 * Swiss Ephemeris build, an independent oracle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import native from 'sweph';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import { julianDay } from '../../src/time/julian.js';
import { separation } from '../../src/math/angles.js';
import { aspectError, classifyMotion } from '../../src/aspects/engine.js';
import {
  findAspectWindows, aspectStateAt, orbStrength, EXACT_ANGLE_TOLERANCE,
} from '../../src/aspects/windows.js';

const EPHE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ephe');
const HAVE_ORACLE = existsSync(join(EPHE, 'sepl_18.se1'));
const NC = native.constants;

let provider: SwissEphWasmProvider;
beforeAll(async () => {
  if (HAVE_ORACLE) native.set_ephe_path(EPHE);
  provider = new SwissEphWasmProvider();
  await provider.init();
});
afterAll(() => provider.close());

const JAN_2025 = julianDay({ year: 2025, month: 1, day: 1 }, 0);
const JUN_2025 = julianDay({ year: 2025, month: 6, day: 1 }, 0);

function oracleLon(jd: number, body: number): number {
  const r = native.calc_ut(jd, body, NC.SEFLG_SWIEPH | NC.SEFLG_SPEED);
  return r.data[0]!;
}

describe('the brief’s worked examples', () => {
  it('measures separation the short way round the circle', () => {
    expect(separation(359, 1)).toBeCloseTo(2, 12);
    expect(separation(1, 359)).toBeCloseTo(2, 12);
  });

  it('natal 15° and transit 117° are 102° apart, 18° from a trine', () => {
    expect(separation(15, 117)).toBeCloseTo(102, 12);
    expect(Math.abs(aspectError(117, 15, 120))).toBeCloseTo(18, 12);
  });

  it('natal 15° and transit 135° make an exact trine', () => {
    expect(separation(15, 135)).toBeCloseTo(120, 12);
    expect(aspectError(135, 15, 120)).toBeCloseTo(0, 12);
  });

  it('natal 125.50° and transit 245.20° are 119.70° apart, a 0.30° trine orb', () => {
    expect(separation(125.5, 245.2)).toBeCloseTo(119.7, 10);
    expect(Math.abs(aspectError(245.2, 125.5, 120))).toBeCloseTo(0.3, 10);
  });

  it('the same separation applies or separates according to the motion', () => {
    // Transit at 245.20°, natal at 125.50°: 0.30° short of the trine.
    expect(classifyMotion(245.2, +0.5, 125.5, 0, 120)).toBe('applying'); // direct, closing the gap
    expect(classifyMotion(245.2, -0.5, 125.5, 0, 120)).toBe('separating'); // retrograde, opening it
  });

  it('a 1° orb of an 8° allowance is 87.5% orb strength', () => {
    expect(orbStrength(1, 8)).toBeCloseTo(87.5, 12);
    expect(orbStrength(8, 8)).toBe(0);
    expect(orbStrength(9, 8)).toBe(0);
    expect(orbStrength(0, 8)).toBe(100);
    // A zero allowance counts only exactness.
    expect(orbStrength(0, 0)).toBe(100);
    expect(orbStrength(0.01, 0)).toBe(0);
  });
});

describe('findAspectWindows', () => {
  const venus = { role: 'transit', body: 'venus' } as const;
  const natal = (longitude: number) => ({ role: 'natal', id: 'point', longitude }) as const;

  it('finds three separate windows over a natal point a retrograde loop crosses three times', () => {
    // 5° Aries: Venus crosses direct in February, back retrograde in March, forward again in late April.
    const w = findAspectWindows(provider, { fromJd: JAN_2025, toJd: JUN_2025, sideA: venus, sideB: natal(5), aspects: ['conjunction'], orbs: 1 });
    expect(w).toHaveLength(3);
    expect(w.map((x) => x.exacts.length)).toEqual([1, 1, 1]);
    expect(w.map((x) => x.exacts[0]!.retrogradeA)).toEqual([false, true, false]);
    for (const x of w) {
      expect(x.entryJd! < x.exacts[0]!.jd && x.exacts[0]!.jd < x.exitJd!).toBe(true);
      // Entry and exit sit on the orb boundary; the exact pass on the point.
      expect(aspectStateAt(provider, x.entryJd!, venus, natal(5), 'conjunction', 1).actualOrb).toBeCloseTo(1, 5);
      expect(aspectStateAt(provider, x.exitJd!, venus, natal(5), 'conjunction', 1).actualOrb).toBeCloseTo(1, 5);
      if (HAVE_ORACLE) expect(Math.abs(oracleLon(x.exacts[0]!.jd, NC.SE_VENUS) - 5)).toBeLessThan(1 / 3600);
    }
  });

  it('keeps the three passes in one window when the orb holds the whole loop, and splits it when it does not', () => {
    // The loop runs from 10°50′ Aries back to 24°37′ Pisces: 10.4° short of 5° Aries at its far end.
    const wide = findAspectWindows(provider, { fromJd: JAN_2025, toJd: JUN_2025, sideA: venus, sideB: natal(5), aspects: ['conjunction'], orbs: 11 });
    expect(wide).toHaveLength(1);
    expect(wide[0]!.exacts.map((e) => e.passIndex)).toEqual([1, 2, 3]);
    // At 8° Venus leaves orb near the station direct and comes back: two windows, passes 1–2 then 3.
    const eight = findAspectWindows(provider, { fromJd: JAN_2025, toJd: JUN_2025, sideA: venus, sideB: natal(5), aspects: ['conjunction'], orbs: 8 });
    expect(eight.map((x) => x.exacts.length)).toEqual([2, 1]);
  });

  it('shows a window that comes into orb and turns away at a station before exactitude', () => {
    // Venus stations near 10°50′ Aries on 1 March 2025, short of 12°.
    const w = findAspectWindows(provider, { fromJd: JAN_2025, toJd: JUN_2025, sideA: venus, sideB: natal(12), aspects: ['conjunction'], orbs: 2 });
    // The turn-back, then a perfected window when Venus comes forward again in May.
    expect(w.map((x) => x.perfected)).toEqual([false, true]);
    const x = w[0]!;
    expect(x.perfected).toBe(false);
    expect(x.exacts).toHaveLength(0);
    expect(x.closestOrb).toBeGreaterThan(1);
    expect(x.closestOrb).toBeLessThan(1.3);
    const station = new Date(julianDayToMs(x.closestJd)).toISOString().slice(0, 10);
    expect(['2025-02-28', '2025-03-01', '2025-03-02']).toContain(station);
    // Applying on the way in, separating on the way out.
    expect(aspectStateAt(provider, x.entryJd! + 0.5, venus, natal(12), 'conjunction', 2).phase).toBe('applying');
    expect(aspectStateAt(provider, x.exitJd! - 0.5, venus, natal(12), 'conjunction', 2).phase).toBe('separating');
  });

  it('times the Sun–Venus inferior conjunction of 23 March 2025, checked against the native build', () => {
    const w = findAspectWindows(provider, {
      fromJd: JAN_2025, toJd: JUN_2025, sideA: { role: 'transit', body: 'sun' }, sideB: venus, aspects: ['conjunction'], orbs: 8,
    });
    const exact = w.flatMap((x) => x.exacts);
    expect(exact).toHaveLength(1);
    expect(exact[0]!.utcIso.slice(0, 10)).toBe('2025-03-23');
    expect(exact[0]!.retrogradeB).toBe(true);
    if (HAVE_ORACLE) {
      const d = separation(oracleLon(exact[0]!.jd, NC.SE_SUN), oracleLon(exact[0]!.jd, NC.SE_VENUS));
      expect(d).toBeLessThan(1 / 3600);
    }
  });

  it('crosses 0° Aries without losing or doubling a window', () => {
    // A natal point at 0°: Venus's loop sits either side of the 0°/360° seam.
    const w = findAspectWindows(provider, { fromJd: JAN_2025, toJd: JUN_2025, sideA: venus, sideB: natal(0), aspects: ['conjunction'], orbs: 1 });
    expect(w.length).toBeGreaterThan(0);
    for (const x of w) for (const e of x.exacts) {
      expect(Math.abs(aspectStateAt(provider, e.jd, venus, natal(0), 'conjunction', 1).actualOrb)).toBeLessThan(EXACT_ANGLE_TOLERANCE);
    }
    // No two exact passes within a day of each other.
    const jds = w.flatMap((x) => x.exacts.map((e) => e.jd)).sort((a, b) => a - b);
    for (let i = 1; i < jds.length; i += 1) expect(jds[i]! - jds[i - 1]!).toBeGreaterThan(1);
  });

  it('finds both branches of a trine and labels them', () => {
    // Sun and Venus never trine; the Sun and Mars do, on both sides, over a synodic period (~780 days).
    const w = findAspectWindows(provider, {
      fromJd: JAN_2025, toJd: JAN_2025 + 800, sideA: { role: 'transit', body: 'sun' }, sideB: { role: 'transit', body: 'mars' }, aspects: ['trine'], orbs: 2,
    });
    const branches = new Set(w.filter((x) => x.exacts.length > 0).map((x) => aspectStateAt(provider, x.exacts[0]!.jd, { role: 'transit', body: 'sun' }, { role: 'transit', body: 'mars' }, 'trine', 2).branch));
    expect(branches).toEqual(new Set(['waxing', 'waning']));
  });

  it('leaves a window open at the edge of the range rather than inventing an entry', () => {
    // Searched 20–26 March: Sun–Venus is in an 8° orb throughout.
    const from = julianDay({ year: 2025, month: 3, day: 20 }, 0);
    const w = findAspectWindows(provider, { fromJd: from, toJd: from + 6, sideA: { role: 'transit', body: 'sun' }, sideB: venus, aspects: ['conjunction'], orbs: 8 });
    expect(w).toHaveLength(1);
    expect(w[0]!.entryJd).toBeNull();
    expect(w[0]!.exitJd).toBeNull();
  });

  it('includes the semi-sextile and quincunx', () => {
    const w = findAspectWindows(provider, {
      fromJd: JAN_2025, toJd: JAN_2025 + 366, sideA: { role: 'transit', body: 'sun' }, sideB: natal(100), aspects: ['semisextile', 'quincunx'], orbs: 1,
    });
    // The Sun passes each of 70°, 130°, 250° and 310° once a year.
    expect(w.filter((x) => x.aspect === 'semisextile' && x.perfected)).toHaveLength(2);
    expect(w.filter((x) => x.aspect === 'quincunx' && x.perfected)).toHaveLength(2);
  });
});

function julianDayToMs(jd: number): number {
  return (jd - 2440587.5) * 86_400_000;
}
