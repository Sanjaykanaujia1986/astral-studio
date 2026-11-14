/**
 * The tabular pages of a printed Jyotiṣa report, each rebuilt from its rule and
 * checked against two reference reports (docs/VEDIC_CONVENTIONS.md §12):
 * friendship, dignity, ṣoḍaśavarga and viṁśopaka, sahams, special lagnas,
 * Jaimini rāśi dṛṣṭi and ārūḍhas, avakahaḍa, ghātaka, favourable points, the
 * Tārā and Sudarśana cakras and the chalit (bhāva) chart.
 */
import { norm360, type Degrees } from '@astro/engine';
import { EXALTATION, GRAHAS, OWN_SIGNS, SEVEN, SIGN_LORDS, type Graha, type GrahaLongitudes, type Planet } from './grahas.js';
import { vargaOf } from './shadbala.js';

const SPAN = 360 / 27;
const sgn = (lon: Degrees): number => Math.floor(norm360(lon) / 30);
const nakIdx = (lon: Degrees): number => Math.floor(norm360(lon) / SPAN);
const VIM_LORD: readonly Graha[] = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'];

// ------------------------------------------------------------------ friendship

export type Relation = 'F' | 'N' | 'E';
/**
 * Permanent friendship of the nine. The seven follow Parāśara; the reference
 * software's rows and columns for Rāhu and Ketu (no classical rule) are used
 * as printed — identical in both reports.
 */
const PERM: Readonly<Record<Graha, string>> = {
  //        Su Mo Ma Me Ju Ve Sa Ra Ke
  sun: '-FFNFEEEE',
  moon: 'F-NFNNNEE',
  mars: 'FF-EFNNEF',
  mercury: 'FEN-NFNFN',
  jupiter: 'FFFE-ENNN',
  venus: 'EENFN-FFF',
  saturn: 'EEEFNF-FE',
  rahu: 'EEEFNFF-E',
  ketu: 'EEFNNFEE-',
};
export const permanentRelation = (a: Graha, b: Graha): Relation => PERM[a][GRAHAS.indexOf(b)] as Relation;
/** Temporary: friends in the 2nd, 3rd, 4th, 10th, 11th and 12th from a planet. */
export const temporaryFriend = (g: GrahaLongitudes, a: Graha, b: Graha): boolean =>
  [2, 3, 4, 10, 11, 12].includes(((sgn(g.lon[b]) - sgn(g.lon[a]) + 12) % 12) + 1);
export type FiveFold = 'intimate' | 'friend' | 'neutral' | 'enemy' | 'bitter';
export function fiveFold(g: GrahaLongitudes, a: Graha, b: Graha): FiveFold {
  const p = permanentRelation(a, b); const s = (p === 'F' ? 1 : p === 'E' ? -1 : 0) + (temporaryFriend(g, a, b) ? 1 : -1);
  return (['bitter', 'enemy', 'neutral', 'friend', 'intimate'] as const)[s + 2]!;
}

// ------------------------------------------------------------------ dignity

/** Combustion orbs (direct, retrograde) from the Sun. */
export const COMBUSTION: Readonly<Partial<Record<Planet, readonly [number, number]>>> = {
  moon: [12, 12], mars: [17, 17], mercury: [14, 12], jupiter: [11, 11], venus: [10, 8], saturn: [15, 15],
};
/** Mūlatrikoṇa sign and degrees, as the reports flag them. */
const MT_FLAG: Readonly<Record<Planet, readonly [number, number, number]>> = {
  sun: [4, 0, 20], moon: [1, 4, 30], mars: [0, 0, 12], mercury: [5, 16, 20], jupiter: [8, 0, 10], venus: [6, 0, 15], saturn: [10, 0, 20],
};
export interface Dignity {
  readonly body: Graha;
  readonly combust: boolean;
  readonly status: 'exalted' | 'debilitated' | 'moolatrikona' | 'own' | 'friend' | 'neutral' | 'enemy' | 'node';
}
export function dignities(g: GrahaLongitudes): Dignity[] {
  return GRAHAS.map((b) => {
    if (b === 'rahu' || b === 'ketu') return { body: b, combust: false, status: 'node' as const };
    const s = sgn(g.lon[b]); const d = norm360(g.lon[b]) % 30;
    const orb = COMBUSTION[b]; const sep = Math.abs(((g.lon[b] - g.lon.sun + 540) % 360) - 180);
    const combust = orb !== undefined && sep <= orb[g.retrograde[b] ? 1 : 0];
    const mt = MT_FLAG[b];
    const status = s === EXALTATION[b] ? 'exalted' as const
      : s === (EXALTATION[b] + 6) % 12 ? 'debilitated' as const
        : s === mt[0] && d >= mt[1] && d < mt[2] ? 'moolatrikona' as const
          : OWN_SIGNS[b].includes(s) ? 'own' as const
            : ({ F: 'friend', N: 'neutral', E: 'enemy' } as const)[permanentRelation(b, SIGN_LORDS[s]!)];
    return { body: b, combust, status };
  });
}

// ------------------------------------------------------------------ ṣoḍaśavarga / viṁśopaka

export const SHODASHA = [1, 2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60] as const;
/** Sign index (0 = Meṣa) of the lagna and nine grahas in each of the sixteen vargas. */
export function shodashavarga(g: GrahaLongitudes): Record<number, Record<Graha | 'lagna', number>> {
  const out: Record<number, Record<Graha | 'lagna', number>> = {};
  for (const n of SHODASHA) {
    const row = {} as Record<Graha | 'lagna', number>;
    if (g.lagna !== undefined) row.lagna = vargaOf(n, g.lagna);
    for (const b of GRAHAS) row[b] = vargaOf(n, g.lon[b]);
    out[n] = row;
  }
  return out;
}

export type VimshopakaScheme = 'shad' | 'sapta' | 'dasha' | 'shodasha';
const SCHEME: Readonly<Record<VimshopakaScheme, readonly (readonly [number, number])[]>> = {
  shad: [[1, 6], [2, 2], [3, 4], [9, 5], [12, 2], [30, 1]],
  sapta: [[1, 5], [2, 2], [3, 3], [7, 2.5], [9, 4.5], [12, 2], [30, 1]],
  dasha: [[1, 3], [2, 1.5], [3, 1.5], [7, 1.5], [9, 1.5], [10, 1.5], [12, 1.5], [16, 1.5], [30, 1.5], [60, 5]],
  shodasha: [[1, 3.5], [2, 1], [3, 1], [4, 0.5], [7, 0.5], [9, 3], [10, 0.5], [12, 0.5], [16, 2], [20, 0.5], [24, 0.5], [27, 0.5], [30, 1], [40, 0.5], [45, 0.5], [60, 4]],
};
/** The reference software's saptavarga weights (D7 1, D9 2.5, D12 4.5, D30 2). */
const SAPTA_PRINTED: readonly (readonly [number, number])[] = [[1, 5], [2, 2], [3, 3], [7, 1], [9, 2.5], [12, 4.5], [30, 2]];

/** Viṁśopaka bala (out of 20) of the seven planets. Points: own 20, adhimitra 18, mitra 15, sama 10, śatru 7, adhiśatru 5. */
export function vimshopaka(g: GrahaLongitudes, scheme: VimshopakaScheme, saptaWeights: 'parashara' | 'printed' = 'parashara'): Record<Planet, number> {
  const sch = scheme === 'sapta' && saptaWeights === 'printed' ? SAPTA_PRINTED : SCHEME[scheme];
  const pts = (b: Planet, n: number): number => {
    const lord = SIGN_LORDS[vargaOf(n, g.lon[b])]!;
    if (lord === b) return 20;
    const p = permanentRelation(b, lord); const t = temporaryFriend(g, b, lord);
    const c = p === 'F' ? (t ? 18 : 10) : p === 'N' ? (t ? 15 : 7) : (t ? 10 : 5);
    return c;
  };
  return Object.fromEntries(SEVEN.map((b) => [b, sch.reduce((a, [n, w]) => a + (w * pts(b, n)) / 20, 0)])) as Record<Planet, number>;
}

// ------------------------------------------------------------------ sahams

export interface Saham { readonly name: string; readonly longitude: Degrees; readonly formula: string }

/**
 * Forty-one Tājika sahams as the reference software computes them (all agree
 * with both reports to 2′). Where a formula is marked "+30" the classical
 * rule adds a sign when the third point does not fall between the second and
 * the first. `cusps` are the twelve Placidus cusps in the chart's zodiac.
 */
export function sahams(g: GrahaLongitudes, cusps: readonly Degrees[]): Saham[] {
  if (g.lagna === undefined) return [];
  const asc = g.lagna; const ascSign = sgn(asc);
  const P = (b: Graha): number => g.lon[b];
  const between = (b: number, a: number, c: number): boolean => norm360(c - b) <= norm360(a - b);
  const sh = (a: number, b: number, c: number, rule: boolean): number => {
    if (Math.abs(a - b) < 1e-9) return norm360(c);
    const v = norm360(a - b + c);
    return rule && !between(b, a, c) ? norm360(v + 30) : v;
  };
  const L = (h: number): number => P(SIGN_LORDS[(ascSign + h - 1) % 12]!);
  const punya = sh(P('moon'), P('sun'), asc, false);
  const vidya = sh(P('sun'), P('moon'), asc, true);
  const rows: [string, number, string][] = [
    ['Puṇya', punya, 'Moon − Sun + Lagna'],
    ['Guru', vidya, 'Sun − Moon + Lagna (+30)'],
    ['Vidyā', vidya, 'Sun − Moon + Lagna (+30)'],
    ['Yaśas', sh(P('jupiter'), punya, asc, true), 'Jupiter − Puṇya + Lagna (+30)'],
    ['Mitra', sh(vidya, punya, P('venus'), false), 'Guru saham − Puṇya + Venus'],
    ['Māhātmya', sh(punya, P('mars'), asc, true), 'Puṇya − Mars + Lagna (+30)'],
    ['Āśā', sh(P('saturn'), P('venus'), asc, true), 'Saturn − Venus + Lagna (+30)'],
    ['Sāmarthya', sh(P('mars'), L(1), asc, true), 'Mars − lagna lord + Lagna (+30)'],
    ['Bhrātṛ', sh(P('jupiter'), P('saturn'), asc, true), 'Jupiter − Saturn + Lagna (+30)'],
    ['Gaurava', sh(P('sun'), P('moon'), P('jupiter'), true), 'Sun − Moon + Jupiter (+30)'],
    ['Pitṛ', sh(P('saturn'), P('sun'), asc, true), 'Saturn − Sun + Lagna (+30)'],
    ['Rāja', sh(P('saturn'), P('sun'), asc, true), 'Saturn − Sun + Lagna (+30)'],
    ['Mātṛ', sh(P('moon'), P('venus'), asc, false), 'Moon − Venus + Lagna'],
    ['Putra', sh(P('jupiter'), P('moon'), asc, true), 'Jupiter − Moon + Lagna (+30)'],
    ['Jīva', sh(P('saturn'), P('jupiter'), asc, true), 'Saturn − Jupiter + Lagna (+30)'],
    ['Roga', sh(P('saturn'), P('moon'), asc, true), 'Saturn − Moon + Lagna (+30)'],
    ['Karma', sh(P('mars'), P('mercury'), asc, true), 'Mars − Mercury + Lagna (+30)'],
    ['Manmatha', sh(P('moon'), L(1), asc, false), 'Moon − lagna lord + Lagna'],
    ['Kali', sh(P('jupiter'), P('mars'), asc, false), 'Jupiter − Mars + Lagna'],
    ['Kṣamā', sh(P('jupiter'), P('mars'), asc, false), 'Jupiter − Mars + Lagna'],
    ['Śāstra', sh(P('jupiter'), P('saturn'), P('mercury'), true), 'Jupiter − Saturn + Mercury (+30)'],
    ['Bandhu', sh(vidya, P('sun'), P('mercury'), false), 'Guru saham − Sun + Mercury'],
    ['Mṛtyu', sh(cusps[7]!, P('moon'), P('saturn'), true), '8th cusp − Moon + Saturn (+30)'],
    ['Deśāntara', sh(cusps[8]!, L(9), asc, false), '9th cusp − 9th lord + Lagna'],
    ['Dhana', sh(cusps[1]!, L(2), asc, false), '2nd cusp − 2nd lord + Lagna'],
    ['Paradāra', sh(P('venus'), P('sun'), asc, true), 'Venus − Sun + Lagna (+30)'],
    ['Anya-karma', sh(P('sun'), P('saturn'), punya, true), 'Sun − Saturn + Puṇya (+30)'],
    ['Vaṇik', sh(P('moon'), P('mercury'), asc, true), 'Moon − Mercury + Lagna (+30)'],
    ['Kārya-siddhi', sh(P('saturn'), P('sun'), P(SIGN_LORDS[sgn(P('sun'))]!), false), 'Saturn − Sun + lord of the Sun’s sign'],
    ['Vivāha', sh(P('venus'), P('saturn'), asc, true), 'Venus − Saturn + Lagna (+30)'],
    ['Prasava', sh(P('jupiter'), P('mercury'), asc, true), 'Jupiter − Mercury + Lagna (+30)'],
    ['Santāpa', sh(P('saturn'), P('moon'), cusps[5]!, false), 'Saturn − Moon + 6th cusp'],
    ['Śraddhā', sh(P('venus'), P('mars'), asc, false), 'Venus − Mars + Lagna'],
    ['Prīti', sh(vidya, punya, asc, true), 'Vidyā − Puṇya + Lagna (+30)'],
    ['Jāḍya', sh(P('mars'), P('saturn'), P('mercury'), true), 'Mars − Saturn + Mercury (+30)'],
    ['Vyāpāra', sh(P('mars'), P('mercury'), asc, true), 'Mars − Mercury + Lagna (+30)'],
    ['Pānīya-pāta', sh(P('saturn'), P('moon'), asc, true), 'Saturn − Moon + Lagna (+30)'],
    ['Śatru', sh(P('mars'), P('saturn'), asc, true), 'Mars − Saturn + Lagna (+30)'],
    ['Jalapatha', sh(105, P('saturn'), asc, true), 'Karka 15° − Saturn + Lagna (+30)'],
    ['Bandhana', sh(punya, P('saturn'), asc, false), 'Puṇya − Saturn + Lagna'],
    ['Lābha', sh(cusps[10]!, L(11), asc, false), '11th cusp − 11th lord + Lagna'],
  ];
  return rows.map(([name, longitude, formula]) => ({ name, longitude, formula }));
}

// ------------------------------------------------------------------ special lagnas and Jaimini

/** Bhāva, horā and ghaṭī lagnas: the Sun at sunrise advanced 15°, 30° and 75° per hour since sunrise. */
export function specialLagnas(sunAtSunrise: Degrees, hoursSinceSunrise: number): { bhava: Degrees; hora: Degrees; ghati: Degrees } {
  return {
    bhava: norm360(sunAtSunrise + 15 * hoursSinceSunrise),
    hora: norm360(sunAtSunrise + 30 * hoursSinceSunrise),
    ghati: norm360(sunAtSunrise + 75 * hoursSinceSunrise),
  };
}

/** Jaimini rāśi dṛṣṭi: signs (0-based) aspected by sign `s`, in zodiacal order from it. */
export function rasiDrishti(s: number): number[] {
  const q = s % 3;
  const set = q === 0 ? [1, 4, 7, 10].filter((x) => x !== (s + 1) % 12)
    : q === 1 ? [0, 3, 6, 9].filter((x) => x !== (s + 11) % 12)
      : [2, 5, 8, 11].filter((x) => x !== s);
  return set.sort((a, b) => ((a - s + 12) % 12) - ((b - s + 12) % 12));
}

/** Ārūḍha of each house (A1 = ārūḍha lagna), sign index; 1st or 7th from the house moves to the 10th from there. */
export function arudhas(g: GrahaLongitudes): number[] {
  if (g.lagna === undefined) return [];
  const asc = sgn(g.lagna);
  return Array.from({ length: 12 }, (_, h) => {
    const house = (asc + h) % 12; const ls = sgn(g.lon[SIGN_LORDS[house]!]);
    let a = (ls + ((ls - house + 12) % 12)) % 12;
    if (a === house || a === (house + 6) % 12) a = (a + 9) % 12;
    return a;
  });
}

// ------------------------------------------------------------------ avakahaḍa and ghātaka

const YONI = ['Aśva', 'Gaja', 'Meṣa', 'Sarpa', 'Sarpa', 'Śvāna', 'Mārjāra', 'Meṣa', 'Mārjāra', 'Mūṣaka', 'Mūṣaka', 'Gau', 'Mahiṣa', 'Vyāghra',
  'Mahiṣa', 'Vyāghra', 'Mṛga', 'Mṛga', 'Śvāna', 'Vānara', 'Nakula', 'Vānara', 'Siṁha', 'Aśva', 'Siṁha', 'Gau', 'Gaja'];
const GANA = 'DMRMDMDDRRMMDRDRDRRMMDRRMMD';
const NADI = 'AMCCMAAMCCMAAMCCMAAMCCMAAMC';
/** Name syllables of each pāda, Aśvinī first. */
const AKSHARA = [
  'Cu Ce Co La', 'Li Lu Le Lo', 'A I U E', 'O Va Vi Vu', 'Ve Vo Ka Ki', 'Ku Gha Ṅa Cha', 'Ke Ko Ha Hi', 'Hu He Ho Ḍa', 'Ḍi Ḍu Ḍe Ḍo',
  'Ma Mi Mu Me', 'Mo Ṭa Ṭi Ṭu', 'Ṭe Ṭo Pa Pi', 'Pu Ṣa Ṇa Ṭha', 'Pe Po Ra Ri', 'Ru Re Ro Ta', 'Ti Tu Te To', 'Na Ni Nu Ne', 'No Ya Yi Yu',
  'Ye Yo Bha Bhi', 'Bhu Dha Pha Ḍha', 'Bhe Bho Ja Ji', 'Ju Je Jo Gha', 'Ga Gi Gu Ge', 'Go Sa Si Su', 'Se So Da Di', 'Du Tha Jha Ña', 'De Do Ca Ci',
].map((x) => x.split(' '));

export interface Avakahada {
  readonly varna: string; readonly vashya: string; readonly yoni: string; readonly gana: string; readonly nadi: string;
  readonly tattva: string; readonly yunja: string; readonly signLord: Graha; readonly nakshatraLord: Graha;
  readonly nakshatra: number; readonly pada: number; readonly syllable: string;
}
/** Avakahaḍa cakra from the Moon (whole-sign vaśya, as the reports print it). */
export function avakahada(moon: Degrees): Avakahada {
  const s = sgn(moon); const n = nakIdx(moon); const pada = Math.floor((norm360(moon) % SPAN) / (SPAN / 4)) + 1;
  const fromRevati = (n + 1) % 27;
  return {
    varna: ['Kṣatriya', 'Vaiśya', 'Śūdra', 'Brāhmaṇa'][s % 4]!,
    tattva: ['Agni', 'Pṛthvī', 'Vāyu', 'Jala'][s % 4]!,
    vashya: ['Catuṣpada', 'Catuṣpada', 'Mānava', 'Jalacara', 'Vanacara', 'Mānava', 'Mānava', 'Kīṭa', 'Mānava', 'Catuṣpada', 'Mānava', 'Jalacara'][s]!,
    yoni: YONI[n]!,
    gana: { D: 'Deva', M: 'Manuṣya', R: 'Rākṣasa' }[GANA[n] as 'D']!,
    nadi: { A: 'Ādi', M: 'Madhya', C: 'Antya' }[NADI[n] as 'A']!,
    yunja: fromRevati < 6 ? 'Pūrva' : fromRevati < 18 ? 'Madhya' : 'Antya',
    signLord: SIGN_LORDS[s]!, nakshatraLord: VIM_LORD[n % 9]!, nakshatra: n, pada, syllable: AKSHARA[n]![pada - 1]!,
  };
}

export interface Ghataka {
  readonly month: string; readonly tithis: string; readonly day: Planet; readonly nakshatra: number;
  readonly yoga: string; readonly karana: string; readonly prahara: number; readonly chandraSign: number;
}
/** Ghātaka cakra: the inauspicious month, tithi, day, nakṣatra, yoga, karaṇa, prahara and Moon sign for each Moon sign. */
const GHATAKA: readonly (readonly [string, string, Planet, number, string, string, number, number])[] = [
  ['Kārttika', '1, 6, 11', 'sun', 9, 'Viṣkambha', 'Bava', 1, 0],
  ['Mārgaśīrṣa', '5, 10, 15', 'saturn', 12, 'Śukla', 'Śakuni', 4, 5],
  ['Āṣāḍha', '2, 7, 12', 'moon', 14, 'Parigha', 'Kaulava', 3, 10],
  ['Pauṣa', '2, 7, 12', 'mercury', 16, 'Vyāghāta', 'Nāga', 1, 4],
  ['Jyeṣṭha', '3, 8, 13', 'saturn', 18, 'Dhṛti', 'Bava', 1, 9],
  ['Bhādrapada', '5, 10, 15', 'saturn', 21, 'Śūla', 'Kaulava', 1, 2],
  ['Māgha', '4, 9, 14', 'jupiter', 23, 'Śukla', 'Taitila', 4, 8],
  ['Āśvina', '1, 6, 11', 'venus', 26, 'Vyatīpāta', 'Gara', 1, 1],
  ['Śrāvaṇa', '3, 8, 13', 'venus', 1, 'Vajra', 'Taitila', 1, 11],
  ['Vaiśākha', '4, 9, 14', 'mars', 3, 'Vaidhṛti', 'Śakuni', 4, 4],
  ['Caitra', '3, 8, 13', 'jupiter', 5, 'Gaṇḍa', 'Kiṁstughna', 3, 8],
  ['Phālguna', '5, 10, 15', 'venus', 8, 'Vajra', 'Catuṣpāda', 4, 10],
];
export function ghataka(moon: Degrees): Ghataka {
  const r = GHATAKA[sgn(moon)]!;
  return { month: r[0], tithis: r[1], day: r[2], nakshatra: r[3], yoga: r[4], karana: r[5], prahara: r[6], chandraSign: r[7] };
}

// ------------------------------------------------------------------ favourable points and gems

export const GEM: Readonly<Record<Graha, string>> = {
  sun: 'Ruby', moon: 'Pearl', mars: 'Red coral', mercury: 'Emerald', jupiter: 'Yellow sapphire', venus: 'Diamond', saturn: 'Blue sapphire', rahu: 'Hessonite', ketu: 'Cat’s eye',
};
export const WEEKDAY_OF: Readonly<Record<Graha, number>> = { sun: 0, moon: 1, mars: 2, mercury: 3, jupiter: 4, venus: 5, saturn: 6, rahu: 6, ketu: 2 };
/** Traditional correspondences of a planet. */
export const CORRESPONDENCE: Readonly<Record<Planet, { metal: string; colour: string; direction: string; grain: string }>> = {
  sun: { metal: 'Gold, copper', colour: 'Red, orange', direction: 'East', grain: 'Wheat' },
  moon: { metal: 'Silver', colour: 'White', direction: 'North-west', grain: 'Rice' },
  mars: { metal: 'Copper', colour: 'Red', direction: 'South', grain: 'Red lentil (masūr)' },
  mercury: { metal: 'Bronze', colour: 'Green', direction: 'North', grain: 'Green gram (mūṅg)' },
  jupiter: { metal: 'Gold', colour: 'Yellow', direction: 'North-east', grain: 'Chickpea (caṇā)' },
  venus: { metal: 'Silver', colour: 'White, variegated', direction: 'South-east', grain: 'Field bean' },
  saturn: { metal: 'Iron', colour: 'Black, dark blue', direction: 'West', grain: 'Black gram (uṛad)' },
};

export interface FavourablePoints {
  readonly radical: number; readonly lucky: number; readonly goodYears: readonly number[];
  readonly favourable: readonly Planet[]; readonly evil: readonly Planet[];
  readonly stone: string; readonly luckyStone: string; readonly lagnaLord: Planet; readonly ninthLord: Planet;
}
const digitRoot = (n: number): number => { let v = n; while (v > 9) v = String(v).split('').reduce((a, c) => a + Number(c), 0); return v; };
/** Numerology and lordship-based favourable points, from the civil birth date and the lagna. */
export function favourablePoints(g: GrahaLongitudes, date: { year: number; month: number; day: number }): FavourablePoints | undefined {
  if (g.lagna === undefined) return undefined;
  const asc = sgn(g.lagna); const lord = (h: number): Planet => SIGN_LORDS[(asc + h - 1) % 12]!;
  const radical = digitRoot(date.day);
  const lucky = digitRoot(`${date.day}${date.month}${date.year}`.split('').reduce((a, c) => a + Number(c), 0));
  const favourable = [...new Set([lord(1), lord(9), lord(10)])];
  const evil = [...new Set([lord(6), lord(8), lord(12)])].filter((x) => !favourable.includes(x));
  return {
    radical, lucky, goodYears: [0, 1, 2, 3, 4].map((k) => radical + 18 + 9 * k), favourable, evil,
    stone: GEM[lord(1)], luckyStone: GEM[lord(9)], lagnaLord: lord(1), ninthLord: lord(9),
  };
}

// ------------------------------------------------------------------ Tārā and Sudarśana cakras

export const TARA_NAMES = ['Janma', 'Sampat', 'Vipat', 'Kṣema', 'Pratyari', 'Sādhaka', 'Vadha', 'Maitra', 'Ati-maitra'] as const;
/** Bindu names of the Tārā cycles, counted inclusively from the Moon's and the Sun's nakṣatra (both reports). */
const CHANDRA_BINDU: Readonly<Record<number, string>> = { 10: 'Karma', 16: 'Sāṅghātika', 18: 'Udaya', 19: 'Ādhāna', 23: 'Vināśa', 25: 'Mānasa', 26: 'Rāja', 27: 'Abhiṣeka' };
const SURYA_BINDU: Readonly<Record<number, string>> = { 5: 'Vidyunmukha', 8: 'Śūla', 14: 'Śanipāta', 18: 'Ketu', 21: 'Ulkā', 22: 'Kampa', 23: 'Vajra', 24: 'Nirghāta' };

export interface TaraRow {
  readonly nakshatra: number; readonly tara: number; readonly cycle: number; readonly lord: Graha;
  readonly ages: readonly [number, number, number]; readonly bodies: readonly (Graha | 'lagna')[];
  readonly chandraBindu?: string; readonly suryaBindu?: string;
}
/** Twenty-seven nakṣatras from the janma nakṣatra: tārā, lord, the bodies in each, the years of life it governs. */
export function taraChakra(g: GrahaLongitudes): TaraRow[] {
  const janma = nakIdx(g.lon.moon); const sun = nakIdx(g.lon.sun);
  return Array.from({ length: 27 }, (_, k) => {
    const n = (janma + k) % 27;
    const bodies = [...(g.lagna !== undefined && nakIdx(g.lagna) === n ? ['lagna' as const] : []), ...GRAHAS.filter((b) => nakIdx(g.lon[b]) === n)];
    const cb = CHANDRA_BINDU[k + 1]; const sb = SURYA_BINDU[((n - sun + 27) % 27) + 1];
    return {
      nakshatra: n, tara: k % 9, cycle: Math.floor(k / 9) + 1, lord: VIM_LORD[n % 9]!, ages: [k + 1, k + 28, k + 55] as const, bodies,
      ...(cb ? { chandraBindu: cb } : {}), ...(sb ? { suryaBindu: sb } : {}),
    };
  });
}

/** Sudarśana cakra: the signs counted from the lagna, the Moon and the Sun, with the bodies in each. */
export function sudarshana(g: GrahaLongitudes): { from: 'lagna' | 'moon' | 'sun'; signs: number[] }[] {
  const ref = { lagna: g.lagna, moon: g.lon.moon, sun: g.lon.sun };
  return (['lagna', 'moon', 'sun'] as const).filter((r) => ref[r] !== undefined).map((r) => ({
    from: r, signs: Array.from({ length: 12 }, (_, h) => (sgn(ref[r]!) + h) % 12),
  }));
}

// ------------------------------------------------------------------ chalit

/** Bhāva of each graha by the Śrīpati sandhis (`sandhi[k]` starts bhāva k+1), beside its whole-sign house. */
export function chalit(g: GrahaLongitudes, sandhi: readonly Degrees[]): { body: Graha; bhava: number; rasiHouse: number }[] {
  if (g.lagna === undefined) return [];
  const asc = sgn(g.lagna);
  const arc = (lon: number): number => {
    for (let k = 0; k < 12; k += 1) {
      const a = sandhi[k]!; const b = sandhi[(k + 1) % 12]!;
      if (norm360(lon - a) < norm360(b - a)) return k + 1;
    }
    return 1;
  };
  return GRAHAS.map((b) => ({ body: b, bhava: arc(g.lon[b]), rasiHouse: ((sgn(g.lon[b]) - asc + 12) % 12) + 1 }));
}
