/**
 * Ṣaḍbala — the six strengths of the seven planets — with iṣṭa/kaṣṭa phala and
 * bhāva bala, after Bṛhat Parāśara Horā Śāstra.
 *
 * Checked component by component against two printed reports: every
 * sthāna, dig, pakṣa, tribhāga, abda, māsa, vāra, horā, ayana, naisargika and
 * dṛk value agrees to 0.01 virūpa. Known differences (docs/VEDIC_CONVENTIONS.md §10):
 *
 * - Nathonnata bala uses local mean time from the birth longitude; the reports'
 *   divā value is not reproducible from their own printed times.
 * - Ceṣṭā bala for Mars–Saturn uses modern mean elements, where the reports use
 *   Sūrya-Siddhānta means (agreement within about 0.5 virūpa).
 * - Yuddha bala is reported as 0; a planetary war is flagged instead.
 */
import { norm360, type Degrees, type EphemerisProvider, type ZodiacMode } from '@astro/engine';
import { MOOLATRIKONA, NATURAL_RELATION, SEVEN, SIGN_LORDS, type GrahaLongitudes, type Planet } from './grahas.js';

const sep = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

/** Sign index of a longitude in a varga (Parāśara's divisions). */
export function vargaOf(n: number, lon: Degrees): number {
  const l = norm360(lon); const s = Math.floor(l / 30); const d = l - s * 30;
  const odd = s % 2 === 0;
  const movable = s % 3 === 0; const fixed = s % 3 === 1;
  const part = (size: number): number => Math.floor(d / size);
  switch (n) {
    case 1: return s;
    case 2: return (d < 15) === odd ? 4 : 3;
    case 3: return (s + 4 * part(10)) % 12;
    case 4: return (s + 3 * part(7.5)) % 12;
    case 7: return (s + (odd ? 0 : 6) + part(30 / 7)) % 12;
    case 9: return Math.floor(l / (10 / 3)) % 12;
    case 10: return (s + (odd ? 0 : 8) + part(3)) % 12;
    case 12: return (s + part(2.5)) % 12;
    case 16: return ((movable ? 0 : fixed ? 4 : 8) + part(30 / 16)) % 12;
    case 20: return ((movable ? 0 : fixed ? 8 : 4) + part(1.5)) % 12;
    case 24: return ((odd ? 4 : 3) + part(1.25)) % 12;
    case 27: return Math.floor(l / (30 / 27)) % 12;
    case 30:
      if (odd) return d < 5 ? 0 : d < 10 ? 10 : d < 18 ? 8 : d < 25 ? 2 : 6;
      return d < 5 ? 1 : d < 12 ? 5 : d < 20 ? 11 : d < 25 ? 9 : 7;
    case 40: return ((odd ? 0 : 6) + part(0.75)) % 12;
    case 45: return ((movable ? 0 : fixed ? 4 : 8) + part(30 / 45)) % 12;
    case 60: return (s + part(0.5)) % 12;
    default: throw new Error(`no varga D${n}`);
  }
}

/** Śrīpati bhāva madhyas (1-12) and sandhis: each quadrant from the lagna, IC, descendant and MC trisected. */
export function sripati(asc: Degrees, mc: Degrees): { madhya: Degrees[]; sandhi: Degrees[] } {
  const q = [asc, norm360(mc + 180), norm360(asc + 180), mc];
  const madhya: Degrees[] = [];
  for (let k = 0; k < 4; k += 1) {
    const a = q[k]!; const arc = norm360(q[(k + 1) % 4]! - a);
    for (let j = 0; j < 3; j += 1) madhya.push(norm360(a + (arc * j) / 3));
  }
  const sandhi = madhya.map((m, k) => { const prev = madhya[(k + 11) % 12]!; return norm360(prev + norm360(m - prev) / 2); });
  return { madhya, sandhi };
}

const DEBIL: Readonly<Record<Planet, number>> = { sun: 190, moon: 213, mars: 118, mercury: 345, jupiter: 275, venus: 177, saturn: 20 };
const MT_RANGE: Readonly<Record<Planet, [number, number]>> = { sun: [0, 20], moon: [3, 30], mars: [0, 12], mercury: [15, 20], jupiter: [0, 10], venus: [0, 15], saturn: [0, 20] };
export const NAISARGIKA: Readonly<Record<Planet, number>> = { sun: 60, moon: 51.43, mars: 17.14, mercury: 25.71, jupiter: 34.29, venus: 42.86, saturn: 8.57 };
/** Minimum required ṣaḍbala in rūpas. */
export const SHADBALA_MIN: Readonly<Record<Planet, number>> = { sun: 5, moon: 6, mars: 5, mercury: 7, jupiter: 6.5, venus: 5.5, saturn: 5 };
const CHALDEAN: readonly Planet[] = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'];
const WEEK: readonly Planet[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];
/** BPHS krānti table, arc-minutes at bhuja 0, 15, … 90. */
const KR = [0, 362, 703, 1002, 1238, 1388, 1440];
/** Heliocentric mean longitudes (tropical, J2000; degrees and degrees per Julian century). */
const MEAN: Readonly<Record<'sun' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn', [number, number]>> = {
  sun: [280.46646, 36000.76983], mercury: [252.25084, 149472.67411], venus: [181.97973, 58517.81539],
  mars: [355.433, 19140.29934], jupiter: [34.35148, 3034.90567], saturn: [50.07747, 1222.11379],
};

/** Compound (pañcadhā) relationship of `a` toward `b`. */
export function compoundRelation(g: GrahaLongitudes, a: Planet, b: Planet): 'AF' | 'F' | 'N' | 'E' | 'AE' {
  const nat = NATURAL_RELATION[a][b];
  const d = ((Math.floor(g.lon[b] / 30) - Math.floor(g.lon[a] / 30) + 12) % 12) + 1;
  const temporal = [2, 3, 4, 10, 11, 12].includes(d);
  if (nat > 0) return temporal ? 'AF' : 'N';
  if (nat === 0) return temporal ? 'F' : 'E';
  return temporal ? 'N' : 'AE';
}

/** BPHS sphuṭa dṛṣṭi (virūpas) of a planet at `a` on a point at `b`, with the special aspects. */
export function sputaDrishti(pl: Planet, a: Degrees, b: Degrees): number {
  const d = norm360(b - a);
  let v = 0;
  if (d >= 30 && d < 60) v = (d - 30) / 2; else if (d >= 60 && d < 90) v = d - 60 + 15;
  else if (d >= 90 && d < 120) v = (120 - d) / 2 + 30; else if (d >= 120 && d < 150) v = 150 - d;
  else if (d >= 150 && d < 180) v = (d - 150) * 2; else if (d >= 180 && d < 300) v = (300 - d) / 2;
  if (pl === 'mars' && ((d >= 90 && d < 120) || (d >= 210 && d < 240))) v += 15;
  if (pl === 'jupiter' && ((d >= 120 && d < 150) || (d >= 240 && d < 270))) v += 30;
  if (pl === 'saturn' && ((d >= 60 && d < 90) || (d >= 270 && d < 300))) v += 45;
  return v;
}

export const SHADBALA_ROWS = [
  'uchcha', 'saptavarga', 'ojayugma', 'kendra', 'drekkana', 'sthana',
  'dig',
  'nathonnata', 'paksha', 'tribhaga', 'abda', 'masa', 'vara', 'hora', 'ayana', 'yuddha', 'kala',
  'cheshta', 'naisargika', 'drik',
  'total', 'rupas', 'minimum', 'ratio', 'rank', 'ishta', 'kashta',
] as const;
export type ShadbalaRow = (typeof SHADBALA_ROWS)[number];

export interface ShadbalaResult {
  readonly rows: Readonly<Record<ShadbalaRow, Readonly<Record<Planet, number>>>>;
  readonly bhava: {
    readonly madhya: readonly Degrees[];
    readonly adhipati: readonly number[];
    readonly dig: readonly number[];
    readonly drishti: readonly number[];
    readonly total: readonly number[];
    readonly rupas: readonly number[];
    readonly rank: readonly number[];
  };
  /** Pairs among Mars–Saturn within 1° (planetary war); yuddha bala is not applied. */
  readonly wars: readonly (readonly [Planet, Planet])[];
  readonly dayBirth: boolean;
}

export interface ShadbalaContext {
  readonly jdUT: number;
  readonly latitude: Degrees;
  readonly longitude: Degrees;
  readonly zodiac: ZodiacMode;
  /** Minutes east of UTC of the birth's civil time. */
  readonly utcOffsetMinutes: number;
}

const rank = (vals: readonly number[]): number[] => {
  const order = vals.map((v, i) => [i, v] as const).sort((x, y) => y[1] - x[1]).map(([i]) => i);
  return vals.map((_, i) => order.indexOf(i) + 1);
};

export function shadbala(provider: EphemerisProvider, g: GrahaLongitudes, ctx: ShadbalaContext): ShadbalaResult {
  if (g.lagna === undefined) throw new Error('ṣaḍbala needs a lagna');
  const L = g.lon;
  const { jdUT } = ctx;
  const ayan = provider.ayanamsha(jdUT, ctx.zodiac);
  const h = provider.houses(jdUT, ctx.latitude, ctx.longitude, 'placidus', { zodiac: ctx.zodiac });
  const M = sripati(norm360(h.ascendant), norm360(h.midheaven)).madhya;
  const place = { latitude: ctx.latitude, longitude: ctx.longitude };
  const off = ctx.utcOffsetMinutes / 1440;
  const civilMidnight = Math.floor(jdUT + off + 0.5) - 0.5 - off; // UT of local 00:00 on the civil date
  const rise = provider.riseTransit(civilMidnight, 'sun', place, 'rise') ?? civilMidnight + 0.25;
  const set = provider.riseTransit(rise, 'sun', place, 'set') ?? rise + 0.5;
  const dayBirth = jdUT >= rise && jdUT < set;
  // Vedic day runs sunrise to sunrise: a birth before sunrise belongs to the previous day.
  const dayRise = jdUT < rise ? provider.riseTransit(civilMidnight - 1, 'sun', place, 'rise') ?? rise - 1 : rise;
  const nightStart = jdUT < rise ? provider.riseTransit(civilMidnight - 1, 'sun', place, 'set') ?? set - 1 : set;
  const nextRise = jdUT < rise ? rise : provider.riseTransit(set, 'sun', place, 'rise') ?? rise + 1;

  const row = (f: (b: Planet) => number): Record<Planet, number> =>
    Object.fromEntries(SEVEN.map((b) => [b, f(b)])) as Record<Planet, number>;
  const sum = (...rs: Record<Planet, number>[]): Record<Planet, number> => row((b) => rs.reduce((a, r) => a + r[b], 0));

  // ------------------------------------------------------------- sthāna
  const uchcha = row((b) => sep(L[b], DEBIL[b]) / 3);
  const saptavarga = row((b) => {
    let s = 0;
    for (const n of [1, 2, 3, 7, 9, 12, 30]) {
      const vs = vargaOf(n, L[b]); const lord = SIGN_LORDS[vs]!; const d = norm360(L[b]) % 30;
      if (n === 1 && MOOLATRIKONA[b] === vs && d >= MT_RANGE[b][0] && d < MT_RANGE[b][1]) { s += 45; continue; }
      if (lord === b) { s += 30; continue; }
      s += { AF: 22.5, F: 15, N: 7.5, E: 3.75, AE: 1.875 }[compoundRelation(g, b, lord)];
    }
    return s;
  });
  const ojayugma = row((b) => {
    const fem = b === 'moon' || b === 'venus';
    return [1, 9].reduce((a, n) => a + ((vargaOf(n, L[b]) % 2 === 1) === fem ? 15 : 0), 0);
  });
  const asc = Math.floor(norm360(g.lagna) / 30);
  const kendra = row((b) => { const k = ((Math.floor(L[b] / 30) - asc + 12) % 12) % 3; return k === 0 ? 60 : k === 1 ? 30 : 15; });
  const drekkana = row((b) => {
    const dr = Math.floor((norm360(L[b]) % 30) / 10);
    const want = ['sun', 'mars', 'jupiter'].includes(b) ? 0 : ['mercury', 'saturn'].includes(b) ? 1 : 2;
    return dr === want ? 15 : 0;
  });
  const sthana = sum(uchcha, saptavarga, ojayugma, kendra, drekkana);

  // ------------------------------------------------------------- dig
  const strongAt: Record<Planet, number> = { sun: M[9]!, mars: M[9]!, jupiter: M[0]!, mercury: M[0]!, moon: M[3]!, venus: M[3]!, saturn: M[6]! };
  const dig = row((b) => sep(L[b], norm360(strongAt[b] + 180)) / 3);

  // ------------------------------------------------------------- kāla
  const lmtHours = (((jdUT + 0.5 + ctx.longitude / 360) % 1) + 1) % 1 * 24; // local mean time
  const fromMidnight = Math.min(lmtHours, 24 - lmtHours);
  const diva = fromMidnight * 5; // 60 virūpas at noon, 0 at midnight
  const nathonnata = row((b) => (b === 'mercury' ? 60 : ['sun', 'jupiter', 'venus'].includes(b) ? diva : 60 - diva));
  const el = norm360(L.moon - L.sun); const pk = (el > 180 ? 360 - el : el) / 3;
  // Benefics: Jupiter, Venus, the Moon when 72° or more from the Sun, Mercury
  // unless it shares a sign with a malefic. The Moon's value is doubled.
  const moonStrong = el >= 72 && el <= 288;
  const sgn = (x: number): number => Math.floor(norm360(x) / 30);
  const mercAfflicted = (['sun', 'mars', 'saturn', 'rahu', 'ketu'] as const).some((m) => sgn(L[m]) === sgn(L.mercury))
    || (!moonStrong && sgn(L.moon) === sgn(L.mercury));
  const isBenefic = (b: Planet): boolean => b === 'jupiter' || b === 'venus' || (b === 'moon' && moonStrong) || (b === 'mercury' && !mercAfflicted);
  const paksha = row((b) => (b === 'moon' ? 2 : 1) * (isBenefic(b) ? pk : 60 - pk));
  const third = dayBirth
    ? Math.min(2, Math.floor((jdUT - rise) / ((set - rise) / 3)))
    : Math.min(2, Math.floor((jdUT - nightStart) / ((nextRise - nightStart) / 3)));
  const tLord: Planet = dayBirth ? (['mercury', 'sun', 'saturn'] as const)[third]! : (['moon', 'venus', 'mars'] as const)[third]!;
  const tribhaga = row((b) => (b === 'jupiter' || b === tLord ? 60 : 0));
  const wd = (jd: number): Planet => WEEK[Math.floor(jd + 1.5) % 7]!;
  const KALI = 588464.5; // ahargana day 0: a Thursday (fits both reports' abda lord)
  const civil0 = Math.floor(jdUT + off + 0.5) - 0.5; // 0h UT of the civil date
  const A = civil0 - KALI;
  const yearLord = wd(KALI + 360 * Math.floor(A / 360));
  const monthLord = wd(KALI + 30 * Math.floor(A / 30));
  const abda = row((b) => (b === yearLord ? 15 : 0));
  const masa = row((b) => (b === monthLord ? 30 : 0));
  const dayLord = wd(civil0 - (jdUT < rise ? 1 : 0));
  const vara = row((b) => (b === dayLord ? 45 : 0));
  const horaN = Math.floor((jdUT - dayRise) * 24);
  const horaLord = CHALDEAN[(CHALDEAN.indexOf(dayLord) + horaN) % 7]!;
  const hora = row((b) => (b === horaLord ? 60 : 0));
  const kranti = (sayana: number): number => {
    const l = norm360(sayana); let bh = l % 180; if (bh > 90) bh = 180 - bh;
    const i = Math.min(5, Math.floor(bh / 15)); const v = KR[i]! + ((bh - i * 15) / 15) * (KR[i + 1]! - KR[i]!);
    return ((l < 180 ? 1 : -1) * v) / 60;
  };
  const ayana = row((b) => {
    const k = kranti(L[b] + ayan);
    const v = (b === 'mercury' ? 24 + Math.abs(k) : ['moon', 'saturn'].includes(b) ? 24 - k : 24 + k) * 1.25;
    return b === 'sun' ? 2 * v : v;
  });
  const WAR: readonly Planet[] = ['mars', 'mercury', 'jupiter', 'venus', 'saturn'];
  const wars: [Planet, Planet][] = [];
  for (let i = 0; i < WAR.length; i += 1) for (let j = i + 1; j < WAR.length; j += 1) if (sep(L[WAR[i]!], L[WAR[j]!]) < 1) wars.push([WAR[i]!, WAR[j]!]);
  const yuddha = row(() => 0);
  const kala = sum(nathonnata, paksha, tribhaga, abda, masa, vara, hora, ayana, yuddha);

  // ------------------------------------------------------------- ceṣṭā
  const T = (jdUT - 2451545) / 36525;
  const meanL = (k: keyof typeof MEAN): number => norm360(MEAN[k][0] + MEAN[k][1] * T);
  const cheshta = row((b) => {
    if (b === 'sun') return ayana.sun;
    if (b === 'moon') return paksha.moon;
    const tru = norm360(L[b] + ayan); const ms = meanL('sun');
    const [mean, seeghra] = b === 'mercury' || b === 'venus' ? [ms, meanL(b)] : [meanL(b), ms];
    let ck = norm360(seeghra - (mean + tru) / 2); if (ck > 180) ck = 360 - ck;
    return ck / 3;
  });
  const naisargika = row((b) => NAISARGIKA[b]);

  // ------------------------------------------------------------- dṛk
  const drik = row((b) => SEVEN.filter((a) => a !== b).reduce((s, a) => s + (isBenefic(a) ? 1 : -1) * sputaDrishti(a, L[a], L[b]), 0) / 4);

  const total = sum(sthana, dig, kala, cheshta, naisargika, drik);
  const rupas = row((b) => total[b] / 60);
  const minimum = row((b) => SHADBALA_MIN[b]);
  const ratio = row((b) => rupas[b] / SHADBALA_MIN[b]);
  const ranks = rank(SEVEN.map((b) => ratio[b]));
  const rankRow = row((b) => ranks[SEVEN.indexOf(b)]!);
  // Iṣṭa/kaṣṭa use the Moon's elongation/3 as its ceṣṭā, as both reports do.
  const ck = (b: Planet): number => (b === 'moon' ? pk : cheshta[b]);
  const ishta = row((b) => Math.sqrt(uchcha[b] * ck(b)));
  const kashta = row((b) => Math.sqrt((60 - uchcha[b]) * (60 - ck(b))));

  // ------------------------------------------------------------- bhāva bala
  const adhipati = M.map((m) => total[SIGN_LORDS[Math.floor(m / 30)]!]);
  const kind = (lon: number): 'N' | 'J' | 'K' | 'C' => {
    const s = Math.floor(lon / 30); const d = lon % 30;
    if (s === 3 || s === 7) return 'K';
    if (s === 11 || (s === 9 && d >= 15)) return 'J';
    if ([2, 5, 6, 10].includes(s) || (s === 8 && d < 15)) return 'N';
    return 'C';
  };
  const strongHouse = { N: 0, J: 3, K: 6, C: 9 } as const;
  const bdig = M.map((m, i) => { const d = Math.abs(i - strongHouse[kind(m)]); return 60 - 10 * Math.min(d, 12 - d); });
  const bdrishti = M.map((m) => SEVEN.reduce((s, a) => {
    const dv = sputaDrishti(a, L[a], m);
    return s + (a === 'mercury' || a === 'jupiter' ? dv : ((a === 'venus' ? 1 : -1) * dv) / 4);
  }, 0));
  const btotal = M.map((_, i) => adhipati[i]! + bdig[i]! + bdrishti[i]!);

  return {
    rows: {
      uchcha, saptavarga, ojayugma, kendra, drekkana, sthana, dig,
      nathonnata, paksha, tribhaga, abda, masa, vara, hora, ayana, yuddha, kala,
      cheshta, naisargika, drik, total, rupas, minimum, ratio, rank: rankRow, ishta, kashta,
    },
    bhava: { madhya: M, adhipati, dig: bdig, drishti: bdrishti, total: btotal, rupas: btotal.map((v) => v / 60), rank: rank(btotal) },
    wars,
    dayBirth,
  };
}
