/**
 * KP lords, aṣṭakavarga and ṣaḍbala checked against their defining rules.
 * No personal birth data: every input is synthetic.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider, julianDay } from '@astro/engine';
import { kpLords, kpChart, fourStep, arcHouse } from '../src/kp.js';
import { ashtakavarga, trikonaReduce, ekadhipatyaReduce } from '../src/ashtakavarga.js';
import { shadbala, sripati, vargaOf, SHADBALA_ROWS } from '../src/shadbala.js';
import { SEVEN } from '../src/grahas.js';

const SPAN = 360 / 27;
const G = {
  lon: { sun: 200, moon: 10, mars: 250, mercury: 205, jupiter: 100, venus: 230, saturn: 300, rahu: 40, ketu: 220 },
  lagna: 5, retrograde: {} as never,
};

describe('KP lords', () => {
  it('splits each star into nine subs in Viṁśottarī proportion, starting with the star lord', () => {
    expect(kpLords(0)).toEqual({ sign: 'mars', star: 'ketu', sub: 'ketu', subSub: 'ketu' });
    const ketuSub = (SPAN * 7) / 120;
    expect(kpLords(ketuSub - 1e-6).sub).toBe('ketu');
    expect(kpLords(ketuSub + 1e-6).sub).toBe('venus');
    expect(kpLords(SPAN - 1e-6).sub).toBe('mercury'); // last sub of Aśvinī
    expect(kpLords(SPAN + 1e-6)).toMatchObject({ star: 'venus', sub: 'venus' }); // Bharaṇī
  });
  it('finds the cusp arc that holds a longitude, across 0° Aries', () => {
    const cusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
    expect(arcHouse(cusps, 355)).toBe(1);
    expect(arcHouse(cusps, 5)).toBe(1);
    expect(arcHouse(cusps, 21)).toBe(2);
    expect(arcHouse(cusps, 345)).toBe(12);
  });
});

describe('aṣṭakavarga', () => {
  const av = ashtakavarga(G);
  it('gives each planet its fixed bindu total and 337 in all', () => {
    const want = { sun: 48, moon: 49, mars: 39, mercury: 54, jupiter: 56, venus: 52, saturn: 39 } as const;
    for (const b of SEVEN) expect(av.bhinna[b].totals.reduce((a, x) => a + x, 0)).toBe(want[b]);
    expect(av.sarva.reduce((a, x) => a + x, 0)).toBe(337);
    expect(av.rekha.every((r, i) => r === 56 - av.sarva[i]!)).toBe(true);
  });
  it('reduces by trikoṇa and ekādhipatya', () => {
    expect(trikonaReduce([3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0]).slice(0, 9)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(trikonaReduce([5, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0])).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0]);
    const occ = new Array(12).fill(false); occ[0] = true;
    // Aries occupied, Scorpio empty and smaller: Scorpio clears.
    expect(ekadhipatyaReduce([4, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], occ)[7]).toBe(0);
    // Both empty and unequal: both take the smaller.
    expect(ekadhipatyaReduce([0, 3, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0], new Array(12).fill(false))).toEqual([0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0]);
  });
});

describe('vargas and bhāva madhyas', () => {
  it('places the navāṁśa and triṁśāṁśa by Parāśara', () => {
    expect(vargaOf(9, 0)).toBe(0);
    expect(vargaOf(9, 31)).toBe(9); // Taurus starts from Capricorn
    expect(vargaOf(30, 3)).toBe(0); // odd sign, first 5°: Mars (Aries)
    expect(vargaOf(30, 33)).toBe(1); // even sign, first 5°: Venus (Taurus)
  });
  it('trisects each quadrant for Śrīpati madhyas', () => {
    const { madhya } = sripati(0, 270);
    expect(madhya.slice(0, 4)).toEqual([0, 30, 60, 90]);
    expect(madhya[9]).toBe(270);
  });
});

describe('ṣaḍbala and KP chart', () => {
  let provider: SwissEphWasmProvider;
  beforeAll(async () => { provider = new SwissEphWasmProvider(); await provider.init(); });
  afterAll(() => provider.close());
  const jd = julianDay({ year: 2000, month: 3, day: 21 }, 6.5);
  const ctx = { jdUT: jd, latitude: 19, longitude: 73, zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } as const, utcOffsetMinutes: 330 };

  it('adds the six balas to the total and scales rūpas', () => {
    const r = shadbala(provider, G, ctx);
    for (const b of SEVEN) {
      const sum = r.rows.sthana[b] + r.rows.dig[b] + r.rows.kala[b] + r.rows.cheshta[b] + r.rows.naisargika[b] + r.rows.drik[b];
      expect(r.rows.total[b]).toBeCloseTo(sum, 9);
      expect(r.rows.rupas[b]).toBeCloseTo(r.rows.total[b] / 60, 9);
      expect(r.rows.uchcha[b]).toBeGreaterThanOrEqual(0);
      expect(r.rows.uchcha[b]).toBeLessThanOrEqual(60);
    }
    expect(SHADBALA_ROWS).toContain('ishta');
    expect([...SEVEN.map((b) => r.rows.rank[b])].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.bhava.total).toHaveLength(12);
  });
  it('gives full uccha bala at the deep exaltation point', () => {
    const g = { ...G, lon: { ...G.lon, sun: 10 } };
    expect(shadbala(provider, g, ctx).rows.uchcha.sun).toBeCloseTo(60, 9);
  });
  it('builds a KP chart whose significators include each planet’s own houses', () => {
    const k = kpChart(provider, jd, { latitude: 19, longitude: 73, utcOffsetMinutes: 330 });
    expect(k.cusps).toHaveLength(12);
    expect(k.ruling).toHaveLength(5);
    for (const b of k.bodies) {
      if (b.body === 'lagna') continue;
      for (const h of [...b.inHouses, ...b.owns]) expect(k.significators[b.body]).toContain(h);
      expect(fourStep(k, b.body)[1].planet).toBe(b.lords.star);
    }
    expect(k.ayanamsha).toBeGreaterThan(23);
  });
});
