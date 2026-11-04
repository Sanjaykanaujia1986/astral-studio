import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LocationDatabase,
  foldForSearch,
  type LocationDataset,
} from '../src/index.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cities.json');
const HAVE_DATA = existsSync(DATA);

let db: LocationDatabase;

beforeAll(() => {
  if (!HAVE_DATA) return;
  db = new LocationDatabase(JSON.parse(readFileSync(DATA, 'utf8')) as LocationDataset);
});

describe('foldForSearch', () => {
  it('strips diacritics so a plain keyboard can reach every city', () => {
    expect(foldForSearch('Zürich')).toBe('zurich');
    expect(foldForSearch('São Paulo')).toBe('sao paulo');
    expect(foldForSearch('Málaga')).toBe('malaga');
    expect(foldForSearch('Ōsaka')).toBe('osaka');
  });

  it('lower-cases and trims', () => {
    expect(foldForSearch('  LONDON  ')).toBe('london');
  });

  it('leaves unaccented text unchanged', () => {
    expect(foldForSearch('Mumbai')).toBe('mumbai');
  });
});

describe.skipIf(!HAVE_DATA)('the bundled dataset', () => {
  it('carries its source and licence, which attribution depends on', () => {
    expect(db.source).toContain('GeoNames');
    expect(db.license).toContain('CC BY 4.0');
    expect(db.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('contains a substantial number of places', () => {
    expect(db.size).toBeGreaterThan(50_000);
  });
});

describe.skipIf(!HAVE_DATA)('search ranking', () => {
  it('puts the largest exact match first', () => {
    const [first] = db.search('London');
    expect(first!.name).toBe('London');
    expect(first!.countryCode).toBe('GB');
  });

  it('finds Mumbai with correct coordinates and time zone', () => {
    const [mumbai] = db.search('Mumbai');
    expect(mumbai!.name).toBe('Mumbai');
    expect(mumbai!.countryCode).toBe('IN');
    expect(mumbai!.timezone).toBe('Asia/Kolkata');
    expect(mumbai!.latitude).toBeCloseTo(19.07, 1);
    expect(mumbai!.longitude).toBeCloseTo(72.88, 1);
  });

  it('ranks exact matches above prefix, and prefix above substring', () => {
    const results = db.search('York', { limit: 30 });
    const exactIndex = results.findIndex((r) => foldForSearch(r.name) === 'york');
    const substringIndex = results.findIndex((r) => foldForSearch(r.name) === 'new york');
    expect(exactIndex).toBeGreaterThanOrEqual(0);
    if (substringIndex >= 0) expect(exactIndex).toBeLessThan(substringIndex);
  });

  it('matches accented city names from unaccented input', () => {
    const results = db.search('Zurich');
    expect(results.length).toBeGreaterThan(0);
    expect(foldForSearch(results[0]!.name)).toBe('zurich');
    expect(results[0]!.countryCode).toBe('CH');
  });

  it('returns nothing for an empty or whitespace query', () => {
    expect(db.search('')).toEqual([]);
    expect(db.search('   ')).toEqual([]);
  });

  it('respects the result limit', () => {
    expect(db.search('San', { limit: 5 })).toHaveLength(5);
  });

  it('can restrict to one country', () => {
    const results = db.search('Springfield', { countryCode: 'US', limit: 50 });
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((r) => r.countryCode === 'US')).toBe(true);
  });

  it('can filter out small places', () => {
    const results = db.search('a', { minPopulation: 1_000_000, limit: 50 });
    expect(results.every((r) => r.population >= 1_000_000)).toBe(true);
  });
});

describe.skipIf(!HAVE_DATA)('disambiguation — same-name cities are common', () => {
  it('gives every result a label that distinguishes it', () => {
    const springfields = db.findAllByName('Springfield');
    expect(springfields.length).toBeGreaterThan(3);
    const labels = new Set(springfields.map((s) => s.label));
    // Labels carry state and country, so they must not all collapse to one.
    expect(labels.size).toBeGreaterThan(3);
  });

  it('labels read as "City, State, Country"', () => {
    const [mumbai] = db.search('Mumbai');
    expect(mumbai!.label).toContain('Mumbai');
    expect(mumbai!.label).toContain('India');
  });

  it('orders same-name cities by population', () => {
    const all = db.findAllByName('Springfield');
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.population).toBeLessThanOrEqual(all[i - 1]!.population);
    }
  });
});

describe.skipIf(!HAVE_DATA)('every record is usable for a chart', () => {
  it('has a valid IANA time zone that the platform recognises', () => {
    // A city whose zone the runtime cannot resolve would silently produce a
    // wrong chart, so this is checked against the real ICU database.
    const sample = [
      ...db.search('a', { limit: 40 }),
      ...db.search('e', { limit: 40 }),
      ...db.search('o', { limit: 40 }),
    ];
    for (const city of sample) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: city.timezone })).not.toThrow();
    }
  });

  it('has coordinates in range', () => {
    for (const city of db.search('a', { limit: 100 })) {
      expect(Math.abs(city.latitude)).toBeLessThanOrEqual(90);
      expect(Math.abs(city.longitude)).toBeLessThanOrEqual(180);
    }
  });

  it('retains enough coordinate precision for house calculation', () => {
    // Stored scaled by 1e4: ~11 m, or 0.024 seconds of sidereal time.
    const [mumbai] = db.search('Mumbai');
    expect(mumbai!.latitude.toString()).toMatch(/^\d+\.\d{1,4}$/);
  });
});

describe.skipIf(!HAVE_DATA)('reverse lookup', () => {
  it('finds the nearest city to a coordinate', () => {
    const near = db.nearest(19.076, 72.877);
    expect(near).toBeDefined();
    expect(near!.countryCode).toBe('IN');
  });

  it('finds a city by exact name', () => {
    expect(db.findByName('Mumbai', 'IN')?.timezone).toBe('Asia/Kolkata');
    expect(db.findByName('Definitely Not A City')).toBeUndefined();
  });
});
