/**
 * Sarvatobhadra vedha: the geometry cell by cell, both methods, the
 * difference between "no hit" and "not evaluated", and a daily run over
 * 8 October – 20 November 2026 at 10:00 Asia/Kolkata.
 *
 * The production tradition is the Horaratna in Sastri's rendering
 * (Phaladeepika, 2nd ed. 1950, pp. 311-315); its three worked lists are
 * checked cell by cell. The labelled fixture and the 1.0.0 geometry stay for
 * reproducibility.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider, resolveCivilTime, norm360 } from '@astro/engine';
import { SARVATOBHADRA, sbcCellOf, nakshatra28, ABHIJIT_INDEX } from '../src/bhava.js';
import {
  vedhaLines, vedhaLineCells, evaluateVedha, resolveTargets, tithiGroupOf, motionOf, disagreement,
  vedhaForDay, grahaStates, validateTradition, directionOf,
  SBC_GEOMETRY_V1, SBC_METHOD_A_FIXTURE, SBC_HORARATNA_V1, SBC_ALL_THREE_V1, grahaClass, mercuryWithMalefic,
  type GrahaState, type ResolvedTarget,
} from '../src/sbcVedha.js';

/** 28-index of a 27-index nakṣatra. */
const n28 = (n27: number): number => (n27 <= 20 ? n27 : n27 + 1);
const KRITTIKA = n28(2); const BHARANI = n28(1); const VISHAKHA = n28(15); const SHRAVANA = n28(21);
const end = (cells: readonly (readonly [number, number])[]) => SARVATOBHADRA[cells.at(-1)![0]]![cells.at(-1)![1]]!;

describe('the geometry', () => {
  it('runs from Kṛttikā to Śravaṇa in front, Bharaṇī behind and Viśākhā ahead', () => {
    const l = vedhaLines(KRITTIKA);
    expect(end(l.front)).toEqual({ kind: 'nakshatra', index: SHRAVANA });
    expect(end(l.behind)).toEqual({ kind: 'nakshatra', index: BHARANI });
    expect(end(l.ahead)).toEqual({ kind: 'nakshatra', index: VISHAKHA });
    // Every cell the ahead diagonal crosses, in order.
    expect(l.ahead).toEqual([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]]);
    expect(SARVATOBHADRA[3]![4]).toMatchObject({ kind: 'tithi', group: 'Nandā' });
    expect(SARVATOBHADRA[2]![3]).toEqual({ kind: 'sign', index: 1 });
  });

  it('pairs every front line both ways, and every ahead line with the partner’s behind line', () => {
    for (let n = 0; n < 28; n += 1) {
      const l = vedhaLines(n);
      const front = end(l.front);
      expect(front.kind).toBe('nakshatra');
      if (front.kind !== 'nakshatra') continue;
      const back = end(vedhaLines(front.index).front);
      expect(back).toEqual({ kind: 'nakshatra', index: n });
      const ahead = end(l.ahead);
      if (ahead.kind === 'nakshatra') expect(end(vedhaLines(ahead.index).behind)).toEqual({ kind: 'nakshatra', index: n });
      // An ahead diagonal leads to a later nakṣatra round the ring, behind to an earlier one.
      const behind = end(l.behind);
      if (ahead.kind === 'nakshatra' && behind.kind === 'nakshatra') {
        expect((ahead.index - n + 28) % 28).toBeLessThan(14);
        expect((n - behind.index + 28) % 28).toBeLessThan(14);
      }
    }
  });

  it('places Abhijit between Uttarāṣāḍhā and Śravaṇa and gives it lines like any other', () => {
    expect(nakshatra28(278)).toBe(ABHIJIT_INDEX);
    expect(nakshatra28(276.6)).toBe(n28(20));
    expect(nakshatra28(281)).toBe(SHRAVANA);
    expect(sbcCellOf(ABHIJIT_INDEX)).toEqual([8, 2]);
    expect(end(vedhaLines(ABHIJIT_INDEX).front)).toMatchObject({ kind: 'nakshatra' });
  });

  it('refuses to start a line from a cell that is not on the edge', () => {
    expect(() => vedhaLineCells([4, 4], 'front')).toThrow();
  });
});

const state = (graha: GrahaState['graha'], n: number, speed: number, t = SBC_METHOD_A_FIXTURE): GrahaState =>
  ({ graha, longitude: 0, speed, nakshatra28: n, motion: motionOf(graha, speed, t) });
const target = (index: number): ResolvedTarget => resolveTargets({ natalMoonNakshatra: index })[0]!;

describe('Method B and Method A', () => {
  it('hits through any of the three lines under Method B, whatever the names', () => {
    for (const t of [SBC_GEOMETRY_V1, SBC_METHOD_A_FIXTURE]) {
      for (const [tgt, line] of [[SHRAVANA, 'front'], [BHARANI, 'behind'], [VISHAKHA, 'ahead']] as const) {
        const e = evaluateVedha('B', state('mars', KRITTIKA, 0.6), target(tgt), t, 'shukla');
        expect([e.outcome, e.lines]).toEqual(['hit', [line]]);
      }
    }
    // Names only where the tradition gives them.
    expect(directionOf('ahead', SBC_GEOMETRY_V1)).toBeNull();
    expect(directionOf('ahead', SBC_METHOD_A_FIXTURE)).toBe('vama');
    expect(directionOf('front', SBC_GEOMETRY_V1)).toBe('sammukha');
  });

  it('says Method A was not evaluated, never "no hit", when no verified table exists', () => {
    const e = evaluateVedha('A', state('mars', KRITTIKA, 0.6, SBC_GEOMETRY_V1), target(SHRAVANA), SBC_GEOMETRY_V1, 'shukla');
    expect([e.outcome, e.reason]).toEqual(['not-evaluated', 'METHOD_A_UNAVAILABLE']);
  });

  it('lets motion choose the line in the fixture, and explains the disagreement with B', () => {
    // Mars direct at 0.4°/day (below its mean 0.524): front only.
    const direct = state('mars', KRITTIKA, 0.4);
    expect(direct.motion).toBe('direct');
    expect(evaluateVedha('A', direct, target(SHRAVANA), SBC_METHOD_A_FIXTURE, 'shukla').outcome).toBe('hit');
    const a = evaluateVedha('A', direct, target(VISHAKHA), SBC_METHOD_A_FIXTURE, 'shukla');
    const b = evaluateVedha('B', direct, target(VISHAKHA), SBC_METHOD_A_FIXTURE, 'shukla');
    expect([a.outcome, b.outcome, disagreement(a, b)]).toEqual(['no-hit', 'hit', 'MOTION_SELECTS_OTHER_LINE']);
    // Fast: vāma, the ahead line in the fixture. Retrograde: dakṣiṇa, behind.
    expect(evaluateVedha('A', state('mars', KRITTIKA, 0.7), target(VISHAKHA), SBC_METHOD_A_FIXTURE, 'shukla')).toMatchObject({ outcome: 'hit', directions: ['vama'], rule: 'A:motion:fast' });
    expect(evaluateVedha('A', state('mars', KRITTIKA, -0.3), target(BHARANI), SBC_METHOD_A_FIXTURE, 'shukla')).toMatchObject({ outcome: 'hit', directions: ['dakshina'], rule: 'A:motion:retrograde' });
  });

  it('gives the Sun and the nodes all three lines, leaves the Moon and stations unevaluated', () => {
    for (const g of ['sun', 'rahu', 'ketu'] as const) {
      expect(evaluateVedha('A', state(g, KRITTIKA, g === 'sun' ? 1 : -0.05), target(BHARANI), SBC_METHOD_A_FIXTURE, 'shukla')).toMatchObject({ outcome: 'hit', rule: 'A:fixed' });
    }
    expect(evaluateVedha('A', state('moon', KRITTIKA, 13), target(SHRAVANA), SBC_METHOD_A_FIXTURE, 'shukla')).toMatchObject({ outcome: 'not-evaluated', reason: 'GRAHA_NOT_COVERED' });
    const station = state('mercury', KRITTIKA, 0.01);
    expect(station.motion).toBe('stationary');
    expect(evaluateVedha('A', station, target(SHRAVANA), SBC_METHOD_A_FIXTURE, 'shukla')).toMatchObject({ outcome: 'not-evaluated', reason: 'MOTION_NOT_COVERED' });
  });

  it('keeps a missing target "not evaluated" and the ascendant apart from the Moon’s sign', () => {
    const ts = resolveTargets({ natalMoonNakshatra: SHRAVANA, natalMoonSign: 1, ascendantSign: 1 });
    expect(ts.map((x) => [x.kind, x.missing ?? null])).toEqual([
      ['natal-moon-nakshatra', null], ['natal-moon-sign', null], ['ascendant-sign', null],
      ['name-consonant', 'NOT_GIVEN'], ['name-vowel', 'NOT_GIVEN'], ['tithi-group', 'NOT_GIVEN'],
    ]);
    const e = evaluateVedha('B', state('mars', KRITTIKA, 0.4), ts[3]!, SBC_GEOMETRY_V1, 'shukla');
    expect([e.outcome, e.reason]).toEqual(['not-evaluated', 'TARGET_NOT_GIVEN']);
    // Vṛṣabha sits on Kṛttikā's ahead line: both sign targets are hit, reported separately.
    expect(evaluateVedha('B', state('mars', KRITTIKA, 0.4), ts[1]!, SBC_GEOMETRY_V1, 'shukla').outcome).toBe('hit');
    expect(evaluateVedha('B', state('mars', KRITTIKA, 0.4), ts[2]!, SBC_GEOMETRY_V1, 'shukla').target.kind).toBe('ascendant-sign');
    // Letters: the consonant ring and the vowel corners are different cells even for "A".
    const [, , , cons, vowel] = resolveTargets({ nameConsonant: 'A', nameVowel: 'A' });
    expect(cons!.cell).toEqual([1, 2]);
    expect(vowel!.cell).toEqual([0, 0]);
    expect(resolveTargets({ nameConsonant: 'Qa' })[3]!.missing).toBe('NOT_ON_CAKRA');
  });

  it('groups tithis five ways, Amāvāsyā with Pūrṇimā', () => {
    expect([1, 6, 11, 16, 2, 3, 4, 5, 15, 30].map(tithiGroupOf)).toEqual(['Nandā', 'Nandā', 'Nandā', 'Nandā', 'Bhadrā', 'Jayā', 'Riktā', 'Pūrṇā', 'Pūrṇā', 'Pūrṇā']);
  });

  it('validates traditions', () => {
    expect(validateTradition(SBC_GEOMETRY_V1)).toEqual([]);
    expect(validateTradition(SBC_METHOD_A_FIXTURE)).toEqual([]);
    expect(validateTradition({ ...SBC_METHOD_A_FIXTURE, vamaLine: null })).toContain('SIDES_UNNAMED');
    expect(validateTradition({ ...SBC_GEOMETRY_V1, version: '' })).toContain('NO_VERSION');
  });
});

const VOWELS = new Set(['A', 'Ā', 'I', 'Ī', 'U', 'Ū', 'Ṛ', 'Ṝ', 'Ḷ', 'Ḹ', 'E', 'Ai', 'O', 'Au', 'Aṁ', 'Aḥ']);
/** A cell as Sastri names it: a nakṣatra, a sign, a tithi group, "the vowel" or "the consonant". */
const token = ([r, c]: readonly [number, number]): string => {
  const x = SARVATOBHADRA[r]![c]!;
  if (x.kind === 'nakshatra') return `N${x.index}`;
  if (x.kind === 'sign') return `S${x.index}`;
  if (x.kind === 'tithi') return `T:${x.group}`;
  if (x.kind === 'letter') return VOWELS.has(x.text) ? 'vowel' : 'consonant';
  return '?';
};
const pierced = (n: number): string[] => {
  const l = vedhaLines(n, 'end-nakshatra');
  return [...l.front, ...l.behind, ...l.ahead].map(token).sort();
};

describe('the Horaratna lists (Sastri 1950, p. 312)', () => {
  it('Kṛttikā: Bharaṇī, the vowel, Vṛṣabha, Nandā, Bhadrā, Tulā, the consonant, Viśākhā, Śravaṇa', () => {
    expect(pierced(KRITTIKA)).toEqual([`N${BHARANI}`, 'vowel', 'S1', 'T:Nandā', 'T:Bhadrā', 'S6', 'consonant', `N${VISHAKHA}`, `N${SHRAVANA}`].sort());
  });
  it('Rohiṇī: the vowel, Aśvinī, the consonant, Mithuna, the vowel, Kanyā, the consonant, Svāti, Abhijit', () => {
    expect(pierced(n28(3))).toEqual(['vowel', `N${n28(0)}`, 'consonant', 'S2', 'vowel', 'S5', 'consonant', `N${n28(14)}`, `N${ABHIJIT_INDEX}`].sort());
  });
  it('Mṛgaśirā: Karkaṭa, the consonant, Siṁha, the consonant, Citrā, Revatī, the consonant, the vowel, Uttarāṣāḍhā', () => {
    expect(pierced(n28(4))).toEqual(['S3', 'consonant', 'S4', 'consonant', `N${n28(13)}`, `N${n28(26)}`, 'consonant', 'vowel', `N${n28(20)}`].sort());
  });
  it('lets the front line pierce only the nakṣatra at its end, unlike the 1.0.0 geometry', () => {
    expect(vedhaLines(KRITTIKA, 'end-nakshatra').front).toEqual([[8, 1]]);
    expect(vedhaLines(KRITTIKA, 'every-cell').front).toHaveLength(8);
    // "Ca" sits on Kṛttikā's front column: pierced under 1.0.0, not under the Horaratna.
    const ca = resolveTargets({ nameConsonant: 'Ca' })[3]!;
    expect(ca.cell).toEqual([3, 1]);
    expect(evaluateVedha('B', state('mars', KRITTIKA, 0.4, SBC_GEOMETRY_V1), ca, SBC_GEOMETRY_V1, 'shukla').outcome).toBe('hit');
    expect(evaluateVedha('B', state('mars', KRITTIKA, 0.4, SBC_HORARATNA_V1), ca, SBC_HORARATNA_V1, 'shukla').outcome).toBe('no-hit');
  });
});

describe('Method A under the Horaratna', () => {
  const T = SBC_HORARATNA_V1;
  const st = (g: GrahaState['graha'], speed: number) => state(g, KRITTIKA, speed, T);
  it('validates, with its sources paged and its sides explained', () => {
    expect(validateTradition(T)).toEqual([]);
    expect(validateTradition(SBC_ALL_THREE_V1)).toEqual([]);
    expect(validateTradition({ ...T, sidesBasis: '' })).toContain('SIDES_UNEXPLAINED');
    expect(validateTradition({ ...T, reference: 'Horaratna' })).toContain('NO_VERSE_REFERENCE');
  });
  it('sends mean motion to the front, swift to the left, retrograde to the right (p. 312)', () => {
    expect(evaluateVedha('A', st('mars', 0.4), target(SHRAVANA), T, 'shukla')).toMatchObject({ outcome: 'hit', directions: ['sammukha'], rule: 'A:motion:direct' });
    expect(evaluateVedha('A', st('mars', 0.4), target(VISHAKHA), T, 'shukla').outcome).toBe('no-hit');
    expect(evaluateVedha('A', st('mars', 0.7), target(VISHAKHA), T, 'shukla')).toMatchObject({ outcome: 'hit', directions: ['vama'] });
    expect(evaluateVedha('A', st('saturn', -0.03), target(BHARANI), T, 'shukla')).toMatchObject({ outcome: 'hit', directions: ['dakshina'] });
  });
  it('sends the Sun and the Moon left, Rāhu and Ketu right, whatever their speed (p. 313)', () => {
    for (const g of ['sun', 'moon'] as const) {
      expect(evaluateVedha('A', st(g, g === 'sun' ? 1 : 13), target(VISHAKHA), T, 'shukla')).toMatchObject({ outcome: 'hit', rule: 'A:fixed', directions: ['vama'] });
      expect(evaluateVedha('A', st(g, 1), target(SHRAVANA), T, 'shukla').outcome).toBe('no-hit');
    }
    for (const g of ['rahu', 'ketu'] as const) {
      expect(evaluateVedha('A', st(g, -0.05), target(BHARANI), T, 'shukla')).toMatchObject({ outcome: 'hit', directions: ['dakshina'] });
    }
  });
  it('says nothing about a station: not evaluated, never "no hit"', () => {
    expect(evaluateVedha('A', st('jupiter', 0.001), target(SHRAVANA), T, 'shukla')).toMatchObject({ outcome: 'not-evaluated', reason: 'MOTION_NOT_COVERED' });
  });
  it('lets the luminaries and nodes cast all three under the other reading', () => {
    for (const n of [SHRAVANA, BHARANI, VISHAKHA]) {
      expect(evaluateVedha('A', state('sun', KRITTIKA, 1, SBC_ALL_THREE_V1), target(n), SBC_ALL_THREE_V1, 'shukla').outcome).toBe('hit');
    }
  });
  it('classes Mercury by its company and the Moon by the tradition’s rule', () => {
    expect(grahaClass('mercury', { paksha: 'shukla', mercuryWithMalefic: true }, T)).toBe('malefic');
    expect(grahaClass('mercury', { paksha: 'shukla', mercuryWithMalefic: false }, T)).toBe('benefic');
    expect(grahaClass('mercury', { paksha: 'shukla', mercuryWithMalefic: true }, SBC_GEOMETRY_V1)).toBe('variable');
    expect(grahaClass('moon', { paksha: 'krishna', tithi: 20 }, T)).toBe('malefic');
    expect(grahaClass('moon', { paksha: 'krishna', tithi: 20 }, SBC_ALL_THREE_V1)).toBe('benefic');
    expect(grahaClass('moon', { paksha: 'krishna', tithi: 27 }, SBC_ALL_THREE_V1)).toBe('malefic');
    expect(grahaClass('moon', { paksha: 'shukla', tithi: 3 }, SBC_ALL_THREE_V1)).toBe('malefic');
    const at = (graha: GrahaState['graha'], longitude: number): GrahaState => ({ graha, longitude, speed: 1, nakshatra28: 0, motion: 'direct' });
    expect(mercuryWithMalefic([at('mercury', 95), at('mars', 110)], false)).toBe(true);
    expect(mercuryWithMalefic([at('mercury', 95), at('mars', 125)], false)).toBe(false);
    expect(mercuryWithMalefic([at('mercury', 95), at('moon', 100)], true)).toBe(true);
  });
});

describe('a daily run', () => {
  let provider: SwissEphWasmProvider;
  beforeAll(async () => { provider = new SwissEphWasmProvider(); await provider.init(); });
  afterAll(() => provider.close());
  const settings = { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } as const, nodeType: 'mean' as const };
  const at10 = (date: string): number => {
    const [y, m, d] = date.split('-').map(Number);
    return resolveCivilTime({ year: y!, month: m!, day: d! }, { hour: 10, minute: 0, second: 0 }, 'Asia/Kolkata').jdUT;
  };
  const days: string[] = [];
  for (let t = Date.parse('2026-10-08T00:00:00Z'); t <= Date.parse('2026-11-20T00:00:00Z'); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));

  it('covers 44 calendar days, both methods, every target and graha', () => {
    expect(days).toHaveLength(44);
    const targets = resolveTargets({ natalMoonNakshatra: SHRAVANA, natalMoonSign: 9, tithiGroup: 'Nandā' });
    const day = vedhaForDay(provider, days[0]!, at10(days[0]!), settings, SBC_METHOD_A_FIXTURE, targets);
    expect(day.evaluations).toHaveLength(2 * 6 * 9);
    expect(day.concurrent).toHaveLength(2 * 6);
    for (const c of day.concurrent) {
      const n = day.evaluations.filter((e) => e.method === c.method && e.target.kind === c.target && e.outcome === 'hit').length;
      expect(c.grahas).toHaveLength(n);
    }
    // Method B hits are a superset of Method A hits, day after day, under the fixture and the Horaratna.
    for (const date of days) for (const tr of [SBC_METHOD_A_FIXTURE, SBC_HORARATNA_V1]) {
      const d = vedhaForDay(provider, date, at10(date), settings, tr, targets);
      if (tr === SBC_HORARATNA_V1) {
        // Every graha is covered: only a station leaves Method A unevaluated, and Mercury is always classed.
        for (const e of d.evaluations.filter((x) => x.method === 'A' && x.outcome === 'not-evaluated' && x.target.cell)) expect(e.reason).toBe('MOTION_NOT_COVERED');
        expect(d.evaluations.filter((x) => x.graha === 'mercury' && x.classification === 'variable')).toHaveLength(0);
      }
      for (const a of d.evaluations.filter((e) => e.method === 'A' && e.outcome === 'hit')) {
        const b = d.evaluations.find((e) => e.method === 'B' && e.graha === a.graha && e.target.kind === a.target.kind)!;
        expect(b.outcome).toBe('hit');
      }
    }
  });

  it('keeps Ketu opposite Rahu in [0, 360) under either node, and sees Mercury retrograde from late October', () => {
    for (const nodeType of ['mean', 'true'] as const) {
      const s = grahaStates(provider, at10('2026-10-30'), { ...settings, nodeType }, SBC_GEOMETRY_V1);
      const rahu = s.find((x) => x.graha === 'rahu')!; const ketu = s.find((x) => x.graha === 'ketu')!;
      expect(ketu.longitude).toBeGreaterThanOrEqual(0);
      expect(ketu.longitude).toBeLessThan(360);
      expect(norm360(ketu.longitude - rahu.longitude)).toBeCloseTo(180, 9);
    }
    const motions = days.map((d) => grahaStates(provider, at10(d), settings, SBC_GEOMETRY_V1).find((x) => x.graha === 'mercury')!.motion);
    expect(motions[0]).not.toBe('retrograde');
    expect(motions).toContain('retrograde');
    expect(motions.at(-1)).not.toBe('retrograde');
  });

  it('moves the nakṣatras with the ayanāṁśa', () => {
    const jd = at10('2026-11-01');
    const lahiri = grahaStates(provider, jd, settings, SBC_GEOMETRY_V1);
    const tropical = grahaStates(provider, jd, { ...settings, zodiac: { kind: 'tropical' } }, SBC_GEOMETRY_V1);
    const ay = provider.ayanamsha(jd, { kind: 'sidereal', ayanamsha: 'lahiri' });
    expect(norm360(tropical[0]!.longitude - lahiri[0]!.longitude)).toBeCloseTo(ay, 6);
  });
});
