/**
 * Birth particulars against their defining rules. Synthetic inputs only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider, norm360 } from '@astro/engine';
import {
  birthDay, limbSpans, hinduCalendar, baladi, charaKarakas, fortuna, gulikaMandi,
  LIMBS, MASA, RITU, SAMVATSARA,
} from '../src/particulars.js';
import { localJd } from '../src/daily.js';
import { GRAHAS, type Graha, type GrahaLongitudes } from '../src/grahas.js';

const zodiac = { kind: 'sidereal', ayanamsha: 'lahiri' } as const;
const MUMBAI = { latitude: 18.9667, longitude: 72.8333 };
const IST = 330;
let provider: SwissEphWasmProvider;

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
}, 60_000);
afterAll(() => provider.close());

const none = Object.fromEntries(GRAHAS.map((g) => [g, false])) as Record<Graha, boolean>;
const G: GrahaLongitudes = {
  lagna: 100,
  lon: { sun: 15, moon: 200, mars: 77, mercury: 29.5, jupiter: 250, venus: 302, saturn: 333, rahu: 160, ketu: 340 },
  retrograde: none,
};

describe('bālādi avasthā', () => {
  it('runs bāla → mṛta in odd signs and back in even ones', () => {
    expect(baladi(0.5)).toBe('bala'); // Meṣa, odd
    expect(baladi(13)).toBe('yuva');
    expect(baladi(29.9)).toBe('mrita');
    expect(baladi(30.5)).toBe('mrita'); // Vṛṣabha, even
    expect(baladi(37)).toBe('vriddha');
    expect(baladi(59.9)).toBe('bala');
  });
});

describe('chara kārakas', () => {
  it('orders the seven by degrees in sign, Rāhu left out', () => {
    const k = charaKarakas(G);
    expect(k.map((x) => x.body)).toEqual(['mercury', 'moon', 'mars', 'sun', 'jupiter', 'saturn', 'venus']);
    expect(k[0]!.karaka).toBe('atma');
    expect(k[6]!.karaka).toBe('dara');
    expect(k.some((x) => (x.body as string) === 'rahu')).toBe(false);
  });
});

describe('Fortuna', () => {
  it('is lagna + Moon − Sun', () => {
    expect(fortuna(G)).toBeCloseTo(norm360(100 + 200 - 15), 9);
    expect(fortuna({ lon: G.lon, retrograde: G.retrograde })).toBeUndefined();
  });
});

describe('the day', () => {
  const jd = localJd(2024, 4, 15, 12, IST);
  it('puts a noon birth between sunrise and sunset, with its ghaṭīs and local times', () => {
    const d = birthDay(provider, jd, MUMBAI, IST);
    expect(d.sunriseJd!).toBeLessThan(jd);
    expect(d.sunsetJd!).toBeGreaterThan(jd);
    expect(d.dayHours!).toBeCloseTo((d.sunsetJd! - d.sunriseJd!) * 24, 9);
    expect(d.ghatis!).toBeCloseTo((jd - d.sunriseJd!) * 60, 9);
    expect(d.weekday).toBe(1); // 15 April 2024 was a Monday
    expect(d.localCorrectionMinutes).toBeCloseTo(72.8333 * 4 - 330, 6);
    expect(d.localMeanTime).toBeCloseTo(12 + d.localCorrectionMinutes / 60, 6);
    expect(d.siderealTime).toBeGreaterThanOrEqual(0);
    expect(d.siderealTime).toBeLessThan(24);
  });
  it('counts a pre-dawn birth from the previous sunrise, in the previous weekday', () => {
    const early = localJd(2024, 4, 15, 4, IST);
    const d = birthDay(provider, early, MUMBAI, IST);
    expect(d.daySunriseJd!).toBeLessThan(early);
    expect(d.ghatis!).toBeGreaterThan(45);
    expect(d.weekday).toBe(0);
  });
});

describe('the pañcāṅga spans', () => {
  const jd = localJd(2024, 4, 15, 12, IST);
  it('chains three spans of each limb about the birth, edges on the limb boundaries', () => {
    const s = limbSpans(provider, jd, zodiac);
    for (const limb of LIMBS) {
      const [prev, cur, next] = s[limb];
      expect(cur.startJd).toBeLessThanOrEqual(jd);
      expect(cur.endJd).toBeGreaterThan(jd);
      expect(Math.abs(prev.endJd - cur.startJd) * 86_400).toBeLessThan(3);
      expect(Math.abs(cur.endJd - next.startJd) * 86_400).toBeLessThan(3);
    }
    // At the tithi's end the elongation is a whole multiple of 12°.
    const end = s.tithi[1].endJd;
    const e = norm360(provider.calc(end, 'moon', { zodiac }).longitude - provider.calc(end, 'sun', { zodiac }).longitude);
    expect(Math.min(e % 12, 12 - (e % 12))).toBeLessThan(0.01);
    expect(s.tithi[2].index).toBe((s.tithi[1].index + 1) % 30);
  });
});

describe('the calendar', () => {
  it('names mid-April 2024 Caitra, Śaka 1946 Krodhin, Vasanta, northward', () => {
    const c = hinduCalendar(provider, localJd(2024, 4, 15, 12, IST), zodiac, { year: 2024, month: 4 });
    expect(MASA[c.amanta]).toBe('Caitra');
    expect(c.adhika).toBe(false);
    expect(MASA[c.purnimanta]).toBe('Caitra'); // bright half
    expect(RITU[c.ritu]).toBe('Vasanta');
    expect(c.shaka).toBe(1946);
    expect(SAMVATSARA[c.samvatsara]).toBe('Krodhin');
    expect(c.vikramaChaitradi).toBe(2081);
    expect(c.vikramaKarttikadi).toBe(2080);
    expect(c.ayana).toBe('north');
    expect(c.gola).toBe('north');
  });
  it('keeps a February date in the old Śaka year, pūrṇimānta a month ahead in the dark half', () => {
    // 28 Feb 2024: Māgha kṛṣṇa (amānta), Phālguna kṛṣṇa (pūrṇimānta).
    const c = hinduCalendar(provider, localJd(2024, 2, 28, 12, IST), zodiac, { year: 2024, month: 2 });
    expect(MASA[c.amanta]).toBe('Māgha');
    expect(MASA[c.purnimanta]).toBe('Phālguna');
    expect(c.shaka).toBe(1945);
    expect(RITU[c.ritu]).toBe('Śiśira');
    expect(c.gola).toBe('south');
    expect(c.ayana).toBe('north');
  });
  it('marks an adhika month (Śrāvaṇa 2023)', () => {
    // 2023 had an adhika Śrāvaṇa, 18 July – 16 August.
    const c = hinduCalendar(provider, localJd(2023, 8, 1, 12, IST), zodiac, { year: 2023, month: 8 });
    expect(c.adhika).toBe(true);
    expect(MASA[c.amanta]).toBe('Śrāvaṇa');
  });
});

describe('Gulika and Māndi', () => {
  it('rise at Saturn’s eighth and at the weekday’s ghaṭī', () => {
    // Monday 15 April 2024, a day birth: eighths from the Moon, Saturn's is the 6th (index 5); Māndi at 22 ghaṭīs.
    const jd = localJd(2024, 4, 15, 12, IST);
    const d = birthDay(provider, jd, MUMBAI, IST);
    const u = gulikaMandi(provider, jd, MUMBAI, zodiac, IST)!;
    const len = d.sunsetJd! - d.sunriseJd!;
    expect(Math.abs(u.gulika.risesJd - (d.sunriseJd! + (len * 5) / 8)) * 86_400).toBeLessThan(1);
    expect(Math.abs(u.mandi.risesJd - (d.sunriseJd! + (len * 22) / 30)) * 86_400).toBeLessThan(1);
    const asc = provider.houses(u.mandi.risesJd, MUMBAI.latitude, MUMBAI.longitude, 'placidus', { zodiac }).ascendant;
    expect(u.mandi.longitude).toBeCloseTo(norm360(asc), 9);
  });
  it('uses the night’s eighths after sunset', () => {
    // Monday night: eighths from the fifth weekday's lord (Friday's Venus), Saturn's is the 2nd (index 1); Māndi at 6 ghaṭīs.
    const jd = localJd(2024, 4, 15, 21, IST);
    const d = birthDay(provider, jd, MUMBAI, IST);
    const nextRise = provider.riseTransit(d.sunsetJd!, 'sun', MUMBAI, 'rise')!;
    const len = nextRise - d.sunsetJd!;
    const u = gulikaMandi(provider, jd, MUMBAI, zodiac, IST)!;
    expect(Math.abs(u.gulika.risesJd - (d.sunsetJd! + len / 8)) * 86_400).toBeLessThan(1);
    expect(Math.abs(u.mandi.risesJd - (d.sunsetJd! + (len * 6) / 30)) * 86_400).toBeLessThan(1);
  });
});
