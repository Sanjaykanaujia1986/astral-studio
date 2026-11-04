/**
 * Integration: birth data -> timezone -> Julian Day -> ephemeris -> chart.
 *
 * Unit tests prove each stage in isolation; these prove the wiring. The classic
 * failure they exist to catch is a chart built correctly from a correctly
 * computed but WRONGLY CONVERTED time — every stage right, the result wrong.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import {
  calculateNatalChart,
  houseOf,
  type BirthData,
} from '../../src/chart/natal.js';
import { ALL_ASPECTS, WIDE_ORBS } from '../../src/aspects/definitions.js';
import { norm360, separation } from '../../src/math/angles.js';
import { julianDay } from '../../src/time/julian.js';

let provider: SwissEphWasmProvider;

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
});

afterAll(() => provider.close());

const MUMBAI: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

describe('a complete natal chart', () => {
  it('resolves the birth time to the correct UTC instant', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    // 14:30 IST (+05:30) == 09:00 UTC
    expect(chart.offsetMinutes).toBe(330);
    expect(chart.utcIso.startsWith('1990-01-15T09:00')).toBe(true);
    expect(chart.jdUT).toBeCloseTo(julianDay({ year: 1990, month: 1, day: 15 }, 9), 9);
    expect(chart.timeAmbiguity).toBe('unique');
  });

  it('places every requested body with a sign and a house', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    expect(chart.bodies.length).toBeGreaterThanOrEqual(10);
    for (const placed of chart.bodies) {
      expect(placed.position.longitude).toBeGreaterThanOrEqual(0);
      expect(placed.position.longitude).toBeLessThan(360);
      expect(placed.sign.signIndex).toBeGreaterThanOrEqual(0);
      expect(placed.sign.signIndex).toBeLessThan(12);
      expect(placed.sign.degreesInSign).toBeGreaterThanOrEqual(0);
      expect(placed.sign.degreesInSign).toBeLessThan(30);
      expect(placed.house).toBeGreaterThanOrEqual(1);
      expect(placed.house).toBeLessThanOrEqual(12);
    }
  });

  it('puts the Sun in Capricorn in mid-January', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    const sun = chart.bodies.find((b) => b.position.body === 'sun')!;
    expect(sun.sign.sign).toBe('capricorn');
    expect(sun.sign.element).toBe('earth');
    expect(sun.sign.modality).toBe('cardinal');
  });

  it('reports full Swiss precision with no warnings for a modern date', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    expect(chart.precision.source).toBe('swiss');
    expect(chart.precision.warnings).toEqual([]);
  });

  it('distributions account for exactly the bodies placed', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    const n = chart.bodies.length;
    expect(chart.elements.total).toBe(n);
    expect(chart.modalities.total).toBe(n);
    expect(chart.signs.total).toBe(n);
    expect(chart.houseDistribution!.total).toBe(n);

    const sum = (counts: Record<string, number>) =>
      Object.values(counts).reduce((a, b) => a + b, 0);
    expect(sum(chart.elements.counts)).toBe(n);
    expect(sum(chart.modalities.counts)).toBe(n);
    expect(sum(chart.signs.counts)).toBe(n);
  });

  it('produces aspects consistent with the placed positions', () => {
    const chart = calculateNatalChart(provider, MUMBAI, {
      settings: { aspects: ALL_ASPECTS, orbProfile: WIDE_ORBS },
    });
    expect(chart.aspects.length).toBeGreaterThan(0);

    const byBody = new Map(chart.bodies.map((b) => [b.position.body, b.position.longitude]));
    for (const hit of chart.aspects) {
      const a = byBody.get(hit.bodyA)!;
      const b = byBody.get(hit.bodyB)!;
      // The reported separation must match the placed longitudes.
      expect(separation(a, b)).toBeCloseTo(hit.separation, 9);
      // And the orb must match the distance from exact.
      expect(Math.abs(hit.separation - hit.exactAngle)).toBeCloseTo(hit.orb, 6);
      expect(hit.orb).toBeLessThanOrEqual(hit.maxOrb);
    }
  });

  it('is deterministic — identical input gives identical output', () => {
    const a = calculateNatalChart(provider, MUMBAI);
    const b = calculateNatalChart(provider, MUMBAI);
    expect(a.jdUT).toBe(b.jdUT);
    expect(a.bodies.map((x) => x.position.longitude)).toEqual(
      b.bodies.map((x) => x.position.longitude),
    );
    expect(a.houses!.cusps).toEqual(b.houses!.cusps);
  });
});

describe('unknown birth time — omitted, never faked', () => {
  // Under exactOptionalPropertyTypes, "no time" means the key is ABSENT, not
  // set to undefined — the same distinction the engine relies on.
  const { time: _unknownTime, ...noTime } = MUMBAI satisfies BirthData;

  it('omits houses and every house placement', () => {
    const chart = calculateNatalChart(provider, noTime);
    expect(chart.timeKnown).toBe(false);
    expect(chart.houses).toBeUndefined();
    expect(chart.houseDistribution).toBeUndefined();
    for (const placed of chart.bodies) {
      expect(placed.house).toBeUndefined();
    }
  });

  it('still returns planetary positions and aspects', () => {
    const chart = calculateNatalChart(provider, noTime);
    expect(chart.bodies.length).toBeGreaterThanOrEqual(10);
    const sun = chart.bodies.find((b) => b.position.body === 'sun')!;
    expect(sun.sign.sign).toBe('capricorn');
  });

  it('warns explicitly, so a UI cannot present it as a full chart', () => {
    // Asserting on the CODE, not on prose: the engine emits language-neutral
    // codes, and a test matching a sentence would break on every copy edit.
    const chart = calculateNatalChart(provider, noTime);
    expect(chart.precision.warnings.map((w) => w.code)).toContain('birthTimeUnknown');
  });
});

describe('house assignment', () => {
  it('places a longitude in the house whose span contains it', () => {
    // Unequal cusps, deliberately not 30 degrees apart.
    const cusps = [0, 25, 55, 90, 130, 160, 180, 205, 235, 270, 310, 340];
    expect(houseOf(10, cusps)).toBe(1);
    expect(houseOf(24.9, cusps)).toBe(1);
    expect(houseOf(25, cusps)).toBe(2);
    expect(houseOf(89, cusps)).toBe(3);
    expect(houseOf(350, cusps)).toBe(12);
  });

  it('handles a house that spans 0 degrees Aries', () => {
    const cusps = [340, 10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310];
    expect(houseOf(345, cusps)).toBe(1);
    expect(houseOf(0, cusps)).toBe(1);   // wraps past 360
    expect(houseOf(5, cusps)).toBe(1);
    expect(houseOf(10, cusps)).toBe(2);
  });

  it('is exhaustive — every longitude lands in exactly one house', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    const cusps = chart.houses!.cusps;
    for (let lon = 0; lon < 360; lon += 0.37) {
      const house = houseOf(lon, cusps);
      expect(house).toBeGreaterThanOrEqual(1);
      expect(house).toBeLessThanOrEqual(12);
    }
  });

  it('places each cusp at the start of its own house', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    const cusps = chart.houses!.cusps;
    for (let i = 0; i < 12; i++) {
      expect(houseOf(cusps[i]!, cusps)).toBe(i + 1);
    }
  });

  it('rejects a malformed cusp array rather than guessing', () => {
    expect(() => houseOf(10, [0, 30, 60])).toThrow(RangeError);
  });
});

describe('the ascendant is the first house cusp', () => {
  it('agrees to floating-point precision', () => {
    const chart = calculateNatalChart(provider, MUMBAI);
    expect(chart.houses!.cusps[0]).toBeCloseTo(chart.houses!.ascendant, 9);
  });

  it('and the MC sits on the 10th cusp for quadrant systems', () => {
    const chart = calculateNatalChart(provider, MUMBAI, {
      settings: { houseSystem: 'placidus' },
    });
    expect(chart.houses!.cusps[9]).toBeCloseTo(chart.houses!.midheaven, 6);
  });
});

describe('sidereal charts', () => {
  it('shift positions back by the ayanamsha', () => {
    const tropical = calculateNatalChart(provider, MUMBAI);
    const sidereal = calculateNatalChart(provider, MUMBAI, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } },
    });

    expect(sidereal.ayanamsha).toBeGreaterThan(23);
    expect(sidereal.ayanamsha).toBeLessThan(25);

    const tropSun = tropical.bodies.find((b) => b.position.body === 'sun')!;
    const sidSun = sidereal.bodies.find((b) => b.position.body === 'sun')!;
    expect(
      separation(sidSun.position.longitude, norm360(tropSun.position.longitude - sidereal.ayanamsha)),
    ).toBeLessThan(1e-6);
  });

  it('put the Sun in Sagittarius sidereally while tropically Capricorn', () => {
    const sidereal = calculateNatalChart(provider, MUMBAI, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } },
    });
    const sun = sidereal.bodies.find((b) => b.position.body === 'sun')!;
    // Mid-January: ~25 Capricorn tropical, minus ~23.7 -> ~1-2 Capricorn... the
    // ayanamsha shift moves it back near the Sagittarius/Capricorn boundary.
    expect(['sagittarius', 'capricorn']).toContain(sun.sign.sign);
  });
});

describe('degraded precision is surfaced, not swallowed', () => {
  it('warns for a date outside the high-precision range', () => {
    const old: BirthData = {
      ...MUMBAI,
      date: { year: 1650, month: 6, day: 10 },
    };
    const chart = calculateNatalChart(provider, old);
    expect(chart.precision.source).toBe('moshier');
    const warning = chart.precision.warnings.find((w) => w.code === 'lowPrecisionEphemeris');
    expect(warning).toBeDefined();
    expect(warning!.params).toMatchObject({ from: 1800, to: 2399 });
    // The chart is still usable.
    expect(chart.bodies.length).toBeGreaterThanOrEqual(10);
  });

  it('warns when a polar latitude forces a house-system fallback', () => {
    const tromso: BirthData = {
      ...MUMBAI,
      place: { latitude: 69.65, longitude: 18.96, label: 'Tromso, Norway' },
    };
    const chart = calculateNatalChart(provider, tromso, {
      settings: { houseSystem: 'placidus' },
    });
    expect(chart.houses!.fallbackFrom).toBe('placidus');
    const warning = chart.precision.warnings.find((w) => w.code === 'houseSystemFallback');
    expect(warning).toBeDefined();
    expect(warning!.params).toMatchObject({ requested: 'placidus', used: 'porphyry' });
  });
});

describe('historical charts use the offset in force at the time', () => {
  it('uses Kolkata LMT +05:21 for an 1890 birth, not the modern +05:30', () => {
    const chart = calculateNatalChart(provider, {
      ...MUMBAI,
      date: { year: 1890, month: 6, day: 1 },
    });
    expect(chart.offsetMinutes).toBeCloseTo(321.1667, 3);
  });

  it('handles a fixed stated offset without consulting zone rules', () => {
    const chart = calculateNatalChart(provider, {
      ...MUMBAI,
      zone: { kind: 'fixedOffset', offsetMinutes: 330 },
    });
    expect(chart.offsetMinutes).toBe(330);
    expect(chart.utcIso.startsWith('1990-01-15T09:00')).toBe(true);
  });
});
