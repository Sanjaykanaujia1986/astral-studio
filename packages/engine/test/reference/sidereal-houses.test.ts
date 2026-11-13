/**
 * Sidereal house cusps.
 *
 * ## What went wrong, and why no test caught it
 *
 * `swe_houses` takes no flags. Setting the sidereal mode first does nothing
 * for it: it always returns TROPICAL cusps. The provider called it and threw
 * away the `SEFLG_SIDEREAL` that `#applyZodiac` had just handed back, so a
 * sidereal chart came out with sidereal BODIES and tropical HOUSES — an
 * ascendant about 24° too high, which is most of a sign and lands in the
 * wrong one roughly four times out of five.
 *
 * Nothing noticed because every existing test either used the tropical
 * zodiac, where the bug is invisible, or asserted the Vedic figures against
 * values this engine had produced. A test that records what the code does
 * cannot tell you the code is wrong.
 *
 * The bug was found by comparing against a horoscope printed by unrelated
 * software. That chart belongs to a real person, so it is not kept here; every
 * input below is synthetic. What remains are the rules that the comparison
 * proved:
 *
 * 1. An INVARIANT — sidereal is tropical minus the ayanāṁśa, for every cusp,
 *    at several births. It holds whatever the right answer is.
 * 2. The two ayanāṁśas are applied independently: Krishnamurti sits about
 *    5′49″ behind Lahiri in 1993, enough to move a planet on a sign boundary
 *    into the next rāśi.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import { calculateNatalChart } from '../../src/chart/natal.js';
import type { BirthData } from '../../src/chart/natal.js';

let provider: SwissEphWasmProvider;

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
}, 60_000);

afterAll(() => provider.close());

/** Shortest signed distance between two longitudes, in degrees. */
function delta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

const ARCSEC = 1 / 3600;

describe('sidereal houses are the tropical ones minus the ayanāṁśa', () => {
  const BIRTHS: readonly (readonly [string, BirthData])[] = [
    ['Ujjain 1993', {
      date: { year: 1993, month: 11, day: 7 },
      time: { hour: 17, minute: 30, second: 0 },
      zone: { kind: 'fixedOffset', offsetMinutes: 330 },
      place: { latitude: 23.18, longitude: 75.77, label: 'Ujjain' },
    }],
    ['Mumbai 1990', {
      date: { year: 1990, month: 1, day: 15 },
      time: { hour: 14, minute: 30, second: 0 },
      zone: { kind: 'iana', zone: 'Asia/Kolkata' },
      place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai' },
    }],
    ['Reykjavík 2001', {
      date: { year: 2001, month: 6, day: 21 },
      time: { hour: 3, minute: 5, second: 0 },
      zone: { kind: 'fixedOffset', offsetMinutes: 0 },
      place: { latitude: 64.14, longitude: -21.9, label: 'Reykjavík' },
    }],
  ];

  for (const [label, birth] of BIRTHS) {
    it(`holds for every cusp at ${label}`, () => {
      const tropical = calculateNatalChart(provider, birth, {
        settings: { zodiac: { kind: 'tropical' }, houseSystem: 'placidus' },
      });
      const sidereal = calculateNatalChart(provider, birth, {
        settings: {
          zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' },
          houseSystem: 'placidus',
        },
      });

      const ayanamsha = sidereal.ayanamsha;
      expect(ayanamsha).toBeGreaterThan(20);

      expect(delta(tropical.houses!.ascendant - ayanamsha, sidereal.houses!.ascendant))
        .toBeLessThan(ARCSEC);
      expect(delta(tropical.houses!.midheaven - ayanamsha, sidereal.houses!.midheaven))
        .toBeLessThan(ARCSEC);

      tropical.houses!.cusps.forEach((cusp, index) => {
        expect(
          delta(cusp - ayanamsha, sidereal.houses!.cusps[index]!),
          `cusp ${index + 1}`,
        ).toBeLessThan(ARCSEC);
      });
    });
  }

  it('leaves the ARMC alone, because it is not an ecliptic longitude', () => {
    /*
     * The obvious wrong fix is to subtract the ayanāṁśa from everything in
     * `ascmc`. The ARMC is right ascension measured along the EQUATOR, so
     * the ayanāṁśa does not apply to it and Swiss Ephemeris correctly
     * returns the same value in both zodiacs.
     */
    const [, birth] = BIRTHS[0]!;
    const tropical = calculateNatalChart(provider, birth, {
      settings: { zodiac: { kind: 'tropical' } },
    });
    const sidereal = calculateNatalChart(provider, birth, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } },
    });
    expect(sidereal.houses!.armc).toBeCloseTo(tropical.houses!.armc, 9);
  });
});

describe('Krishnamurti and Lahiri are applied independently', () => {
  /*
   * A synthetic moment with Saturn on the Makara/Kumbha boundary: 7 Nov 1993,
   * 12:00 UT. Lahiri puts it at Makara 29°57′, Krishnamurti at Kumbha 0°03′.
   * Same point in the sky, different rāśi, different bhāva, different dignity.
   * An engine that applied one ayanāṁśa for both, or rounded either way,
   * would give a reader the wrong chart.
   */
  const MOMENT: BirthData = {
    date: { year: 1993, month: 11, day: 7 },
    time: { hour: 12, minute: 0, second: 0 },
    zone: { kind: 'fixedOffset', offsetMinutes: 0 },
    place: { latitude: 23.18, longitude: 75.77, label: 'Ujjain' },
  };

  const saturn = (ayanamsha: 'lahiri' | 'krishnamurti'): number =>
    calculateNatalChart(provider, MOMENT, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha }, bodies: ['saturn'] },
    }).bodies[0]!.position.longitude;

  it('puts Saturn in Makara under Lahiri and Kumbha under Krishnamurti', () => {
    expect(Math.floor(saturn('lahiri') / 30)).toBe(9); // Makara
    expect(Math.floor(saturn('krishnamurti') / 30)).toBe(10); // Kumbha
  });

  it('keeps Krishnamurti about 5′49″ behind Lahiri', () => {
    const gap = (saturn('krishnamurti') - saturn('lahiri')) * 3600;
    expect(gap).toBeGreaterThan(340);
    expect(gap).toBeLessThan(360);
  });

  it('moves the houses with the ayanāṁśa as well as the bodies', () => {
    const chart = (ayanamsha: 'lahiri' | 'krishnamurti') => calculateNatalChart(provider, MOMENT, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha }, houseSystem: 'placidus', bodies: ['saturn'] },
    });
    const l = chart('lahiri'); const k = chart('krishnamurti');
    const gap = k.ayanamsha - l.ayanamsha;
    expect(delta(l.houses!.ascendant - gap, k.houses!.ascendant)).toBeLessThan(ARCSEC);
  });
});
