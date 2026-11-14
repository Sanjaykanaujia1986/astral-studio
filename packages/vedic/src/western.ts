/**
 * The "western" pages of a printed Jyotiṣa report: sāyana longitudes with
 * motion, latitude and declination, tropical Placidus cusps, and the
 * planet-to-planet and planet-to-cusp aspect grids.
 *
 * As the reference software prints them: a separation is the whole degrees of
 * |a − b|, except that above 180° it prints 360 − ⌊|a − b|⌋; an aspect holds
 * within 8° for the major aspects, 4° for the semi-square, 3° for the
 * sesquiquadrate and quincunx and 2° for the quintile, read from that whole
 * number. Nakṣatra lords on these pages are taken on the sāyana longitude.
 */
import { norm360, type Body, type Degrees, type EphemerisProvider } from '@astro/engine';
import { kpLords, type KpLords } from './kp.js';

export const WESTERN_BODIES = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu', 'uranus', 'neptune', 'pluto'] as const;
export type WesternBody = (typeof WESTERN_BODIES)[number];

export const ASPECTS = [
  { angle: 0, name: 'conjunction', short: 'conj', orb: 8 },
  { angle: 45, name: 'semi-square', short: 'ssqr', orb: 4 },
  { angle: 60, name: 'sextile', short: 'sext', orb: 8 },
  { angle: 72, name: 'quintile', short: 'quin', orb: 2 },
  { angle: 90, name: 'square', short: 'squr', orb: 8 },
  { angle: 120, name: 'trine', short: 'trin', orb: 8 },
  { angle: 135, name: 'sesquiquadrate', short: 'sesq', orb: 3 },
  { angle: 150, name: 'quincunx', short: 'qucu', orb: 3 },
  { angle: 180, name: 'opposition', short: 'oppo', orb: 8 },
] as const;

/** The reports' whole-degree separation. */
export function separationInt(a: Degrees, b: Degrees): number {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - Math.floor(d) : Math.floor(d);
}
export function aspectOf(sep: number): (typeof ASPECTS)[number] | undefined {
  return ASPECTS.find((x) => Math.abs(sep - x.angle) <= x.orb);
}

export interface WesternPosition {
  readonly body: WesternBody | 'lagna';
  readonly longitude: Degrees;
  readonly speed: number;
  readonly latitude: Degrees;
  readonly declination: Degrees;
  /** Lords taken on the sāyana longitude, as the reports print them. */
  readonly lords: KpLords;
}

export interface Western {
  readonly positions: readonly WesternPosition[];
  readonly cusps: readonly { readonly house: number; readonly longitude: Degrees; readonly lords: KpLords }[];
}

export function western(provider: EphemerisProvider, jdUT: number, place: { latitude: Degrees; longitude: Degrees }, node: 'meanNode' | 'trueNode' = 'meanNode'): Western {
  const zodiac = { kind: 'tropical' } as const;
  const h = provider.houses(jdUT, place.latitude, place.longitude, 'placidus', { zodiac });
  const positions: WesternPosition[] = [
    { body: 'lagna', longitude: norm360(h.ascendant), speed: 0, latitude: 0, declination: 0, lords: kpLords(h.ascendant) },
  ];
  for (const b of WESTERN_BODIES) {
    const id: Body = b === 'rahu' || b === 'ketu' ? node : b;
    const p = provider.calc(jdUT, id, { zodiac, includeEquatorial: true });
    const ketu = b === 'ketu'; const node0 = b === 'rahu' || ketu;
    const lon = norm360(p.longitude + (ketu ? 180 : 0));
    positions.push({
      body: b, longitude: lon, speed: p.longitudeSpeed,
      // The reports print 0 latitude and declination for the nodes.
      latitude: node0 ? 0 : p.latitude, declination: node0 ? 0 : p.equatorial?.declination ?? 0,
      lords: kpLords(lon),
    });
  }
  return { positions, cusps: h.cusps.map((c, k) => ({ house: k + 1, longitude: norm360(c), lords: kpLords(c) })) };
}

/** Upper-triangle grid of whole-degree separations and aspects between bodies. */
export function aspectGrid(lons: readonly (readonly [string, Degrees])[]): { a: string; b: string; sep: number; aspect?: string }[] {
  const out: { a: string; b: string; sep: number; aspect?: string }[] = [];
  for (let i = 0; i < lons.length; i += 1) {
    for (let j = i + 1; j < lons.length; j += 1) {
      const sep = separationInt(lons[i]![1], lons[j]![1]); const asp = aspectOf(sep);
      out.push({ a: lons[i]![0], b: lons[j]![0], sep, ...(asp ? { aspect: asp.short } : {}) });
    }
  }
  return out;
}
