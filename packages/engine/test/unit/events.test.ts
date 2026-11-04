/**
 * Sky events: ingresses, stations, declination, and the reference frames.
 *
 * Checked against facts that can be looked up independently — the Sun's
 * ingress into a tropical sign is an equinox or the start of a month-long
 * season, Mercury's retrograde periods are published, the Sun's declination
 * extremes are the solstices. A test that only compares the engine with
 * itself would pass just as happily with every one of these inverted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  SwissEphWasmProvider,
  findIngresses,
  findStations,
  findDeclinationEvents,
  NoStationsError,
  FrameError,
  julianDay,
  julianDayToIsoUtc,
} from '../../src/index.js';

let provider: SwissEphWasmProvider;

const jd = (year: number, month: number, day: number) =>
  julianDay({ year, month, day }, 0);

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
}, 60_000);

afterAll(() => provider.close());

describe('sign ingresses', () => {
  it('puts the Sun into tropical Aries at the March equinox', () => {
    const events = findIngresses(provider, {
      fromJd: jd(2024, 3, 1),
      toJd: jd(2024, 4, 1),
      bodies: ['sun'],
    });

    const aries = events.filter((e) => e.sign === 'aries');
    expect(aries).toHaveLength(1);
    // The 2024 equinox was 20 March, 03:06 UTC.
    expect(aries[0]!.utcIso.slice(0, 10)).toBe('2024-03-20');
    expect(aries[0]!.utcIso.slice(11, 16)).toBe('03:06');
    expect(aries[0]!.fromSign).toBe('pisces');
    expect(aries[0]!.retrograde).toBe(false);
  });

  it('gives the Sun exactly twelve ingresses in a year, one per sign', () => {
    const events = findIngresses(provider, {
      fromJd: jd(2024, 1, 1),
      toJd: jd(2025, 1, 1),
      bodies: ['sun'],
    });
    expect(events).toHaveLength(12);
    expect(new Set(events.map((e) => e.sign)).size).toBe(12);
    // In time order, and each one leaves the sign the previous entered.
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i]!.jd).toBeGreaterThan(events[i - 1]!.jd);
      expect(events[i]!.fromSign).toBe(events[i - 1]!.sign);
    }
  });

  it('reports a retrograde re-entry as its own ingress', () => {
    /*
     * The case a naive implementation loses. In early 2020 Mercury entered
     * Pisces on 3 February, turned retrograde, went BACK into Aquarius on
     * 4 March, and entered Pisces a second time on 16 March. Comparing
     * floor(longitude / 30) between grid samples reports the middle crossing
     * as nothing at all, and the reader never learns Mercury left.
     *
     * (My first draft of this test used Mars in 2022, which turns out to
     * have stayed inside Gemini for its whole retrograde — a reminder that
     * an example has to be checked, not remembered.)
     */
    const events = findIngresses(provider, {
      fromJd: jd(2020, 1, 1),
      toJd: jd(2020, 4, 1),
      bodies: ['mercury'],
    });

    const pisces = events.filter((e) => e.sign === 'pisces');
    const aquarius = events.filter((e) => e.sign === 'aquarius');
    expect(pisces).toHaveLength(2);
    expect(pisces.map((e) => e.utcIso.slice(0, 10))).toEqual(['2020-02-03', '2020-03-16']);

    // The backward one is marked, so three lines do not read as duplicates.
    const backwards = aquarius.find((e) => e.retrograde)!;
    expect(backwards).toBeDefined();
    expect(backwards.utcIso.slice(0, 10)).toBe('2020-03-04');
    expect(backwards.fromSign).toBe('pisces');
    expect(backwards.speed).toBeLessThan(0);

    // Forward ingresses are never flagged retrograde.
    expect(pisces.every((e) => !e.retrograde && e.speed > 0)).toBe(true);
  });

  it('moves with the zodiac it was asked for', () => {
    // Sidereal boundaries sit about 24° from tropical, so the same ingress
    // happens on a different date. Quietly using tropical would be invisible.
    const tropical = findIngresses(provider, {
      fromJd: jd(2024, 1, 1), toJd: jd(2024, 12, 31), bodies: ['sun'],
    }).find((e) => e.sign === 'leo')!;
    const sidereal = findIngresses(provider, {
      fromJd: jd(2024, 1, 1), toJd: jd(2024, 12, 31), bodies: ['sun'],
      zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' },
    }).find((e) => e.sign === 'leo')!;

    const daysApart = Math.abs(sidereal.jd - tropical.jd);
    expect(daysApart).toBeGreaterThan(20);
    expect(daysApart).toBeLessThan(28);
  });

  it('refuses a backwards window', () => {
    expect(() => findIngresses(provider, {
      fromJd: jd(2024, 2, 1), toJd: jd(2024, 1, 1), bodies: ['sun'],
    })).toThrow(RangeError);
  });
});

describe('stations', () => {
  it('finds both of Mercury’s turns in a known retrograde period', () => {
    /*
     * Mercury was retrograde 1–25 December 2023. Both ends are stations, and
     * they must come back in the right order with the right direction.
     */
    const events = findStations(provider, {
      fromJd: jd(2023, 11, 20),
      toJd: jd(2024, 1, 5),
      bodies: ['mercury'],
    });

    expect(events).toHaveLength(2);
    expect(events[0]!.direction).toBe('retrograde');
    expect(events[1]!.direction).toBe('direct');
    expect(events[0]!.utcIso.slice(0, 10)).toBe('2023-12-13');
    expect(events[1]!.utcIso.slice(0, 10)).toBe('2024-01-02');
    expect(events[0]!.jd).toBeLessThan(events[1]!.jd);
  });

  it('reports a speed of essentially zero at the station', () => {
    const [station] = findStations(provider, {
      fromJd: jd(2023, 12, 1), toJd: jd(2023, 12, 20), bodies: ['mercury'],
    });
    const speed = provider.calc(station!.jd, 'mercury').longitudeSpeed;
    expect(Math.abs(speed)).toBeLessThan(1e-6);
  });

  it('names the sign the station happens in', () => {
    const [station] = findStations(provider, {
      fromJd: jd(2023, 12, 1), toJd: jd(2023, 12, 20), bodies: ['mercury'],
    });
    expect(station!.sign).toBe('capricorn');
  });

  it('refuses a body that never stations rather than returning nothing', () => {
    /*
     * The assertion that matters here. An empty list for "when does the Sun
     * turn retrograde" is indistinguishable from "not in this window", and
     * the reader would take the wrong lesson from it.
     */
    for (const body of ['sun', 'moon', 'meanNode'] as const) {
      expect(() => findStations(provider, {
        fromJd: jd(2024, 1, 1), toJd: jd(2024, 12, 31), bodies: [body],
      }), body).toThrow(NoStationsError);
    }
  });

  it('can be asked to skip them instead, when the caller means a mixed list', () => {
    const events = findStations(provider, {
      fromJd: jd(2023, 11, 20), toJd: jd(2024, 1, 5),
      bodies: ['sun', 'mercury'], strict: false,
    });
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.body === 'mercury')).toBe(true);
  });
});

describe('declination events', () => {
  it('puts the Sun’s extremes at the solstices', () => {
    const events = findDeclinationEvents(provider, {
      fromJd: jd(2024, 6, 1),
      toJd: jd(2024, 7, 10),
      bodies: ['sun'],
      include: ['maximum', 'minimum'],
    });

    expect(events).toHaveLength(1);
    const solstice = events[0]!;
    expect(solstice.type).toBe('maximum');
    expect(solstice.utcIso.slice(0, 10)).toBe('2024-06-20');
    // The obliquity of the ecliptic, which is what the solstice measures.
    expect(solstice.declination).toBeCloseTo(23.44, 1);
  });

  it('puts the Sun across the equator at the equinoxes', () => {
    const events = findDeclinationEvents(provider, {
      fromJd: jd(2024, 1, 1),
      toJd: jd(2025, 1, 1),
      bodies: ['sun'],
      include: ['equatorCrossing'],
    });

    expect(events).toHaveLength(2);
    expect(events[0]!.utcIso.slice(0, 10)).toBe('2024-03-20');
    expect(events[1]!.utcIso.slice(0, 10)).toBe('2024-09-22');
    for (const event of events) expect(Math.abs(event.declination)).toBeLessThan(1e-4);
  });

  it('finds a parallel where two bodies share a declination', () => {
    const events = findDeclinationEvents(provider, {
      fromJd: jd(2024, 1, 1),
      toJd: jd(2025, 1, 1),
      bodies: [],
      pairs: [['venus', 'mars']],
      include: ['parallel'],
    });

    // Once in 2024, on 19 July.
    expect(events).toHaveLength(1);
    expect(events[0]!.utcIso.slice(0, 10)).toBe('2024-07-19');
    for (const event of events) {
      const venus = provider.calc(event.jd, 'venus', { includeEquatorial: true });
      const mars = provider.calc(event.jd, 'mars', { includeEquatorial: true });
      expect(venus.equatorial!.declination)
        .toBeCloseTo(mars.equatorial!.declination, 6);
      expect(event.otherBody).toBe('mars');
    }
  });

  it('distinguishes a contra-parallel, which is the opposite relation', () => {
    const events = findDeclinationEvents(provider, {
      fromJd: jd(2024, 1, 1),
      toJd: jd(2024, 12, 31),
      bodies: [],
      pairs: [['venus', 'mars']],
      include: ['contraParallel'],
    });

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      const venus = provider.calc(event.jd, 'venus', { includeEquatorial: true });
      const mars = provider.calc(event.jd, 'mars', { includeEquatorial: true });
      // Equal and OPPOSITE: the sum is zero, not the difference.
      expect(venus.equatorial!.declination + mars.equatorial!.declination)
        .toBeCloseTo(0, 6);
    }
  });

  it('searches only what it was asked for', () => {
    const events = findDeclinationEvents(provider, {
      fromJd: jd(2024, 1, 1), toJd: jd(2024, 12, 31),
      bodies: ['sun'], include: ['equatorCrossing'],
    });
    expect(events.every((e) => e.type === 'equatorCrossing')).toBe(true);
  });
});

describe('reference frames', () => {
  const instant = jd(2024, 6, 1);

  it('defaults to geocentric', () => {
    const implicit = provider.calc(instant, 'mars');
    const explicit = provider.calc(instant, 'mars', { frame: 'geocentric' });
    expect(explicit.longitude).toBe(implicit.longitude);
  });

  it('gives a different, correct heliocentric longitude', () => {
    const geo = provider.calc(instant, 'mars');
    const helio = provider.calc(instant, 'mars', { frame: 'heliocentric' });
    expect(helio.longitude).not.toBeCloseTo(geo.longitude, 2);

    /*
     * Cross-check without trusting the flag. Heliocentrically, Mars's
     * distance is its distance from the SUN, which never leaves the band
     * between its perihelion (1.381 AU) and aphelion (1.666 AU) — a fact
     * about Mars's orbit, not about this engine. Geocentric distance ranges
     * from about 0.37 to 2.68 AU and on this date is outside that band, so
     * the test fails if the frame did not actually change.
     */
    expect(helio.distanceAu).toBeGreaterThan(1.38);
    expect(helio.distanceAu).toBeLessThan(1.67);
    expect(geo.distanceAu).toBeGreaterThan(1.67);
  });

  it('never moves retrograde heliocentrically', () => {
    // Retrogradation is a parallax effect of watching from a moving Earth.
    // A planet seen from the Sun always advances, which is the clearest
    // single check that the frame really changed.
    for (const body of ['mercury', 'venus', 'mars', 'jupiter'] as const) {
      expect(provider.calc(instant, body, { frame: 'heliocentric' }).longitudeSpeed, body)
        .toBeGreaterThan(0);
    }
  });

  it('refuses a heliocentric Sun, Moon or node instead of inventing one', () => {
    for (const body of ['sun', 'moon', 'trueNode', 'meanNode'] as const) {
      expect(() => provider.calc(instant, body, { frame: 'heliocentric' }), body)
        .toThrow(FrameError);
    }
  });

  it('shifts the Moon topocentrically, and barely anything else', () => {
    const observer = { latitude: 51.4779, longitude: 0, altitudeMetres: 0 };
    const geoMoon = provider.calc(instant, 'moon');
    const topoMoon = provider.calc(instant, 'moon', { frame: 'topocentric', observer });
    const shift = Math.abs(topoMoon.longitude - geoMoon.longitude);
    expect(shift).toBeGreaterThan(0.1);
    expect(shift).toBeLessThan(1.5);

    const geoJupiter = provider.calc(instant, 'jupiter');
    const topoJupiter = provider.calc(instant, 'jupiter', { frame: 'topocentric', observer });
    expect(Math.abs(topoJupiter.longitude - geoJupiter.longitude)).toBeLessThan
      (0.01);
  });

  it('refuses topocentric without an observer rather than returning geocentric', () => {
    expect(() => provider.calc(instant, 'moon', { frame: 'topocentric' }))
      .toThrow(FrameError);
  });
});

describe('the ISO stamp on every event', () => {
  it('agrees with the Julian Day it carries', () => {
    const events = findIngresses(provider, {
      fromJd: jd(2024, 1, 1), toJd: jd(2024, 3, 1), bodies: ['sun'],
    });
    for (const event of events) {
      expect(event.utcIso).toBe(julianDayToIsoUtc(event.jd));
    }
  });
});
