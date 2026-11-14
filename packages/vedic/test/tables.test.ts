/**
 * Report tables, sāyana pages, transit pages and KP events against their
 * defining rules. No personal birth data: every input is synthetic.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider, julianDay, norm360 } from '@astro/engine';
import {
  permanentRelation, fiveFold, dignities, shodashavarga, vimshopaka, sahams, specialLagnas, rasiDrishti, arudhas,
  avakahada, ghataka, favourablePoints, taraChakra, sudarshana, chalit, SHODASHA,
} from '../src/tables.js';
import { separationInt, aspectOf, aspectGrid, western } from '../src/western.js';
import { dailyPower, moonTaraSchedule, gochar, localJd } from '../src/daily.js';
import { kpChart } from '../src/kp.js';
import { kpEvents, KP_EVENTS } from '../src/kpEvents.js';
import { ashtakavarga } from '../src/ashtakavarga.js';
import { sunrise } from '../src/panchang.js';
import { GRAHAS, type Graha, type GrahaLongitudes } from '../src/grahas.js';

const zodiac = { kind: 'sidereal', ayanamsha: 'lahiri' } as const;
const none = Object.fromEntries(GRAHAS.map((g) => [g, false])) as Record<Graha, boolean>;
/** A hand-made chart: lagna 5° Meṣa, planets spread through the signs. */
const G: GrahaLongitudes = {
  lagna: 5,
  lon: { sun: 10, moon: 45, mars: 100, mercury: 25, jupiter: 95, venus: 350, saturn: 200, rahu: 160, ketu: 340 },
  retrograde: none,
};

describe('friendship and dignity', () => {
  it('follows Parāśara for the seven', () => {
    expect(permanentRelation('sun', 'moon')).toBe('F');
    expect(permanentRelation('sun', 'venus')).toBe('E');
    expect(permanentRelation('jupiter', 'saturn')).toBe('N');
    expect(permanentRelation('moon', 'mercury')).toBe('F');
    expect(permanentRelation('mercury', 'moon')).toBe('E');
  });
  it('combines permanent and temporary into five grades', () => {
    // Sun (Meṣa) and Moon (Vṛṣabha, 2nd from the Sun): friend + temporary friend.
    expect(fiveFold(G, 'sun', 'moon')).toBe('intimate');
    // Sun and Venus (Mīna, 12th): enemy + temporary friend → neutral.
    expect(fiveFold(G, 'sun', 'venus')).toBe('neutral');
  });
  it('flags exaltation, debilitation and combustion', () => {
    const d = Object.fromEntries(dignities(G).map((x) => [x.body, x]));
    expect(d.sun!.status).toBe('exalted');
    expect(d.jupiter!.status).toBe('exalted');
    expect(d.mars!.status).toBe('debilitated');
    expect(d.saturn!.status).toBe('exalted');
    expect(d.mercury!.combust).toBe(false); // 15° from the Sun, orb 14
    expect(dignities({ ...G, lon: { ...G.lon, mercury: 20 } }).find((x) => x.body === 'mercury')!.combust).toBe(true);
  });
});

describe('vargas and viṁśopaka', () => {
  it('lists sixteen divisions with D1 equal to the rāśi', () => {
    const v = shodashavarga(G);
    expect(Object.keys(v).map(Number)).toEqual([...SHODASHA]);
    for (const g of GRAHAS) expect(v[1]![g]).toBe(Math.floor(G.lon[g] / 30));
  });
  it('gives at most 20 and at least 5 in every scheme', () => {
    for (const s of ['shad', 'sapta', 'dasha', 'shodasha'] as const) {
      for (const w of ['parashara', 'printed'] as const) {
        for (const v of Object.values(vimshopaka(G, s, w))) { expect(v).toBeLessThanOrEqual(20 + 1e-9); expect(v).toBeGreaterThanOrEqual(5 - 1e-9); }
      }
    }
  });
});

describe('sahams, lagnas and Jaimini', () => {
  const cusps = Array.from({ length: 12 }, (_, k) => norm360(5 + 30 * k));
  it('computes Puṇya as Moon − Sun + Lagna and returns 41 sahams', () => {
    const s = sahams(G, cusps);
    expect(s).toHaveLength(41);
    expect(s[0]!.longitude).toBeCloseTo(norm360(45 - 10 + 5), 9);
  });
  it('advances the special lagnas at 15°, 30° and 75° an hour', () => {
    expect(specialLagnas(100, 2)).toEqual({ bhava: 130, hora: 160, ghati: 250 });
  });
  it('gives each sign three rāśi dṛṣṭis, never its neighbour', () => {
    for (let s = 0; s < 12; s += 1) {
      const a = rasiDrishti(s);
      expect(a).toHaveLength(3);
      expect(a).not.toContain((s + 1) % 12); expect(a).not.toContain((s + 11) % 12); expect(a).not.toContain(s);
    }
    expect(rasiDrishti(0)).toEqual([4, 7, 10]); // Meṣa (movable) sees the fixed signs but Vṛṣabha
  });
  it('moves an ārūḍha out of the house itself or its 7th', () => {
    const a = arudhas(G);
    expect(a).toHaveLength(12);
    const asc = 0;
    a.forEach((s, h) => { const house = (asc + h) % 12; expect(s === house || s === (house + 6) % 12).toBe(false); });
  });
});

describe('avakahaḍa, ghātaka, favourable points', () => {
  it('reads the Moon’s nakṣatra, pada and syllable', () => {
    const a = avakahada(0.5); // Aśvinī pada 1
    expect([a.nakshatra, a.pada, a.syllable, a.gana, a.nadi, a.yoni]).toEqual([0, 1, 'Cu', 'Deva', 'Ādi', 'Aśva']);
    expect(ghataka(0.5).month).toBe('Kārttika');
  });
  it('derives the numbers from the civil date and the lords from the lagna', () => {
    const f = favourablePoints(G, { year: 1990, month: 1, day: 15 })!;
    expect(f.radical).toBe(6); // 1 + 5
    expect(f.lucky).toBe(8); // 1+5+1+1+9+9+0 = 26 → 8
    expect(f.lagnaLord).toBe('mars');
    expect(f.favourable).toEqual(['mars', 'jupiter', 'saturn']);
  });
});

describe('cakras and chalit', () => {
  it('counts 27 nakṣatras from the janma nakṣatra in cycles of nine', () => {
    const r = taraChakra(G);
    expect(r).toHaveLength(27);
    expect(r[0]!.nakshatra).toBe(Math.floor(45 / (360 / 27)));
    expect(r.map((x) => x.tara)).toEqual(Array.from({ length: 27 }, (_, k) => k % 9));
    expect(r[0]!.bodies).toContain('moon');
  });
  it('counts Sudarśana from lagna, Moon and Sun', () => {
    const s = sudarshana(G);
    expect(s.map((x) => x.signs[0])).toEqual([0, 1, 0]);
  });
  it('places a graha by the sandhis', () => {
    const sandhi = Array.from({ length: 12 }, (_, k) => norm360(-10 + 30 * k));
    const c = Object.fromEntries(chalit(G, sandhi).map((x) => [x.body, x]));
    expect(c.mercury!.rasiHouse).toBe(1);
    expect(c.mercury!.bhava).toBe(2); // 25° is past the sandhi at 20°
  });
});

describe('western aspects', () => {
  it('takes whole-degree separations and the reports’ orbs', () => {
    expect(separationInt(10.9, 100.2)).toBe(89);
    expect(separationInt(350, 10)).toBe(20);
    expect(aspectOf(89)?.short).toBe('squr');
    expect(aspectOf(74)?.short).toBe('quin');
    expect(aspectOf(75)).toBeUndefined();
    expect(aspectGrid([['a', 0], ['b', 120], ['c', 240]])).toHaveLength(3);
  });
});

describe('ephemeris-backed pages', () => {
  let provider: SwissEphWasmProvider;
  beforeAll(async () => { provider = new SwissEphWasmProvider(); await provider.init(); });
  afterAll(() => provider.close());
  const birthJd = julianDay({ year: 1990, month: 1, day: 15 }, 9);
  const ctx = { birthJd, utcOffsetMinutes: 330, zodiac };
  const natal = (): GrahaLongitudes => {
    const lon = {} as Record<Graha, number>;
    for (const b of ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'] as const) lon[b] = provider.calc(birthJd, b, { zodiac }).longitude;
    lon.rahu = provider.calc(birthJd, 'meanNode', { zodiac }).longitude; lon.ketu = norm360(lon.rahu + 180);
    return { lon, lagna: provider.houses(birthJd, 19, 73, 'placidus', { zodiac }).ascendant, retrograde: none };
  };

  it('scores each day of a month from the natal bindus', () => {
    const g = natal(); const av = ashtakavarga(g);
    const days = dailyPower(provider, g, ctx, 2024, 2);
    expect(days).toHaveLength(29);
    const d = days[9]!;
    expect(d.jd).toBeCloseTo(localJd(2024, 2, 10, 5.5, 330), 9);
    expect(d.total).toBe(Object.entries(d.planets).reduce((a, [p, v]) => a + av.bhinna[p as 'sun'].totals[v.sign]!, 0));
    expect(d.score).toBe(d.total - 28);
    expect(d.dasha).toHaveLength(3);
  });

  it('cuts the Moon at every nakṣatra and sign edge', () => {
    const g = natal();
    const from = localJd(2024, 3, 1, 0, 330); const to = localJd(2024, 4, 1, 0, 330);
    const s = moonTaraSchedule(provider, g, zodiac, from, to);
    expect(s[0]!.startJd).toBe(from); expect(s[s.length - 1]!.endJd).toBe(to);
    for (let k = 1; k < s.length; k += 1) expect(s[k]!.startJd).toBe(s[k - 1]!.endJd);
    // About 27 nakṣatra changes plus about 13 sign changes, with some coinciding.
    expect(s.length).toBeGreaterThan(30); expect(s.length).toBeLessThan(45);
    for (const x of s.slice(1, -1)) {
      const mid = provider.calc((x.startJd + x.endJd) / 2, 'moon', { zodiac }).longitude;
      expect(Math.floor(mid / (360 / 27))).toBe(x.nakshatra);
    }
  });

  it('lists the year’s ingresses with Ketu opposite Rāhu', () => {
    const g = natal();
    const e = gochar(provider, g, ctx, localJd(2024, 1, 1, 0, 330), localJd(2025, 1, 1, 0, 330));
    expect(e.filter((x) => x.body === 'sun')).toHaveLength(12);
    const r = e.filter((x) => x.body === 'rahu'); const k = e.filter((x) => x.body === 'ketu');
    expect(r.length).toBe(k.length);
    r.forEach((x, i) => expect(k[i]!.sign).toBe((x.sign + 6) % 12));
    expect(e.every((x, i) => i === 0 || x.jd >= e[i - 1]!.jd)).toBe(true);
  });

  it('builds every KP event from cusp sub lords and their star lords', () => {
    const k = kpChart(provider, birthJd, { latitude: 19, longitude: 73, utcOffsetMinutes: 330 });
    const ev = kpEvents(k);
    expect(ev).toHaveLength(KP_EVENTS.length);
    for (const e of ev) {
      expect(e.rows).toHaveLength(e.def.houses.length + e.def.karakas.length);
      for (const r of e.rows) {
        const lead = k.bodies.find((b) => b.body === r.lead.planet)!;
        expect(r.star.planet).toBe(lead.lords.star);
        if (r.cusp) {
          expect(r.lead.planet).toBe(k.cusps[r.cusp - 1]!.lords.sub);
          for (const s of r.significators!) expect(k.significators[s]).toContain(r.cusp);
        }
      }
    }
  });

  it('finds the sunrise the special lagnas count from', () => {
    const r = sunrise(provider, birthJd - 1, { latitude: 19, longitude: 73 })!;
    expect(r).toBeGreaterThan(birthJd - 1);
    expect(r).toBeLessThan(birthJd);
    // Sun on the eastern horizon: about 06:20–07:30 IST in mid-January at 19° N.
    const ist = ((r + 0.5 + 330 / 1440) % 1) * 24;
    expect(ist).toBeGreaterThan(6.3); expect(ist).toBeLessThan(7.5);
  });

  it('prints nodes with no latitude and the Ascendant first on the sāyana page', () => {
    const w = western(provider, birthJd, { latitude: 19, longitude: 73 });
    expect(w.positions[0]!.body).toBe('lagna');
    expect(w.positions).toHaveLength(13);
    const ra = w.positions.find((p) => p.body === 'rahu')!; const ke = w.positions.find((p) => p.body === 'ketu')!;
    expect(ra.latitude).toBe(0);
    expect(norm360(ke.longitude - ra.longitude)).toBeCloseTo(180, 9);
    expect(w.cusps).toHaveLength(12);
  });
});
