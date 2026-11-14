/**
 * Aṣṭakūṭa (36-point) compatibility from the two Moons, and Maṅgala doṣa.
 *
 * Seven of the eight kūṭas agree with the reference horoscope software's
 * printed tables (checked across 72 rows). Bhakūṭa follows the classical 0/7
 * rule with the lord-friendship cancellation; the reference software prints 6s
 * and 1s that vary within a single pair of signs, which no published rule
 * produces. See docs/VEDIC_CONVENTIONS.md §9.
 */
import { norm360, type Degrees } from '@astro/engine';
import { NATURAL_RELATION, SIGN_LORDS, type Planet, type GrahaLongitudes } from './grahas.js';

const SPAN = 360 / 27;
const nak = (lon: Degrees): number => Math.floor(norm360(lon) / SPAN);
const sgn = (lon: Degrees): number => Math.floor(norm360(lon) / 30);

/** Varṇa rank by sign: 4 Brāhmaṇa (water), 3 Kṣatriya (fire), 2 Vaiśya (earth), 1 Śūdra (air). */
const VARNA = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4];
export const VARNA_NAME = ['', 'Śūdra', 'Vaiśya', 'Kṣatriya', 'Brāhmaṇa'];

/** Vaśya group: C catuṣpada, N nara (manava), J jalacara, V vanacara, K kīṭa. */
export function vashyaGroup(lon: Degrees): 'C' | 'N' | 'J' | 'V' | 'K' {
  const s = sgn(lon); const d = norm360(lon) % 30;
  return (['C', 'C', 'N', 'J', 'V', 'N', 'N', 'K', d < 15 ? 'N' : 'C', d < 15 ? 'C' : 'J', 'N', 'J'] as const)[s]!;
}
export const VASHYA_NAME = { C: 'Catuṣpada', N: 'Mānava', J: 'Jalacara', V: 'Vanacara', K: 'Kīṭa' } as const;
const VASHYA_PTS: Record<string, number> = {
  CC: 2, NN: 2, JJ: 2, VV: 2, KK: 2, CN: 1, NC: 1, CJ: 1, JC: 1, NJ: 0.5, JN: 0.5, NV: 0, VN: 0, NK: 0, KN: 0,
  CV: 0.5, VC: 0.5, CK: 1, KC: 1, JV: 1, VJ: 1, JK: 1, KJ: 1, VK: 0, KV: 0,
};

export const YONI_OF = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Serpent', 'Dog', 'Cat', 'Sheep', 'Cat', 'Rat', 'Rat', 'Cow', 'Buffalo', 'Tiger',
  'Buffalo', 'Tiger', 'Deer', 'Deer', 'Dog', 'Monkey', 'Mongoose', 'Monkey', 'Lion', 'Horse', 'Lion', 'Cow', 'Elephant'] as const;
const YN = ['Horse', 'Elephant', 'Sheep', 'Serpent', 'Dog', 'Cat', 'Rat', 'Cow', 'Buffalo', 'Tiger', 'Deer', 'Monkey', 'Mongoose', 'Lion'];
const YM = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1], [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0], [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2], [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1], [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2], [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1], [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1], [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1], [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2], [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];

/** Gaṇa by nakṣatra: D deva, M manuṣya, R rākṣasa. */
const GANA = 'DMRMDMDDRRMMDRDRDRRMMDRRMMD';
export const GANA_NAME = { D: 'Deva', M: 'Manuṣya', R: 'Rākṣasa' } as const;
const GANA_PTS: Record<string, number> = { DD: 6, DM: 6, DR: 1, MD: 5, MM: 6, MR: 0, RD: 1, RM: 0, RR: 6 }; // boy+girl

/** Nāḍī by nakṣatra: 0 Ādi, 1 Madhya, 2 Antya. */
const NADI = [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2];
export const NADI_NAME = ['Ādi', 'Madhya', 'Antya'];

/** Pañcadhā-free (natural) relation code of a toward b: F, N or E. */
const rel = (a: Planet, b: Planet): 'F' | 'N' | 'E' => {
  const r = NATURAL_RELATION[a][b];
  return r > 0 ? 'F' : r < 0 ? 'E' : 'N';
};

export interface Koota {
  readonly id: 'varna' | 'vashya' | 'tara' | 'yoni' | 'maitri' | 'gana' | 'bhakut' | 'nadi';
  readonly max: number;
  readonly score: number;
  /** Boy's value, girl's value, and a short reason. */
  readonly boy: string;
  readonly girl: string;
  readonly note?: string;
}

export interface AshtakootaResult {
  readonly kootas: readonly Koota[];
  readonly total: number;
  readonly max: 36;
  /** Doṣas that tradition flags, whatever the total. */
  readonly nadiDosha: boolean;
  readonly bhakutDosha: boolean;
  readonly bhakutCancelled: boolean;
}

/** Eight kūṭas from the boy's and the girl's sidereal Moon. */
export function ashtakoota(boyMoon: Degrees, girlMoon: Degrees): AshtakootaResult {
  const bs = sgn(boyMoon); const gs = sgn(girlMoon);
  const bn = nak(boyMoon); const gn = nak(girlMoon);
  const bl = SIGN_LORDS[bs]!; const gl = SIGN_LORDS[gs]!;

  const varna = VARNA[bs]! >= VARNA[gs]! ? 1 : 0;
  const bv = vashyaGroup(boyMoon); const gv = vashyaGroup(girlMoon);
  const vashya = VASHYA_PTS[bv + gv]!;
  const taraPart = (a: number, b: number): number => ([3, 5, 7].includes((((b - a + 27) % 27) + 1) % 9) ? 0 : 1.5);
  const tara = taraPart(gn, bn) + taraPart(bn, gn);
  const yoni = YM[YN.indexOf(YONI_OF[bn]!)]![YN.indexOf(YONI_OF[gn]!)]!;
  const pair = [rel(bl, gl), rel(gl, bl)].sort().join('');
  const maitri = bl === gl ? 5 : ({ FF: 5, FN: 4, NN: 3, EF: 1, EN: 0.5, EE: 0 } as Record<string, number>)[pair]!;
  const gana = GANA_PTS[GANA[bn]! + GANA[gn]!]!;
  const dist = ((bs - gs + 12) % 12) + 1;
  const bhakutDosha = [2, 12, 5, 9, 6, 8].includes(dist);
  const bhakutCancelled = bhakutDosha && (bl === gl || pair === 'FF');
  const bhakut = !bhakutDosha || bhakutCancelled ? 7 : 0;
  const nadiDosha = NADI[bn] === NADI[gn];
  const nadi = nadiDosha ? 0 : 8;

  const kootas: Koota[] = [
    { id: 'varna', max: 1, score: varna, boy: VARNA_NAME[VARNA[bs]!]!, girl: VARNA_NAME[VARNA[gs]!]! },
    { id: 'vashya', max: 2, score: vashya, boy: VASHYA_NAME[bv], girl: VASHYA_NAME[gv] },
    { id: 'tara', max: 3, score: tara, boy: String(((bn - gn + 27) % 27) % 9 + 1), girl: String(((gn - bn + 27) % 27) % 9 + 1) },
    { id: 'yoni', max: 4, score: yoni, boy: YONI_OF[bn]!, girl: YONI_OF[gn]! },
    { id: 'maitri', max: 5, score: maitri, boy: bl, girl: gl },
    { id: 'gana', max: 6, score: gana, boy: GANA_NAME[GANA[bn] as 'D'], girl: GANA_NAME[GANA[gn] as 'D'] },
    {
      id: 'bhakut', max: 7, score: bhakut, boy: String(dist), girl: String(((gs - bs + 12) % 12) + 1),
      ...(bhakutCancelled ? { note: 'cancelled: sign lords are the same or mutual friends' } : {}),
    },
    { id: 'nadi', max: 8, score: nadi, boy: NADI_NAME[NADI[bn]!]!, girl: NADI_NAME[NADI[gn]!]! },
  ];
  return { kootas, total: kootas.reduce((a, k) => a + k.score, 0), max: 36, nadiDosha, bhakutDosha, bhakutCancelled };
}

/**
 * The printed horoscope's compatibility table: this person against a partner
 * Moon in each of the 36 nakṣatra-within-sign segments.
 */
export function compatibilityTable(moon: Degrees, sex: 'male' | 'female'): {
  readonly signIndex: number; readonly nakshatra: number; readonly padas: readonly number[]; readonly result: AshtakootaResult;
}[] {
  const rows: { signIndex: number; nakshatra: number; padas: number[]; result: AshtakootaResult }[] = [];
  for (let p = 0; p < 108; p += 1) {
    const lon = p * (10 / 3) + 1 / 60; // inside the pāda
    const s = sgn(lon); const n = nak(lon);
    const last = rows[rows.length - 1];
    if (last && last.signIndex === s && last.nakshatra === n) { last.padas.push((p % 4) + 1); continue; }
    const mid = lon + 5 / 3;
    rows.push({
      signIndex: s, nakshatra: n, padas: [(p % 4) + 1],
      result: sex === 'female' ? ashtakoota(mid, moon) : ashtakoota(moon, mid),
    });
  }
  return rows;
}

export interface MangalaDosha {
  /** House of Mars from the lagna, the Moon and Venus. */
  readonly fromLagna?: number;
  readonly fromMoon: number;
  readonly fromVenus: number;
  readonly byLagna: boolean;
  readonly byMoon: boolean;
  readonly byVenus: boolean;
  readonly present: boolean;
}

const MANGALA_HOUSES = [1, 2, 4, 7, 8, 12];

/** Mars in the 1st, 2nd, 4th, 7th, 8th or 12th from the lagna, the Moon or Venus. */
export function mangalaDosha(g: GrahaLongitudes): MangalaDosha {
  const h = (from: Degrees) => ((sgn(g.lon.mars) - sgn(from) + 12) % 12) + 1;
  const fromLagna = g.lagna === undefined ? undefined : h(g.lagna);
  const fromMoon = h(g.lon.moon);
  const fromVenus = h(g.lon.venus);
  const byLagna = fromLagna !== undefined && MANGALA_HOUSES.includes(fromLagna);
  const byMoon = MANGALA_HOUSES.includes(fromMoon);
  const byVenus = MANGALA_HOUSES.includes(fromVenus);
  return {
    ...(fromLagna === undefined ? {} : { fromLagna }),
    fromMoon, fromVenus, byLagna, byMoon, byVenus,
    present: g.lagna === undefined ? byMoon : byLagna,
  };
}
