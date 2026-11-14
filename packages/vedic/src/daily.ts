/**
 * Transit pages of a printed Jyotiṣa report:
 *
 * - The daily power chart: at 05:30 local time on each day of a month, each of
 *   the seven planets' transit sign, its house from the natal lagna and its own
 *   bhinnāṣṭakavarga bindus in that sign; the day's total and total − 28; and
 *   the running Viṁśottarī mahā/antar/pratyantar daśā.
 * - The Moon's daily tārā: the Moon's run between nakṣatra and sign edges, with
 *   the tārā counted from the janma nakṣatra, its house from the lagna, the
 *   padas covered and the sarvāṣṭakavarga of the sign.
 * - Gochar: every sign change of the nine in a window, with the house from the
 *   lagna and from the natal Moon and the daśā running at the time.
 *
 * Bindus are the natal ones (docs/VEDIC_CONVENTIONS.md §12); the daśā clock is
 * the reports' — from local midnight of the birth date, 365.25-day years.
 */
import { findIngresses, norm360, type Degrees, type EphemerisProvider, type ZodiacMode } from '@astro/engine';
import { ashtakavarga } from './ashtakavarga.js';
import { dashas, localMidnightJd, runningPath } from './dasha.js';
import { GRAHAS, SEVEN, type Graha, type GrahaLongitudes, type Planet } from './grahas.js';

const SPAN = 360 / 27;
const sgn = (lon: Degrees): number => Math.floor(norm360(lon) / 30);
const house = (sign: number, from: number): number => ((sign - from + 12) % 12) + 1;
export const TARA_CYCLE = ['janma', 'sampat', 'vipat', 'kshema', 'pratyari', 'sadhaka', 'vadha', 'mitra', 'atimitra'] as const;
export type Tara = (typeof TARA_CYCLE)[number];

export interface TransitContext {
  readonly birthJd: number;
  readonly utcOffsetMinutes: number;
  readonly zodiac: ZodiacMode;
  readonly node?: 'meanNode' | 'trueNode';
}

/** Running Viṁśottarī lords [MD, AD, PD] at `jd`, on the reports' clock. */
export function vimshottariAt(g: GrahaLongitudes, c: TransitContext): (jd: number) => string[] {
  const d = dashas('vimshottari', g.lon.moon, c.birthJd, {
    anchor: 'civilDate', localMidnightJd: localMidnightJd(c.birthJd, c.utcOffsetMinutes), yearDays: 365.25, spanYears: 130,
  });
  return (jd) => runningPath(d, jd, 3).map((n) => n.lord);
}

/** UT Julian Day of local clock time `hours` on a civil date. */
export function localJd(year: number, month: number, day: number, hours: number, utcOffsetMinutes: number): number {
  // Gregorian civil date → JD at 0h UT (Meeus), then local → UT.
  let y = year; let m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100); const b = 2 - a + Math.floor(a / 4);
  const jd0 = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
  return jd0 + (hours - utcOffsetMinutes / 60) / 24;
}

export interface PowerDay {
  readonly day: number;
  readonly jd: number;
  readonly planets: Readonly<Record<Planet, { readonly sign: number; readonly house: number; readonly bindus: number }>>;
  readonly total: number;
  /** Total less 28 (the average of seven planets × 4): positive is a stronger day. */
  readonly score: number;
  readonly dasha: readonly string[];
}

/** The daily power chart for one month, sampled at `hours` (default 05:30) local time. */
export function dailyPower(
  provider: EphemerisProvider, g: GrahaLongitudes, c: TransitContext, year: number, month: number, hours = 5.5,
): PowerDay[] {
  if (g.lagna === undefined) throw new Error('daily power chart needs a lagna');
  const av = ashtakavarga(g); const asc = sgn(g.lagna); const dasha = vimshottariAt(g, c);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: PowerDay[] = [];
  for (let day = 1; day <= days; day += 1) {
    const jd = localJd(year, month, day, hours, c.utcOffsetMinutes);
    const planets = {} as Record<Planet, { sign: number; house: number; bindus: number }>;
    let total = 0;
    for (const p of SEVEN) {
      const s = sgn(provider.calc(jd, p, { zodiac: c.zodiac }).longitude);
      const b = av.bhinna[p].totals[s]!;
      planets[p] = { sign: s, house: house(s, asc), bindus: b }; total += b;
    }
    out.push({ day, jd, planets, total, score: total - 28, dasha: dasha(jd) });
  }
  return out;
}

export interface MoonSegment {
  readonly startJd: number;
  readonly endJd: number;
  readonly nakshatra: number;
  readonly sign: number;
  /** Padas (1-4) the Moon covers within this segment. */
  readonly padas: readonly number[];
  readonly tara: Tara;
  readonly houseFromLagna?: number;
  readonly sarva?: number;
}

/** The Moon's segments between nakṣatra and sign edges, from `fromJd` to `toJd`. */
export function moonTaraSchedule(
  provider: EphemerisProvider, g: GrahaLongitudes, zodiac: ZodiacMode, fromJd: number, toJd: number,
): MoonSegment[] {
  const mlon = (jd: number): number => norm360(provider.calc(jd, 'moon', { zodiac }).longitude);
  const janma = Math.floor(norm360(g.lon.moon) / SPAN);
  const sav = g.lagna === undefined ? undefined : ashtakavarga(g).sarva;
  const asc = g.lagna === undefined ? undefined : sgn(g.lagna);
  /** Next nakṣatra or sign edge after `jd`. The Moon never moves backwards. */
  const nextEdge = (jd: number): number => {
    const l = mlon(jd);
    const target = Math.min((Math.floor(l / SPAN + 1e-12) + 1) * SPAN, (Math.floor(l / 30) + 1) * 30);
    const need = target - l;
    let lo = jd; let hi = jd + 2.5;
    for (let k = 0; k < 45; k += 1) {
      const m = (lo + hi) / 2;
      if (norm360(mlon(m) - l) < need) lo = m; else hi = m;
    }
    return hi;
  };
  const out: MoonSegment[] = [];
  let t = fromJd;
  for (let guard = 0; t < toJd && guard < 200; guard += 1) {
    const e = nextEdge(t);
    const mid = mlon((t + Math.min(e, toJd)) / 2);
    const a = mlon(t + 1e-5); const z = mlon(Math.min(e, toJd) - 1e-5);
    const p0 = Math.floor(a / (SPAN / 4)) % 4; const p1 = Math.floor(z / (SPAN / 4)) % 4;
    const padas: number[] = []; for (let p = p0; ; p = (p + 1) % 4) { padas.push(p + 1); if (p === p1 || padas.length > 4) break; }
    const n = Math.floor(mid / SPAN); const s = sgn(mid);
    out.push({
      startJd: t, endJd: Math.min(e, toJd), nakshatra: n, sign: s, padas,
      tara: TARA_CYCLE[(n - janma + 27) % 9]!,
      ...(asc === undefined ? {} : { houseFromLagna: house(s, asc), sarva: sav![s]! }),
    });
    t = e;
  }
  return out;
}

export interface GocharEvent {
  readonly body: Graha;
  readonly jd: number;
  readonly sign: number;
  readonly retrograde: boolean;
  readonly houseFromLagna?: number;
  readonly houseFromMoon: number;
  /** The body's own bhinnāṣṭakavarga bindus in the sign entered (seven planets, with a lagna). */
  readonly bindus?: number;
  /** Sarvāṣṭakavarga of the sign entered (with a lagna). */
  readonly sarva?: number;
  readonly dasha: readonly string[];
}

/** Sign changes of the eight slow grahas (the Moon has its own schedule) between two instants. Ketu is Rāhu + 180°. */
export function gochar(
  provider: EphemerisProvider, g: GrahaLongitudes, c: TransitContext, fromJd: number, toJd: number,
): GocharEvent[] {
  const node = c.node ?? 'meanNode';
  const ev = findIngresses(provider, { fromJd, toJd, bodies: [...SEVEN.filter((b) => b !== 'moon'), node], zodiac: c.zodiac });
  const moon = sgn(g.lon.moon); const asc = g.lagna === undefined ? undefined : sgn(g.lagna);
  const dasha = vimshottariAt(g, c);
  const av = asc === undefined ? undefined : ashtakavarga(g);
  const out: GocharEvent[] = [];
  const push = (body: Graha, jd: number, sign: number, retrograde: boolean): void => {
    out.push({
      body, jd, sign, retrograde, houseFromMoon: house(sign, moon),
      ...(asc === undefined ? {} : { houseFromLagna: house(sign, asc), sarva: av!.sarva[sign]! }),
      ...(av && body !== 'rahu' && body !== 'ketu' ? { bindus: av.bhinna[body as Planet].totals[sign]! } : {}),
      dasha: dasha(jd),
    });
  };
  for (const e of ev) {
    if (e.body === node) {
      // Nodes move backwards, so for them the re-entry is a forward (true-node) wobble.
      push('rahu', e.jd, e.signIndex, !e.retrograde);
      push('ketu', e.jd, (e.signIndex + 6) % 12, !e.retrograde);
    } else {
      push(e.body as Graha, e.jd, e.signIndex, e.retrograde);
    }
  }
  return out.sort((a, b) => a.jd - b.jd || GRAHAS.indexOf(a.body) - GRAHAS.indexOf(b.body));
}
