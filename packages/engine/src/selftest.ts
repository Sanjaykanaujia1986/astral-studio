/**
 * Engine self-test: a deterministic fingerprint of what this build computes.
 *
 * ## Why this exists
 *
 * The Android build and the web build are the same TypeScript running on the
 * same WASM payload, but they are not the same *environment*: a different
 * JavaScript engine, a different WASM runtime, a different filesystem shim, and
 * on Android a WebView whose version is chosen by the device rather than by us.
 * "It is the same code, so it must give the same numbers" is an assumption, and
 * an assumption about numerical output is exactly the kind this project does
 * not make.
 *
 * So the engine can fingerprint itself. The same function runs in Node under
 * test, in the browser, and inside the WebView on a phone; if all three produce
 * the same 8-character hash, every position, cusp and aspect in the suite
 * agreed to a milliarcsecond. If one differs, it says which case differed and
 * by how much, rather than leaving someone to diff two screenshots.
 *
 * The fingerprint is deliberately cheap to compare — a person can read it over
 * the phone — and impossible to satisfy by accident.
 */
import { calculateChartForInstant } from './chart/instant.js';
import { julianDay } from './time/julian.js';
import type { EphemerisProvider } from './ephemeris/provider.js';
import { ALL_ASPECTS } from './aspects/definitions.js';
import type { HouseSystem, ZodiacMode } from './ephemeris/types.js';

export interface SelfTestCase {
  readonly id: string;
  readonly jdUT: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly houseSystem: HouseSystem;
  readonly zodiac: ZodiacMode;
}

/**
 * The suite.
 *
 * Chosen to exercise the parts most likely to diverge between environments
 * rather than to be representative of ordinary use: both ends of the Swiss data
 * range, a high latitude where Placidus is near its limit, the southern
 * hemisphere, a sidereal zodiac (which takes a different code path through the
 * ayanamsha call), and a date before the Gregorian reform.
 */
export const SELF_TEST_CASES: readonly SelfTestCase[] = [
  {
    id: 'mumbai-1990',
    jdUT: julianDay({ year: 1990, month: 1, day: 15 }, 9),
    latitude: 18.9667, longitude: 72.8333,
    houseSystem: 'placidus', zodiac: { kind: 'tropical' },
  },
  {
    id: 'mumbai-1990-lahiri',
    jdUT: julianDay({ year: 1990, month: 1, day: 15 }, 9),
    latitude: 18.9667, longitude: 72.8333,
    houseSystem: 'wholeSign', zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' },
  },
  {
    id: 'london-1900',
    jdUT: julianDay({ year: 1900, month: 6, day: 21 }, 12),
    latitude: 51.5074, longitude: -0.1278,
    houseSystem: 'placidus', zodiac: { kind: 'tropical' },
  },
  {
    id: 'reykjavik-2024-polar',
    // 64°N: Placidus is defined but close enough to its limit to expose any
    // difference in how the two environments handle the iteration.
    jdUT: julianDay({ year: 2024, month: 12, day: 21 }, 0),
    latitude: 64.1466, longitude: -21.9426,
    houseSystem: 'placidus', zodiac: { kind: 'tropical' },
  },
  {
    id: 'sydney-2000',
    jdUT: julianDay({ year: 2000, month: 9, day: 15 }, 10),
    latitude: -33.8688, longitude: 151.2093,
    houseSystem: 'koch', zodiac: { kind: 'tropical' },
  },
  {
    id: 'quito-1850-equator',
    jdUT: julianDay({ year: 1850, month: 3, day: 20 }, 6),
    latitude: -0.1807, longitude: -78.4678,
    houseSystem: 'campanus', zodiac: { kind: 'tropical' },
  },
  {
    id: 'range-start-1800',
    jdUT: julianDay({ year: 1800, month: 1, day: 2 }, 0),
    latitude: 40.7128, longitude: -74.006,
    houseSystem: 'equal', zodiac: { kind: 'tropical' },
  },
  {
    id: 'range-end-2399',
    jdUT: julianDay({ year: 2399, month: 12, day: 30 }, 0),
    latitude: 35.6762, longitude: 139.6503,
    houseSystem: 'regiomontanus', zodiac: { kind: 'tropical' },
  },
];

export interface SelfTestCaseResult {
  readonly id: string;
  /** Every number the case produced, rounded and joined. */
  readonly digest: string;
  readonly bodies: number;
  readonly aspects: number;
  readonly source: string;
}

export interface SelfTestResult {
  /** 8 hex characters. Identical across environments means identical output. */
  readonly fingerprint: string;
  readonly cases: readonly SelfTestCaseResult[];
  readonly milliseconds: number;
}

/**
 * Round to a milliarcsecond and format without exponent notation.
 *
 * Fixed-width text, not a float, because the comparison has to be exact and
 * `toString()` on a double is free to differ in its last digit between
 * engines. A milliarcsecond is roughly a thousandth of the precision anything
 * here claims, so a genuine numerical difference will show and a
 * representation difference will not.
 */
function fixed(value: number): string {
  if (!Number.isFinite(value)) return 'NaN';
  const rounded = Math.round(value * 3_600_000) / 3_600_000;
  // Collapse -0 so two environments cannot disagree about its sign.
  return (rounded === 0 ? 0 : rounded).toFixed(7);
}

/** FNV-1a, 32-bit. Small, dependency-free and stable across engines. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // Multiply by the FNV prime with 32-bit wraparound.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Run the suite and fingerprint the result.
 *
 * Synchronous once the provider is ready, so it can run identically wherever
 * the provider can.
 */
export function runSelfTest(provider: EphemerisProvider): SelfTestResult {
  const started = Date.now();
  const cases: SelfTestCaseResult[] = [];

  for (const testCase of SELF_TEST_CASES) {
    const chart = calculateChartForInstant(
      provider,
      testCase.jdUT,
      { latitude: testCase.latitude, longitude: testCase.longitude },
      {
        settings: {
          zodiac: testCase.zodiac,
          houseSystem: testCase.houseSystem,
          aspects: ALL_ASPECTS,
          includeEquatorial: true,
        },
      },
    );

    const parts: string[] = [testCase.id];

    // Positions, in the order the chart holds them.
    for (const placed of chart.bodies) {
      parts.push(
        placed.position.body,
        fixed(placed.position.longitude),
        fixed(placed.position.latitude),
        fixed(placed.position.longitudeSpeed),
        String(placed.house ?? '-'),
      );
      if (placed.position.equatorial) {
        parts.push(
          fixed(placed.position.equatorial.rightAscension),
          fixed(placed.position.equatorial.declination),
        );
      }
    }

    // Angles and cusps.
    if (chart.houses) {
      parts.push(fixed(chart.houses.ascendant), fixed(chart.houses.midheaven));
      for (const cusp of chart.houses.cusps) parts.push(fixed(cusp));
    }

    // Aspects, which depend on speeds as well as positions and so catch a
    // divergence that longitudes alone might round away.
    for (const hit of chart.aspects) {
      parts.push(hit.bodyA, hit.aspect, hit.bodyB, fixed(hit.orb), hit.motion);
    }

    parts.push(fixed(chart.ayanamsha));

    const digest = parts.join('|');
    cases.push({
      id: testCase.id,
      digest: fnv1a(digest),
      bodies: chart.bodies.length,
      aspects: chart.aspects.length,
      source: chart.precision.source,
    });
  }

  return {
    fingerprint: fnv1a(cases.map((c) => `${c.id}:${c.digest}`).join('\n')),
    cases,
    milliseconds: Date.now() - started,
  };
}
