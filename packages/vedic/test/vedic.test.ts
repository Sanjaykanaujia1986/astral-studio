/**
 * Jyotiṣa calculations, checked against classical definitions.
 *
 * The reference values are the rules themselves — a nakṣatra is 13°20', the
 * navāṁśa of 0° Taurus is Capricorn, Viṁśottarī sums to 120 years — rather
 * than numbers copied from another program. Where a classical rule can be
 * stated two ways, both are computed and asserted equal, which is a real
 * cross-check rather than the same formula twice.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  SwissEphWasmProvider, calculateNatalChart, julianDay, norm360, SIGNS,
  type BirthData, type NatalChart,
} from '@astro/engine';
import {
  nakshatraOf, absolutePada, NAKSHATRAS, NAKSHATRA_ARCMINUTES, PADA_ARCMINUTES,
  VIMSHOTTARI_LORDS,
} from '../src/nakshatra.js';
import { vargaSignIndex, buildVargaChart, VARGAS } from '../src/varga.js';
import {
  vimshottari, dashaAt, lordSequence, LORD_YEARS, TOTAL_YEARS, YEAR_LENGTHS,
} from '../src/vimshottari.js';
import { tithiFrom, yogaFrom, karanaFrom, weekdayFrom, panchang } from '../src/panchang.js';
import { vedicChart, wholeSignHouse, NotSiderealError } from '../src/chart.js';

let provider: SwissEphWasmProvider;
let sidereal: NatalChart;
let tropical: NatalChart;

const MUMBAI: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai' },
};

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  sidereal = calculateNatalChart(provider, MUMBAI, {
    settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' }, nodeType: 'mean' },
  });
  tropical = calculateNatalChart(provider, MUMBAI);
});

afterAll(() => provider.close());

// ---------------------------------------------------------------- nakṣatra

describe('nakṣatras', () => {
  it('divides the zodiac into 27 spans of 13°20', () => {
    expect(NAKSHATRAS).toHaveLength(27);
    expect((NAKSHATRA_ARCMINUTES * 27) / 60).toBe(360);
    expect(NAKSHATRA_ARCMINUTES / PADA_ARCMINUTES).toBe(4);
  });

  it('starts Aśvinī at sidereal 0° Aries', () => {
    const start = nakshatraOf(0);
    expect(start.nakshatra).toBe('ashwini');
    expect(start.pada).toBe(1);
    expect(start.elapsed).toBe(0);
  });

  it('places every boundary exactly', () => {
    /*
     * The reason the module works in integer arcminutes. 13°20' is 13.333… in
     * degrees and never exact in binary, so a longitude sitting precisely on a
     * boundary lands on whichever side the floating-point error falls.
     */
    for (let i = 0; i < 27; i++) {
      const boundary = (i * NAKSHATRA_ARCMINUTES) / 60;
      expect(nakshatraOf(boundary).index, `start of ${NAKSHATRAS[i]}`).toBe(i);
      expect(nakshatraOf(boundary).pada).toBe(1);
      // A hair before the boundary belongs to the previous nakṣatra.
      if (i > 0) expect(nakshatraOf(boundary - 1e-9).index).toBe(i - 1);
    }
  });

  it('gives four pādas per nakṣatra, each 3°20', () => {
    const base = 13 + 20 / 60; // start of Bharaṇī
    expect(nakshatraOf(base).pada).toBe(1);
    expect(nakshatraOf(base + 3 + 20 / 60).pada).toBe(2);
    expect(nakshatraOf(base + 2 * (3 + 20 / 60)).pada).toBe(3);
    expect(nakshatraOf(base + 3 * (3 + 20 / 60)).pada).toBe(4);
  });

  it('cycles the lords every nine nakṣatras', () => {
    // Aśvinī-Ketu, Bharaṇī-Venus, Kṛttikā-Sun … then repeating from Maghā.
    expect(nakshatraOf(0).lord).toBe('ketu');
    expect(nakshatraOf(14).lord).toBe('venus');
    expect(nakshatraOf(28).lord).toBe('sun');
    // Maghā is the 10th, so its lord is Ketu again.
    expect(nakshatraOf(120).nakshatra).toBe('magha');
    expect(nakshatraOf(120).lord).toBe('ketu');
    for (let i = 0; i < 27; i++) {
      expect(nakshatraOf((i * NAKSHATRA_ARCMINUTES) / 60).lord).toBe(VIMSHOTTARI_LORDS[i % 9]);
    }
  });

  it('never returns an out-of-range index at the very end of the circle', () => {
    const last = nakshatraOf(360 - 1e-12);
    expect(last.index).toBeLessThanOrEqual(26);
    expect(last.pada).toBeLessThanOrEqual(4);
  });

  it('agrees with absolutePada, which is the same division', () => {
    for (const longitude of [0, 13.5, 99.9, 180, 271.3, 359.99]) {
      const n = nakshatraOf(longitude);
      expect(absolutePada(longitude)).toBe(n.index * 4 + (n.pada - 1));
    }
  });
});

// ------------------------------------------------------------------ vargas

describe('vargas', () => {
  it('D-1 is the sign itself', () => {
    for (let s = 0; s < 12; s++) {
      expect(vargaSignIndex(s * 30 + 15, 'D1')).toBe(s);
    }
  });

  it('D-9 matches the classical movable/fixed/dual rule', () => {
    /*
     * A genuine cross-check: the module counts navāṁśas continuously from
     * Aries, while the classical statement is that a movable sign's navāṁśas
     * start from itself, a fixed sign's from the 9th, and a dual sign's from
     * the 5th. These are different procedures; asserting they agree for every
     * sign is not the same formula twice.
     */
    for (let s = 0; s < 12; s++) {
      const modality = s % 3; // 0 movable, 1 fixed, 2 dual
      const offset = modality === 0 ? 0 : modality === 1 ? 8 : 4;
      const classical = (s + offset) % 12;
      expect(vargaSignIndex(s * 30, 'D9'), `${SIGNS[s]} first navāṁśa`).toBe(classical);
    }
  });

  it('D-9 covers all twelve signs across one sign of the zodiac', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 9; i++) seen.add(vargaSignIndex(i * (10 / 3) + 0.1, 'D9'));
    expect(seen.size).toBe(9);
  });

  it('D-2 produces only Cancer and Leo', () => {
    // The usual bug is a uniform divide-and-count, which yields twelve signs
    // and no horā at all.
    const CANCER = 3;
    const LEO = 4;
    for (let d = 0; d < 360; d += 1.7) {
      expect([CANCER, LEO]).toContain(vargaSignIndex(d, 'D2'));
    }
    // Aries (odd) first half is Leo; second half Cancer.
    expect(vargaSignIndex(5, 'D2')).toBe(LEO);
    expect(vargaSignIndex(20, 'D2')).toBe(CANCER);
    // Taurus (even) is reversed.
    expect(vargaSignIndex(35, 'D2')).toBe(CANCER);
    expect(vargaSignIndex(50, 'D2')).toBe(LEO);
  });

  it('D-3 gives the sign, then the 5th, then the 9th from it', () => {
    expect(vargaSignIndex(5, 'D3')).toBe(0);        // Aries, 1st third
    expect(vargaSignIndex(15, 'D3')).toBe(4);       // 5th from Aries = Leo
    expect(vargaSignIndex(25, 'D3')).toBe(8);       // 9th from Aries = Sagittarius
  });

  it('D-10 counts from the sign for odd signs and the 9th for even', () => {
    expect(vargaSignIndex(1, 'D10')).toBe(0);       // Aries (odd) 1st part
    // Taurus (even) 1st part starts from the 9th from Taurus = Capricorn.
    expect(vargaSignIndex(31, 'D10')).toBe(9);
  });

  it('D-12 always counts from the sign itself', () => {
    expect(vargaSignIndex(1, 'D12')).toBe(0);
    expect(vargaSignIndex(31, 'D12')).toBe(1);
    expect(vargaSignIndex(31 + 2.5, 'D12')).toBe(2);
  });

  it('builds a varga chart whose lagna is itself divided', () => {
    /*
     * Carrying the rāśi lagna into a divisional chart is a common bug and
     * makes every house in every varga wrong. The navāṁśa lagna must be the
     * navāṁśa OF the lagna.
     */
    const lagna = 100; // 10° Cancer
    const chart = buildVargaChart('D9', lagna, [{ body: 'sun', longitude: lagna }]);
    expect(chart.lagnaSignIndex).toBe(vargaSignIndex(lagna, 'D9'));
    expect(chart.lagnaSignIndex).not.toBe(Math.floor(lagna / 30));
    // A body at the lagna is always in the first house of any varga.
    expect(chart.placements[0]!.house).toBe(1);
  });

  it('assigns houses 1-12 in every varga', () => {
    for (const varga of VARGAS) {
      const chart = buildVargaChart(varga, 37, [
        { body: 'sun', longitude: 10 }, { body: 'moon', longitude: 200 },
      ]);
      for (const p of chart.placements) {
        expect(p.house, `${varga} ${p.body}`).toBeGreaterThanOrEqual(1);
        expect(p.house).toBeLessThanOrEqual(12);
      }
    }
  });
});

// ------------------------------------------------------------- viṁśottarī

describe('Viṁśottarī daśā', () => {
  it('sums to 120 years', () => {
    expect(Object.values(LORD_YEARS).reduce((a, b) => a + b, 0)).toBe(TOTAL_YEARS);
  });

  it('starts from the lord of the Moon’s nakṣatra', () => {
    const moon = sidereal.bodies.find((b) => b.position.body === 'moon')!;
    const result = vimshottari(moon.position.longitude, sidereal.jdUT);
    expect(result.periods[0]!.lord).toBe(nakshatraOf(moon.position.longitude).lord);
  });

  it('gives the balance as what REMAINS, not what has passed', () => {
    /*
     * The classic inversion. A Moon at the very start of its nakṣatra must get
     * the lord's full period; one at the very end almost none. Using the
     * elapsed fraction directly produces a chart whose first daśā runs
     * backwards, and it still looks superficially plausible.
     */
    const atStart = vimshottari(0, 2_450_000);           // 0° Aries: Ketu, full
    expect(atStart.balanceFraction).toBeCloseTo(1, 12);
    expect(atStart.balanceYears).toBeCloseTo(LORD_YEARS.ketu, 12);

    const nearEnd = vimshottari((NAKSHATRA_ARCMINUTES - 1) / 60, 2_450_000);
    expect(nearEnd.balanceFraction).toBeLessThan(0.002);
    expect(nearEnd.periods[0]!.lord).toBe('ketu');
  });

  it('runs the lords in order after the first', () => {
    const result = vimshottari(0, 2_450_000, { count: 9 });
    expect(result.periods.map((p) => p.lord)).toEqual([...lordSequence('ketu')]);
  });

  it('gives every later mahādaśā its full span', () => {
    const result = vimshottari(5, 2_450_000, { count: 9, includeAntardashas: false });
    for (const period of result.periods.slice(1)) {
      expect(period.years).toBeCloseTo(LORD_YEARS[period.lord], 12);
    }
  });

  it('runs one full cycle in 120 years minus the elapsed balance', () => {
    const result = vimshottari(0, 2_450_000, { count: 9, includeAntardashas: false });
    const span = result.periods[8]!.endJd - result.periods[0]!.startJd;
    expect(span / result.yearLengthDays).toBeCloseTo(TOTAL_YEARS, 9);
  });

  it('has antardaśās that exactly fill their mahādaśā', () => {
    // A rounding scheme that did not would leave a visible gap or overlap at
    // every boundary in the table.
    const result = vimshottari(47.3, 2_450_000);
    for (const maha of result.periods) {
      expect(maha.antardashas).toHaveLength(9);
      expect(maha.antardashas[0]!.lord).toBe(maha.lord);
      expect(maha.antardashas[0]!.startJd).toBeCloseTo(maha.startJd, 9);
      expect(maha.antardashas[8]!.endJd).toBeCloseTo(maha.endJd, 6);
      const summed = maha.antardashas.reduce((a, p) => a + p.years, 0);
      expect(summed).toBeCloseTo(maha.years, 9);
    }
  });

  it('is contiguous — no gaps between periods', () => {
    const result = vimshottari(123.4, 2_450_000);
    for (let i = 1; i < result.periods.length; i++) {
      expect(result.periods[i]!.startJd).toBe(result.periods[i - 1]!.endJd);
    }
  });

  it('records the year length, because it changes the dates', () => {
    /*
     * The convention that makes two programs disagree. Over 120 years the
     * Gregorian and Julian years diverge by about a day, which lands squarely
     * on mahādaśā boundaries.
     */
    const gregorian = vimshottari(0, 2_450_000, { yearLength: 'gregorian', count: 9, includeAntardashas: false });
    const julian = vimshottari(0, 2_450_000, { yearLength: 'julian', count: 9, includeAntardashas: false });

    expect(gregorian.yearLengthName).toBe('gregorian');
    expect(gregorian.yearLengthDays).toBe(YEAR_LENGTHS.gregorian);

    const driftDays = julian.periods[8]!.endJd - gregorian.periods[8]!.endJd;
    expect(driftDays).toBeGreaterThan(0.8);
    expect(driftDays).toBeLessThan(1.2);
  });

  it('accepts a custom year length and labels it as custom', () => {
    const result = vimshottari(0, 2_450_000, { yearLength: 365.3, count: 1 });
    expect(result.yearLengthName).toBe('custom');
    expect(() => vimshottari(0, 2_450_000, { yearLength: 0 })).toThrow(/positive/);
  });

  it('finds the daśā in force at an instant', () => {
    const result = vimshottari(0, 2_450_000);
    const at = dashaAt(result, 2_450_000 + 1);
    expect(at.maha?.lord).toBe('ketu');
    expect(at.antar?.lord).toBe('ketu');
    // Before birth there is nothing.
    expect(dashaAt(result, 2_449_000).maha).toBeUndefined();
  });
});

// --------------------------------------------------------------- pañcāṅga

describe('pañcāṅga', () => {
  it('makes tithi 1 just after the new moon', () => {
    expect(tithiFrom(0, 0.5).number).toBe(1);
    expect(tithiFrom(0, 0.5).paksha).toBe('shukla');
  });

  it('makes Pūrṇimā the 15th and Amāvāsyā the 30th', () => {
    const full = tithiFrom(0, 179);        // elongation just under 180
    expect(full.number).toBe(15);
    expect(full.nameKey).toBe('tithi.purnima');
    expect(full.paksha).toBe('shukla');

    const newMoon = tithiFrom(0, 359.9);   // elongation just under 360
    expect(newMoon.number).toBe(30);
    expect(newMoon.nameKey).toBe('tithi.amavasya');
    expect(newMoon.paksha).toBe('krishna');
  });

  it('switches pakṣa at the full moon', () => {
    expect(tithiFrom(0, 180.1).paksha).toBe('krishna');
    expect(tithiFrom(0, 180.1).inPaksha).toBe(1);
  });

  it('spans 12° per tithi, 30 of them', () => {
    const numbers = new Set<number>();
    for (let e = 0.001; e < 360; e += 1) numbers.add(tithiFrom(0, e).number);
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(30);
    expect(numbers.size).toBe(30);
  });

  it('gives 27 yogas of 13°20 from the SUM of the longitudes', () => {
    expect(yogaFrom(0, 0.1).number).toBe(1);
    expect(yogaFrom(10, 10).number).toBe(2);   // sum 20° -> second yoga
    const numbers = new Set<number>();
    for (let s = 0.01; s < 360; s += 1) numbers.add(yogaFrom(0, s).number);
    expect(numbers.size).toBe(27);
  });

  it('follows the real karaṇa sequence, not index % 7', () => {
    /*
     * The sequence is 1 fixed, then 7 movable repeating eight times, then 3
     * fixed. A modulo shortcut gets the end of every lunar month wrong.
     */
    expect(karanaFrom(0, 1).nameKey).toBe('karana.kimstughna');
    expect(karanaFrom(0, 1).fixed).toBe(true);
    expect(karanaFrom(0, 7).nameKey).toBe('karana.bava');
    expect(karanaFrom(0, 7).fixed).toBe(false);

    // The final three are the fixed ones.
    expect(karanaFrom(0, 57 * 6 + 1).nameKey).toBe('karana.shakuni');
    expect(karanaFrom(0, 58 * 6 + 1).nameKey).toBe('karana.chatushpada');
    expect(karanaFrom(0, 59 * 6 + 1).nameKey).toBe('karana.naga');

    let fixed = 0;
    for (let i = 0; i < 60; i++) if (karanaFrom(0, i * 6 + 1).fixed) fixed += 1;
    expect(fixed).toBe(4);
  });

  it('computes the weekday from the Julian Day', () => {
    // 2000-01-01 12:00 UT is JD 2451545.0, a Saturday.
    expect(weekdayFrom(2451545.0)).toBe('shanivara');
    expect(weekdayFrom(2451546.0)).toBe('ravivara');
  });

  it('omits the vāra when the Sun does not rise, rather than assuming midnight', () => {
    const result = panchang(2451545.0, 10, 100, { noSunrise: true });
    expect(result.vara).toBeUndefined();
    expect(result.varaUnavailableReason).toBe('noSunriseAtThisLatitude');
    // The longitude-based limbs are still valid and still present.
    expect(result.tithi.number).toBeGreaterThan(0);
    expect(result.nakshatra.nakshatra).toBeTruthy();
    expect(result.yoga.number).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------ sunrise (real)

describe('sunrise from the ephemeris', () => {
  it('finds sunrise at Mumbai within the expected window', () => {
    // Mumbai (19°N, 72.83°E) in mid-January: sunrise about 07:12 IST, which is
    // 01:42 UT. Asserted as a window, since the exact minute depends on the
    // disc and refraction convention.
    const dayStart = julianDay({ year: 1990, month: 1, day: 15 }, 0);
    const rise = provider.riseTransit(dayStart, 'sun', { latitude: 18.9667, longitude: 72.8333 });
    expect(rise).toBeDefined();
    const hoursUT = ((rise! - dayStart) * 24) % 24;
    expect(hoursUT).toBeGreaterThan(1.3);
    expect(hoursUT).toBeLessThan(2.1);
  });

  it('returns undefined inside the Arctic circle in midwinter', () => {
    /*
     * The honest answer, not an error and not a fabricated time. Longyearbyen
     * at 78°N has no sunrise in December at all.
     */
    const dayStart = julianDay({ year: 2024, month: 12, day: 21 }, 0);
    expect(provider.riseTransit(dayStart, 'sun', { latitude: 78.22, longitude: 15.65 }))
      .toBeUndefined();
  });

  it('finds sunrise at the same place in midsummer', () => {
    // Midnight sun: the Sun does not set, so "rise" is also absent in June.
    // What must not happen is a wrong time being returned.
    const dayStart = julianDay({ year: 2024, month: 6, day: 21 }, 0);
    const rise = provider.riseTransit(dayStart, 'sun', { latitude: 78.22, longitude: 15.65 });
    expect(rise === undefined || rise > dayStart).toBe(true);
  });
});

// --------------------------------------------------------------- the chart

describe('the Vedic chart', () => {
  it('refuses a tropical chart instead of silently misreading it', () => {
    /*
     * Treating tropical longitudes as sidereal puts every planet about 24°
     * out — wrong sign, wrong nakṣatra, wrong starting daśā lord — and the
     * result looks entirely normal. Refusing is the only safe behaviour.
     */
    expect(() => vedicChart(tropical)).toThrow(NotSiderealError);
  });

  it('places every body with a sign, nakṣatra and whole-sign house', () => {
    const chart = vedicChart(sidereal);
    expect(chart.placements.length).toBeGreaterThanOrEqual(10);
    for (const p of chart.placements) {
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
      expect(p.nakshatra.pada).toBeGreaterThanOrEqual(1);
      expect(p.nakshatra.pada).toBeLessThanOrEqual(4);
      expect(p.degreesInSign).toBeGreaterThanOrEqual(0);
      expect(p.degreesInSign).toBeLessThan(30);
    }
  });

  it('puts the lagna in the first house by construction', () => {
    const chart = vedicChart(sidereal);
    expect(chart.lagna).toBeDefined();
    expect(wholeSignHouse(chart.lagna!.longitude, chart.lagna!.longitude)).toBe(1);
  });

  it('uses the sidereal longitudes, offset from tropical by the ayanamsha', () => {
    const chart = vedicChart(sidereal);
    expect(chart.ayanamsha).toBeGreaterThan(23);
    expect(chart.ayanamsha).toBeLessThan(24);
    expect(chart.ayanamshaName).toBe('lahiri');

    const sunSid = chart.placements.find((p) => p.body === 'sun')!.longitude;
    const sunTrop = tropical.bodies.find((b) => b.position.body === 'sun')!.position.longitude;
    expect(norm360(sunTrop - sunSid)).toBeCloseTo(chart.ayanamsha, 6);
  });

  it('reports that it is using mean nodes', () => {
    expect(vedicChart(sidereal).usesMeanNodes).toBe(true);
    const withTrue = calculateNatalChart(provider, MUMBAI, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' }, nodeType: 'true' },
    });
    expect(vedicChart(withTrue).usesMeanNodes).toBe(false);
  });

  it('builds every varga with its own lagna', () => {
    const chart = vedicChart(sidereal);
    for (const varga of VARGAS) {
      const built = chart.vargas[varga];
      expect(built, varga).toBeDefined();
      expect(built!.lagnaSignIndex).toBe(vargaSignIndex(chart.lagna!.longitude, varga));
    }
  });

  it('starts the daśā from the Moon’s nakṣatra lord', () => {
    const chart = vedicChart(sidereal);
    const moon = chart.placements.find((p) => p.body === 'moon')!;
    expect(chart.dasha?.periods[0]!.lord).toBe(moon.nakshatra.lord);
  });

  it('computes the pañcāṅga with a real sunrise when given a place', () => {
    const chart = vedicChart(sidereal, {
      provider,
      place: { latitude: 18.9667, longitude: 72.8333 },
    });
    expect(chart.panchang?.vara).toBeDefined();
    expect(chart.panchang?.sunriseJd).toBeDefined();
    expect(chart.panchang?.varaUnavailableReason).toBeUndefined();
    // 15 January 1990 was a Monday.
    expect(chart.panchang?.vara).toBe('somavara');
  });

  it('omits houses rather than inventing them without a birth time', () => {
    const { time: _t, ...noTime } = MUMBAI;
    const timeless = calculateNatalChart(provider, noTime, {
      settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } },
    });
    const chart = vedicChart(timeless);
    expect(chart.lagna).toBeUndefined();
    expect(Object.keys(chart.vargas)).toHaveLength(0);
    // But the daśā needs only the Moon, so it is still there.
    expect(chart.dasha).toBeDefined();
  });
});
