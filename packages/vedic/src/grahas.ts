/**
 * The nine grahas as Jyotiṣa counts them, and the fixed tables every later
 * module needs: sign lords, exaltation, own signs, natural friendship.
 *
 * Rāhu is whichever node the chart was cast with (mean, classically); Ketu is
 * exactly opposite. Outer planets are not grahas and are left out.
 */
import { norm360, type Degrees } from '@astro/engine';
import type { VedicChart } from './chart.js';

export const GRAHAS = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'] as const;
export type Graha = (typeof GRAHAS)[number];
export const SEVEN = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'] as const;
export type Planet = (typeof SEVEN)[number];

/** Lord of each sign, Aries first. */
export const SIGN_LORDS: readonly Planet[] = [
  'mars', 'venus', 'mercury', 'moon', 'sun', 'mercury',
  'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter',
];

/** Sign index of exaltation (debilitation is opposite). */
export const EXALTATION: Readonly<Record<Planet, number>> = {
  sun: 0, moon: 1, mars: 9, mercury: 5, jupiter: 3, venus: 11, saturn: 6,
};

export const OWN_SIGNS: Readonly<Record<Planet, readonly number[]>> = {
  sun: [4], moon: [3], mars: [0, 7], mercury: [2, 5], jupiter: [8, 11], venus: [1, 6], saturn: [9, 10],
};

/** Mūlatrikoṇa sign. */
export const MOOLATRIKONA: Readonly<Record<Planet, number>> = {
  sun: 4, moon: 1, mars: 0, mercury: 5, jupiter: 8, venus: 6, saturn: 10,
};

/** Naisargika (natural) relationship: +1 friend, 0 neutral, -1 enemy. */
const F = 1; const N = 0; const E = -1;
export const NATURAL_RELATION: Readonly<Record<Planet, Readonly<Record<Planet, number>>>> = {
  sun: { sun: F, moon: F, mars: F, mercury: N, jupiter: F, venus: E, saturn: E },
  moon: { sun: F, moon: F, mars: N, mercury: F, jupiter: N, venus: N, saturn: N },
  mars: { sun: F, moon: F, mars: F, mercury: E, jupiter: F, venus: N, saturn: N },
  mercury: { sun: F, moon: E, mars: N, mercury: F, jupiter: N, venus: F, saturn: N },
  jupiter: { sun: F, moon: F, mars: F, mercury: E, jupiter: F, venus: E, saturn: N },
  venus: { sun: E, moon: E, mars: N, mercury: F, jupiter: N, venus: F, saturn: F },
  saturn: { sun: E, moon: E, mars: E, mercury: F, jupiter: N, venus: F, saturn: F },
};

export const signOf = (lon: Degrees): number => Math.floor(norm360(lon) / 30);
/** House of `lon` counted from the sign of `from` (1-12). */
export const houseFrom = (lon: Degrees, from: Degrees): number => ((signOf(lon) - signOf(from) + 12) % 12) + 1;

/** Sidereal longitudes of the nine grahas and the lagna. */
export interface GrahaLongitudes {
  readonly lon: Readonly<Record<Graha, Degrees>>;
  readonly lagna?: Degrees;
  readonly retrograde: Readonly<Record<Graha, boolean>>;
  /** Daily speed in degrees, when the chart carries it (negative = retrograde). */
}

export function grahaLongitudes(chart: VedicChart): GrahaLongitudes {
  const find = (ids: readonly string[]) => chart.placements.find((p) => ids.includes(p.body));
  const lon: Partial<Record<Graha, Degrees>> = {};
  const retro: Partial<Record<Graha, boolean>> = {};
  for (const g of SEVEN) {
    const p = find([g]);
    if (!p) throw new Error(`chart has no ${g}`);
    lon[g] = p.longitude; retro[g] = p.retrograde;
  }
  const node = find(['meanNode', 'trueNode']);
  if (!node) throw new Error('chart has no lunar node');
  lon.rahu = node.longitude; lon.ketu = norm360(node.longitude + 180);
  retro.rahu = true; retro.ketu = true;
  return {
    lon: lon as Record<Graha, Degrees>,
    retrograde: retro as Record<Graha, boolean>,
    ...(chart.lagna ? { lagna: chart.lagna.longitude } : {}),
  };
}
