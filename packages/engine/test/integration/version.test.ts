/**
 * The loaded Swiss Ephemeris reports its version, for calculation records,
 * and says which ephemeris answered each call through its returned flag.
 */
import { it, expect } from 'vitest';
import { SwissEphWasmProvider, julianDay, sourceForJd } from '../../src/index.js';

it('reports the Swiss Ephemeris version it loaded', async () => {
  const p = new SwissEphWasmProvider();
  await p.init();
  expect(p.ephemerisVersion()).toMatch(/^2\.\d+/);
  p.close();
});

it('reads the ephemeris used from Swiss Ephemeris’s returned flag, not the date range', async () => {
  const p = new SwissEphWasmProvider();
  await p.init();
  const at = (y: number, m: number, d: number) => julianDay({ year: y, month: m, day: d }, 0);
  expect(p.calc(at(2000, 1, 1), 'sun')).toMatchObject({ source: 'swiss', sourceBasis: 'returned-flag' });
  expect(p.calc(at(1700, 6, 1), 'moon')).toMatchObject({ source: 'moshier', sourceBasis: 'returned-flag' });
  // The bundled files begin on 1800-01-02: the range check calls midnight on
  // 1 January 1800 Swiss, the flag shows Swiss Ephemeris fell back to Moshier.
  const edge = at(1800, 1, 1);
  expect(sourceForJd(edge)).toBe('swiss');
  expect(p.calc(edge, 'sun')).toMatchObject({ source: 'moshier', sourceBasis: 'returned-flag' });
  expect(p.calc(at(1800, 1, 3), 'sun').source).toBe('swiss');
  p.close();
});
