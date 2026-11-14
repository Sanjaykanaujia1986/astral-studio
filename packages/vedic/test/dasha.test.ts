/**
 * Daśā systems and Saturn transits, checked against their defining rules.
 * No personal birth data: every input is synthetic.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider, julianDay } from '@astro/engine';
import {
  dashas, subPeriods, runningPath, yearsToYmd, localMidnightJd, DASHA_SYSTEMS,
} from '../src/dasha.js';
import { sadeSati, payaOf, signStays } from '../src/transits.js';

const SPAN = 360 / 27;
const J2000 = 2451545;

describe('daśā systems', () => {
  it.each([['vimshottari', 120], ['ashtottari', 108], ['yogini', 36]] as const)('%s lengths sum to %i', (id, total) => {
    const s = DASHA_SYSTEMS[id];
    expect(s.years.reduce((a, b) => a + b, 0)).toBe(total);
    expect(s.totalYears).toBe(total);
  });

  it('starts Viṁśottarī from the nakṣatra lord with the unelapsed balance', () => {
    const r = dashas('vimshottari', 0, J2000);
    expect(r.firstLord).toBe('ketu');
    expect(r.balanceYears).toBeCloseTo(7, 12);
    const half = dashas('vimshottari', SPAN * 1.5, J2000); // middle of Bharaṇī
    expect(half.firstLord).toBe('venus');
    expect(half.balanceYears).toBeCloseTo(10, 9);
  });

  it('counts Yoginī as (nakṣatra number + 3) mod 8 from Maṅgalā', () => {
    expect(dashas('yogini', 0, J2000).firstLord).toBe('bhramari'); // Aśvinī: 1+3 = 4th
    expect(dashas('yogini', SPAN * 5 + 1, J2000).firstLord).toBe('mangala'); // Ārdrā: 6+3 = 9 → 1st
  });

  it('gives Aṣṭottarī groups from Ārdrā, measuring the elapsed part across the group', () => {
    const ardra = dashas('ashtottari', SPAN * 5, J2000);
    expect(ardra.firstLord).toBe('sun');
    expect(ardra.balanceYears).toBeCloseTo(6, 9);
    // Śravaṇa is the third nakṣatra of Saturn's group (PĀ, UĀ, Śravaṇa).
    const shravana = dashas('ashtottari', SPAN * 21 + SPAN / 2, J2000);
    expect(shravana.firstLord).toBe('saturn');
    expect(shravana.elapsed).toBeCloseTo((2 + 0.5) / 3, 9);
  });

  it('chains mahādaśās without gaps and splits every level in proportion', () => {
    const r = dashas('vimshottari', 123.4, J2000, { spanYears: 130 });
    for (let i = 1; i < r.mahadashas.length; i += 1) expect(r.mahadashas[i]!.startJd).toBe(r.mahadashas[i - 1]!.endJd);
    let node = r.mahadashas[2]!;
    for (let level = 2; level <= 5; level += 1) {
      const kids = subPeriods(node);
      expect(kids).toHaveLength(9);
      expect(kids[0]!.lord).toBe(node.lord);
      expect(kids[0]!.startJd).toBe(node.startJd);
      expect(kids[8]!.endJd).toBe(node.endJd);
      expect(kids.reduce((a, k) => a + k.years, 0)).toBeCloseTo(node.years, 9);
      node = kids[3]!;
      expect(node.level).toBe(level);
    }
  });

  it('anchors at local midnight when asked, and reports the running path', () => {
    const birth = julianDay({ year: 1990, month: 6, day: 15 }, 8.5); // 14:00 at UTC+05:30
    const mid = localMidnightJd(birth, 330);
    expect(mid).toBeCloseTo(julianDay({ year: 1990, month: 6, day: 14 }, 18.5), 9); // 00:00 IST on the 15th
    const r = dashas('vimshottari', 200, birth, { anchor: 'civilDate', localMidnightJd: mid });
    expect(r.anchorJd).toBe(mid);
    const path = runningPath(r, mid + 4000, 4);
    expect(path).toHaveLength(4);
    for (const p of path) expect(mid + 4000).toBeGreaterThanOrEqual(p.startJd);
  });

  it('writes a balance on the 360-day reckoning', () => {
    expect(yearsToYmd(4.475)).toEqual({ years: 4, months: 5, days: 21 });
    expect(yearsToYmd(0.999999)).toEqual({ years: 1, months: 0, days: 0 });
  });
});

describe('Saturn transits', () => {
  let provider: SwissEphWasmProvider;
  beforeAll(async () => { provider = new SwissEphWasmProvider(); await provider.init(); });
  afterAll(() => provider.close());
  const zodiac = { kind: 'sidereal', ayanamsha: 'lahiri' } as const;

  it('maps the transiting Moon house to the four pāyas', () => {
    expect([1, 6, 11].map(payaOf)).toEqual(['gold', 'gold', 'gold']);
    expect([2, 5, 9].map(payaOf)).toEqual(['silver', 'silver', 'silver']);
    expect([3, 7, 10].map(payaOf)).toEqual(['copper', 'copper', 'copper']);
    expect([4, 8, 12].map(payaOf)).toEqual(['iron', 'iron', 'iron']);
  });

  it('builds contiguous sign stays from solved ingresses', () => {
    const a = julianDay({ year: 2000, month: 1, day: 1 }, 0); const z = julianDay({ year: 2030, month: 1, day: 1 }, 0);
    const stays = signStays(provider, 'saturn', a, z, zodiac, 15);
    for (let i = 1; i < stays.length; i += 1) {
      expect(stays[i]!.startJd).toBe(stays[i - 1]!.endJd);
      expect(stays[i]!.signIndex).not.toBe(stays[i - 1]!.signIndex);
    }
    const p = provider.calc(stays[3]!.startJd + 1, 'saturn', { zodiac }).longitude;
    expect(Math.floor(p / 30)).toBe(stays[3]!.signIndex);
  });

  it('marks the 12th, 1st and 2nd from the Moon as one sāḍe-sātī spell', () => {
    const birth = julianDay({ year: 1980, month: 1, day: 1 }, 0);
    const { spells, stays } = sadeSati(provider, 15, birth, { zodiac, years: 60 }); // Moon in Aries
    const ss = spells.filter((s) => s.kind === 'sadeSati');
    expect(ss.length).toBeGreaterThanOrEqual(2);
    for (const s of ss) {
      const houses = new Set(s.stays.map((x) => x.houseFromMoon));
      for (const h of houses) expect([12, 1, 2]).toContain(h);
      expect((s.endJd - s.startJd) / 365.25).toBeGreaterThan(6.5);
    }
    for (const s of stays.filter((x) => x.paya)) expect(['gold', 'silver', 'copper', 'iron']).toContain(s.paya);
  });
});

describe('aṣṭakūṭa and yogas', async () => {
  const { ashtakoota, compatibilityTable, mangalaDosha } = await import('../src/matching.js');
  const { yogas } = await import('../src/yogas.js');
  const SPAN = 360 / 27;

  it('scores the same Moon as 28 of 36: full except Bhakūṭa-free Nāḍī doṣa', () => {
    const r = ashtakoota(100, 100);
    expect(r.total).toBe(28);
    expect(r.nadiDosha).toBe(true);
    expect(r.kootas.find((k) => k.id === 'nadi')!.score).toBe(0);
    expect(r.kootas.find((k) => k.id === 'bhakut')!.score).toBe(7);
  });

  it('applies the 6/8 Bhakūṭa doṣa unless the sign lords are friends', () => {
    // Aries (Mars) boy, Virgo (Mercury) girl: 6/8, Mars-Mercury not mutual friends.
    expect(ashtakoota(15, 165).kootas.find((k) => k.id === 'bhakut')!.score).toBe(0);
    // Taurus (Venus) boy, Libra (Venus) girl: 6/8 with one lord: cancelled.
    const c = ashtakoota(45, 195);
    expect(c.bhakutDosha).toBe(true);
    expect(c.bhakutCancelled).toBe(true);
  });

  it('builds the 36-segment table with every pāda once', () => {
    const t = compatibilityTable(SPAN * 4.5, 'female');
    expect(t).toHaveLength(36);
    expect(t.reduce((a, r) => a + r.padas.length, 0)).toBe(108);
    for (const r of t) expect(r.result.total).toBeLessThanOrEqual(36);
  });

  it('finds Maṅgala doṣa from the lagna, Moon and Venus', () => {
    const lon = { sun: 0, moon: 100, mars: 215, mercury: 10, jupiter: 50, venus: 20, saturn: 300, rahu: 120, ketu: 300 };
    const m = mangalaDosha({ lon, lagna: 5, retrograde: {} as never });
    expect(m.fromLagna).toBe(8);
    expect(m.byLagna).toBe(true);
    expect(m.present).toBe(true);
  });

  it('tests yogas against their conditions, noting node-dependent ones', () => {
    // Moon in Aries, Jupiter in Cancer (4th from the Moon): Gajakesarī.
    const lon = { sun: 200, moon: 10, mars: 250, mercury: 205, jupiter: 100, venus: 230, saturn: 300, rahu: 40, ketu: 220 };
    const y = yogas({ lon, lagna: 5, retrograde: {} as never });
    expect(y.find((x) => x.id === 'gajakesari')!.holds).toBe(true);
    expect(y.find((x) => x.id === 'budha-aditya')!.holds).toBe(true);
    // Only Rāhu (Taurus) is 2nd from the Moon: Sunaphā holds only with nodes.
    const s = y.find((x) => x.id === 'sunapha')!;
    expect(s.holds).toBe(false);
    expect(s.holdsWithNodes).toBe(true);
  });
});
