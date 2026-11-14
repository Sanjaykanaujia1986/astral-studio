/**
 * Aṣṭakavarga (Bṛhat Parāśara Horā Śāstra): the bhinnāṣṭakavarga of the seven
 * planets and the lagna, the sarvāṣṭakavarga, the trikoṇa and ekādhipatya
 * reductions, and the rāśi, graha and śodhya piṇḍas.
 *
 * Matches every printed bindu, reduction and piṇḍa in two reference reports.
 * Signs are 0-based (0 = Meṣa).
 */
import { norm360 } from '@astro/engine';
import { SEVEN, type GrahaLongitudes, type Planet } from './grahas.js';

export type AvOwner = Planet | 'lagna';
export const AV_OWNERS: readonly AvOwner[] = [...SEVEN, 'lagna'];
/** Contributors, in the order the bindu tables print them. */
export const AV_CONTRIBUTORS: readonly AvOwner[] = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon', 'lagna'];

/** Houses (counted from each contributor) where it gives the owner a bindu. */
const RULES: Readonly<Record<AvOwner, Readonly<Record<AvOwner, readonly number[]>>>> = {
  sun: { sun: [1, 2, 4, 7, 8, 9, 10, 11], moon: [3, 6, 10, 11], mars: [1, 2, 4, 7, 8, 9, 10, 11], mercury: [3, 5, 6, 9, 10, 11, 12], jupiter: [5, 6, 9, 11], venus: [6, 7, 12], saturn: [1, 2, 4, 7, 8, 9, 10, 11], lagna: [3, 4, 6, 10, 11, 12] },
  moon: { sun: [3, 6, 7, 8, 10, 11], moon: [1, 3, 6, 7, 10, 11], mars: [2, 3, 5, 6, 9, 10, 11], mercury: [1, 3, 4, 5, 7, 8, 10, 11], jupiter: [1, 4, 7, 8, 10, 11, 12], venus: [3, 4, 5, 7, 9, 10, 11], saturn: [3, 5, 6, 11], lagna: [3, 6, 10, 11] },
  mars: { sun: [3, 5, 6, 10, 11], moon: [3, 6, 11], mars: [1, 2, 4, 7, 8, 10, 11], mercury: [3, 5, 6, 11], jupiter: [6, 10, 11, 12], venus: [6, 8, 11, 12], saturn: [1, 4, 7, 8, 9, 10, 11], lagna: [1, 3, 6, 10, 11] },
  mercury: { sun: [5, 6, 9, 11, 12], moon: [2, 4, 6, 8, 10, 11], mars: [1, 2, 4, 7, 8, 9, 10, 11], mercury: [1, 3, 5, 6, 9, 10, 11, 12], jupiter: [6, 8, 11, 12], venus: [1, 2, 3, 4, 5, 8, 9, 11], saturn: [1, 2, 4, 7, 8, 9, 10, 11], lagna: [1, 2, 4, 6, 8, 10, 11] },
  jupiter: { sun: [1, 2, 3, 4, 7, 8, 9, 10, 11], moon: [2, 5, 7, 9, 11], mars: [1, 2, 4, 7, 8, 10, 11], mercury: [1, 2, 4, 5, 6, 9, 10, 11], jupiter: [1, 2, 3, 4, 7, 8, 10, 11], venus: [2, 5, 6, 9, 10, 11], saturn: [3, 5, 6, 12], lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11] },
  venus: { sun: [8, 11, 12], moon: [1, 2, 3, 4, 5, 8, 9, 11, 12], mars: [3, 5, 6, 9, 11, 12], mercury: [3, 5, 6, 9, 11], jupiter: [5, 8, 9, 10, 11], venus: [1, 2, 3, 4, 5, 8, 9, 10, 11], saturn: [3, 4, 5, 8, 9, 10, 11], lagna: [1, 2, 3, 4, 5, 8, 9, 11] },
  saturn: { sun: [1, 2, 4, 7, 8, 10, 11], moon: [3, 6, 11], mars: [3, 5, 6, 10, 11, 12], mercury: [6, 8, 9, 10, 11, 12], jupiter: [5, 6, 11, 12], venus: [6, 11, 12], saturn: [3, 5, 6, 11], lagna: [1, 3, 4, 6, 10, 11] },
  lagna: { sun: [3, 4, 6, 10, 11, 12], moon: [3, 6, 10, 11, 12], mars: [1, 3, 6, 10, 11], mercury: [1, 2, 4, 6, 8, 10, 11], jupiter: [1, 2, 4, 5, 6, 7, 9, 10, 11], venus: [1, 2, 3, 4, 5, 8, 9], saturn: [1, 3, 4, 6, 10, 11], lagna: [3, 6, 10, 11] },
};

const RASI_MULT = [7, 10, 8, 4, 10, 5, 7, 8, 9, 5, 11, 12];
const GRAHA_MULT: Readonly<Record<Planet, number>> = { sun: 5, moon: 5, mars: 8, mercury: 5, jupiter: 10, venus: 7, saturn: 5 };

export interface Bhinna {
  readonly owner: AvOwner;
  /** bindus[contributor][sign]: 1 when that contributor gives a bindu in that sign. */
  readonly bindus: Readonly<Record<AvOwner, readonly number[]>>;
  /** Bindus per sign (0-8). */
  readonly totals: readonly number[];
  readonly trikona: readonly number[];
  readonly ekadhipatya: readonly number[];
  readonly rasiPinda: number;
  readonly grahaPinda: number;
  readonly sodhyaPinda: number;
}

export interface Ashtakavarga {
  readonly bhinna: Readonly<Record<AvOwner, Bhinna>>;
  /** Sarvāṣṭakavarga per sign (seven planets; total 337). */
  readonly sarva: readonly number[];
  /** Rekhās: 56 minus the bindus. */
  readonly rekha: readonly number[];
}

/** Trikoṇa śodhana: in each fire/earth/air/water triad subtract the smallest; equal values all clear. */
export function trikonaReduce(v: readonly number[]): number[] {
  const r = [...v];
  for (let g = 0; g < 4; g += 1) {
    const idx = [g, g + 4, g + 8]; const vals = idx.map((i) => r[i]!);
    if (vals.every((x) => x === vals[0])) { for (const i of idx) r[i] = 0; continue; }
    const mn = Math.min(...vals);
    if (mn === 0) continue;
    for (const i of idx) r[i] = r[i]! - mn;
  }
  return r;
}

/** Ekādhipatya śodhana for the five pairs of signs with one lord; `occupied[s]` = a planet sits in s. */
export function ekadhipatyaReduce(v: readonly number[], occupied: readonly boolean[]): number[] {
  const r = [...v];
  for (const [a, b] of [[0, 7], [1, 6], [2, 5], [8, 11], [9, 10]] as const) {
    const oa = occupied[a]!; const ob = occupied[b]!;
    if (r[a] === 0 || r[b] === 0 || (oa && ob)) continue;
    if (!oa && !ob) {
      if (r[a] === r[b]) { r[a] = 0; r[b] = 0; } else { const m = Math.min(r[a]!, r[b]!); r[a] = m; r[b] = m; }
      continue;
    }
    const [occ, emp] = oa ? [a, b] : [b, a];
    r[emp] = r[occ]! >= r[emp]! ? 0 : r[occ]!;
  }
  return r;
}

export function ashtakavarga(g: GrahaLongitudes): Ashtakavarga {
  if (g.lagna === undefined) throw new Error('aṣṭakavarga needs a lagna');
  const sign = (o: AvOwner): number => Math.floor(norm360(o === 'lagna' ? g.lagna! : g.lon[o]) / 30);
  const occupied = Array.from({ length: 12 }, (_, s) => SEVEN.some((b) => sign(b) === s));
  const bhinna = {} as Record<AvOwner, Bhinna>;
  for (const owner of AV_OWNERS) {
    const bindus = {} as Record<AvOwner, number[]>;
    for (const c of AV_CONTRIBUTORS) {
      const row = new Array<number>(12).fill(0); const s0 = sign(c);
      for (const h of RULES[owner][c]) row[(s0 + h - 1) % 12] = 1;
      bindus[c] = row;
    }
    const totals = Array.from({ length: 12 }, (_, s) => AV_CONTRIBUTORS.reduce((a, c) => a + bindus[c][s]!, 0));
    const trikona = trikonaReduce(totals);
    const eka = ekadhipatyaReduce(trikona, occupied);
    const rasiPinda = eka.reduce((a, v, s) => a + v * RASI_MULT[s]!, 0);
    const grahaPinda = SEVEN.reduce((a, b) => a + eka[sign(b)]! * GRAHA_MULT[b], 0);
    bhinna[owner] = { owner, bindus, totals, trikona, ekadhipatya: eka, rasiPinda, grahaPinda, sodhyaPinda: rasiPinda + grahaPinda };
  }
  const sarva = Array.from({ length: 12 }, (_, s) => SEVEN.reduce((a, b) => a + bhinna[b].totals[s]!, 0));
  return { bhinna, sarva, rekha: sarva.map((v) => 56 - v) };
}
