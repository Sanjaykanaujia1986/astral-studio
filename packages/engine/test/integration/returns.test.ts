/**
 * Returns, progressions and directions.
 *
 * Every exact moment is cross-checked against the native oracle: if the engine
 * says the Sun returns to its natal longitude at time T, the oracle must agree
 * the Sun is at that longitude at T.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import native from 'sweph';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import { calculateNatalChart, type BirthData, type NatalChart } from '../../src/chart/natal.js';
import {
  findNextReturn,
  findReturns,
  natalLongitudeOf,
  ReturnNotFoundError,
} from '../../src/returns/engine.js';
import {
  secondaryProgression,
  solarArcDirections,
  TROPICAL_YEAR_DAYS,
  JULIAN_YEAR_DAYS,
} from '../../src/progressions/engine.js';
import { julianDay } from '../../src/time/julian.js';
import { separation } from '../../src/math/angles.js';

const EPHE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ephe');
const HAVE_ORACLE = existsSync(join(EPHE, 'sepl_18.se1'));
const NC = native.constants;

let provider: SwissEphWasmProvider;
let natal: NatalChart;

const BIRTH: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

beforeAll(async () => {
  if (HAVE_ORACLE) native.set_ephe_path(EPHE);
  provider = new SwissEphWasmProvider();
  await provider.init();
  natal = calculateNatalChart(provider, BIRTH);
});

afterAll(() => provider.close());

describe('the solar return is an instant, not a birthday', () => {
  const from = julianDay({ year: 2023, month: 1, day: 1 }, 0);

  it('lands where the Sun is exactly at its natal longitude', () => {
    const natalSun = natalLongitudeOf(natal, 'sun');
    const result = findNextReturn(provider, {
      body: 'sun',
      natalLongitude: natalSun,
      fromJd: from,
      place: BIRTH.place,
    });
    const atReturn = provider.calc(result.exactJd, 'sun');
    expect(separation(atReturn.longitude, natalSun) * 3600).toBeLessThan(0.01);
  });

  it.skipIf(!HAVE_ORACLE)('is confirmed by the independent oracle', () => {
    const natalSun = natalLongitudeOf(natal, 'sun');
    for (const result of findReturns(
      provider,
      { body: 'sun', natalLongitude: natalSun, fromJd: from, place: BIRTH.place },
      4,
    )) {
      const oracle = native.calc_ut(result.exactJd, NC.SE_SUN, NC.SEFLG_SWIEPH);
      expect(separation(oracle.data[0]!, natalSun) * 3600).toBeLessThan(0.01);
    }
  });

  it('drifts hours away from midnight on the birthday, and can land the day before', () => {
    // The tropical year is 365.2422 days, so the Sun reaches its natal
    // longitude at a different clock time each year.
    const natalSun = natalLongitudeOf(natal, 'sun');
    const results = findReturns(
      provider,
      { body: 'sun', natalLongitude: natalSun, fromJd: from, place: BIRTH.place },
      4,
    );

    const drifts = results.map((r) => {
      const year = Number(r.exactUtcIso.slice(0, 4));
      return (r.exactJd - julianDay({ year, month: 1, day: 15 }, 0)) * 24;
    });

    // Every one is hours off midnight, and they are not all the same.
    expect(drifts.every((h) => Math.abs(h) > 1)).toBe(true);
    expect(new Set(drifts.map((h) => Math.round(h))).size).toBeGreaterThan(1);
    // At least one falls before the 15th entirely.
    expect(drifts.some((h) => h < 0)).toBe(true);
  });

  it('CONSEQUENCE: using the birthday instead moves the Ascendant by degrees, not minutes', () => {
    // This is why the exact instant is solved rather than assumed. Planetary
    // positions barely move in a few hours; the ascendant moves a full circle
    // in twenty-four, so the entire house structure changes.
    const natalSun = natalLongitudeOf(natal, 'sun');
    const result = findNextReturn(provider, {
      body: 'sun',
      natalLongitude: natalSun,
      fromJd: julianDay({ year: 2024, month: 1, day: 1 }, 0),
      place: BIRTH.place,
    });

    const birthdayMidnight = julianDay({ year: 2024, month: 1, day: 15 }, 0);
    const naive = provider.houses(
      birthdayMidnight,
      BIRTH.place.latitude,
      BIRTH.place.longitude,
      'placidus',
    );

    const error = separation(result.chart.houses!.ascendant, naive.ascendant);
    expect(error).toBeGreaterThan(30); // measured ~122 degrees
  });

  it('casts the return chart with houses at the requested place', () => {
    const result = findNextReturn(provider, {
      body: 'sun',
      natalLongitude: natalLongitudeOf(natal, 'sun'),
      fromJd: from,
      place: BIRTH.place,
    });
    expect(result.chart.houses).toBeDefined();
    expect(result.chart.houses!.cusps).toHaveLength(12);
    expect(result.chart.place).toEqual(BIRTH.place);
  });

  it('relocating changes the houses but not the planets', () => {
    const options = {
      body: 'sun' as const,
      natalLongitude: natalLongitudeOf(natal, 'sun'),
      fromJd: from,
      place: BIRTH.place,
    };
    const home = findNextReturn(provider, options);
    const away = findNextReturn(provider, {
      ...options,
      place: { latitude: 51.5074, longitude: -0.1278, label: 'London' },
    });

    // Same instant, so identical positions...
    expect(away.exactJd).toBe(home.exactJd);
    expect(away.chart.bodies.map((b) => b.position.longitude)).toEqual(
      home.chart.bodies.map((b) => b.position.longitude),
    );
    // ...but a different sky overhead.
    expect(separation(away.chart.houses!.ascendant, home.chart.houses!.ascendant)).toBeGreaterThan(1);
  });
});

describe('other returns', () => {
  it('lunar returns repeat at about the sidereal month', () => {
    const results = findReturns(
      provider,
      {
        body: 'moon',
        natalLongitude: natalLongitudeOf(natal, 'moon'),
        fromJd: julianDay({ year: 2026, month: 1, day: 1 }, 0),
        place: BIRTH.place,
      },
      4,
    );
    expect(results).toHaveLength(4);
    for (let i = 1; i < results.length; i++) {
      const gap = results[i]!.exactJd - results[i - 1]!.exactJd;
      expect(gap).toBeGreaterThan(27.0);
      expect(gap).toBeLessThan(27.9);
    }
  });

  it('the Saturn return falls in the expected age band', () => {
    const result = findNextReturn(provider, {
      body: 'saturn',
      natalLongitude: natalLongitudeOf(natal, 'saturn'),
      fromJd: natal.jdUT + 365 * 25,
      place: BIRTH.place,
    });
    const age = (result.exactJd - natal.jdUT) / TROPICAL_YEAR_DAYS;
    expect(age).toBeGreaterThan(28);
    expect(age).toBeLessThan(30.5);
  });

  it('numbers consecutive returns and never repeats one', () => {
    const results = findReturns(
      provider,
      {
        body: 'sun',
        natalLongitude: natalLongitudeOf(natal, 'sun'),
        fromJd: julianDay({ year: 2023, month: 1, day: 1 }, 0),
        place: BIRTH.place,
      },
      5,
    );
    expect(results.map((r) => r.ordinal)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.exactJd).toBeGreaterThan(results[i - 1]!.exactJd);
      // Roughly a year apart, so no duplicate of the same crossing.
      expect(results[i]!.exactJd - results[i - 1]!.exactJd).toBeGreaterThan(300);
    }
  });

  it('searches strictly AFTER the start date', () => {
    // Starting at the natal moment, Saturn is already at its natal longitude,
    // so an inclusive search would return the birth instant as the first
    // "return" — true, and useless.
    const result = findNextReturn(provider, {
      body: 'saturn',
      natalLongitude: natalLongitudeOf(natal, 'saturn'),
      fromJd: natal.jdUT,
      place: BIRTH.place,
    });
    expect(result.exactJd).toBeGreaterThan(natal.jdUT + 365 * 20);
  });

  it('raises rather than guessing when the window is too short', () => {
    expect(() =>
      findNextReturn(provider, {
        body: 'saturn',
        natalLongitude: natalLongitudeOf(natal, 'saturn'),
        fromJd: natal.jdUT,
        place: BIRTH.place,
        windowDays: 10,
      }),
    ).toThrow(ReturnNotFoundError);
  });

  it('rejects a nonsensical count', () => {
    const options = {
      body: 'sun' as const,
      natalLongitude: natalLongitudeOf(natal, 'sun'),
      fromJd: natal.jdUT,
      place: BIRTH.place,
    };
    expect(() => findReturns(provider, options, 0)).toThrow(RangeError);
    expect(() => findReturns(provider, options, 1.5)).toThrow(RangeError);
  });
});

describe('secondary progressions — a day for a year', () => {
  it('progresses one day per year of life', () => {
    for (const age of [0, 10, 36]) {
      const target = natal.jdUT + age * TROPICAL_YEAR_DAYS;
      const progressed = secondaryProgression(provider, {
        natalJd: natal.jdUT,
        targetJd: target,
        place: BIRTH.place,
      });
      expect(progressed.elapsedYears).toBeCloseTo(age, 6);
      expect(progressed.progressedJd - natal.jdUT).toBeCloseTo(age, 6);
    }
  });

  it('moves the progressed Sun about a degree a year', () => {
    const natalSun = natalLongitudeOf(natal, 'sun');
    const progressed = secondaryProgression(provider, {
      natalJd: natal.jdUT,
      targetJd: natal.jdUT + 36 * TROPICAL_YEAR_DAYS,
      place: BIRTH.place,
    });
    const sun = progressed.chart.bodies.find((b) => b.position.body === 'sun')!;
    const arc = separation(sun.position.longitude, natalSun);
    // 36 years of roughly 1 degree, a little over because the Sun is fast in January.
    expect(arc).toBeGreaterThan(34);
    expect(arc).toBeLessThan(38);
  });

  it('at age zero the progressed chart IS the natal chart', () => {
    const progressed = secondaryProgression(provider, {
      natalJd: natal.jdUT,
      targetJd: natal.jdUT,
      place: BIRTH.place,
    });
    expect(progressed.progressedJd).toBe(natal.jdUT);
    expect(progressed.chart.bodies.map((b) => b.position.longitude)).toEqual(
      natal.bodies.map((b) => b.position.longitude),
    );
  });

  it('records the year length it used, and honours an override', () => {
    const base = { natalJd: natal.jdUT, targetJd: natal.jdUT + 100 * 365.25, place: BIRTH.place };
    const tropical = secondaryProgression(provider, base);
    const julian = secondaryProgression(provider, { ...base, yearLengthDays: JULIAN_YEAR_DAYS });

    expect(tropical.yearLengthDays).toBe(TROPICAL_YEAR_DAYS);
    expect(julian.yearLengthDays).toBe(JULIAN_YEAR_DAYS);
    // Measured: ~0.002 days of progressed time over a century of age, about
    // three minutes. Small, but the two keys genuinely differ, which is why the
    // one used is recorded on the result.
    const gap = Math.abs(tropical.progressedJd - julian.progressedJd);
    expect(gap).toBeGreaterThan(0.001);
    expect(gap).toBeLessThan(0.01);
  });

  it('allows progressing backwards', () => {
    const progressed = secondaryProgression(provider, {
      natalJd: natal.jdUT,
      targetJd: natal.jdUT - 10 * TROPICAL_YEAR_DAYS,
      place: BIRTH.place,
    });
    expect(progressed.elapsedYears).toBeCloseTo(-10, 6);
    expect(progressed.progressedJd).toBeLessThan(natal.jdUT);
  });

  it('rejects non-finite input and a non-positive year length', () => {
    const base = { natalJd: natal.jdUT, targetJd: natal.jdUT, place: BIRTH.place };
    expect(() => secondaryProgression(provider, { ...base, targetJd: Number.NaN })).toThrow(RangeError);
    expect(() => secondaryProgression(provider, { ...base, yearLengthDays: 0 })).toThrow(RangeError);
  });
});

describe('solar arc directions', () => {
  const target = () => natal.jdUT + 36 * TROPICAL_YEAR_DAYS;

  it('advances every natal position by one shared arc', () => {
    const directed = solarArcDirections(provider, {
      natalJd: natal.jdUT,
      targetJd: target(),
      place: BIRTH.place,
      natalChart: natal,
    });

    expect(directed.positions).toHaveLength(natal.bodies.length);
    for (const position of directed.positions) {
      expect(separation(position.longitude, position.natalLongitude)).toBeCloseTo(directed.arc, 6);
    }
  });

  it('takes the arc from the secondary-progressed Sun', () => {
    const directed = solarArcDirections(provider, {
      natalJd: natal.jdUT, targetJd: target(), place: BIRTH.place, natalChart: natal,
    });
    const progressed = secondaryProgression(provider, {
      natalJd: natal.jdUT, targetJd: target(), place: BIRTH.place,
    });
    const progressedSun = progressed.chart.bodies.find((b) => b.position.body === 'sun')!;
    expect(directed.arc).toBeCloseTo(
      separation(progressedSun.position.longitude, natalLongitudeOf(natal, 'sun')),
      6,
    );
  });

  it('directs the angles too, keeping them opposite', () => {
    const directed = solarArcDirections(provider, {
      natalJd: natal.jdUT, targetJd: target(), place: BIRTH.place, natalChart: natal,
    });
    expect(directed.angles).toBeDefined();
    expect(separation(directed.angles!.ascendant, directed.angles!.descendant)).toBeCloseTo(180, 9);
    expect(separation(directed.angles!.midheaven, directed.angles!.imumCoeli)).toBeCloseTo(180, 9);
    expect(separation(directed.angles!.ascendant, natal.houses!.ascendant)).toBeCloseTo(
      directed.arc, 6,
    );
  });

  it('omits angles when the natal chart has none', () => {
    const { time: _omit, ...noTime } = BIRTH satisfies BirthData;
    const timeless = calculateNatalChart(provider, noTime);
    const directed = solarArcDirections(provider, {
      natalJd: timeless.jdUT, targetJd: timeless.jdUT + 3652, place: BIRTH.place,
      natalChart: timeless,
    });
    expect(directed.angles).toBeUndefined();
  });

  it('keeps every directed longitude in range', () => {
    const directed = solarArcDirections(provider, {
      // A large arc so the wrap past 360 is genuinely exercised.
      natalJd: natal.jdUT, targetJd: natal.jdUT + 200 * TROPICAL_YEAR_DAYS,
      place: BIRTH.place, natalChart: natal,
    });
    for (const position of directed.positions) {
      expect(position.longitude).toBeGreaterThanOrEqual(0);
      expect(position.longitude).toBeLessThan(360);
    }
  });
});
