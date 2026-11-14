/**
 * Slow-planet transits read against the natal Moon: Śani's sāḍe-sātī and
 * panautī (ḍhaiyā), and the ingress tables for Śani, Guru and Maṅgala.
 *
 * Every date is a real sidereal sign ingress, solved for by the engine (never
 * sampled), so retrograde re-entries are kept: Saturn can leave a sign, back
 * into it and leave again, and each of those is a row.
 *
 * Conventions match the reference horoscope software, checked against 80 of
 * its printed rows:
 * - Sāḍe-sātī = Saturn in the 12th, 1st and 2nd from the natal Moon sign;
 *   "small panautī" (ḍhaiyā) = the 4th or the 8th.
 * - Pāya (the "foot" the phase arrives on) = the transiting Moon's house from
 *   the natal Moon at the moment Saturn enters: 1/6/11 gold, 2/5/9 silver,
 *   3/7/10 copper, 4/8/12 iron.
 */
import { findIngresses, type EphemerisProvider, type ZodiacMode, type Degrees } from '@astro/engine';
import { julianDayToIsoUtc, norm360 } from '@astro/engine';

export type SaturnPhase = 'rising' | 'peak' | 'setting' | 'kantaka' | 'ashtama';
export type Paya = 'gold' | 'silver' | 'copper' | 'iron';

export interface SignStay {
  readonly body: 'saturn' | 'jupiter' | 'mars';
  readonly signIndex: number;
  readonly startJd: number;
  readonly endJd: number;
  readonly startIso: string;
  readonly endIso: string;
  /** Entered moving backwards (a retrograde re-entry). */
  readonly retrogradeEntry: boolean;
  /** House of the sign counted from the natal Moon sign (1-12). */
  readonly houseFromMoon: number;
  /** House from the lagna sign, when there is a lagna. */
  readonly houseFromLagna?: number;
}

export interface SaturnStay extends SignStay {
  readonly phase?: SaturnPhase;
  readonly paya?: Paya;
}

export interface SadeSatiSpell {
  readonly kind: 'sadeSati' | 'smallPanoti';
  readonly startJd: number;
  readonly endJd: number;
  readonly startIso: string;
  readonly endIso: string;
  readonly stays: readonly SaturnStay[];
}

const PHASE: Readonly<Record<number, SaturnPhase>> = { 12: 'rising', 1: 'peak', 2: 'setting', 4: 'kantaka', 8: 'ashtama' };

export function payaOf(transitMoonHouseFromNatalMoon: number): Paya {
  const h = transitMoonHouseFromNatalMoon;
  if ([1, 6, 11].includes(h)) return 'gold';
  if ([2, 5, 9].includes(h)) return 'silver';
  if ([3, 7, 10].includes(h)) return 'copper';
  return 'iron';
}

const house = (sign: number, from: number): number => ((sign - from + 12) % 12) + 1;

/** Every stay of `body` in a sign between two dates, cut at the window edges. */
export function signStays(
  provider: EphemerisProvider,
  body: 'saturn' | 'jupiter' | 'mars',
  fromJd: number,
  toJd: number,
  zodiac: ZodiacMode,
  natalMoon: Degrees,
  lagna?: Degrees,
): SignStay[] {
  const moonSign = Math.floor(norm360(natalMoon) / 30);
  const lagnaSign = lagna === undefined ? undefined : Math.floor(norm360(lagna) / 30);
  const events = findIngresses(provider, { fromJd, toJd, bodies: [body], zodiac });
  const first = Math.floor(norm360(provider.calc(fromJd, body, { zodiac }).longitude) / 30);
  const cuts = [{ jd: fromJd, sign: first, retro: false }, ...events.map((e) => ({ jd: e.jd, sign: e.signIndex, retro: e.retrograde }))];
  return cuts.map((c, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1]!.jd : toJd;
    return {
      body, signIndex: c.sign, startJd: c.jd, endJd: end,
      startIso: julianDayToIsoUtc(c.jd), endIso: julianDayToIsoUtc(end),
      retrogradeEntry: c.retro, houseFromMoon: house(c.sign, moonSign),
      ...(lagnaSign === undefined ? {} : { houseFromLagna: house(c.sign, lagnaSign) }),
    };
  });
}

/** Saturn's stays with phase and pāya, and the spells they form. */
export function sadeSati(
  provider: EphemerisProvider,
  natalMoon: Degrees,
  birthJd: number,
  options: { readonly zodiac: ZodiacMode; readonly years?: number; readonly lagna?: Degrees },
): { readonly stays: readonly SaturnStay[]; readonly spells: readonly SadeSatiSpell[] } {
  const toJd = birthJd + (options.years ?? 100) * 365.25;
  const moonSign = Math.floor(norm360(natalMoon) / 30);
  // Start well before birth: a spell running at birth is reported from its real start.
  const raw = signStays(provider, 'saturn', birthJd - 10 * 365.25, toJd, options.zodiac, natalMoon, options.lagna);
  const stays: SaturnStay[] = raw.map((s, i) => {
    const phase = PHASE[s.houseFromMoon];
    if (!phase) return s;
    // The first stay is clipped at birth: there is no entry moment to read a pāya at.
    if (i === 0) return { ...s, phase };
    const tm = provider.calc(s.startJd, 'moon', { zodiac: options.zodiac }).longitude;
    return { ...s, phase, paya: payaOf(house(Math.floor(norm360(tm) / 30), moonSign)) };
  });
  const spells: SadeSatiSpell[] = [];
  let cur: { kind: SadeSatiSpell['kind']; list: SaturnStay[] } | undefined;
  const flush = (): void => {
    if (!cur) return;
    const a = cur.list[0]!; const z = cur.list[cur.list.length - 1]!;
    spells.push({ kind: cur.kind, startJd: a.startJd, endJd: z.endJd, startIso: a.startIso, endIso: z.endIso, stays: cur.list });
    cur = undefined;
  };
  const kindOf = (s: SaturnStay): SadeSatiSpell['kind'] | undefined =>
    s.phase === 'rising' || s.phase === 'peak' || s.phase === 'setting' ? 'sadeSati' : s.phase ? 'smallPanoti' : undefined;
  for (let i = 0; i < stays.length; i += 1) {
    const s = stays[i]!;
    const kind = kindOf(s);
    if (!kind) {
      // A short retrograde excursion out of the zone, followed by a return to
      // it, belongs to the same spell (the report prints one row for it).
      const next = stays[i + 1];
      const back = cur && next && kindOf(next) === cur.kind
        && (cur.kind === 'sadeSati' || next.signIndex === cur.list[cur.list.length - 1]!.signIndex);
      if (cur && back && s.endJd - s.startJd < 300) continue;
      flush(); continue;
    }
    if (cur && cur.kind === kind && (kind === 'sadeSati' || cur.list[cur.list.length - 1]!.signIndex === s.signIndex)) {
      cur.list.push(s); continue;
    }
    flush();
    cur = { kind, list: [s] };
  }
  flush();
  // The spell running at birth is reported from the start of the sign stay
  // that contains the birth, as the reference report prints it.
  const live = spells.filter((x) => x.endJd > birthJd).map((x) => {
    if (x.startJd >= birthJd) return x;
    const kept = x.stays.filter((s) => s.endJd > birthJd);
    const a = kept[0]!;
    return { ...x, startJd: a.startJd, startIso: a.startIso, stays: kept };
  });
  return { stays: stays.filter((s) => s.endJd > birthJd), spells: live };
}

/**
 * When Saturn is within a degree of the natal Moon: the dates it reaches the
 * Moon's whole degree − 1 and leaves the whole degree + 1 (the reference
 * report's "28°/30°" columns for a Moon at 29°). Several passes when retrograde.
 */
export function saturnOverMoon(
  provider: EphemerisProvider,
  natalMoon: Degrees,
  fromJd: number,
  toJd: number,
  zodiac: ZodiacMode,
): { readonly enterJd: number; readonly leaveJd: number }[] {
  const lo = Math.floor(norm360(natalMoon)) - 1;
  const hi = Math.floor(norm360(natalMoon)) + 2;
  const inside = (jd: number): boolean => {
    const d = norm360(provider.calc(jd, 'saturn', { zodiac }).longitude - lo);
    return d < hi - lo;
  };
  const out: { enterJd: number; leaveJd: number }[] = [];
  const edge = (a: number, b: number): number => {
    const want = inside(b);
    for (let k = 0; k < 40; k += 1) { const m = (a + b) / 2; if (inside(m) === want) b = m; else a = m; }
    return b;
  };
  let prev = inside(fromJd); let enter = prev ? fromJd : NaN;
  for (let jd = fromJd + 2; jd <= toJd; jd += 2) {
    const now = inside(jd);
    if (now !== prev) {
      const t = edge(jd - 2, jd);
      if (now) enter = t; else { out.push({ enterJd: enter, leaveJd: t }); enter = NaN; }
      prev = now;
    }
  }
  return out;
}
