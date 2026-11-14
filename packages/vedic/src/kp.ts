/**
 * Krishnamurti Paddhati: KP (Krishnamurti) ayanāṁśa, Placidus cusps, and the
 * sign / star / sub / sub-sub lords of every planet and cusp, the
 * significators of each house and the four-step theory.
 *
 * Reproduces the reference horoscope software's KP pages:
 *
 * - A planet sits in the house whose cusp arc contains it. A planet less than
 *   1° before the next cusp is also counted in that next house (both printed
 *   reports place the cut between 58.6′ and 81′).
 * - Rāhu and Ketu own the houses their sign lord owns.
 * - A planet signifies the houses it occupies and owns, and those its star
 *   lord occupies and owns.
 * - Ruling planets: lagna sign lord, lagna star lord, Moon sign lord, day
 *   lord, Moon star lord.
 */
import { norm360, type Degrees, type EphemerisProvider } from '@astro/engine';
import { SIGN_LORDS, type Graha } from './grahas.js';

const SPAN = 360 / 27;
/** Viṁśottarī order from Ketu, and the years that size each sub. */
export const KP_LORDS = ['ketu', 'venus', 'sun', 'moon', 'mars', 'rahu', 'jupiter', 'saturn', 'mercury'] as const satisfies readonly Graha[];
const YEARS = [7, 20, 6, 10, 7, 18, 16, 19, 17];
const NINE: readonly Graha[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];
const DAY_LORD: readonly Graha[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];

export interface KpLords {
  readonly sign: Graha;
  readonly star: Graha;
  readonly sub: Graha;
  readonly subSub: Graha;
}

/** Sign, star, sub and sub-sub lord of a sidereal longitude. */
export function kpLords(lon: Degrees): KpLords {
  const l = norm360(lon);
  const n = Math.floor(l / SPAN);
  const start = n % 9;
  const pick = (from: number, within: number): [number, number] => {
    let acc = 0;
    for (let k = 0; k < 9; k += 1) {
      const lord = (from + k) % 9; const frac = YEARS[lord]! / 120;
      if (within < acc + frac || k === 8) return [lord, Math.min(1, Math.max(0, (within - acc) / frac))];
      acc += frac;
    }
    return [from, 0];
  };
  const [sub, w2] = pick(start, (l % SPAN) / SPAN);
  const [subSub] = pick(sub, w2);
  return { sign: SIGN_LORDS[Math.floor(l / 30)]!, star: KP_LORDS[start]!, sub: KP_LORDS[sub]!, subSub: KP_LORDS[subSub]! };
}

export interface KpBody {
  readonly body: Graha | 'lagna';
  readonly longitude: Degrees;
  readonly lords: KpLords;
  /** Houses it occupies (two when within 1° before the next cusp). */
  readonly inHouses: readonly number[];
  /** Houses it owns (Rāhu/Ketu: those of their sign lord). */
  readonly owns: readonly number[];
  readonly retrograde: boolean;
}

export interface KpCusp {
  readonly house: number;
  readonly longitude: Degrees;
  readonly lords: KpLords;
}

export interface KpChart {
  readonly ayanamsha: Degrees;
  readonly cusps: readonly KpCusp[];
  readonly bodies: readonly KpBody[];
  /** Houses signified by each planet (occupation and ownership of it and its star lord). */
  readonly significators: Readonly<Record<Graha, readonly number[]>>;
  /** Ruling planets at birth: lagna sign lord, lagna star lord, Moon sign lord, day lord, Moon star lord. */
  readonly ruling: readonly Graha[];
}

export interface KpOptions {
  readonly latitude: Degrees;
  readonly longitude: Degrees;
  /** Mean nodes by default, as the reference software uses. */
  readonly node?: 'meanNode' | 'trueNode';
  /** Minutes east of UTC, for the day lord of the civil date. */
  readonly utcOffsetMinutes?: number;
}

const ZODIAC = { kind: 'sidereal', ayanamsha: 'krishnamurti' } as const;

/** House (1-12) whose cusp arc contains `lon`. */
export function arcHouse(cusps: readonly Degrees[], lon: Degrees): number {
  for (let k = 0; k < 12; k += 1) {
    const a = cusps[k]!; const b = cusps[(k + 1) % 12]!;
    if (norm360(lon - a) < norm360(b - a)) return k + 1;
  }
  return 1;
}

export function kpChart(provider: EphemerisProvider, jdUT: number, o: KpOptions): KpChart {
  const h = provider.houses(jdUT, o.latitude, o.longitude, 'placidus', { zodiac: ZODIAC });
  const cuspLon = h.cusps.map(norm360);
  const lon = {} as Record<Graha, Degrees>; const retro = {} as Record<Graha, boolean>;
  for (const b of NINE) {
    if (b === 'rahu' || b === 'ketu') continue;
    const p = provider.calc(jdUT, b, { zodiac: ZODIAC });
    lon[b] = norm360(p.longitude); retro[b] = p.longitudeSpeed < 0;
  }
  const node = provider.calc(jdUT, o.node ?? 'meanNode', { zodiac: ZODIAC });
  lon.rahu = norm360(node.longitude); lon.ketu = norm360(node.longitude + 180);
  retro.rahu = true; retro.ketu = true;

  const inOf = (l: Degrees): number[] => {
    const a = arcHouse(cuspLon, l);
    return norm360(cuspLon[a % 12]! - l) < 1 ? [a, (a % 12) + 1] : [a];
  };
  const ownsOf = (b: Graha): number[] => {
    if (b === 'rahu' || b === 'ketu') return ownsOf(SIGN_LORDS[Math.floor(lon[b] / 30)]!);
    return cuspLon.map((c, k) => (SIGN_LORDS[Math.floor(c / 30)] === b ? k + 1 : 0)).filter(Boolean);
  };
  const bodies: KpBody[] = [
    { body: 'lagna', longitude: norm360(h.ascendant), lords: kpLords(h.ascendant), inHouses: [1], owns: [], retrograde: false },
    ...NINE.map((b) => ({ body: b, longitude: lon[b], lords: kpLords(lon[b]), inHouses: inOf(lon[b]), owns: ownsOf(b), retrograde: retro[b] })),
  ];
  const byBody = new Map(bodies.map((b) => [b.body, b]));
  const significators = {} as Record<Graha, number[]>;
  for (const b of NINE) {
    const me = byBody.get(b)!; const st = byBody.get(me.lords.star)!;
    significators[b] = [...new Set([...me.inHouses, ...me.owns, ...st.inHouses, ...st.owns])].sort((x, y) => x - y);
  }
  const off = (o.utcOffsetMinutes ?? 0) / 1440;
  const weekday = Math.floor(jdUT + 1.5 + off) % 7;
  const asc = kpLords(h.ascendant); const moon = kpLords(lon.moon);
  return {
    ayanamsha: provider.ayanamsha(jdUT, ZODIAC),
    cusps: cuspLon.map((c, k) => ({ house: k + 1, longitude: c, lords: kpLords(c) })),
    bodies,
    significators,
    ruling: [asc.sign, asc.star, moon.sign, DAY_LORD[weekday]!, moon.star],
  };
}

/** One step of the four-step theory: a planet with the houses it occupies and owns. */
export interface KpStep { readonly planet: Graha; readonly inHouses: readonly number[]; readonly owns: readonly number[] }

/** Four-step theory for a planet: itself, its star lord, its sub lord, and the sub lord's star lord. */
export function fourStep(k: KpChart, planet: Graha): readonly [KpStep, KpStep, KpStep, KpStep] {
  const b = (g: Graha): KpBody => k.bodies.find((x) => x.body === g)!;
  const step = (g: Graha): KpStep => ({ planet: g, inHouses: b(g).inHouses, owns: b(g).owns });
  const me = b(planet); const sub = me.lords.sub;
  return [step(planet), step(me.lords.star), step(sub), step(b(sub).lords.star)];
}

/** Cusps (1-12) whose sub lord is `planet`. */
export const cuspsSubbedBy = (k: KpChart, planet: Graha): number[] => k.cusps.filter((c) => c.lords.sub === planet).map((c) => c.house);
