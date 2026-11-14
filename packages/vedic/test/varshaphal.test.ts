/**
 * Varṣaphal, mudda daśā and progressions against their defining rules.
 * No personal birth data: every input is synthetic.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider, julianDay, norm360 } from '@astro/engine';
import { varshaphal, muddaDasha, progression, MUDDA_DAYS } from '../src/varshaphal.js';

const zodiac = { kind: 'sidereal', ayanamsha: 'lahiri' } as const;

describe('mudda daśā', () => {
  it('uses whole-day middle periods totalling a 366-day cycle in the printed convention', () => {
    const start = julianDay({ year: 2020, month: 5, day: 1 }, 6);
    const m = muddaDasha(100, start, start + 365.2564, 'printed', 330);
    expect(m).toHaveLength(10);
    expect(m[0]!.lord).toBe(m[9]!.lord);
    for (let k = 1; k < 9; k += 1) expect(m[k]!.endJd - m[k]!.startJd).toBe(MUDDA_DAYS[m[k]!.lord]);
    expect(Object.values(MUDDA_DAYS).reduce((a, b) => a + b, 0)).toBe(366);
    for (let k = 1; k < 10; k += 1) expect(m[k]!.startJd).toBe(m[k - 1]!.endJd);
  });
  it('splits the solar year in Viṁśottarī proportion in the proportional convention', () => {
    const m = muddaDasha(0, 0, 365.25, 'proportional'); // Aśvinī 0°: the whole of Ketu first
    expect(m[0]!.lord).toBe('ketu');
    expect(m[0]!.endJd).toBeCloseTo((7 / 120) * 365.25, 9);
    expect(m[9]!.endJd).toBe(365.25);
    expect(m[9]!.endJd - m[9]!.startJd).toBeCloseTo(0, 9);
  });
});

describe('varṣaphal and progressions', () => {
  let provider: SwissEphWasmProvider;
  beforeAll(async () => { provider = new SwissEphWasmProvider(); await provider.init(); });
  afterAll(() => provider.close());
  const birthJd = julianDay({ year: 1990, month: 1, day: 15 }, 9);
  const o = { birthJd, latitude: 19, longitude: 73, zodiac, utcOffsetMinutes: 330 };

  it('returns the sidereal Sun to its natal longitude and advances Muntha a sign a year', () => {
    const natal = provider.calc(birthJd, 'sun', { zodiac }).longitude;
    const v = varshaphal(provider, o, 30);
    expect(Math.abs(norm360(v.positions.lon.sun - natal + 180) - 180)).toBeLessThan(1e-6);
    expect((v.startJd - birthJd) / 365.2564).toBeCloseTo(30, 1);
    const v31 = varshaphal(provider, o, 31);
    expect(v31.muntha).toBe((v.muntha + 1) % 12);
    expect(v.endJd).toBeCloseTo(v31.startJd, 6);
  });
  it('progresses one day per year in the tropical zodiac', () => {
    const p = progression(provider, o, 20);
    expect(p.jd).toBe(birthJd + 20);
    expect(p.lon.sun).toBeCloseTo(provider.calc(birthJd + 20, 'sun', { zodiac: { kind: 'tropical' } }).longitude, 9);
  });
});
