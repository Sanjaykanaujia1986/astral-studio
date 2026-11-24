/** The loaded Swiss Ephemeris reports its version, for calculation records. */
import { it, expect } from 'vitest';
import { SwissEphWasmProvider } from '../../src/index.js';

it('reports the Swiss Ephemeris version it loaded', async () => {
  const p = new SwissEphWasmProvider();
  await p.init();
  expect(p.ephemerisVersion()).toMatch(/^2\.\d+/);
  p.close();
});
