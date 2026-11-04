/**
 * Independent-oracle cross-check.
 *
 * The shipped engine (`swisseph-wasm`) is compared against a SEPARATELY BUILT
 * Swiss Ephemeris (`sweph`, native, devDependency only). Two independent builds
 * agreeing is real evidence; testing one binding twice is not.
 *
 * Tolerances are MEASURED, not guessed — see docs/ASTRONOMY_NOTES.md for the
 * derivation over ~5,900 samples per body across 1800-2400. They are set just
 * above the observed maxima, so a genuine regression trips them while the known
 * build-vintage difference does not.
 *
 * Requires the oracle data files: `npm run fetch:ephe`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import native from 'sweph';
import { SwissEphWasmProvider } from '../../src/ephemeris/swisseph-wasm-provider.js';
import { separation } from '../../src/math/angles.js';
import { julianDay } from '../../src/time/julian.js';
import type { Body } from '../../src/ephemeris/types.js';

const EPHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ephe');
const HAVE_ORACLE_DATA = existsSync(join(EPHE_DIR, 'sepl_18.se1'));

const NC = native.constants;
const SWIEPH = NC.SEFLG_SWIEPH;
const SPEED = NC.SEFLG_SPEED;

/** Measured max divergence + headroom. See docs/ASTRONOMY_NOTES.md. */
const TOLERANCE_ARCSEC: Readonly<Record<string, number>> = {
  sun: 0.1,
  moon: 0.5,
  mercury: 0.1,
  venus: 0.1,
  mars: 0.5,
  jupiter: 0.1,
  saturn: 0.1,
  uranus: 0.5,
  neptune: 2,
  pluto: 2,
  trueNode: 0.5,
  chiron: 5,
};

const NATIVE_NUMBERS: Readonly<Record<string, number>> = {
  sun: NC.SE_SUN,
  moon: NC.SE_MOON,
  mercury: NC.SE_MERCURY,
  venus: NC.SE_VENUS,
  mars: NC.SE_MARS,
  jupiter: NC.SE_JUPITER,
  saturn: NC.SE_SATURN,
  uranus: NC.SE_URANUS,
  neptune: NC.SE_NEPTUNE,
  pluto: NC.SE_PLUTO,
  trueNode: NC.SE_TRUE_NODE,
  chiron: NC.SE_CHIRON,
};

/** Dates spread across the full-precision window, including both edges. */
const SAMPLE_DATES: ReadonlyArray<readonly [number, number, number, number]> = [
  [1800, 1, 2, 12],
  [1875, 3, 17, 6],
  [1900, 1, 1, 0],
  [1947, 8, 15, 5],
  [1969, 7, 20, 20.28],
  [2000, 1, 1, 12],
  [2026, 8, 24, 9.5],
  [2100, 6, 30, 18],
  [2250, 11, 5, 3],
  [2399, 12, 1, 12],
];

let provider: SwissEphWasmProvider;

beforeAll(async () => {
  if (HAVE_ORACLE_DATA) native.set_ephe_path(EPHE_DIR);
  provider = new SwissEphWasmProvider();
  await provider.init();
});

afterAll(() => provider.close());

describe.skipIf(!HAVE_ORACLE_DATA)('oracle cross-check: WASM engine vs native Swiss Ephemeris', () => {
  it('has the oracle data available', () => {
    expect(HAVE_ORACLE_DATA).toBe(true);
  });

  for (const [body, tolerance] of Object.entries(TOLERANCE_ARCSEC)) {
    it(`${body} agrees within ${tolerance}"`, () => {
      let worst = 0;
      let worstAt = '';

      for (const [y, m, d, h] of SAMPLE_DATES) {
        const jd = julianDay({ year: y, month: m, day: d }, h);
        const oracle = native.calc_ut(jd, NATIVE_NUMBERS[body]!, SWIEPH | SPEED);

        // Only compare where the oracle genuinely used its data files; outside
        // that both builds fall back to Moshier and the test proves nothing.
        if (!(oracle.flag & SWIEPH)) continue;

        const mine = provider.calc(jd, body as Body);
        const diff = separation(mine.longitude, oracle.data[0]!) * 3600;
        if (diff > worst) {
          worst = diff;
          worstAt = `${y}-${m}-${d}`;
        }
      }

      expect(worst, `worst divergence at ${worstAt}`).toBeLessThan(tolerance);
    });
  }

  it('speeds agree closely enough for applying/separating to be reliable', () => {
    let worst = 0;
    for (const [y, m, d, h] of SAMPLE_DATES) {
      const jd = julianDay({ year: y, month: m, day: d }, h);
      for (const body of ['sun', 'moon', 'mars', 'saturn'] as const) {
        const oracle = native.calc_ut(jd, NATIVE_NUMBERS[body]!, SWIEPH | SPEED);
        if (!(oracle.flag & SWIEPH)) continue;
        const mine = provider.calc(jd, body);
        worst = Math.max(worst, Math.abs(mine.longitudeSpeed - oracle.data[3]!) * 3600);
      }
    }
    // Arcsec/day. Direction of motion is never in doubt at this level.
    expect(worst).toBeLessThan(0.05);
  });

  it('retrograde flags agree on every sample', () => {
    for (const [y, m, d, h] of SAMPLE_DATES) {
      const jd = julianDay({ year: y, month: m, day: d }, h);
      for (const body of ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const) {
        const oracle = native.calc_ut(jd, NATIVE_NUMBERS[body]!, SWIEPH | SPEED);
        if (!(oracle.flag & SWIEPH)) continue;
        const mine = provider.calc(jd, body);
        expect(mine.retrograde, `${body} @ ${y}-${m}-${d}`).toBe(oracle.data[3]! < 0);
      }
    }
  });
});

describe.skipIf(!HAVE_ORACLE_DATA)('oracle cross-check: houses', () => {
  const CASES = [
    { label: 'Mumbai', lat: 18.9667, lon: 72.8333, jd: julianDay({ year: 1947, month: 8, day: 15 }, 5) },
    { label: 'London', lat: 51.5074, lon: -0.1278, jd: julianDay({ year: 2000, month: 6, day: 21 }, 12) },
    { label: 'Sydney', lat: -33.8688, lon: 151.2093, jd: julianDay({ year: 1985, month: 12, day: 25 }, 3) },
    { label: 'Quito', lat: -0.1807, lon: -78.4678, jd: julianDay({ year: 2010, month: 3, day: 20 }, 17 ) },
  ] as const;

  const SYSTEMS = [
    ['placidus', 'P'], ['koch', 'K'], ['campanus', 'C'],
    ['regiomontanus', 'R'], ['porphyry', 'O'], ['equal', 'A'],
  ] as const;

  for (const { label, lat, lon, jd } of CASES) {
    for (const [system, code] of SYSTEMS) {
      it(`${label} / ${system}: all 12 cusps and the angles match`, () => {
        const oracle = native.houses(jd, lat, lon, code);
        const mine = provider.houses(jd, lat, lon, system);

        for (let i = 0; i < 12; i++) {
          const diff = separation(mine.cusps[i]!, oracle.data.houses[i]!) * 3600;
          expect(diff, `cusp ${i + 1}`).toBeLessThan(0.5);
        }
        expect(separation(mine.ascendant, oracle.data.points[0]!) * 3600).toBeLessThan(0.5);
        expect(separation(mine.midheaven, oracle.data.points[1]!) * 3600).toBeLessThan(0.5);
      });
    }
  }
});

describe.skipIf(!HAVE_ORACLE_DATA)('oracle cross-check: ayanamsha', () => {
  const MODES = [
    ['lahiri', NC.SE_SIDM_LAHIRI],
    ['raman', NC.SE_SIDM_RAMAN],
    ['krishnamurti', NC.SE_SIDM_KRISHNAMURTI],
    ['fagenBradley', NC.SE_SIDM_FAGAN_BRADLEY],
  ] as const;

  for (const [name, mode] of MODES) {
    it(`${name} matches the oracle`, () => {
      for (const [y, m, d, h] of SAMPLE_DATES) {
        const jd = julianDay({ year: y, month: m, day: d }, h);
        native.set_sid_mode(mode, 0, 0);
        const oracle = native.get_ayanamsa_ex_ut(jd, SWIEPH | SPEED);
        const oracleValue = typeof oracle === 'number' ? oracle : oracle.data;
        const mine = provider.ayanamsha(jd, { kind: 'sidereal', ayanamsha: name });
        expect(Math.abs(mine - oracleValue) * 3600, `${name} @ ${y}`).toBeLessThan(0.01);
      }
    });
  }
});
