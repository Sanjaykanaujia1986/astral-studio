/**
 * Nakṣatra daśā systems — Viṁśottarī, Aṣṭottarī and Yoginī — on one engine.
 *
 * Every system is a cycle of lords with fixed lengths. The first lord comes from
 * the nakṣatra of a chosen longitude (the Moon, classically; the report's "daśā
 * from Lagna / Sun / …" pages use another body), and the first period is cut to
 * the unelapsed part of that nakṣatra. Sub-periods divide a period in the same
 * proportions, starting from the period's own lord. That rule is identical at
 * every level, so one recursive function serves antar, pratyantar, sūkṣma and
 * prāṇa daśās alike.
 *
 * ## Anchor and year — the two conventions that move dates
 *
 * - `anchor: 'birthMoment'` starts the clock at the birth instant.
 *   `anchor: 'civilDate'` starts it at 00:00 local time on the birth date, which
 *   is what the reference horoscope software does (fitted against 1,200+ printed
 *   dates; see docs/VEDIC_CONVENTIONS.md §6). With 'civilDate' every printed
 *   Viṁśottarī and Aṣṭottarī date in the reference reports is reproduced.
 * - The year length is explicit (`yearDays`), 365.25 by default — again the
 *   reference reports' value.
 *
 * Sub-periods are generated on demand (`subPeriods`), because five levels of a
 * nine-lord system is 59,049 nodes per mahādaśā.
 */
import { julianDayToIsoUtc, norm360, type Degrees } from '@astro/engine';

const SPAN = 360 / 27;

export type DashaSystemId = 'vimshottari' | 'ashtottari' | 'yogini';

/** Planet ids, as used across the app. Yoginī names map onto these. */
export type DashaPlanet =
  'sun' | 'moon' | 'mars' | 'mercury' | 'jupiter' | 'venus' | 'saturn' | 'rahu' | 'ketu';

export interface DashaSystem {
  readonly id: DashaSystemId;
  /** Lord ids in cycle order. For Yoginī these are the yoginī names. */
  readonly lords: readonly string[];
  /** Period of each lord in daśā years, same order. */
  readonly years: readonly number[];
  readonly totalYears: number;
  /** Planet ruling each lord (identity for the planetary systems). */
  readonly planetOf: Readonly<Record<string, DashaPlanet>>;
  /** First lord index and elapsed fraction of its period at `longitude`. */
  readonly start: (longitude: Degrees) => { readonly index: number; readonly elapsed: number };
}

const VIM_LORDS = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'] as const;
const identity = (xs: readonly DashaPlanet[]): Record<string, DashaPlanet> =>
  Object.fromEntries(xs.map((x) => [x, x]));

export const VIMSHOTTARI_SYSTEM: DashaSystem = {
  id: 'vimshottari',
  lords: VIM_LORDS,
  years: [7, 20, 6, 10, 7, 18, 16, 19, 17],
  totalYears: 120,
  planetOf: identity(VIM_LORDS),
  start: (lon) => {
    const l = norm360(lon);
    return { index: Math.floor(l / SPAN) % 9, elapsed: (l % SPAN) / SPAN };
  },
};

/**
 * Aṣṭottarī (108 years, eight lords, no Ketu). The 27 nakṣatras from Ārdrā are
 * shared out in groups of 4,3,4,3,3,3,4,3 (Abhijit is not used), and the elapsed
 * fraction is measured across the whole group, not one nakṣatra.
 */
const ASH_LORDS = ['sun', 'moon', 'mars', 'mercury', 'saturn', 'jupiter', 'rahu', 'venus'] as const;
const ASH_GROUP = [4, 3, 4, 3, 3, 3, 4, 3] as const;
const ARDRA = 5;
export const ASHTOTTARI_SYSTEM: DashaSystem = {
  id: 'ashtottari',
  lords: ASH_LORDS,
  years: [6, 15, 8, 17, 10, 19, 12, 21],
  totalYears: 108,
  planetOf: identity(ASH_LORDS),
  start: (lon) => {
    const l = norm360(lon);
    const nak = Math.floor(l / SPAN);
    const within = (l % SPAN) / SPAN;
    let cursor = ARDRA;
    for (let g = 0; g < ASH_GROUP.length; g += 1) {
      const size = ASH_GROUP[g]!;
      for (let k = 0; k < size; k += 1) {
        if ((cursor + k) % 27 === nak) return { index: g, elapsed: (k + within) / size };
      }
      cursor += size;
    }
    throw new Error(`no Aṣṭottarī group for nakṣatra ${nak}`);
  },
};

/** Yoginī (36 years). Start = (nakṣatra number + 3) mod 8, counted from Maṅgalā. */
const YOG_LORDS = ['mangala', 'pingala', 'dhanya', 'bhramari', 'bhadrika', 'ulka', 'siddha', 'sankata'] as const;
export const YOGINI_SYSTEM: DashaSystem = {
  id: 'yogini',
  lords: YOG_LORDS,
  years: [1, 2, 3, 4, 5, 6, 7, 8],
  totalYears: 36,
  planetOf: {
    mangala: 'moon', pingala: 'sun', dhanya: 'jupiter', bhramari: 'mars',
    bhadrika: 'mercury', ulka: 'saturn', siddha: 'venus', sankata: 'rahu',
  },
  start: (lon) => {
    const l = norm360(lon);
    const nak = Math.floor(l / SPAN); // 0-based, so +1 for the nakṣatra number
    return { index: (nak + 1 + 3 - 1) % 8, elapsed: (l % SPAN) / SPAN };
  },
};

export const DASHA_SYSTEMS: Readonly<Record<DashaSystemId, DashaSystem>> = {
  vimshottari: VIMSHOTTARI_SYSTEM,
  ashtottari: ASHTOTTARI_SYSTEM,
  yogini: YOGINI_SYSTEM,
};

export const DASHA_LEVEL_NAMES = ['mahā', 'antar', 'pratyantar', 'sūkṣma', 'prāṇa'] as const;

export interface DashaNode {
  readonly system: DashaSystemId;
  /** Lord path from the mahādaśā down, e.g. ['mercury','moon','venus']. */
  readonly path: readonly string[];
  readonly lord: string;
  /** 1 = mahādaśā … 5 = prāṇa. */
  readonly level: number;
  readonly startJd: number;
  readonly endJd: number;
  readonly startIso: string;
  readonly endIso: string;
  /** Length in daśā years. */
  readonly years: number;
}

export interface DashaOptions {
  /** Days per daśā year. Defaults to 365.25. */
  readonly yearDays?: number;
  /**
   * Where the clock starts. `birthJd` is always the birth instant (UT). With
   * 'civilDate', `localMidnightJd` is required.
   */
  readonly anchor?: 'birthMoment' | 'civilDate';
  readonly localMidnightJd?: number;
  /** Generate mahādaśās until at least this many years after birth. Default 120. */
  readonly spanYears?: number;
}

export interface DashaResult {
  readonly system: DashaSystemId;
  readonly longitude: Degrees;
  readonly firstLord: string;
  /** Fraction of the first period already elapsed at the anchor. */
  readonly elapsed: number;
  /** Unelapsed years of the first period. */
  readonly balanceYears: number;
  readonly yearDays: number;
  readonly anchorJd: number;
  readonly anchor: 'birthMoment' | 'civilDate';
  readonly mahadashas: readonly DashaNode[];
}

const node = (system: DashaSystemId, path: string[], start: number, end: number, years: number): DashaNode => ({
  system, path, lord: path[path.length - 1]!, level: path.length,
  startJd: start, endJd: end, startIso: julianDayToIsoUtc(start), endIso: julianDayToIsoUtc(end), years,
});

/** Mahādaśās from a longitude. The first one starts before birth (its elapsed part). */
export function dashas(systemId: DashaSystemId, longitude: Degrees, birthJd: number, options: DashaOptions = {}): DashaResult {
  const system = DASHA_SYSTEMS[systemId];
  const yearDays = options.yearDays ?? 365.25;
  const anchor = options.anchor ?? 'birthMoment';
  if (anchor === 'civilDate' && options.localMidnightJd === undefined) {
    throw new Error("anchor 'civilDate' needs localMidnightJd");
  }
  const anchorJd = anchor === 'civilDate' ? options.localMidnightJd! : birthJd;
  const { index, elapsed } = system.start(longitude);
  const firstYears = system.years[index]!;
  const out: DashaNode[] = [];
  let t = anchorJd - elapsed * firstYears * yearDays;
  const until = anchorJd + (options.spanYears ?? 120) * yearDays;
  for (let n = 0; t < until; n += 1) {
    const k = (index + n) % system.lords.length;
    const len = system.years[k]! * yearDays;
    out.push(node(systemId, [system.lords[k]!], t, t + len, system.years[k]!));
    t += len;
  }
  return {
    system: systemId, longitude: norm360(longitude), firstLord: system.lords[index]!,
    elapsed, balanceYears: (1 - elapsed) * firstYears, yearDays, anchorJd, anchor, mahadashas: out,
  };
}

/** The next level down, in the system's proportions, starting from the period's own lord. */
export function subPeriods(parent: DashaNode): DashaNode[] {
  const system = DASHA_SYSTEMS[parent.system];
  const k0 = system.lords.indexOf(parent.lord);
  const out: DashaNode[] = [];
  let t = parent.startJd;
  const span = parent.endJd - parent.startJd;
  for (let j = 0; j < system.lords.length; j += 1) {
    const k = (k0 + j) % system.lords.length;
    const frac = system.years[k]! / system.totalYears;
    const end = j === system.lords.length - 1 ? parent.endJd : t + span * frac;
    out.push(node(parent.system, [...parent.path, system.lords[k]!], t, end, parent.years * frac));
    t = end;
  }
  return out;
}

/** The running period at every level down to `depth`, at instant `jd`. */
export function runningPath(result: DashaResult, jd: number, depth = 3): DashaNode[] {
  const path: DashaNode[] = [];
  let level: readonly DashaNode[] = result.mahadashas;
  for (let d = 0; d < depth; d += 1) {
    const hit = level.find((p) => jd >= p.startJd && jd < p.endJd);
    if (!hit) break;
    path.push(hit);
    level = subPeriods(hit);
  }
  return path;
}

/**
 * A span of daśā years as years / months / days on the 360-day reckoning
 * (12 months of 30 days) — the form the reference reports print a balance in.
 */
export function yearsToYmd(years: number): { readonly years: number; readonly months: number; readonly days: number } {
  let y = Math.floor(years);
  const mf = (years - y) * 12;
  let m = Math.floor(mf);
  let d = Math.round((mf - m) * 30);
  if (d === 30) { d = 0; m += 1; }
  if (m === 12) { m = 0; y += 1; }
  return { years: y, months: m, days: d };
}

/** 00:00 local civil time on the birth date, as a UT Julian Day. */
export function localMidnightJd(birthJdUT: number, utcOffsetMinutes: number): number {
  const local = birthJdUT + utcOffsetMinutes / 1440;
  return Math.floor(local - 0.5) + 0.5 - utcOffsetMinutes / 1440;
}
