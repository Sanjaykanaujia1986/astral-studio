/**
 * City lookup for birth data.
 *
 * Wraps the columnar payload built by `scripts/build-locations.mjs` in a search
 * API. Everything runs locally against the bundled data — no network call is
 * made to resolve a birthplace, because the app must produce charts offline.
 *
 * Data: GeoNames, CC BY 4.0. Attribution is required wherever this is shown.
 */

export interface CityRecord {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  /** IANA zone identifier, e.g. `Asia/Kolkata`. */
  readonly timezone: string;
  readonly countryCode: string;
  readonly countryName: string;
  /** State or province name, where GeoNames has one. */
  readonly admin1?: string;
  readonly population: number;
  /**
   * Human-readable disambiguator, e.g. `Springfield, Illinois, United States`.
   * Same-name cities are common enough that a bare name is not selectable.
   */
  readonly label: string;
}

export interface LocationDataset {
  readonly version: number;
  readonly source: string;
  readonly license: string;
  readonly generated: string;
  readonly coordinateScale: number;
  readonly timezones: readonly string[];
  readonly countries: readonly string[];
  readonly countryNames: Readonly<Record<string, string>>;
  readonly admin1: Readonly<Record<string, string>>;
  readonly cities: readonly (readonly [
    name: string,
    scaledLatitude: number,
    scaledLongitude: number,
    timezoneIndex: number,
    countryIndex: number,
    admin1Code: string,
    population: number,
  ])[];
}

export interface SearchOptions {
  readonly limit?: number;
  /** Restrict to one ISO country code, e.g. `IN`. */
  readonly countryCode?: string;
  /** Ignore places below this population. */
  readonly minPopulation?: number;
}

/**
 * Fold a string for comparison: lower case, diacritics stripped.
 *
 * Someone typing "zurich" must find "Zürich" and "Sao Paulo" must find
 * "São Paulo" — expecting a user to reproduce diacritics they may not have on
 * their keyboard would make those cities unreachable.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    // Strip combining marks. NFD splits an accented letter into base +
    // mark, so removing the Mark category leaves the plain letter behind.
    // Uses a Unicode property escape rather than a hard-coded code-point
    // range, which states the intent and cannot drift.
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

interface IndexedCity {
  readonly record: CityRecord;
  readonly folded: string;
}

export class LocationDatabase {
  readonly #dataset: LocationDataset;
  #index: IndexedCity[] | undefined;

  constructor(dataset: LocationDataset) {
    if (!dataset || !Array.isArray(dataset.cities)) {
      throw new TypeError('LocationDatabase requires a built city dataset');
    }
    this.#dataset = dataset;
  }

  get source(): string { return this.#dataset.source; }
  get license(): string { return this.#dataset.license; }
  get generated(): string { return this.#dataset.generated; }
  get size(): number { return this.#dataset.cities.length; }

  /** Built on first use, so importing the package costs nothing. */
  #ensureIndex(): IndexedCity[] {
    if (this.#index) return this.#index;

    const d = this.#dataset;
    const scale = d.coordinateScale;

    this.#index = d.cities.map((row) => {
      const [name, lat, lon, tzIndex, ccIndex, admin1Code, population] = row;
      const countryCode = d.countries[ccIndex] ?? '';
      const countryName = d.countryNames[countryCode] ?? countryCode;
      const admin1 = admin1Code ? d.admin1[`${countryCode}.${admin1Code}`] : undefined;

      const label = [name, admin1, countryName].filter(Boolean).join(', ');

      const record: CityRecord = {
        name,
        latitude: lat / scale,
        longitude: lon / scale,
        timezone: d.timezones[tzIndex] ?? 'UTC',
        countryCode,
        countryName,
        ...(admin1 ? { admin1 } : {}),
        population,
        label,
      };
      return { record, folded: foldForSearch(name) };
    });

    return this.#index;
  }

  /**
   * Search by city name.
   *
   * Ranked so the expected answer comes first: exact match, then prefix, then
   * substring; population breaks ties within each tier, because "London" almost
   * always means the large one.
   */
  search(query: string, options: SearchOptions = {}): CityRecord[] {
    const needle = foldForSearch(query);
    if (needle.length === 0) return [];

    const limit = options.limit ?? 20;
    const minPopulation = options.minPopulation ?? 0;
    const countryCode = options.countryCode;

    const scored: { city: IndexedCity; rank: number }[] = [];

    for (const city of this.#ensureIndex()) {
      if (city.record.population < minPopulation) continue;
      if (countryCode && city.record.countryCode !== countryCode) continue;

      const position = city.folded.indexOf(needle);
      if (position === -1) continue;

      // Lower rank sorts first.
      const tier = city.folded === needle ? 0 : position === 0 ? 1 : 2;
      scored.push({ city, rank: tier });
    }

    scored.sort((a, b) =>
      a.rank !== b.rank ? a.rank - b.rank : b.city.record.population - a.city.record.population,
    );

    return scored.slice(0, limit).map((entry) => entry.city.record);
  }

  /** Exact-name lookup, for restoring a saved chart's birthplace. */
  findByName(name: string, countryCode?: string): CityRecord | undefined {
    const needle = foldForSearch(name);
    return this.#ensureIndex().find(
      (c) => c.folded === needle && (!countryCode || c.record.countryCode === countryCode),
    )?.record;
  }

  /** Every city sharing a name — the set a disambiguating UI must offer. */
  findAllByName(name: string): CityRecord[] {
    const needle = foldForSearch(name);
    return this.#ensureIndex()
      .filter((c) => c.folded === needle)
      .map((c) => c.record)
      .sort((a, b) => b.population - a.population);
  }

  /** Nearest city to a coordinate, for reverse lookup of a manual entry. */
  nearest(latitude: number, longitude: number): CityRecord | undefined {
    let best: CityRecord | undefined;
    let bestDistance = Infinity;

    for (const { record } of this.#ensureIndex()) {
      // Squared planar distance is monotonic in true distance over the small
      // separations that matter here, and avoids a trig call per city.
      const dLat = record.latitude - latitude;
      const dLon = (record.longitude - longitude) * Math.cos((latitude * Math.PI) / 180);
      const distance = dLat * dLat + dLon * dLon;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = record;
      }
    }
    return best;
  }
}

/** Attribution string that must accompany any display of this data. */
export const GEONAMES_ATTRIBUTION =
  'City data © GeoNames, licensed under CC BY 4.0';
