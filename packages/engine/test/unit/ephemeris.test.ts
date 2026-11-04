import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import {
  DateOutOfRangeError,
  EphemerisError,
  HouseCalculationError,
  sourceForJd,
  SWISS_RANGE_END_JD,
  SWISS_RANGE_START_JD,
} from '../../src/ephemeris/provider.js';
import { separation } from '../../src/math/angles.js';
import { julianDay } from '../../src/time/julian.js';

const J2000 = 2451545.0;
let provider: SwissEphWasmProvider;

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
});

afterAll(() => provider.close());

describe('lifecycle', () => {
  it('refuses to calculate before init(), rather than returning zeros', () => {
    const fresh = new SwissEphWasmProvider();
    expect(() => fresh.calc(J2000, 'sun')).toThrow(EphemerisError);
    expect(() => fresh.calc(J2000, 'sun')).toThrow(/before init/);
  });

  it('init() is idempotent', async () => {
    await provider.init();
    expect(provider.calc(J2000, 'sun').longitude).toBeGreaterThan(0);
  });
});

describe('planetary positions at J2000.0', () => {
  it('places the Sun at the known longitude with the correct speed', () => {
    const sun = provider.calc(J2000, 'sun');
    expect(sun.longitude).toBeCloseTo(280.3689, 3);
    // Earth is near perihelion in early January, so the Sun moves faster than
    // its ~0.9856 deg/day mean.
    expect(sun.longitudeSpeed).toBeCloseTo(1.0194, 3);
    expect(sun.retrograde).toBe(false);
  });

  it('gives the Moon a plausible latitude and speed', () => {
    const moon = provider.calc(J2000, 'moon');
    expect(Math.abs(moon.latitude)).toBeLessThan(5.4); // orbit inclined ~5.15 deg
    expect(moon.longitudeSpeed).toBeGreaterThan(11.7);
    expect(moon.longitudeSpeed).toBeLessThan(15.4);
  });

  it('detects Saturn retrograde in January 2000', () => {
    const saturn = provider.calc(J2000, 'saturn');
    expect(saturn.retrograde).toBe(true);
    expect(saturn.longitudeSpeed).toBeLessThan(0);
  });

  it('reports the lunar node as always retrograde', () => {
    const node = provider.calc(J2000, 'trueNode');
    expect(node.retrograde).toBe(true);
    expect(node.longitudeSpeed).toBeCloseTo(-0.0544, 3);
  });

  it('returns every default body without error', () => {
    const bodies = provider.calcMany(J2000, [
      'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter',
      'saturn', 'uranus', 'neptune', 'pluto', 'trueNode', 'chiron',
    ]);
    expect(bodies).toHaveLength(12);
    for (const b of bodies) {
      expect(b.longitude).toBeGreaterThanOrEqual(0);
      expect(b.longitude).toBeLessThan(360);
      expect(Number.isFinite(b.longitudeSpeed)).toBe(true);
    }
  });
});

describe('south node is derived, not invented', () => {
  it('sits exactly opposite the north node', () => {
    const north = provider.calc(J2000, 'trueNode');
    const south = provider.calc(J2000, 'southNode');
    expect(separation(north.longitude, south.longitude)).toBeCloseTo(180, 9);
    expect(south.latitude).toBeCloseTo(-north.latitude, 12);
    expect(south.longitudeSpeed).toBe(north.longitudeSpeed);
  });

  it('stays inside [0, 360) after the 180 shift', () => {
    for (const jd of [J2000, J2000 + 3000, J2000 + 6000, J2000 - 20000]) {
      const south = provider.calc(jd, 'southNode');
      expect(south.longitude).toBeGreaterThanOrEqual(0);
      expect(south.longitude).toBeLessThan(360);
    }
  });
});

describe('provenance — degraded results must never masquerade as full precision', () => {
  it('labels in-range dates as swiss', () => {
    expect(provider.calc(J2000, 'sun').source).toBe('swiss');
    expect(sourceForJd(SWISS_RANGE_START_JD)).toBe('swiss');
    expect(sourceForJd(SWISS_RANGE_END_JD)).toBe('swiss');
  });

  it('labels out-of-range dates as moshier', () => {
    const early = julianDay({ year: 1600, month: 1, day: 1 }, 12);
    const late = julianDay({ year: 2500, month: 1, day: 1 }, 12);
    expect(sourceForJd(early)).toBe('moshier');
    expect(sourceForJd(late)).toBe('moshier');
    expect(provider.calc(early, 'sun').source).toBe('moshier');
    expect(provider.calc(late, 'sun').source).toBe('moshier');
  });

  it('still returns a usable position for out-of-range dates — just labelled', () => {
    const early = julianDay({ year: 1600, month: 1, day: 1 }, 12);
    const sun = provider.calc(early, 'sun');
    expect(sun.longitude).toBeGreaterThanOrEqual(0);
    expect(sun.longitude).toBeLessThan(360);
    expect(sun.source).toBe('moshier');
  });

  it('rejects dates no ephemeris covers', () => {
    const absurd = julianDay({ year: -2999, month: 1, day: 1 }, 0) - 100000;
    expect(() => provider.calc(absurd, 'sun')).toThrow(DateOutOfRangeError);
    expect(() => provider.calc(Number.NaN, 'sun')).toThrow(EphemerisError);
  });
});

describe('equatorial coordinates', () => {
  it('are omitted unless requested', () => {
    expect(provider.calc(J2000, 'sun').equatorial).toBeUndefined();
  });

  it('are returned when asked for, with a plausible declination', () => {
    const sun = provider.calc(J2000, 'sun', { includeEquatorial: true });
    expect(sun.equatorial).toBeDefined();
    // Early January: the Sun sits near its southern extreme, about -23 deg.
    expect(sun.equatorial!.declination).toBeCloseTo(-23.03, 1);
    expect(sun.equatorial!.rightAscension).toBeGreaterThanOrEqual(0);
    expect(sun.equatorial!.rightAscension).toBeLessThan(360);
  });

  it('never lets declination exceed the obliquity limit for the Sun', () => {
    for (let d = 0; d < 365; d += 29) {
      const sun = provider.calc(J2000 + d, 'sun', { includeEquatorial: true });
      expect(Math.abs(sun.equatorial!.declination)).toBeLessThan(23.5);
    }
  });
});

describe('houses', () => {
  // Mumbai, 15 Aug 1947, 10:30 IST -> 05:00 UT
  const jd = julianDay({ year: 1947, month: 8, day: 15 }, 5.0);
  const LAT = 18.9667;
  const LON = 72.8333;

  it('returns twelve cusps, correctly 1-based from the wrapper', () => {
    const h = provider.houses(jd, LAT, LON, 'placidus');
    expect(h.cusps).toHaveLength(12);
    // Cusp 1 IS the ascendant — proves the off-by-one was handled.
    expect(h.cusps[0]).toBeCloseTo(h.ascendant, 9);
    for (const c of h.cusps) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(360);
    }
  });

  it('derives the angles consistently', () => {
    const h = provider.houses(jd, LAT, LON, 'placidus');
    expect(separation(h.ascendant, h.descendant)).toBeCloseTo(180, 9);
    expect(separation(h.midheaven, h.imumCoeli)).toBeCloseTo(180, 9);
  });

  it('gives whole-sign houses exactly 30 degrees apart, starting the sign of the ASC', () => {
    const h = provider.houses(jd, LAT, LON, 'wholeSign');
    for (let i = 1; i < 12; i++) {
      expect(separation(h.cusps[i]!, h.cusps[i - 1]!)).toBeCloseTo(30, 6);
    }
    expect(h.cusps[0]! % 30).toBeCloseTo(0, 9);
  });

  it('supports every configured system without engine changes', () => {
    const systems = [
      'placidus', 'koch', 'wholeSign', 'equal', 'campanus',
      'regiomontanus', 'porphyry', 'alcabitius', 'topocentric',
    ] as const;
    for (const system of systems) {
      const h = provider.houses(jd, LAT, LON, system);
      expect(h.cusps).toHaveLength(12);
      expect(h.system).toBe(system);
    }
  });

  it('validates coordinates instead of producing a silly chart', () => {
    expect(() => provider.houses(jd, 95, LON, 'placidus')).toThrow(EphemerisError);
    expect(() => provider.houses(jd, LAT, 200, 'placidus')).toThrow(EphemerisError);
  });
});

describe('houses at high latitude — Placidus is undefined near the poles', () => {
  const jd = julianDay({ year: 1990, month: 6, day: 21 }, 12);
  const TROMSO_LAT = 69.65;
  const TROMSO_LON = 18.96;

  it('falls back rather than emitting garbage, and SAYS it fell back', () => {
    const h = provider.houses(jd, TROMSO_LAT, TROMSO_LON, 'placidus');
    expect(h.fallbackFrom).toBe('placidus');
    expect(h.system).toBe('porphyry');
    expect(h.cusps).toHaveLength(12);
  });

  it('raises instead when the caller forbids a fallback', () => {
    expect(() =>
      provider.houses(jd, TROMSO_LAT, TROMSO_LON, 'placidus', { polarFallback: 'none' }),
    ).toThrow(HouseCalculationError);
  });

  it('leaves polar-safe systems alone at the same latitude', () => {
    const h = provider.houses(jd, TROMSO_LAT, TROMSO_LON, 'wholeSign');
    expect(h.fallbackFrom).toBeUndefined();
    expect(h.system).toBe('wholeSign');
  });
});

describe('sidereal zodiac and ayanamsha', () => {
  it('tropical mode has no ayanamsha', () => {
    expect(provider.ayanamsha(J2000, { kind: 'tropical' })).toBe(0);
  });

  it('Lahiri ayanamsha at J2000 is about 23.85 degrees', () => {
    const a = provider.ayanamsha(J2000, { kind: 'sidereal', ayanamsha: 'lahiri' });
    expect(a).toBeGreaterThan(23.5);
    expect(a).toBeLessThan(24.2);
  });

  it('sidereal longitude equals tropical minus the ayanamsha, EXACTLY', () => {
    // REGRESSION GUARD (mean vs true equinox).
    //
    // swe_get_ayanamsa_ut measures the ayanamsha from the MEAN equinox of
    // date, while sidereal positions are referred to the TRUE equinox. Mixing
    // them leaves a nutation-sized gap — measured at 13.93 arcsec for J2000,
    // exactly equal to nutation in longitude (-0.00386987 deg) reported by
    // SE_ECL_NUT. The provider therefore uses swe_get_ayanamsa_ex_ut with the
    // same flags as the positions.
    //
    // If this test starts failing by ~14 arcsec, that substitution was undone.
    const tropical = provider.calc(J2000, 'sun');
    const zodiac = { kind: 'sidereal', ayanamsha: 'lahiri' } as const;
    const sidereal = provider.calc(J2000, 'sun', { zodiac });
    const ayan = provider.ayanamsha(J2000, zodiac);

    const gapArcsec = separation(sidereal.longitude, tropical.longitude - ayan) * 3600;
    expect(gapArcsec).toBeLessThan(0.001);
  });

  it('stays consistent across dates and ayanamshas', () => {
    for (const ayanamsha of ['lahiri', 'raman', 'krishnamurti', 'fagenBradley'] as const) {
      for (const jd of [J2000, J2000 - 30000, J2000 + 30000]) {
        const zodiac = { kind: 'sidereal', ayanamsha } as const;
        const tropical = provider.calc(jd, 'mars');
        const sidereal = provider.calc(jd, 'mars', { zodiac });
        const ayan = provider.ayanamsha(jd, zodiac);
        const gapArcsec = separation(sidereal.longitude, tropical.longitude - ayan) * 3600;
        expect(gapArcsec, `${ayanamsha} @ jd ${jd}`).toBeLessThan(0.001);
      }
    }
  });

  it('different ayanamshas give different values, and switching back restores', () => {
    const lahiri = provider.ayanamsha(J2000, { kind: 'sidereal', ayanamsha: 'lahiri' });
    const raman = provider.ayanamsha(J2000, { kind: 'sidereal', ayanamsha: 'raman' });
    expect(Math.abs(lahiri - raman)).toBeGreaterThan(0.1);
    // Global sidereal state must not leak between calls.
    expect(provider.ayanamsha(J2000, { kind: 'sidereal', ayanamsha: 'lahiri' })).toBeCloseTo(
      lahiri,
      9,
    );
  });

  it('rejects a custom ayanamsha with no offset supplied', () => {
    expect(() =>
      provider.calc(J2000, 'sun', { zodiac: { kind: 'sidereal', ayanamsha: 'custom' } }),
    ).toThrow(EphemerisError);
  });
});

describe('stationary detection', () => {
  it('flags a body whose speed is below the threshold', () => {
    // Force the issue with a large threshold rather than hunting a real station.
    const saturn = provider.calc(J2000, 'saturn', { stationaryThreshold: 1 });
    expect(saturn.stationary).toBe(true);
    const normal = provider.calc(J2000, 'saturn');
    expect(normal.stationary).toBe(false);
  });
});
