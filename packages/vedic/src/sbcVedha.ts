/**
 * Vedha (piercing) on the Sarvatobhadra cakra, by two methods kept apart.
 *
 * ## The geometry, which is not in doubt
 *
 * A graha stands in the nakṣatra on the cakra's edge where its sidereal
 * longitude falls (28 nakṣatras, Abhijit between Uttarāṣāḍhā and Śravaṇa,
 * 276°40′–280°53′20″). From that edge cell three straight lines run into the
 * grid: one straight across to the opposite edge, and two diagonals. Every
 * cell a line crosses (letters, signs, tithi groups, and the nakṣatra where
 * it leaves the grid) is "pierced".
 *
 * The two diagonals are named here by where they lead round the ring, which
 * does not depend on how one pictures the cakra: `behind` reaches a nakṣatra
 * earlier in the zodiac, `ahead` a later one. From Kṛttikā the front line
 * reaches Śravaṇa, `behind` reaches Bharaṇī and `ahead` reaches Viśākhā.
 *
 * ## The names and the motion rule, which are
 *
 * - Which diagonal a tradition calls vāma (left) and which dakṣiṇa (right) is
 *   a matter of how the observer is pictured. A tradition states it in
 *   `vamaLine`; when it is null the diagonals are reported by geometry only.
 * - **Method B** counts all three lines for every graha (sammukha, vāma and
 *   dakṣiṇa together). Its hits depend on the geometry alone.
 * - **Method A** lets motion choose the line(s): direct, fast, retrograde. Its
 *   rule table must come from a verified reference. The production tradition
 *   ships WITHOUT one (`methodA: null`), so Method A is "not evaluated", never
 *   "no hit". `SBC_METHOD_A_FIXTURE` is a labelled test fixture transcribed
 *   from a secondary summary, for exercising the engine and the screen only.
 *
 * Directions are never inferred from Western aspects.
 */
import { norm360, type Degrees, type EphemerisProvider, type NodeType, type ZodiacMode } from '@astro/engine';
import { SARVATOBHADRA, nakshatra28, sbcCellOf, type SbcCell } from './bhava.js';
import { tithiFrom } from './panchang.js';
import { GRAHAS, type Graha } from './grahas.js';

export type VedhaLine = 'front' | 'behind' | 'ahead';
export type VedhaDirection = 'sammukha' | 'vama' | 'dakshina';
export type GrahaMotion = 'direct' | 'fast' | 'stationary' | 'retrograde';
export type VedhaMethod = 'A' | 'B';

/** Mean geocentric daily motion, degrees: the line between "direct" and "fast". */
export const MEAN_DAILY_MOTION: Readonly<Record<Graha, number>> = {
  sun: 0.9856, moon: 13.1764, mercury: 0.9856, venus: 0.9856, mars: 0.5240,
  jupiter: 0.0831, saturn: 0.0335, rahu: -0.0530, ketu: -0.0530,
};

export interface MotionRule {
  /** The directions a graha casts, by its motion. A motion left out is not covered. */
  readonly byMotion: Partial<Record<GrahaMotion, readonly VedhaDirection[]>>;
  /** Grahas whose directions are fixed whatever their motion. */
  readonly fixed: Partial<Record<Graha, readonly VedhaDirection[]>>;
  /** Grahas the rule says nothing about: "not evaluated". */
  readonly notCovered: readonly Graha[];
}

export interface SbcTradition {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  /** Where the layout, the names and the motion rule come from. */
  readonly reference: string;
  /** `verified`: checked against the reference with a worked example; `unverified`: in use, evidence owed; `test-fixture`: tests and demonstration only. */
  readonly status: 'verified' | 'unverified' | 'test-fixture';
  readonly abhijit: 'between-uttarashadha-and-shravana';
  /** Which diagonal is called vāma; null when the reference does not settle it. */
  readonly vamaLine: 'behind' | 'ahead' | null;
  /** Method A's table; null when no verified table exists. */
  readonly methodA: MotionRule | null;
  /** Below this fraction of mean motion a graha counts as stationary. */
  readonly stationFraction: number;
}

/** The production tradition: geometry verified against the cakra; names and Method A owed to a primary reference. */
export const SBC_GEOMETRY_V1: SbcTradition = {
  id: 'sbc-geometry',
  version: '1.0.0',
  name: 'Sarvatobhadra, geometric lines',
  reference:
    'Cakra layout as tabulated in printed kuṇḍalīs (VEDIC_CONVENTIONS §14); lines checked cell by cell (Kṛttikā → Śravaṇa, Bharaṇī, Viśākhā). ' +
    'Motion rule and vāma/dakṣiṇa naming NOT verified: a critical edition of Narapati Jayacharya’s Svarodaya (Sarvatobhadra section) or Mānasāgarī with verse numbers and a worked example is needed.',
  status: 'unverified',
  abhijit: 'between-uttarashadha-and-shravana',
  vamaLine: null,
  methodA: null,
  stationFraction: 0.1,
};

/**
 * TEST FIXTURE, not a production rule. Transcribed from a secondary summary
 * (Wikipedia, "Sarvatobhadra chakra", citing Phaladeepika ch. XXVI): normal
 * direct motion → front, fast → left, retrograde → right; the Sun and the
 * nodes cast all three; the Moon has no rule. The left-hand diagonal is taken
 * as `ahead` (an observer on the edge facing the centre). Stations are not
 * covered.
 */
export const SBC_METHOD_A_FIXTURE: SbcTradition = {
  id: 'sbc-method-a-fixture',
  version: '0.0.1-fixture',
  name: 'Method A test fixture (secondary source, unverified)',
  reference: 'https://en.wikipedia.org/wiki/Sarvatobhadra_chakra (secondary; cites Phaladeepika ch. XXVI). For tests only.',
  status: 'test-fixture',
  abhijit: 'between-uttarashadha-and-shravana',
  vamaLine: 'ahead',
  methodA: {
    byMotion: { direct: ['sammukha'], fast: ['vama'], retrograde: ['dakshina'] },
    fixed: { sun: ['sammukha', 'vama', 'dakshina'], rahu: ['sammukha', 'vama', 'dakshina'], ketu: ['sammukha', 'vama', 'dakshina'] },
    notCovered: ['moon'],
  },
  stationFraction: 0.1,
};

/** Problems with a tradition; empty when usable. */
export function validateTradition(t: SbcTradition): string[] {
  const out: string[] = [];
  if (!t.version.trim()) out.push('NO_VERSION');
  if (!t.reference.trim()) out.push('NO_REFERENCE');
  if (t.methodA) {
    const needsSides = [...Object.values(t.methodA.byMotion), ...Object.values(t.methodA.fixed)].some((d) => d?.some((x) => x !== 'sammukha'));
    if (needsSides && t.vamaLine === null) out.push('SIDES_UNNAMED');
    if (t.status === 'verified' && t.methodA && !/\d/.test(t.reference)) out.push('NO_VERSE_REFERENCE');
  }
  if (!(t.stationFraction >= 0 && t.stationFraction < 1)) out.push('BAD_STATION_FRACTION');
  return out;
}

// ------------------------------------------------------------------ geometry

type Cell = readonly [number, number];

/** Unit steps for an edge cell: into the grid, and forward round the ring (the zodiac's direction). */
function frame([r, c]: Cell): { inward: Cell; forward: Cell } {
  if (r === 0) return { inward: [1, 0], forward: [0, 1] };
  if (c === 8) return { inward: [0, -1], forward: [1, 0] };
  if (r === 8) return { inward: [-1, 0], forward: [0, -1] };
  if (c === 0) return { inward: [0, 1], forward: [-1, 0] };
  throw new Error(`cell ${r},${c} is not on the edge`);
}

/** The cells one line crosses from an edge cell, the source excluded, in order. */
export function vedhaLineCells(source: Cell, line: VedhaLine): Cell[] {
  const { inward, forward } = frame(source);
  const sign = line === 'front' ? 0 : line === 'ahead' ? 1 : -1;
  const step: Cell = [inward[0] + sign * forward[0], inward[1] + sign * forward[1]];
  const out: Cell[] = [];
  for (let r = source[0] + step[0], c = source[1] + step[1]; r >= 0 && r < 9 && c >= 0 && c < 9; r += step[0], c += step[1]) out.push([r, c]);
  return out;
}

/** The three lines from a nakṣatra (28-index). */
export function vedhaLines(index28: number): Record<VedhaLine, Cell[]> {
  const src = sbcCellOf(index28);
  return { front: vedhaLineCells(src, 'front'), behind: vedhaLineCells(src, 'behind'), ahead: vedhaLineCells(src, 'ahead') };
}

export function lineOf(direction: VedhaDirection, t: SbcTradition): VedhaLine | null {
  if (direction === 'sammukha') return 'front';
  if (t.vamaLine === null) return null;
  const other: VedhaLine = t.vamaLine === 'ahead' ? 'behind' : 'ahead';
  return direction === 'vama' ? t.vamaLine : other;
}

export function directionOf(line: VedhaLine, t: SbcTradition): VedhaDirection | null {
  if (line === 'front') return 'sammukha';
  if (t.vamaLine === null) return null;
  return line === t.vamaLine ? 'vama' : 'dakshina';
}

// ------------------------------------------------------------------ targets

const RING_CORNERS: readonly Cell[] = [
  [0, 0], [0, 8], [8, 8], [8, 0], [1, 1], [1, 7], [7, 7], [7, 1],
  [2, 2], [2, 6], [6, 6], [6, 2], [3, 3], [3, 5], [5, 5], [5, 3],
];
const isCorner = ([r, c]: Cell): boolean => RING_CORNERS.some(([a, b]) => a === r && b === c);

export type TargetKind = 'natal-moon-nakshatra' | 'natal-moon-sign' | 'ascendant-sign' | 'name-consonant' | 'name-vowel' | 'tithi-group';

/**
 * What the user wants watched. Each is optional: a missing one is reported as
 * "not evaluated" with the reason, never as "no hit". The ascendant is its own
 * target, never folded into the Moon's sign.
 */
export interface VedhaTargetInput {
  /** 28-index. */
  readonly natalMoonNakshatra?: number;
  /** 0 = Meṣa. */
  readonly natalMoonSign?: number;
  readonly ascendantSign?: number;
  /** As printed in the cakra's consonant ring: 'Ka', 'Na', … */
  readonly nameConsonant?: string;
  /** As printed at the ring corners: 'A', 'Ā', 'I', … */
  readonly nameVowel?: string;
  /** Nandā, Bhadrā, Jayā, Riktā or Pūrṇā. */
  readonly tithiGroup?: string;
  /** Free text describing where each came from (chart record id, "name-based, user-entered"). */
  readonly provenance?: Partial<Record<TargetKind, string>>;
}

export interface ResolvedTarget {
  readonly kind: TargetKind;
  readonly value: string;
  readonly cell: Cell | null;
  /** Why the target cannot be evaluated, when `cell` is null. */
  readonly missing?: 'NOT_GIVEN' | 'NOT_ON_CAKRA';
  readonly provenance?: string;
}

function findCell(pred: (x: SbcCell, cell: Cell) => boolean): Cell | null {
  for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) if (pred(SARVATOBHADRA[r]![c]!, [r, c])) return [r, c];
  return null;
}

export const TARGET_KINDS: readonly TargetKind[] = ['natal-moon-nakshatra', 'natal-moon-sign', 'ascendant-sign', 'name-consonant', 'name-vowel', 'tithi-group'];

export function resolveTargets(t: VedhaTargetInput): ResolvedTarget[] {
  const one = (kind: TargetKind, given: string | number | undefined, find: () => Cell | null): ResolvedTarget => {
    const provenance = t.provenance?.[kind];
    const base = provenance !== undefined ? { provenance } : {};
    if (given === undefined || given === '') return { kind, value: '', cell: null, missing: 'NOT_GIVEN', ...base };
    const cell = find();
    return cell ? { kind, value: String(given), cell, ...base } : { kind, value: String(given), cell: null, missing: 'NOT_ON_CAKRA', ...base };
  };
  return [
    one('natal-moon-nakshatra', t.natalMoonNakshatra, () => sbcCellOf(t.natalMoonNakshatra!)),
    one('natal-moon-sign', t.natalMoonSign, () => findCell((x) => x.kind === 'sign' && x.index === t.natalMoonSign)),
    one('ascendant-sign', t.ascendantSign, () => findCell((x) => x.kind === 'sign' && x.index === t.ascendantSign)),
    one('name-consonant', t.nameConsonant, () => findCell((x, cell) => x.kind === 'letter' && x.text === t.nameConsonant && !isCorner(cell))),
    one('name-vowel', t.nameVowel, () => findCell((x, cell) => x.kind === 'letter' && x.text === t.nameVowel && isCorner(cell))),
    one('tithi-group', t.tithiGroup, () => findCell((x) => x.kind === 'tithi' && x.group === t.tithiGroup)),
  ];
}

/** The tithi group of a tithi (1-30): 1·6·11 Nandā … 5·10·15 Pūrṇā; Amāvāsyā counts as the 15th. */
export function tithiGroupOf(tithiNumber: number): string {
  const inPaksha = tithiNumber <= 15 ? tithiNumber : tithiNumber - 15;
  return ['Nandā', 'Bhadrā', 'Jayā', 'Riktā', 'Pūrṇā'][(inPaksha - 1) % 5]!;
}

// ------------------------------------------------------------------ evaluation

export interface GrahaState {
  readonly graha: Graha;
  /** Sidereal longitude under the chosen ayanāṁśa. */
  readonly longitude: Degrees;
  readonly speed: number;
  readonly nakshatra28: number;
  readonly motion: GrahaMotion;
}

export function motionOf(graha: Graha, speed: number, t: SbcTradition): GrahaMotion {
  const mean = Math.abs(MEAN_DAILY_MOTION[graha]);
  if (graha === 'rahu' || graha === 'ketu') return speed < 0 ? 'retrograde' : Math.abs(speed) < t.stationFraction * mean ? 'stationary' : 'direct';
  if (Math.abs(speed) < t.stationFraction * mean) return 'stationary';
  if (speed < 0) return 'retrograde';
  return speed > mean ? 'fast' : 'direct';
}

export type NotEvaluatedReason =
  | 'METHOD_A_UNAVAILABLE' // the tradition has no verified Method A table
  | 'GRAHA_NOT_COVERED' // the rule says nothing about this graha (the Moon in the fixture)
  | 'MOTION_NOT_COVERED' // the rule says nothing about this motion (a station)
  | 'SIDES_UNNAMED' // the rule needs vāma/dakṣiṇa and the tradition does not name them
  | 'TARGET_NOT_GIVEN'
  | 'TARGET_NOT_ON_CAKRA';

/** Natural benefic/malefic, by convention: the Moon by pakṣa, Mercury variable (by association). */
export type GrahaClass = 'benefic' | 'malefic' | 'variable';
export function grahaClass(graha: Graha, paksha: 'shukla' | 'krishna'): GrahaClass {
  if (graha === 'jupiter' || graha === 'venus') return 'benefic';
  if (graha === 'moon') return paksha === 'shukla' ? 'benefic' : 'malefic';
  if (graha === 'mercury') return 'variable';
  return 'malefic';
}

export interface VedhaEvaluation {
  readonly method: VedhaMethod;
  readonly graha: Graha;
  readonly source: number;
  readonly motion: GrahaMotion;
  readonly target: ResolvedTarget;
  readonly outcome: 'hit' | 'no-hit' | 'not-evaluated';
  /** The line(s) that pierce the target; for no-hit, the lines that were looked at. */
  readonly lines: readonly VedhaLine[];
  /** Traditional names of those lines, null where the tradition does not name the diagonals. */
  readonly directions: readonly (VedhaDirection | null)[];
  /** Rule code: 'B:all-lines', 'A:fixed', 'A:motion:fast', … */
  readonly rule: string;
  readonly reason?: NotEvaluatedReason;
  readonly classification: GrahaClass;
}

function onLine(lines: Record<VedhaLine, Cell[]>, which: readonly VedhaLine[], cell: Cell): VedhaLine[] {
  return which.filter((l) => lines[l].some(([r, c]) => r === cell[0] && c === cell[1]));
}

const ALL: readonly VedhaLine[] = ['front', 'behind', 'ahead'];

export function evaluateVedha(
  method: VedhaMethod, g: GrahaState, target: ResolvedTarget, t: SbcTradition, paksha: 'shukla' | 'krishna',
): VedhaEvaluation {
  const base = { method, graha: g.graha, source: g.nakshatra28, motion: g.motion, target, classification: grahaClass(g.graha, paksha) };
  const notEvaluated = (rule: string, reason: NotEvaluatedReason): VedhaEvaluation => ({ ...base, outcome: 'not-evaluated', lines: [], directions: [], rule, reason });
  if (!target.cell) return notEvaluated(`${method}:target`, target.missing === 'NOT_ON_CAKRA' ? 'TARGET_NOT_ON_CAKRA' : 'TARGET_NOT_GIVEN');
  const lines = vedhaLines(g.nakshatra28);
  let looked: readonly VedhaLine[];
  let rule: string;
  if (method === 'B') {
    looked = ALL; rule = 'B:all-lines';
  } else {
    const a = t.methodA;
    if (!a) return notEvaluated('A:unavailable', 'METHOD_A_UNAVAILABLE');
    if (a.notCovered.includes(g.graha)) return notEvaluated('A:graha-not-covered', 'GRAHA_NOT_COVERED');
    const fixed = a.fixed[g.graha];
    const dirs = fixed ?? a.byMotion[g.motion];
    rule = fixed ? 'A:fixed' : `A:motion:${g.motion}`;
    if (!dirs) return notEvaluated(rule, 'MOTION_NOT_COVERED');
    const mapped = dirs.map((d) => lineOf(d, t));
    if (mapped.some((l) => l === null)) return notEvaluated(rule, 'SIDES_UNNAMED');
    looked = mapped as VedhaLine[];
  }
  const hits = onLine(lines, looked, target.cell);
  const shown = hits.length ? hits : looked;
  return { ...base, outcome: hits.length ? 'hit' : 'no-hit', lines: shown, directions: shown.map((l) => directionOf(l, t)), rule };
}

/** Why Method A and Method B differ for one graha and target, or null when they agree. */
export type DisagreementReason = 'A_NOT_EVALUATED' | 'MOTION_SELECTS_OTHER_LINE';
export function disagreement(a: VedhaEvaluation, b: VedhaEvaluation): DisagreementReason | null {
  if (a.outcome === b.outcome) return null;
  if (a.outcome === 'not-evaluated') return b.outcome === 'not-evaluated' ? null : 'A_NOT_EVALUATED';
  // Method B looks at every line, so B hits whenever A hits; the reverse is the motion choosing another line.
  return 'MOTION_SELECTS_OTHER_LINE';
}

export interface CalcSettings {
  readonly zodiac: ZodiacMode;
  readonly nodeType: NodeType;
}

/** The nine grahas at one instant, sidereal, with speed and motion. */
export function grahaStates(provider: EphemerisProvider, jd: number, settings: CalcSettings, t: SbcTradition): GrahaState[] {
  const opts = { zodiac: settings.zodiac };
  return GRAHAS.map((graha) => {
    const body = graha === 'rahu' || graha === 'ketu' ? (settings.nodeType === 'true' ? 'trueNode' : 'meanNode') : graha;
    const p = provider.calc(jd, body, opts);
    const longitude = graha === 'ketu' ? norm360(p.longitude + 180) : p.longitude;
    return { graha, longitude, speed: p.longitudeSpeed, nakshatra28: nakshatra28(longitude), motion: motionOf(graha, p.longitudeSpeed, t) };
  });
}

export interface VedhaDay {
  readonly date: string;
  readonly jd: number;
  readonly tithi: number;
  readonly paksha: 'shukla' | 'krishna';
  readonly states: readonly GrahaState[];
  readonly evaluations: readonly VedhaEvaluation[];
  /** Per target and method: the grahas that hit it, the measure of concurrent vedha. */
  readonly concurrent: readonly { readonly target: TargetKind; readonly method: VedhaMethod; readonly grahas: readonly Graha[]; readonly malefic: number; readonly benefic: number }[];
}

export function vedhaForDay(
  provider: EphemerisProvider, date: string, jd: number, settings: CalcSettings, t: SbcTradition, targets: readonly ResolvedTarget[],
): VedhaDay {
  const states = grahaStates(provider, jd, settings, t);
  const sun = states.find((s) => s.graha === 'sun')!; const moon = states.find((s) => s.graha === 'moon')!;
  const tithi = tithiFrom(sun.longitude, moon.longitude);
  const evaluations: VedhaEvaluation[] = [];
  for (const method of ['A', 'B'] as const) for (const target of targets) for (const g of states) evaluations.push(evaluateVedha(method, g, target, t, tithi.paksha));
  const concurrent = (['A', 'B'] as const).flatMap((method) => targets.map((target) => {
    const hits = evaluations.filter((e) => e.method === method && e.target.kind === target.kind && e.outcome === 'hit');
    return {
      target: target.kind, method, grahas: hits.map((h) => h.graha),
      malefic: hits.filter((h) => h.classification === 'malefic').length,
      benefic: hits.filter((h) => h.classification === 'benefic').length,
    };
  }));
  return { date, jd, tithi: tithi.number, paksha: tithi.paksha, states, evaluations, concurrent };
}
